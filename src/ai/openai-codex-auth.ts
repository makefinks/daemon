import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { getAppConfigDir, openUrlInBrowser } from "../utils/preferences";
import { fetchOpenAiCodexWithTimeout } from "./openai-codex-http";

const OPENAI_CODEX_AUTH_FILE = "openai-codex-auth.json";
const OPENAI_CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const OPENAI_CODEX_AUTHORIZE_URL = "https://auth.openai.com/oauth/authorize";
const OPENAI_CODEX_TOKEN_URL = "https://auth.openai.com/oauth/token";
const OPENAI_CODEX_CALLBACK_HOST = "localhost";
const OPENAI_CODEX_CALLBACK_PORTS = [1455, 1457] as const;
const OPENAI_CODEX_CALLBACK_PATH = "/auth/callback";
// offline_access is required so OAuth returns a refresh token and DAEMON can keep
// the Codex session alive across launches instead of forcing a browser login each time.
const OPENAI_CODEX_SCOPE = "openid profile email offline_access api.connectors.read api.connectors.invoke";
// Give the browser handoff enough time without leaving the local callback server open indefinitely.
const OPENAI_CODEX_LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
// Refresh a little early so long-running responses do not start with a nearly expired token.
const OPENAI_CODEX_REFRESH_SKEW_MS = 60 * 1000;

export interface OpenAiCodexAuthRecord {
	version: 1;
	createdAt: string;
	updatedAt: string;
	accessToken: string;
	refreshToken: string;
	expiresAt: number;
	accountId: string;
}

interface OAuthTokenResponse {
	access_token?: string;
	refresh_token?: string;
	expires_in?: number;
	id_token?: string;
}

interface JwtPayload {
	chatgpt_account_id?: string;
	organizations?: Array<{ id?: string }>;
	"https://api.openai.com/auth"?: {
		chatgpt_account_id?: string;
	};
}

let refreshPromise: Promise<OpenAiCodexAuthRecord> | null = null;

/** Resolve the local file path used for persisted Codex OAuth tokens. */
function getOpenAiCodexAuthPath(): string {
	return path.join(getAppConfigDir(), OPENAI_CODEX_AUTH_FILE);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function toBase64Url(buffer: Buffer): string {
	return buffer.toString("base64url");
}

/** Create a PKCE verifier/challenge pair for the browser OAuth flow. */
function buildPkcePair(): { verifier: string; challenge: string } {
	const verifier = toBase64Url(randomBytes(32));
	const challenge = createHash("sha256").update(verifier).digest("base64url");
	return { verifier, challenge };
}

function createState(): string {
	return randomBytes(16).toString("hex");
}

function getCallbackUrl(port: number): string {
	return `http://${OPENAI_CODEX_CALLBACK_HOST}:${port}${OPENAI_CODEX_CALLBACK_PATH}`;
}

/** Decode a JWT payload without verifying the signature. */
function decodeJwt(token: string | undefined): JwtPayload | null {
	if (!token) return null;
	try {
		const [, payload] = token.split(".");
		if (!payload) return null;
		return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as JwtPayload;
	} catch {
		return null;
	}
}

function firstNonEmptyString(...values: Array<string | undefined>): string | undefined {
	return values.find((value) => typeof value === "string" && value.trim().length > 0)?.trim();
}

function extractAccountIdFromClaims(claims: JwtPayload | null): string | undefined {
	if (!claims) return undefined;
	return firstNonEmptyString(
		claims["https://api.openai.com/auth"]?.chatgpt_account_id,
		claims.chatgpt_account_id,
		claims.organizations?.[0]?.id
	);
}

export function extractOpenAiCodexAccountId(tokenResponse: OAuthTokenResponse): string | undefined {
	const idPayload = decodeJwt(tokenResponse.id_token);
	const idAccountId = extractAccountIdFromClaims(idPayload);
	if (idAccountId) return idAccountId;
	return extractAccountIdFromClaims(decodeJwt(tokenResponse.access_token));
}

function parseErrorCode(raw: string): string | undefined {
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (!isRecord(parsed)) return undefined;
		const error = parsed.error;
		if (typeof error === "string" && error.trim()) return error.trim();
		if (isRecord(error) && typeof error.code === "string" && error.code.trim()) return error.code.trim();
		if (typeof parsed.code === "string" && parsed.code.trim()) return parsed.code.trim();
	} catch {}
	return undefined;
}

function parseErrorMessage(raw: string): string | undefined {
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (!isRecord(parsed)) return undefined;
		if (typeof parsed.error_description === "string" && parsed.error_description.trim()) {
			return parsed.error_description.trim();
		}
		if (isRecord(parsed.error) && typeof parsed.error.message === "string" && parsed.error.message.trim()) {
			return parsed.error.message.trim();
		}
		if (typeof parsed.message === "string" && parsed.message.trim()) return parsed.message.trim();
	} catch {}
	const trimmed = raw.trim();
	return trimmed || undefined;
}

export function formatOpenAiCodexRefreshError(status: number, body: string): string {
	const code = parseErrorCode(body)?.toLowerCase();
	if (status === 401) {
		if (code === "refresh_token_expired") {
			return "Your OpenAI Codex session expired. Please sign in again.";
		}
		if (code === "refresh_token_reused") {
			return "Your OpenAI Codex refresh token was already used. Please sign in again.";
		}
		if (code === "refresh_token_invalidated") {
			return "Your OpenAI Codex refresh token was revoked. Please sign in again.";
		}
	}
	return `OpenAI Codex token refresh failed (${status}): ${parseErrorMessage(body) ?? "No details"}`;
}

export function formatOpenAiCodexOAuthError(error: string, errorDescription?: string | null): string {
	if (error === "access_denied" && errorDescription?.toLowerCase().includes("missing_codex_entitlement")) {
		return "Codex is not enabled for this ChatGPT workspace. Contact your workspace administrator to request access to Codex.";
	}
	if (errorDescription?.trim()) {
		return `OpenAI Codex login failed: ${errorDescription.trim()}`;
	}
	return `OpenAI Codex login failed: ${error}`;
}

/**
 * Validate the persisted auth file before using it.
 * The file lives in user-controlled storage, so we treat it as untrusted input.
 */
function parsePersistedOpenAiCodexAuth(raw: unknown): OpenAiCodexAuthRecord | null {
	if (!isRecord(raw)) return null;
	if (raw.version !== 1) return null;
	if (typeof raw.createdAt !== "string") return null;
	if (typeof raw.updatedAt !== "string") return null;
	if (typeof raw.accessToken !== "string") return null;
	if (typeof raw.refreshToken !== "string") return null;
	if (typeof raw.expiresAt !== "number") return null;
	if (typeof raw.accountId !== "string") return null;

	return {
		version: 1,
		createdAt: raw.createdAt,
		updatedAt: raw.updatedAt,
		accessToken: raw.accessToken,
		refreshToken: raw.refreshToken,
		expiresAt: raw.expiresAt,
		accountId: raw.accountId,
	};
}

/** Persist the normalized Codex auth record with user-only file permissions. */
async function writeOpenAiCodexAuth(record: OpenAiCodexAuthRecord): Promise<void> {
	const authPath = getOpenAiCodexAuthPath();
	await fs.mkdir(path.dirname(authPath), { recursive: true });
	await fs.writeFile(authPath, `${JSON.stringify(record, null, 2)}\n`, {
		encoding: "utf8",
		mode: 0o600,
	});
	await fs.chmod(authPath, 0o600);
}

/**
 * Build the auth record we persist locally from OAuth token response data.
 * We only keep fields DAEMON actually uses at runtime.
 */
function buildOpenAiCodexAuthRecord(
	tokenResponse: OAuthTokenResponse,
	existing?: OpenAiCodexAuthRecord
): OpenAiCodexAuthRecord {
	if (typeof tokenResponse.access_token !== "string" || tokenResponse.access_token.trim().length === 0) {
		throw new Error("OpenAI Codex login did not return an access token.");
	}

	const refreshToken =
		typeof tokenResponse.refresh_token === "string" && tokenResponse.refresh_token.trim().length > 0
			? tokenResponse.refresh_token
			: existing?.refreshToken;
	if (!refreshToken) {
		throw new Error("OpenAI Codex login did not return a refresh token.");
	}

	const accountId = extractOpenAiCodexAccountId(tokenResponse) ?? existing?.accountId;

	if (!accountId) {
		throw new Error("OpenAI Codex login succeeded but no ChatGPT workspace/account ID was present.");
	}

	const expiresInMs =
		typeof tokenResponse.expires_in === "number" && Number.isFinite(tokenResponse.expires_in)
			? tokenResponse.expires_in * 1000
			: 60 * 60 * 1000;
	const now = new Date().toISOString();

	return {
		version: 1,
		createdAt: existing?.createdAt ?? now,
		updatedAt: now,
		accessToken: tokenResponse.access_token,
		refreshToken,
		expiresAt: Date.now() + expiresInMs,
		accountId,
	};
}

/** Read and validate any previously persisted Codex auth record. */
async function readOpenAiCodexAuth(): Promise<OpenAiCodexAuthRecord | null> {
	try {
		const raw = await fs.readFile(getOpenAiCodexAuthPath(), "utf8");
		return parsePersistedOpenAiCodexAuth(JSON.parse(raw) as unknown);
	} catch {
		return null;
	}
}

/** Exchange the browser callback code for access and refresh tokens. */
async function exchangeAuthorizationCode(
	code: string,
	verifier: string,
	redirectUri: string
): Promise<OpenAiCodexAuthRecord> {
	const response = await fetchOpenAiCodexWithTimeout(OPENAI_CODEX_TOKEN_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: new URLSearchParams({
			grant_type: "authorization_code",
			client_id: OPENAI_CODEX_CLIENT_ID,
			code,
			code_verifier: verifier,
			redirect_uri: redirectUri,
		}),
	});

	if (!response.ok) {
		const details = await response.text().catch(() => "");
		throw new Error(`OpenAI Codex login failed (${response.status}): ${details || "No details"}`);
	}

	return buildOpenAiCodexAuthRecord((await response.json()) as OAuthTokenResponse);
}

/** Refresh an existing Codex session and update the persisted auth file. */
async function refreshOpenAiCodexAuthRecord(existing: OpenAiCodexAuthRecord): Promise<OpenAiCodexAuthRecord> {
	const response = await fetchOpenAiCodexWithTimeout(OPENAI_CODEX_TOKEN_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			grant_type: "refresh_token",
			client_id: OPENAI_CODEX_CLIENT_ID,
			refresh_token: existing.refreshToken,
		}),
	});

	if (!response.ok) {
		const details = await response.text().catch(() => "");
		throw new Error(formatOpenAiCodexRefreshError(response.status, details));
	}

	const next = buildOpenAiCodexAuthRecord((await response.json()) as OAuthTokenResponse, existing);
	await writeOpenAiCodexAuth(next);
	return next;
}

function isAddressInUse(error: unknown): boolean {
	return error instanceof Error && "code" in error && (error as { code?: unknown }).code === "EADDRINUSE";
}

async function listenForOAuthCallback(server: ReturnType<typeof createServer>): Promise<number> {
	let lastError: unknown;
	for (const port of OPENAI_CODEX_CALLBACK_PORTS) {
		try {
			await new Promise<void>((resolve, reject) => {
				const onError = (error: Error) => {
					server.off("listening", onListening);
					reject(error);
				};
				const onListening = () => {
					server.off("error", onError);
					resolve();
				};
				server.once("error", onError);
				server.once("listening", onListening);
				server.listen(port, OPENAI_CODEX_CALLBACK_HOST);
			});
			return port;
		} catch (error) {
			lastError = error;
			if (!isAddressInUse(error)) {
				throw error;
			}
		}
	}
	throw lastError instanceof Error ? lastError : new Error("OpenAI Codex callback ports are unavailable.");
}

/** Start the local OAuth callback server and resolve with the returned authorization code. */
async function startAuthorizationCodeListener(expectedState: string): Promise<{
	redirectUri: string;
	codePromise: Promise<string>;
}> {
	const successHtml = [
		"<!doctype html>",
		'<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>DAEMON Link Complete</title><style>',
		':root{color-scheme:dark;--bg:#000;--panel:#050505;--border:#2b2b2b;--text:#d7d7d7;--accent:#7ef0c4;}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;color:var(--text)}main{width:min(92vw,760px);padding:20px 22px;border:1px solid var(--border);background:var(--panel)}pre{margin:0;font:inherit;white-space:pre-wrap;line-height:1.65}.accent{color:var(--accent)}.cursor{display:inline-block;color:var(--accent);animation:blink 1s steps(1,end) infinite}@keyframes blink{50%{opacity:0}}</style></head>',
		"<body><main>",
		'<pre><span class="accent">daemon://oauth</span> [complete]\n\nOpenAI Codex authentication succeeded.\n\n> session linked\n> tokens stored locally\n> automatic refresh enabled\n\nNext:\n  1. close this browser tab\n  2. return to the terminal\n  3. continue using DAEMON\n\nstatus: ready<span class="cursor">_</span></pre>',
		"</body></html>",
	].join("");
	let callbackUrl = getCallbackUrl(OPENAI_CODEX_CALLBACK_PORTS[0]);
	let timeout: ReturnType<typeof setTimeout> | null = null;
	let settled = false;
	const server = createServer((req, res) => {
		const url = new URL(req.url ?? "/", callbackUrl);
		if (url.pathname !== OPENAI_CODEX_CALLBACK_PATH) {
			res.statusCode = 404;
			res.end("Not found");
			return;
		}

		const finish = (result: { code: string } | { error: Error }, statusCode: number, body: string) => {
			if (settled) return;
			settled = true;
			if (timeout) clearTimeout(timeout);
			res.statusCode = statusCode;
			if (statusCode === 200) res.setHeader("Content-Type", "text/html; charset=utf-8");
			res.end(body);
			server.close();
			if ("code" in result) {
				resolveCode(result.code);
			} else {
				rejectCode(result.error);
			}
		};

		const state = url.searchParams.get("state");
		const error = url.searchParams.get("error");
		if (error) {
			const message = formatOpenAiCodexOAuthError(error, url.searchParams.get("error_description"));
			finish({ error: new Error(message) }, 400, message);
			return;
		}

		const code = url.searchParams.get("code");
		if (!code) {
			finish(
				{ error: new Error("OpenAI Codex login callback did not include an authorization code.") },
				400,
				"Missing authorization code"
			);
			return;
		}

		if (state !== expectedState) {
			finish(
				{ error: new Error("OpenAI Codex login callback state did not match the pending login request.") },
				400,
				"State mismatch"
			);
			return;
		}

		finish({ code }, 200, successHtml);
	});

	let resolveCode: (code: string) => void = () => {};
	let rejectCode: (error: Error) => void = () => {};
	const codePromise = new Promise<string>((resolve, reject) => {
		resolveCode = resolve;
		rejectCode = reject;
		timeout = setTimeout(() => {
			if (settled) return;
			settled = true;
			server.close();
			reject(new Error("Timed out waiting for OpenAI Codex login callback."));
		}, OPENAI_CODEX_LOGIN_TIMEOUT_MS);
	});

	let port: number;
	try {
		port = await listenForOAuthCallback(server);
	} catch (error) {
		settled = true;
		if (timeout) clearTimeout(timeout);
		server.close();
		throw error;
	}
	callbackUrl = getCallbackUrl(port);
	server.on("error", (error) => {
		if (settled) return;
		settled = true;
		if (timeout) clearTimeout(timeout);
		rejectCode(error instanceof Error ? error : new Error(String(error)));
	});

	return { redirectUri: callbackUrl, codePromise };
}

/** Build the browser authorization URL for the PKCE login flow. */
function buildAuthorizationUrl(challenge: string, state: string, redirectUri: string): string {
	const url = new URL(OPENAI_CODEX_AUTHORIZE_URL);
	url.searchParams.set("response_type", "code");
	url.searchParams.set("client_id", OPENAI_CODEX_CLIENT_ID);
	url.searchParams.set("redirect_uri", redirectUri);
	url.searchParams.set("scope", OPENAI_CODEX_SCOPE);
	url.searchParams.set("code_challenge", challenge);
	url.searchParams.set("code_challenge_method", "S256");
	url.searchParams.set("state", state);
	url.searchParams.set("id_token_add_organizations", "true");
	url.searchParams.set("codex_cli_simplified_flow", "true");
	url.searchParams.set("originator", "codex_cli_rs");
	return url.toString();
}

/** Load any previously stored Codex auth record without forcing a refresh. */
export async function loadOpenAiCodexAuth(): Promise<OpenAiCodexAuthRecord | null> {
	return readOpenAiCodexAuth();
}

/** Remove any locally persisted Codex auth record. */
export async function clearOpenAiCodexAuth(): Promise<void> {
	try {
		await fs.unlink(getOpenAiCodexAuthPath());
	} catch {}
}

/** Start the browser OAuth flow, wait for the callback, and persist the resulting tokens. */
export async function loginOpenAiCodex(): Promise<OpenAiCodexAuthRecord> {
	const { verifier, challenge } = buildPkcePair();
	const state = createState();
	const { redirectUri, codePromise } = await startAuthorizationCodeListener(state);
	openUrlInBrowser(buildAuthorizationUrl(challenge, state, redirectUri));
	const code = await codePromise;
	const record = await exchangeAuthorizationCode(code, verifier, redirectUri);
	await writeOpenAiCodexAuth(record);
	return record;
}

/** Ensure Codex auth exists and refresh it early when the token is near expiry. */
export async function ensureOpenAiCodexAuth(
	skewMs = OPENAI_CODEX_REFRESH_SKEW_MS
): Promise<OpenAiCodexAuthRecord> {
	return ensureOpenAiCodexAuthInternal(skewMs, false);
}

/** Force a refresh after a backend 401 and return the updated auth record. */
export async function refreshOpenAiCodexAuth(): Promise<OpenAiCodexAuthRecord> {
	return ensureOpenAiCodexAuthInternal(0, true);
}

/** Internal auth loader that can optionally force a refresh after a 401. */
async function ensureOpenAiCodexAuthInternal(
	skewMs: number,
	forceRefresh: boolean
): Promise<OpenAiCodexAuthRecord> {
	const existing = await readOpenAiCodexAuth();
	if (!existing) {
		throw new Error("OpenAI Codex is not authenticated.");
	}

	if (!forceRefresh && existing.expiresAt > Date.now() + Math.max(0, skewMs)) {
		return existing;
	}

	if (!refreshPromise) {
		refreshPromise = refreshOpenAiCodexAuthRecord(existing).finally(() => {
			refreshPromise = null;
		});
	}

	return refreshPromise;
}

/** Best-effort helper used by bootstrap/onboarding checks. */
export async function hasOpenAiCodexAuthSafe(): Promise<boolean> {
	try {
		await ensureOpenAiCodexAuthInternal(0, false);
		return true;
	} catch {
		return false;
	}
}

import { CopilotClient, defineTool } from "@github/copilot-sdk";
import type {
	CopilotClientOptions,
	CopilotSession,
	GetAuthStatusResponse,
	ModelInfo,
	SessionConfig,
	Tool as CopilotTool,
	ToolResultObject,
	ToolInvocation,
} from "@github/copilot-sdk";
import type { ToolSet } from "ai";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ZodTypeAny } from "zod";
import type { StreamCallbacks, ToolApprovalRequest, ToolApprovalResponse } from "../types";
import { debug } from "../utils/debug-logger";

interface CopilotClientRuntime {
	fingerprint: string;
	client: CopilotClient;
}

let runtime: CopilotClientRuntime | null = null;
let startupPromise: Promise<CopilotClient> | null = null;
const modelScopedSessionIdByKey = new Map<string, string>();

const DEFAULT_CLIENT_START_TIMEOUT_MS = 15000;
const DEFAULT_AUTH_STATUS_TIMEOUT_MS = 10000;
const DEFAULT_SESSION_TIMEOUT_MS = 15000;
const DEFAULT_MODEL_LIST_TIMEOUT_MS = 15000;
const GH_AUTH_CACHE_TTL_MS = 30000;
const BUN_RUNTIME_NAME = "bun";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const KNOWN_CA_BUNDLE_PATHS = [
	"/etc/ssl/cert.pem",
	"/etc/ssl/certs/ca-certificates.crt",
	"/etc/pki/tls/certs/ca-bundle.crt",
	"/opt/homebrew/etc/openssl@3/cert.pem",
	"/usr/local/etc/openssl@3/cert.pem",
];

let ghAuthStatusCache: { checkedAt: number; authenticated: boolean } | null = null;
let cachedGitSslCaInfo: string | null = null;

function parseBooleanFlag(value: string | undefined, fallback: boolean): boolean {
	if (!value) return fallback;
	const normalized = value.trim().toLowerCase();
	if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") return true;
	if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off")
		return false;
	return fallback;
}

function isBunRuntime(): boolean {
	return typeof process.versions[BUN_RUNTIME_NAME] === "string";
}

function parseTimeoutMs(value: string | undefined, fallback: number): number {
	if (!value) return fallback;
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
	return parsed;
}

function isUuid(value: string | null | undefined): boolean {
	if (!value) return false;
	return UUID_PATTERN.test(value.trim());
}

function normalizeCopilotSessionId(sessionId: string): string {
	const trimmed = sessionId.trim();
	if (isUuid(trimmed)) return trimmed;
	const generated = randomUUID();
	debug.warn("copilot-session-id-normalized", {
		originalSessionId: sessionId,
		normalizedSessionId: generated,
	});
	return generated;
}

function resolveModelScopedSessionId(sessionId: string, modelId: string | undefined): string {
	const trimmedSessionId = sessionId.trim();
	const trimmedModelId = modelId?.trim();
	if (!trimmedModelId) {
		return trimmedSessionId;
	}

	const key = `${trimmedSessionId}::${trimmedModelId}`;
	const existing = modelScopedSessionIdByKey.get(key);
	if (existing) {
		return existing;
	}

	const generated = randomUUID();
	modelScopedSessionIdByKey.set(key, generated);
	debug.info("copilot-model-scoped-session-created", {
		sessionId: trimmedSessionId,
		modelId: trimmedModelId,
		scopedSessionId: generated,
	});
	return generated;
}

function isModelListFailure(error: Error): boolean {
	const message = error.message.toLowerCase();
	return (
		message.includes("failed to list models") ||
		message.includes("failed to list available models") ||
		message.includes("models.list")
	);
}

function supportsReasoningEffort(model: ModelInfo | undefined): boolean {
	return model?.capabilities?.supports?.reasoningEffort === true;
}

function normalizeSessionConfigForModel(
	config: Omit<SessionConfig, "sessionId">,
	models: ModelInfo[]
): Omit<SessionConfig, "sessionId"> {
	if (!config.reasoningEffort) {
		return config;
	}

	const modelId = typeof config.model === "string" ? config.model.trim() : "";
	if (!modelId) {
		return config;
	}

	const selectedModel = models.find((model) => model.id === modelId);
	if (supportsReasoningEffort(selectedModel)) {
		return config;
	}

	debug.warn("copilot-reasoning-effort-omitted", {
		model: modelId,
		reasoningEffort: config.reasoningEffort,
		modelFound: Boolean(selectedModel),
	});

	return {
		...config,
		reasoningEffort: undefined,
	};
}

function resolveNodeExecutablePath(): string | undefined {
	const envOverride = process.env.COPILOT_NODE_PATH?.trim();
	if (envOverride && existsSync(envOverride)) {
		return envOverride;
	}

	const probe = spawnSync("node", ["-p", "process.execPath"], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "ignore"],
		timeout: 2000,
	});

	if (probe.status !== 0) return undefined;
	const candidate = probe.stdout.trim();
	if (!candidate) return undefined;
	return existsSync(candidate) ? candidate : undefined;
}

function resolveGitSslCaInfo(): string | undefined {
	if (cachedGitSslCaInfo !== null) {
		return cachedGitSslCaInfo || undefined;
	}

	const probe = spawnSync("git", ["config", "--get", "http.sslCAInfo"], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "ignore"],
		timeout: 2000,
	});

	if (probe.status !== 0) {
		cachedGitSslCaInfo = "";
		return undefined;
	}

	const candidate = probe.stdout.trim();
	cachedGitSslCaInfo = candidate;
	return candidate || undefined;
}

function resolveAutoDetectedCaBundlePath(): string | undefined {
	const candidates = [
		process.env.COPILOT_NODE_EXTRA_CA_CERTS?.trim(),
		process.env.NODE_EXTRA_CA_CERTS?.trim(),
		process.env.SSL_CERT_FILE?.trim(),
		process.env.CURL_CA_BUNDLE?.trim(),
		resolveGitSslCaInfo(),
		...KNOWN_CA_BUNDLE_PATHS,
	];

	for (const candidate of candidates) {
		if (!candidate) continue;
		if (existsSync(candidate)) {
			return candidate;
		}
	}

	return undefined;
}

function resolveBundledCopilotCliPath(): string | undefined {
	try {
		const sdkUrl = import.meta.resolve("@github/copilot/sdk");
		const sdkPath = fileURLToPath(sdkUrl);
		const cliPath = join(dirname(dirname(sdkPath)), "index.js");
		return existsSync(cliPath) ? cliPath : undefined;
	} catch {
		return undefined;
	}
}

function resolveRuntimeCliOverrides(): Pick<CopilotClientOptions, "cliArgs" | "cliPath"> {
	const explicitCliPath = process.env.COPILOT_CLI_PATH?.trim();
	if (explicitCliPath) {
		return { cliPath: explicitCliPath };
	}

	// Copilot SDK defaults to spawning the bundled CLI JS with process.execPath.
	// Under Bun, that means executing the CLI with Bun, which can hang auth/session RPC calls.
	if (!isBunRuntime()) {
		return {};
	}

	const nodePath = resolveNodeExecutablePath();
	const bundledCliPath = resolveBundledCopilotCliPath();
	if (!nodePath || !bundledCliPath) {
		return {};
	}

	return {
		cliPath: nodePath,
		cliArgs: [bundledCliPath],
	};
}

function resolveCopilotAuthConfig(): Pick<CopilotClientOptions, "useLoggedInUser"> {
	// DAEMON uses logged-in-user mode only for Copilot auth.
	return {
		useLoggedInUser: true,
	};
}

function buildCopilotChildEnv(
	authConfig: Pick<CopilotClientOptions, "useLoggedInUser">
): Record<string, string | undefined> {
	const env = { ...process.env };
	if (authConfig.useLoggedInUser) {
		// Prevent explicit Copilot SDK token env from overriding logged-in-user auth.
		env.COPILOT_SDK_AUTH_TOKEN = undefined;
	}

	const useSystemCa = parseBooleanFlag(process.env.COPILOT_USE_SYSTEM_CA, true);
	if (useSystemCa) {
		const existingNodeOptions = env.NODE_OPTIONS?.trim();
		const hasSystemCaFlag = Boolean(existingNodeOptions?.split(/\s+/).includes("--use-system-ca"));
		if (!hasSystemCaFlag) {
			env.NODE_OPTIONS = existingNodeOptions ? `${existingNodeOptions} --use-system-ca` : "--use-system-ca";
		}
	}

	const autoDetectCa = parseBooleanFlag(process.env.COPILOT_AUTO_DETECT_CA_CERTS, true);
	const extraCaPath =
		process.env.COPILOT_NODE_EXTRA_CA_CERTS?.trim() ??
		(autoDetectCa ? resolveAutoDetectedCaBundlePath() : undefined);
	if (extraCaPath && !env.NODE_EXTRA_CA_CERTS) {
		env.NODE_EXTRA_CA_CERTS = extraCaPath;
	}

	return env;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
	let timeoutId: ReturnType<typeof setTimeout> | null = null;
	try {
		return await Promise.race([
			promise,
			new Promise<T>((_, reject) => {
				timeoutId = setTimeout(() => {
					reject(new Error(message));
				}, timeoutMs);
			}),
		]);
	} finally {
		if (timeoutId) {
			clearTimeout(timeoutId);
		}
	}
}

async function hasGhCliAuth(): Promise<boolean> {
	const now = Date.now();
	if (ghAuthStatusCache && now - ghAuthStatusCache.checkedAt < GH_AUTH_CACHE_TTL_MS) {
		return ghAuthStatusCache.authenticated;
	}

	const authenticated = await new Promise<boolean>((resolve) => {
		let settled = false;
		const finish = (value: boolean) => {
			if (settled) return;
			settled = true;
			resolve(value);
		};

		const child = spawn("gh", ["auth", "status"], {
			stdio: "ignore",
		});

		const timeout = setTimeout(() => {
			child.kill();
			finish(false);
		}, 2000);

		child.on("error", () => {
			clearTimeout(timeout);
			finish(false);
		});

		child.on("exit", (code) => {
			clearTimeout(timeout);
			finish(code === 0);
		});
	});

	ghAuthStatusCache = {
		checkedAt: now,
		authenticated,
	};

	return authenticated;
}

export async function hasCopilotCliAuthSafe(): Promise<boolean> {
	try {
		return await hasGhCliAuth();
	} catch {
		return false;
	}
}

function buildClientOptions(): CopilotClientOptions {
	const authConfig = resolveCopilotAuthConfig();
	const cliOverrides = resolveRuntimeCliOverrides();

	return {
		...cliOverrides,
		env: buildCopilotChildEnv(authConfig),
		useLoggedInUser: authConfig.useLoggedInUser,
		autoStart: false,
		autoRestart: true,
		logLevel: "warning",
	};
}

function getFingerprint(options: CopilotClientOptions): string {
	return JSON.stringify({
		cliPath: options.cliPath ?? "default",
		cliArgs: options.cliArgs ?? [],
		useLoggedInUser: options.useLoggedInUser ?? true,
		nodeOptions: options.env?.NODE_OPTIONS ?? null,
		extraCaCerts: options.env?.NODE_EXTRA_CA_CERTS ?? null,
	});
}

async function stopRuntimeClientIfPresent(): Promise<void> {
	if (!runtime) return;
	try {
		await runtime.client.stop();
	} catch {
		// Ignore shutdown errors.
	} finally {
		runtime = null;
	}
}

async function ensureClient(): Promise<CopilotClient> {
	const options = buildClientOptions();
	const nextFingerprint = getFingerprint(options);

	if (runtime && runtime.fingerprint === nextFingerprint) {
		return runtime.client;
	}

	if (startupPromise) {
		return startupPromise;
	}

	startupPromise = (async () => {
		await stopRuntimeClientIfPresent();

		debug.info("copilot-client-start", {
			useLoggedInUser: options.useLoggedInUser ?? true,
			cliPath: options.cliPath ?? "default",
			cliArgs: options.cliArgs ?? [],
		});

		const client = new CopilotClient(options);
		try {
			await withTimeout(
				client.start(),
				parseTimeoutMs(process.env.COPILOT_CLIENT_START_TIMEOUT_MS, DEFAULT_CLIENT_START_TIMEOUT_MS),
				"Timed out while starting Copilot client."
			);
		} catch (error) {
			await client.stop().catch(() => {});
			throw error;
		}

		runtime = {
			fingerprint: nextFingerprint,
			client,
		};

		return client;
	})()
		.catch((error) => {
			const err = error instanceof Error ? error : new Error(String(error));
			debug.error("copilot-client-start-failed", { message: err.message });
			throw err;
		})
		.finally(() => {
			startupPromise = null;
		});

	return startupPromise;
}

export async function resetCopilotClient(): Promise<void> {
	await stopRuntimeClientIfPresent();
}

export async function getCopilotAuthStatusSafe(): Promise<GetAuthStatusResponse & { error?: string }> {
	try {
		const timeoutMs = parseTimeoutMs(process.env.COPILOT_AUTH_TIMEOUT_MS, DEFAULT_AUTH_STATUS_TIMEOUT_MS);
		const client = await withTimeout(
			ensureClient(),
			timeoutMs,
			"Timed out while preparing Copilot authentication."
		);
		const status = await withTimeout(
			client.getAuthStatus(),
			timeoutMs,
			"Timed out while checking Copilot authentication."
		);
		if (!status.isAuthenticated) {
			const hasGhAuth = await hasGhCliAuth();
			const statusMessage =
				typeof status.statusMessage === "string" && status.statusMessage.trim().length > 0
					? status.statusMessage
					: hasGhAuth
						? "GitHub CLI is authenticated, but Copilot SDK is not. Complete Copilot sign-in and retry."
						: "Copilot SDK is not authenticated.";
			return {
				...status,
				statusMessage,
			};
		}
		return status;
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		return {
			isAuthenticated: false,
			statusMessage: err.message,
			error: err.message,
		};
	}
}

export async function listCopilotModelsSafe(): Promise<ModelInfo[]> {
	const timeoutMs = parseTimeoutMs(process.env.COPILOT_MODELS_TIMEOUT_MS, DEFAULT_MODEL_LIST_TIMEOUT_MS);

	let lastError: Error | null = null;
	for (let attempt = 0; attempt < 2; attempt++) {
		const client = await withTimeout(
			ensureClient(),
			timeoutMs,
			"Timed out while preparing Copilot model listing."
		);
		try {
			const authStatus = await withTimeout(
				client.getAuthStatus(),
				timeoutMs,
				"Timed out while validating Copilot authentication before model listing."
			);
			if (!authStatus.isAuthenticated) {
				const statusMessage =
					typeof authStatus.statusMessage === "string" && authStatus.statusMessage.trim().length > 0
						? authStatus.statusMessage
						: "Copilot SDK is not authenticated.";
				throw new Error(
					`Copilot SDK is not authenticated while listing models: ${statusMessage}. Authenticate via GitHub and retry.`
				);
			}

			return await withTimeout(client.listModels(), timeoutMs, "Timed out while listing Copilot models.");
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			lastError = err;
			if (attempt === 0 && isModelListFailure(err)) {
				debug.warn("copilot-model-list-retry", { message: err.message });
				await resetCopilotClient();
				continue;
			}
			throw err;
		}
	}

	throw lastError ?? new Error("Failed to list Copilot models.");
}

export async function getOrCreateCopilotSession(
	sessionId: string,
	config: Omit<SessionConfig, "sessionId">
): Promise<{ session: CopilotSession; created: boolean }> {
	// Warm model cache and fail fast with an explicit auth/models error before session RPCs.
	const models = await listCopilotModelsSafe();
	const normalizedConfig = normalizeSessionConfigForModel(config, models);
	const requestedModelId =
		typeof normalizedConfig.model === "string" && normalizedConfig.model.trim().length > 0
			? normalizedConfig.model.trim()
			: undefined;

	const timeoutMs = parseTimeoutMs(process.env.COPILOT_SESSION_TIMEOUT_MS, DEFAULT_SESSION_TIMEOUT_MS);
	const scopedSessionId = resolveModelScopedSessionId(sessionId, requestedModelId);
	const normalizedSessionId = normalizeCopilotSessionId(scopedSessionId);

	let lastError: Error | null = null;
	for (let attempt = 0; attempt < 2; attempt++) {
		const client = await withTimeout(ensureClient(), timeoutMs, "Timed out while preparing Copilot session.");
		let resumeError: Error | null = null;

		try {
			const session = await withTimeout(
				client.resumeSession(normalizedSessionId, normalizedConfig),
				timeoutMs,
				"Timed out while resuming Copilot session."
			);
			return { session, created: false };
		} catch (error) {
			resumeError = error instanceof Error ? error : new Error(String(error));
			debug.error("copilot-session-resume-failed", {
				sessionId: normalizedSessionId,
				message: resumeError.message,
			});

			if (attempt === 0 && isModelListFailure(resumeError)) {
				debug.warn("copilot-session-resume-retry-after-model-list-failure", {
					message: resumeError.message,
				});
				await resetCopilotClient();
				continue;
			}
		}

		const resumeFailure = resumeError ?? new Error("Unknown Copilot session resume failure.");
		const fallbackSessionId = resumeFailure.message.includes("Timed out while resuming Copilot session.")
			? randomUUID()
			: normalizedSessionId;

		try {
			const session = await withTimeout(
				client.createSession({
					...normalizedConfig,
					sessionId: fallbackSessionId,
				}),
				timeoutMs,
				"Timed out while creating Copilot session."
			);
			return { session, created: true };
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			err.message = `${err.message} (resume fallback: ${resumeFailure.message})`;
			lastError = err;
			if (attempt === 0 && isModelListFailure(err)) {
				debug.warn("copilot-session-create-retry-after-model-list-failure", {
					message: err.message,
				});
				await resetCopilotClient();
				continue;
			}
			throw err;
		}
	}

	throw lastError ?? new Error("Failed to create Copilot session.");
}

function toFailureResult(
	message: string,
	error?: string,
	resultType: ToolResultObject["resultType"] = "failure"
) {
	return {
		textResultForLlm: message,
		resultType,
		error,
		toolTelemetry: {},
	} satisfies ToolResultObject;
}

async function resolveApproval(
	callbacks: StreamCallbacks,
	request: ToolApprovalRequest
): Promise<{ approved: boolean; reason?: string }> {
	callbacks.onToolApprovalRequest?.(request);

	if (!callbacks.onAwaitingApprovals) {
		return {
			approved: false,
			reason: "Tool execution was denied because no approval handler is registered.",
		};
	}

	const responses = await new Promise<ToolApprovalResponse[]>((resolve) => {
		callbacks.onAwaitingApprovals?.([request], (value) => resolve(value));
	});

	const response = responses.find((item) => item.approvalId === request.approvalId);
	if (!response) {
		return {
			approved: false,
			reason: "Tool execution was denied because no approval decision was returned.",
		};
	}

	return {
		approved: response.approved,
		reason: response.reason,
	};
}

function toJsonSchema(parameters: unknown): Record<string, unknown> | undefined {
	if (!parameters || typeof parameters !== "object") return undefined;

	if ("toJSONSchema" in parameters && typeof parameters.toJSONSchema === "function") {
		try {
			return parameters.toJSONSchema() as Record<string, unknown>;
		} catch {
			// Fall through to zod conversion.
		}
	}

	if ("safeParse" in parameters || "safeParseAsync" in parameters) {
		try {
			return zodToJsonSchema(parameters as ZodTypeAny, {
				target: "jsonSchema7",
				$refStrategy: "none",
			}) as Record<string, unknown>;
		} catch {
			return undefined;
		}
	}

	return undefined;
}

async function parseToolInput(
	schema: unknown,
	input: unknown
): Promise<
	| { ok: true; value: unknown }
	| {
			ok: false;
			error: string;
	  }
> {
	if (!schema || typeof schema !== "object") {
		return { ok: true, value: input };
	}

	if ("safeParseAsync" in schema && typeof schema.safeParseAsync === "function") {
		const parsed = await schema.safeParseAsync(input);
		if (!parsed.success) {
			return { ok: false, error: parsed.error.message };
		}
		return { ok: true, value: parsed.data };
	}

	if ("safeParse" in schema && typeof schema.safeParse === "function") {
		const parsed = schema.safeParse(input);
		if (!parsed.success) {
			return { ok: false, error: parsed.error.message };
		}
		return { ok: true, value: parsed.data };
	}

	return { ok: true, value: input };
}

export function convertToolSetToCopilotTools(tools: ToolSet, callbacks: StreamCallbacks): CopilotTool[] {
	return Object.entries(tools).map(([name, tool]) => {
		const inputSchema = (tool as { inputSchema?: unknown }).inputSchema;
		const execute = (tool as { execute?: (input: unknown, context?: unknown) => Promise<unknown> | unknown })
			.execute;
		const needsApproval = (tool as { needsApproval?: (input: unknown) => Promise<boolean> | boolean })
			.needsApproval;

		return defineTool(name, {
			description: (tool as { description?: string }).description,
			parameters: toJsonSchema(inputSchema),
			handler: async (rawInput: unknown, invocation: ToolInvocation) => {
				const parsed = await parseToolInput(inputSchema, rawInput);
				if (!parsed.ok) {
					return toFailureResult(
						"Tool input validation failed. The provided arguments are invalid.",
						parsed.error
					);
				}

				if (needsApproval) {
					let approved = false;
					let reason: string | undefined;

					try {
						const shouldAsk = await needsApproval(parsed.value);
						if (!shouldAsk) {
							approved = true;
						} else {
							const request: ToolApprovalRequest = {
								approvalId: `approval-${invocation.toolCallId}-${Date.now()}`,
								toolName: name,
								toolCallId: invocation.toolCallId,
								input: parsed.value,
							};
							const result = await resolveApproval(callbacks, request);
							approved = result.approved;
							reason = result.reason;
						}
					} catch (error) {
						const err = error instanceof Error ? error : new Error(String(error));
						return toFailureResult(
							"Tool approval failed. The command was not executed.",
							err.message,
							"denied"
						);
					}

					if (!approved) {
						return toFailureResult(
							`[DENIED] ${reason ?? "Tool execution was denied by the user."}`,
							reason,
							"denied"
						);
					}
				}

				if (!execute) {
					return toFailureResult(`Tool '${name}' is missing an execute handler.`);
				}

				try {
					return await execute(parsed.value, {
						toolCallId: invocation.toolCallId,
					});
				} catch (error) {
					const err = error instanceof Error ? error : new Error(String(error));
					return toFailureResult(
						"Invoking this tool produced an error. Detailed information is not available.",
						err.message
					);
				}
			},
		});
	});
}

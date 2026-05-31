import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	clearOpenAiCodexAuth,
	extractOpenAiCodexAccountId,
	formatOpenAiCodexOAuthError,
	formatOpenAiCodexRefreshError,
	hasOpenAiCodexAuthSafe,
	loadOpenAiCodexAuth,
	type OpenAiCodexAuthRecord,
} from "../src/ai/openai-codex-auth";
import { normalizeOpenAiCodexRequestInit, rewriteOpenAiCodexUrl } from "../src/ai/openai-codex-compat";
import { buildOpenAiCodexHeaders } from "../src/ai/openai-codex-fetch";

describe("openai codex auth", () => {
	const originalConfigDir = process.env.DAEMON_CONFIG_DIR;
	let configDir = "";

	function jwtWithPayload(payload: unknown): string {
		return [
			Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url"),
			Buffer.from(JSON.stringify(payload)).toString("base64url"),
			"signature",
		].join(".");
	}

	beforeEach(() => {
		configDir = mkdtempSync(path.join(os.tmpdir(), "daemon-codex-auth-"));
		process.env.DAEMON_CONFIG_DIR = configDir;
	});

	afterEach(async () => {
		await clearOpenAiCodexAuth();
		process.env.DAEMON_CONFIG_DIR = originalConfigDir;
	});

	it("loads persisted auth from the daemon config directory", async () => {
		const record: OpenAiCodexAuthRecord = {
			version: 1,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
			accessToken: "access-token",
			refreshToken: "refresh-token",
			expiresAt: Date.now() + 60_000,
			accountId: "workspace-123",
		};
		writeFileSync(path.join(configDir, "openai-codex-auth.json"), `${JSON.stringify(record, null, 2)}\n`);

		expect(await loadOpenAiCodexAuth()).toEqual(record);
		expect(await hasOpenAiCodexAuthSafe()).toBe(true);
	});

	it("clears persisted auth", async () => {
		const record: OpenAiCodexAuthRecord = {
			version: 1,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
			accessToken: "access-token",
			refreshToken: "refresh-token",
			expiresAt: Date.now() + 60_000,
			accountId: "workspace-123",
		};
		writeFileSync(path.join(configDir, "openai-codex-auth.json"), `${JSON.stringify(record, null, 2)}\n`);

		await clearOpenAiCodexAuth();

		expect(await loadOpenAiCodexAuth()).toBeNull();
		expect(await hasOpenAiCodexAuthSafe()).toBe(false);
	});

	it("builds the required codex auth headers", () => {
		const headers = buildOpenAiCodexHeaders(undefined, {
			version: 1,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
			accessToken: "access-token",
			refreshToken: "refresh-token",
			expiresAt: Date.now() + 60_000,
			accountId: "workspace-123",
		});

		expect(headers.get("Authorization")).toBe("Bearer access-token");
		expect(headers.get("ChatGPT-Account-ID")).toBe("workspace-123");
		expect(headers.get("OpenAI-Beta")).toBe("responses=experimental");
		expect(headers.get("originator")).toBe("codex_cli_rs");
	});

	it("extracts account id from supported token claim locations", () => {
		expect(
			extractOpenAiCodexAccountId({
				access_token: jwtWithPayload({
					"https://api.openai.com/auth": { chatgpt_account_id: "namespaced-account" },
				}),
			})
		).toBe("namespaced-account");

		expect(
			extractOpenAiCodexAccountId({
				id_token: jwtWithPayload({ chatgpt_account_id: "top-level-account" }),
			})
		).toBe("top-level-account");

		expect(
			extractOpenAiCodexAccountId({
				id_token: jwtWithPayload({ organizations: [{ id: "org-account" }] }),
			})
		).toBe("org-account");
	});

	it("formats actionable refresh token errors", () => {
		expect(formatOpenAiCodexRefreshError(401, JSON.stringify({ error: "refresh_token_expired" }))).toBe(
			"Your OpenAI Codex session expired. Please sign in again."
		);
		expect(
			formatOpenAiCodexRefreshError(401, JSON.stringify({ error: { code: "refresh_token_reused" } }))
		).toBe("Your OpenAI Codex refresh token was already used. Please sign in again.");
		expect(formatOpenAiCodexRefreshError(401, JSON.stringify({ code: "refresh_token_invalidated" }))).toBe(
			"Your OpenAI Codex refresh token was revoked. Please sign in again."
		);
	});

	it("formats oauth callback errors before missing code handling", () => {
		expect(formatOpenAiCodexOAuthError("access_denied", "missing_codex_entitlement")).toContain(
			"Codex is not enabled"
		);
		expect(formatOpenAiCodexOAuthError("access_denied", "User cancelled login")).toBe(
			"OpenAI Codex login failed: User cancelled login"
		);
	});

	it("adds codex client version without replacing an explicit version", () => {
		expect(rewriteOpenAiCodexUrl("https://chatgpt.com/backend-api/codex/models")).toContain(
			"client_version=0.134.0"
		);
		expect(rewriteOpenAiCodexUrl("https://chatgpt.com/backend-api/codex/models?client_version=custom")).toBe(
			"https://chatgpt.com/backend-api/codex/models?client_version=custom"
		);
	});

	it("moves system and developer messages into codex instructions", async () => {
		const init = await normalizeOpenAiCodexRequestInit({
			method: "POST",
			body: JSON.stringify({
				input: [
					{ role: "system", content: "System instruction" },
					{ role: "developer", content: [{ text: "Developer instruction" }] },
					{ role: "user", content: "Hello" },
				],
			}),
		});

		const body = JSON.parse(String(init?.body)) as { instructions?: string; input?: Array<{ role: string }> };
		expect(body.instructions).toBe("System instruction\n\nDeveloper instruction");
		expect(body.input).toEqual([{ role: "user", content: "Hello" }]);
	});
});

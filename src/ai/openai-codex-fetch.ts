import type { OpenAiCodexAuthRecord } from "./openai-codex-auth";
import { ensureOpenAiCodexAuth, refreshOpenAiCodexAuth } from "./openai-codex-auth";
import { normalizeOpenAiCodexRequestInit, rewriteOpenAiCodexUrl } from "./openai-codex-compat";
import { fetchOpenAiCodexWithTimeout } from "./openai-codex-http";

type OpenAiCodexHeadersInit = NonNullable<RequestInit["headers"]>;

export const OPENAI_CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex";

/** Build the headers Codex expects for authenticated backend requests. */
export function buildOpenAiCodexHeaders(
	headers: OpenAiCodexHeadersInit | undefined,
	auth: OpenAiCodexAuthRecord
): Headers {
	const nextHeaders = new Headers(headers);
	nextHeaders.set("Authorization", `Bearer ${auth.accessToken}`);
	nextHeaders.set("ChatGPT-Account-ID", auth.accountId);
	nextHeaders.set("OpenAI-Beta", "responses=experimental");
	nextHeaders.set("originator", "codex_cli_rs");
	return nextHeaders;
}

/**
 * Authenticated fetch wrapper for the Codex backend.
 * It normalizes request shape, injects auth headers, and retries once after a 401.
 */
export async function openAiCodexAuthenticatedFetch(
	input: Parameters<typeof fetch>[0],
	init?: RequestInit
): Promise<Response> {
	const url = rewriteOpenAiCodexUrl(input);
	const normalizedInit = await normalizeOpenAiCodexRequestInit(init);
	const auth = await ensureOpenAiCodexAuth();
	const attempt = async (record: OpenAiCodexAuthRecord) => {
		return await fetchOpenAiCodexWithTimeout(url, {
			...normalizedInit,
			headers: buildOpenAiCodexHeaders(normalizedInit?.headers, record),
		});
	};

	const initialResponse = await attempt(auth);
	if (initialResponse.status !== 401) {
		return initialResponse;
	}

	const refreshed = await refreshOpenAiCodexAuth();
	if (refreshed.accessToken === auth.accessToken) {
		return initialResponse;
	}

	return await attempt(refreshed);
}

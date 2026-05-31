const OPENAI_CODEX_REQUEST_TIMEOUT_MS = 60 * 1000;

export async function fetchOpenAiCodexWithTimeout(
	input: Parameters<typeof fetch>[0],
	init?: RequestInit,
	timeoutMs = OPENAI_CODEX_REQUEST_TIMEOUT_MS
): Promise<Response> {
	const controller = new AbortController();
	let timedOut = false;
	const externalSignal = init?.signal;
	const abortFromExternal = () => controller.abort(externalSignal?.reason);
	if (externalSignal?.aborted) {
		abortFromExternal();
	} else {
		externalSignal?.addEventListener("abort", abortFromExternal, { once: true });
	}

	const timeout = setTimeout(() => {
		timedOut = true;
		controller.abort(new Error(`OpenAI Codex request timed out after ${Math.round(timeoutMs / 1000)}s.`));
	}, timeoutMs);

	try {
		return await fetch(input, {
			...init,
			signal: controller.signal,
		});
	} catch (error) {
		if (timedOut) {
			throw new Error(`OpenAI Codex request timed out after ${Math.round(timeoutMs / 1000)}s.`);
		}
		throw error;
	} finally {
		clearTimeout(timeout);
		externalSignal?.removeEventListener("abort", abortFromExternal);
	}
}

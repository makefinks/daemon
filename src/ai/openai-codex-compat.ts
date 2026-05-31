// The Codex backend gates model discovery by Codex CLI client_version. Keep this
// near the current @openai/codex release so new subscription models appear.
const OPENAI_CODEX_CLIENT_VERSION = "0.134.0";

interface OpenAiCodexInputMessage {
	role?: string;
	content?: unknown;
	[key: string]: unknown;
}

interface OpenAiCodexRequestBody {
	instructions?: string;
	input?: unknown;
	stream?: boolean;
	[key: string]: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

/** Ensure every Codex backend request carries the required client_version marker. */
export function rewriteOpenAiCodexUrl(input: Parameters<typeof fetch>[0]): string {
	const url = new URL(
		typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
	);
	if (!url.searchParams.has("client_version")) {
		url.searchParams.set("client_version", OPENAI_CODEX_CLIENT_VERSION);
	}
	return url.toString();
}

/** Collapse known text-bearing input parts into a plain string for Codex instructions. */
function extractTextContent(content: unknown): string {
	if (typeof content === "string") {
		return content.trim();
	}
	if (!Array.isArray(content)) {
		return "";
	}
	return content
		.map((part) => {
			if (typeof part === "string") return part;
			if (!isRecord(part)) return "";
			if (typeof part.text === "string") return part.text;
			if (typeof part.content === "string") return part.content;
			return "";
		})
		.map((value) => value.trim())
		.filter(Boolean)
		.join("\n\n");
}

/**
 * Adapt AI SDK Responses payloads to the stricter Codex backend contract.
 * Codex expects top-level instructions and always uses streaming responses.
 */
export function transformOpenAiCodexBody(body: OpenAiCodexRequestBody): OpenAiCodexRequestBody {
	const nextBody: OpenAiCodexRequestBody = { ...body };
	if (nextBody.stream !== true) {
		nextBody.stream = true;
	}
	if (typeof nextBody.instructions === "string" && nextBody.instructions.trim().length > 0) {
		return nextBody;
	}
	if (!Array.isArray(nextBody.input)) {
		return nextBody;
	}

	const instructions: string[] = [];
	const nextInput: OpenAiCodexInputMessage[] = [];
	for (const item of nextBody.input as OpenAiCodexInputMessage[]) {
		if (!isRecord(item)) {
			nextInput.push(item);
			continue;
		}
		const role = typeof item.role === "string" ? item.role : undefined;
		if (role === "developer" || role === "system") {
			const text = extractTextContent(item.content);
			if (text) instructions.push(text);
			continue;
		}
		nextInput.push(item);
	}

	if (instructions.length > 0) {
		nextBody.instructions = instructions.join("\n\n");
		nextBody.input = nextInput;
	}

	return nextBody;
}

/** Parse and normalize a JSON request body only when the request actually carries one. */
export async function normalizeOpenAiCodexRequestInit(init?: RequestInit): Promise<RequestInit | undefined> {
	if (!init?.body) {
		return init;
	}

	let bodyText: string;
	if (typeof init.body === "string") {
		bodyText = init.body;
	} else {
		try {
			bodyText = await new Response(init.body).text();
		} catch {
			return init;
		}
	}

	if (!bodyText.trim()) {
		return init;
	}

	try {
		const parsed = JSON.parse(bodyText) as OpenAiCodexRequestBody;
		const transformed = transformOpenAiCodexBody(parsed);
		return {
			...init,
			body: JSON.stringify(transformed),
		};
	} catch {
		return init;
	}
}

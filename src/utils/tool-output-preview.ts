type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeWhitespace(text: string): string {
	return text.replace(/\r\n/g, "\n").replace(/\t/g, "  ");
}

function truncateText(text: string, maxChars: number): { text: string; truncated: boolean } {
	if (text.length <= maxChars) return { text, truncated: false };
	if (maxChars <= 1) return { text: "…", truncated: true };
	return { text: `${text.slice(0, maxChars - 1)}…`, truncated: true };
}

function splitPreviewLines(text: string, maxLines: number): { lines: string[]; truncated: boolean } {
	const normalized = normalizeWhitespace(text);
	const rawLines = normalized.split("\n");
	const trimmedLines = rawLines.map((l) => l.trimEnd()).filter((l) => l.length > 0);
	if (trimmedLines.length <= maxLines) return { lines: trimmedLines, truncated: false };
	return { lines: trimmedLines.slice(0, maxLines), truncated: true };
}

function tryStringify(value: unknown): string {
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint")
		return String(value);
	if (value === null) return "null";
	if (value === undefined) return "";
	try {
		return JSON.stringify(value, null, 2) ?? "";
	} catch {
		return String(value);
	}
}

type McpContentLike = {
	type?: unknown;
	text?: unknown;
	content?: unknown;
	data?: unknown;
	mimeType?: unknown;
};

function extractMcpContentText(item: unknown): string {
	if (!isRecord(item)) return "";
	const it = item as McpContentLike;
	if (typeof it.text === "string") return it.text;
	if (typeof it.content === "string") return it.content;
	if (typeof it.type === "string" && it.type === "text" && typeof it.data === "string") return it.data;
	if (typeof it.type === "string" && it.type === "image" && typeof it.mimeType === "string") {
		return `[Image: ${it.mimeType}]`;
	}
	return "";
}

function formatMcpLikeResult(result: unknown): string | null {
	if (!isRecord(result)) return null;

	const structuredContent =
		"structuredContent" in result ? (result as UnknownRecord).structuredContent : undefined;
	if (structuredContent !== undefined) {
		const raw = tryStringify(structuredContent);
		return raw.trim().length > 0 ? raw : null;
	}

	const content = "content" in result ? (result as UnknownRecord).content : undefined;
	if (Array.isArray(content)) {
		const pieces = content
			.map(extractMcpContentText)
			.map((t) => t.trim())
			.filter((t) => t.length > 0);
		const joined = pieces.join("\n");
		if (joined.trim().length > 0) {
			const isError = (result as UnknownRecord).isError === true;
			if (isError && !joined.toLowerCase().startsWith("error:")) {
				return `error: ${joined}`;
			}
			return joined;
		}
	}

	// Fallback: show the raw container (truncated downstream)
	const fallback = tryStringify(result);
	return fallback.trim().length > 0 ? fallback : null;
}

/**
 * Generic preview formatter for dynamic tools (e.g. MCP).
 */
export function formatGenericToolOutputPreview(result: unknown): string[] | null {
	if (result === undefined) return null;

	const raw = formatMcpLikeResult(result) ?? tryStringify(result);
	if (!raw.trim()) return ["(no output)"];

	const MAX_LINES = 4;
	const MAX_CHARS_PER_LINE = 160;
	const MAX_TOTAL_CHARS = 260;

	const { lines, truncated: lineTruncated } = splitPreviewLines(raw, MAX_LINES);

	let usedChars = 0;
	const outputLines: string[] = [];
	let anyTruncated = lineTruncated;

	for (const line of lines) {
		const remaining = Math.max(0, MAX_TOTAL_CHARS - usedChars);
		if (remaining <= 0) {
			anyTruncated = true;
			break;
		}
		const { text: truncatedLine, truncated } = truncateText(line, Math.min(MAX_CHARS_PER_LINE, remaining));
		anyTruncated = anyTruncated || truncated;
		outputLines.push(truncatedLine);
		usedChars += truncatedLine.length;
	}

	if (outputLines.length === 0) return ["(no output)"];

	if (anyTruncated && outputLines.length > 0) {
		const last = outputLines[outputLines.length - 1] ?? "";
		if (!last.endsWith("…")) {
			const { text } = truncateText(last, Math.max(1, last.length - 1));
			outputLines[outputLines.length - 1] = `${text}…`.replace(/……$/, "…");
		}
	}

	return outputLines;
}

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

function pickFirstNonEmpty(...parts: Array<string | undefined | null>): string {
	for (const part of parts) {
		if (typeof part === "string" && part.trim().length > 0) return part;
	}
	return "";
}

function formatBashResult(result: unknown): string | null {
	if (!isRecord(result)) return null;
	const success = "success" in result ? result.success : undefined;
	const exitCode =
		typeof result.exitCode === "number" || result.exitCode === null ? result.exitCode : undefined;

	const stdout = typeof result.stdout === "string" ? result.stdout : "";
	const stderr = typeof result.stderr === "string" ? result.stderr : "";
	const error = typeof result.error === "string" ? result.error : "";

	const body = pickFirstNonEmpty(stdout, stderr, error);
	if (!body) {
		if (typeof success === "boolean") {
			return `success=${success}${exitCode !== undefined ? ` exit=${String(exitCode)}` : ""}`;
		}
		return null;
	}

	const label = stdout.trim().length > 0 ? "stdout" : stderr.trim().length > 0 ? "stderr" : "error";
	const meta =
		typeof success === "boolean" || exitCode !== undefined
			? ` (${typeof success === "boolean" ? `success=${success}` : ""}${exitCode !== undefined ? `${typeof success === "boolean" ? " " : ""}exit=${String(exitCode)}` : ""})`
			: "";
	return `${label}${meta}: ${body}`;
}

type ExaLikeItem = {
	title?: unknown;
	url?: unknown;
	text?: unknown;
	lineOffset?: unknown;
	lineLimit?: unknown;
};

function extractExaItems(data: unknown): ExaLikeItem[] | null {
	if (!isRecord(data)) return null;
	const direct = data.results;
	if (Array.isArray(direct)) return direct as ExaLikeItem[];
	const contents = data.contents;
	if (Array.isArray(contents)) return contents as ExaLikeItem[];
	return null;
}

function extractToolDataContainer(result: UnknownRecord): unknown {
	if ("data" in result) return result.data;
	return result;
}

function formatExaItemLabel(item: ExaLikeItem): string {
	const title = typeof item.title === "string" ? item.title : "";
	const url = typeof item.url === "string" ? item.url : "";
	return pickFirstNonEmpty(title, url, "(untitled)");
}

function formatExaSearchResult(result: unknown): string | null {
	if (!isRecord(result)) return null;
	if (result.success === false && typeof result.error === "string") {
		return `error: ${result.error}`;
	}
	if (result.success !== true) return null;
	const data = extractToolDataContainer(result);
	const items = extractExaItems(data);
	if (!items) return null;

	const top = items.slice(0, 4).map((item, idx) => {
		const url = typeof item.url === "string" ? item.url : "";
		const title = typeof item.title === "string" ? item.title : "";
		const label = formatExaItemLabel(item);
		const urlSuffix = url && title ? ` — ${url}` : "";
		return `${idx + 1}) ${label}${urlSuffix}`;
	});

	return top.length > 0 ? top.join("\n") : null;
}

function formatExaFetchResult(result: unknown): string | null {
	if (!isRecord(result)) return null;
	if (result.success === false && typeof result.error === "string") {
		return `error: ${result.error}`;
	}
	if (result.success !== true) return null;
	const data = extractToolDataContainer(result);
	const candidate = isRecord(data) ? (data as ExaLikeItem & { remainingLines?: unknown }) : {};
	const label = formatExaItemLabel(candidate);
	const url = typeof candidate.url === "string" ? candidate.url : "";
	const title = typeof candidate.title === "string" ? candidate.title : "";
	const lineOffset = typeof candidate.lineOffset === "number" ? candidate.lineOffset : undefined;
	const lineLimit = typeof candidate.lineLimit === "number" ? candidate.lineLimit : undefined;
	const remainingLines =
		typeof (candidate as { remainingLines?: unknown }).remainingLines === "number" ||
		(candidate as { remainingLines?: unknown }).remainingLines === null
			? (candidate as { remainingLines: number | null }).remainingLines
			: undefined;
	const rangeParts: string[] = [];
	if (lineOffset !== undefined) rangeParts.push(`lineOffset=${lineOffset}`);
	if (lineLimit !== undefined) rangeParts.push(`lineLimit=${lineLimit}`);
	if (remainingLines !== undefined) {
		rangeParts.push(remainingLines === null ? "remainingLines=unknown" : `remainingLines=${remainingLines}`);
	}
	const remainingSuffix = rangeParts.length > 0 ? ` (${rangeParts.join(", ")})` : "";

	const headerBase = url && title ? `${label} — ${url}` : label;
	const header = `${headerBase}${remainingSuffix}`;

	const text = typeof candidate.text === "string" ? candidate.text : "";
	if (!text.trim()) return header;

	// Provide a small snippet; downstream truncation enforces the hard caps.
	const snippet = normalizeWhitespace(text)
		.replace(/\n{3,}/g, "\n\n")
		.trim();

	return `${header}\n${snippet}`;
}

function formatRenderUrlResult(result: unknown): string | null {
	if (!isRecord(result)) return null;
	if (result.success === false && typeof result.error === "string") {
		return `error: ${result.error}`;
	}
	if (result.success !== true) return null;

	const url = typeof result.url === "string" ? result.url : "(unknown url)";
	const lineOffset = typeof result.lineOffset === "number" ? result.lineOffset : undefined;
	const lineLimit = typeof result.lineLimit === "number" ? result.lineLimit : undefined;
	const remainingLines = typeof result.remainingLines === "number" ? result.remainingLines : null;
	const rangeParts: string[] = [];
	if (lineOffset !== undefined) rangeParts.push(`lineOffset=${lineOffset}`);
	if (lineLimit !== undefined) rangeParts.push(`lineLimit=${lineLimit}`);
	rangeParts.push(remainingLines === null ? "remainingLines=unknown" : `remainingLines=${remainingLines}`);
	const remainingSuffix = rangeParts.length > 0 ? ` (${rangeParts.join(", ")})` : "";

	const header = `${url}${remainingSuffix}`;

	const text = typeof result.text === "string" ? result.text : "";
	if (!text.trim()) return header;

	const snippet = normalizeWhitespace(text)
		.replace(/\n{3,}/g, "\n\n")
		.trim();

	return `${header}\n${snippet}`;
}

function formatReadFileResult(result: unknown): string | null {
	if (!isRecord(result)) return null;
	if (result.success === false && typeof result.error === "string") {
		return `error: ${result.error}`;
	}
	if (result.success !== true) return null;
	const path = typeof result.path === "string" ? result.path : "";
	const startLine = typeof result.startLine === "number" ? result.startLine : undefined;
	const endLine = typeof result.endLine === "number" ? result.endLine : undefined;
	const hasMore = typeof result.hasMore === "boolean" ? result.hasMore : undefined;
	const content = typeof result.content === "string" ? result.content : "";

	const range =
		startLine !== undefined && endLine !== undefined && startLine > 0 && endLine > 0
			? ` (${startLine}-${endLine}${hasMore ? "+" : ""})`
			: "";

	if (!content.trim()) return path ? `${path}${range}` : null;
	return `${path}${range}:\n${content}`;
}

function tryStringify(value: unknown): string {
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint")
		return String(value);
	if (value === null) return "null";
	if (value === undefined) return "undefined";
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

type McpContentLike = {
	type?: unknown;
	text?: unknown;
	content?: unknown;
	data?: unknown;
};

function extractMcpContentText(item: unknown): string {
	if (!isRecord(item)) return "";
	const it = item as McpContentLike;
	if (typeof it.text === "string") return it.text;
	if (typeof it.content === "string") return it.content;
	if (typeof it.type === "string" && it.type === "text" && typeof it.data === "string") return it.data;
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
 * Format a very small, terminal-safe preview of a tool result.
 * Intended for the tool call UI box (not full logs).
 */
export function formatToolOutputPreview(toolName: string, result: unknown): string[] | null {
	if (result === undefined) return null;

	let raw: string | null = null;
	if (toolName === "runBash") raw = formatBashResult(result);
	if (toolName === "webSearch") raw = formatExaSearchResult(result);
	if (toolName === "fetchUrls") raw = formatExaFetchResult(result);
	if (toolName === "renderUrl") raw = formatRenderUrlResult(result);
	if (toolName === "readFile") raw = formatReadFileResult(result);

	if (!raw) {
		if (isRecord(result) && result.success === false && typeof result.error === "string") {
			raw = `error: ${result.error}`;
		} else {
			return null;
		}
	}

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

	if (anyTruncated && outputLines.length > 0) {
		const last = outputLines[outputLines.length - 1] ?? "";
		if (!last.endsWith("…")) {
			const { text } = truncateText(last, Math.max(1, last.length - 1));
			outputLines[outputLines.length - 1] = `${text}…`.replace(/……$/, "…");
		}
	}

	return outputLines.length > 0 ? outputLines : null;
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

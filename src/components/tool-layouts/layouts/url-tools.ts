import type { ToolLayoutConfig, ToolHeader } from "../types";
import { registerToolLayout } from "../registry";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface FetchUrlsInput {
	url: string;
	lineOffset?: number;
	lineLimit?: number;
	highlightQuery?: string;
}

function extractFetchUrlsInput(input: unknown): FetchUrlsInput | null {
	if (!isRecord(input)) return null;
	if (!("url" in input) || typeof input.url !== "string") return null;

	const lineOffset =
		"lineOffset" in input && typeof input.lineOffset === "number" ? input.lineOffset : undefined;
	const lineLimit = "lineLimit" in input && typeof input.lineLimit === "number" ? input.lineLimit : undefined;
	const highlightQuery =
		"highlightQuery" in input && typeof input.highlightQuery === "string" ? input.highlightQuery : undefined;
	return { url: input.url, lineOffset, lineLimit, highlightQuery };
}

function mergeFetchUrlsDefaults(input: FetchUrlsInput | null, result?: unknown): FetchUrlsInput | null {
	if (!input) return null;
	if (!result || typeof result !== "object") return input;

	const resultRecord = result as Record<string, unknown>;
	const lineOffset =
		input.lineOffset ?? (typeof resultRecord.lineOffset === "number" ? resultRecord.lineOffset : undefined);
	const lineLimit =
		input.lineLimit ?? (typeof resultRecord.lineLimit === "number" ? resultRecord.lineLimit : undefined);

	return { ...input, lineOffset, lineLimit };
}

function formatFetchUrlsHeader(input: FetchUrlsInput): string {
	if (input.highlightQuery) {
		return `highlight: "${input.highlightQuery}"`;
	}
	const parts: string[] = [];
	if (input.lineOffset !== undefined) {
		parts.push(`lineOffset=${input.lineOffset}`);
	}
	if (input.lineLimit !== undefined) {
		parts.push(`lineLimit=${input.lineLimit}`);
	}
	return parts.length > 0 ? `(${parts.join(", ")})` : "";
}

function normalizeWhitespace(text: string): string {
	return text.replace(/\r\n/g, "\n").replace(/\t/g, "  ");
}

type ExaLikeItem = {
	title?: unknown;
	url?: unknown;
	text?: unknown;
	lineOffset?: unknown;
	lineLimit?: unknown;
	remainingLines?: unknown;
};

function formatExaItemLabel(item: ExaLikeItem): string {
	const title = typeof item.title === "string" ? item.title : "";
	const url = typeof item.url === "string" ? item.url : "";
	return title || url || "(untitled)";
}

function extractToolDataContainer(result: UnknownRecord): unknown {
	if ("data" in result) return result.data;
	return result;
}

function formatFetchUrlsResult(result: unknown): string[] | null {
	if (!isRecord(result)) return null;
	if (result.success === false && typeof result.error === "string") {
		return [`error: ${result.error}`];
	}
	if (result.success !== true) return null;

	if (Array.isArray(result.highlights)) {
		return formatHighlightsResult(result);
	}

	const data = extractToolDataContainer(result);
	const candidate = isRecord(data) ? (data as ExaLikeItem) : {};
	const label = formatExaItemLabel(candidate);
	const url = typeof candidate.url === "string" ? candidate.url : "";
	const title = typeof candidate.title === "string" ? candidate.title : "";
	const lineOffset = typeof candidate.lineOffset === "number" ? candidate.lineOffset : undefined;
	const lineLimit = typeof candidate.lineLimit === "number" ? candidate.lineLimit : undefined;
	const remainingLines =
		typeof candidate.remainingLines === "number" || candidate.remainingLines === null
			? candidate.remainingLines
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
	if (!text.trim()) return [header];

	const MAX_LINES = 4;
	const MAX_CHARS = 160;
	const snippet = normalizeWhitespace(text)
		.replace(/\n{3,}/g, "\n\n")
		.trim()
		.split("\n")
		.slice(0, MAX_LINES)
		.map((l) => (l.length > MAX_CHARS ? `${l.slice(0, MAX_CHARS - 1)}…` : l));

	return [header, ...snippet];
}

function formatHighlightsResult(result: UnknownRecord): string[] {
	const highlights = result.highlights as unknown[];
	const highlightQuery = typeof result.highlightQuery === "string" ? result.highlightQuery : "";
	const count = highlights.length;

	const lines: string[] = [`${count} highlight${count !== 1 ? "s" : ""} for "${highlightQuery}"`];

	const MAX_HIGHLIGHTS = 3;
	const MAX_CHARS = 120;

	highlights.slice(0, MAX_HIGHLIGHTS).forEach((h, idx) => {
		if (typeof h === "string") {
			const clean = h.replace(/\n+/g, " ").trim();
			const truncated = clean.length > MAX_CHARS ? `${clean.slice(0, MAX_CHARS - 1)}…` : clean;
			lines.push(`  ${idx + 1}. "${truncated}"`);
		}
	});

	if (highlights.length > MAX_HIGHLIGHTS) {
		lines.push(`  ...and ${highlights.length - MAX_HIGHLIGHTS} more`);
	}

	return lines;
}

function formatRenderUrlResult(result: unknown): string[] | null {
	if (!isRecord(result)) return null;
	if (result.success === false && typeof result.error === "string") {
		return [`error: ${result.error}`];
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
	if (!text.trim()) return [header];

	const MAX_LINES = 4;
	const MAX_CHARS = 160;
	const snippet = normalizeWhitespace(text)
		.replace(/\n{3,}/g, "\n\n")
		.trim()
		.split("\n")
		.slice(0, MAX_LINES)
		.map((l) => (l.length > MAX_CHARS ? `${l.slice(0, MAX_CHARS - 1)}…` : l));

	return [header, ...snippet];
}

export const fetchUrlsLayout: ToolLayoutConfig = {
	abbreviation: "fetch",

	getHeader: (input, result): ToolHeader | null => {
		const urlInput = mergeFetchUrlsDefaults(extractFetchUrlsInput(input), result);
		if (!urlInput) return null;
		const headerSuffix = formatFetchUrlsHeader(urlInput);
		return {
			primary: urlInput.url,
			secondary: headerSuffix || undefined,
		};
	},

	formatResult: formatFetchUrlsResult,
};

export const renderUrlLayout: ToolLayoutConfig = {
	abbreviation: "render",

	getHeader: (input, result): ToolHeader | null => {
		const urlInput = mergeFetchUrlsDefaults(extractFetchUrlsInput(input), result);
		if (!urlInput) return null;
		const headerSuffix = formatFetchUrlsHeader(urlInput);
		return {
			primary: urlInput.url,
			secondary: headerSuffix || undefined,
		};
	},

	formatResult: formatRenderUrlResult,
};

registerToolLayout("fetchUrls", fetchUrlsLayout);
registerToolLayout("renderUrl", renderUrlLayout);

import type { ToolLayoutConfig, ToolHeader } from "../types";
import { COLORS } from "../../../ui/constants";
import { registerToolLayout } from "../registry";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface FetchUrlsRequestInput {
	url: string;
	lineOffset?: number;
	lineLimit?: number;
}

type FetchUrlsResultItem = {
	success?: unknown;
	url?: unknown;
	text?: unknown;
	lineOffset?: unknown;
	lineLimit?: unknown;
	remainingLines?: unknown;
	error?: unknown;
	title?: unknown;
};

function extractFetchUrlsRequests(input: unknown): FetchUrlsRequestInput[] | null {
	if (!isRecord(input)) return null;
	if (!("requests" in input) || !Array.isArray(input.requests)) return null;

	const requests: FetchUrlsRequestInput[] = [];
	for (const item of input.requests) {
		if (!isRecord(item)) continue;
		if (!("url" in item) || typeof item.url !== "string") continue;
		const lineOffset =
			"lineOffset" in item && typeof item.lineOffset === "number" ? item.lineOffset : undefined;
		const lineLimit = "lineLimit" in item && typeof item.lineLimit === "number" ? item.lineLimit : undefined;
		requests.push({ url: item.url, lineOffset, lineLimit });
	}

	return requests.length > 0 ? requests : null;
}

function extractRenderUrlInput(input: unknown): FetchUrlsRequestInput | null {
	if (!input) return null;
	if (!isRecord(input)) return null;
	if (!("url" in input) || typeof input.url !== "string") return null;

	const lineOffset =
		"lineOffset" in input && typeof input.lineOffset === "number" ? input.lineOffset : undefined;
	const lineLimit = "lineLimit" in input && typeof input.lineLimit === "number" ? input.lineLimit : undefined;
	return { url: input.url, lineOffset, lineLimit };
}

function extractFetchUrlsResults(result?: unknown): FetchUrlsResultItem[] | null {
	if (!result || typeof result !== "object") return null;
	const record = result as Record<string, unknown>;
	const container = extractToolDataContainer(record);
	if (!isRecord(container)) return null;

	if (Array.isArray(container.results)) {
		return container.results.filter((item): item is FetchUrlsResultItem => isRecord(item));
	}

	return null;
}

function mergeFetchUrlsDefaults(
	input: FetchUrlsRequestInput,
	result?: FetchUrlsResultItem | null
): FetchUrlsRequestInput {
	if (!result) return input;
	const lineOffset =
		input.lineOffset ?? (typeof result.lineOffset === "number" ? result.lineOffset : undefined);
	const lineLimit = input.lineLimit ?? (typeof result.lineLimit === "number" ? result.lineLimit : undefined);

	return { ...input, lineOffset, lineLimit };
}

function formatFetchUrlsHeader(input: FetchUrlsRequestInput): string {
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

function escapeXmlAttribute(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

type ExaLikeItem = {
	title?: unknown;
	url?: unknown;
	text?: unknown;
	lineOffset?: unknown;
	lineLimit?: unknown;
	remainingLines?: unknown;
	totalLines?: unknown;
	error?: unknown;
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
	if (typeof result === "string") {
		const lines = result.split("\n");
		const MAX_LINES = 8;
		if (lines.length <= MAX_LINES) return lines;
		return [...lines.slice(0, MAX_LINES - 1), "  ..."];
	}
	if (!isRecord(result)) return null;
	if (result.success === false && typeof result.error === "string") {
		return [`error: ${result.error}`];
	}
	if (result.success !== true) return null;

	const items = extractFetchUrlsResults(result);
	if (!items) return null;

	const lines: string[] = ["<fetchUrls>"];
	const MAX_LINES = 2;
	const MAX_CHARS = 160;
	const maxItems = 3;

	for (const item of items.slice(0, maxItems)) {
		const candidate = item as ExaLikeItem;
		const url = typeof candidate.url === "string" ? candidate.url : "";
		if (!url) continue;

		const attributes: string[] = [`href="${escapeXmlAttribute(url)}"`];
		if (typeof candidate.lineOffset === "number") attributes.push(`lineOffset="${candidate.lineOffset}"`);
		if (typeof candidate.lineLimit === "number") attributes.push(`lineLimit="${candidate.lineLimit}"`);
		if (typeof candidate.totalLines === "number") attributes.push(`totalLines="${candidate.totalLines}"`);
		if (typeof candidate.remainingLines === "number") {
			attributes.push(`remainingLines="${candidate.remainingLines}"`);
		} else if (candidate.remainingLines === null) {
			attributes.push(`remainingLines="unknown"`);
		}

		if (candidate.success === false && typeof candidate.error === "string") {
			attributes.push(`error="${escapeXmlAttribute(candidate.error)}"`);
			lines.push(`  <url ${attributes.join(" ")} />`);
			continue;
		}

		const text = typeof candidate.text === "string" ? candidate.text : "";
		if (!text.trim()) {
			lines.push(`  <url ${attributes.join(" ")} />`);
			continue;
		}

		const snippetLines = normalizeWhitespace(text)
			.replace(/\n{3,}/g, "\n\n")
			.trim()
			.split("\n")
			.slice(0, MAX_LINES)
			.map((l) => (l.length > MAX_CHARS ? `${l.slice(0, MAX_CHARS - 1)}…` : l));

		lines.push(`  <url ${attributes.join(" ")}>`);
		for (const line of snippetLines) {
			lines.push(`    ${escapeXmlAttribute(line)}`);
		}
		lines.push("  </url>");
	}

	lines.push("</fetchUrls>");
	return lines.length > 2 ? lines : null;
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
		const requests = extractFetchUrlsRequests(input);
		if (!requests) return null;
		const items = extractFetchUrlsResults(result);
		const firstResult = items?.[0] ?? null;
		const first = mergeFetchUrlsDefaults(requests[0] as FetchUrlsRequestInput, firstResult);
		if (requests.length === 1) {
			const headerSuffix = formatFetchUrlsHeader(first);
			return {
				primary: first.url,
				secondary: headerSuffix || undefined,
			};
		}

		return {
			primary: `${requests.length} urls`,
		};
	},

	getBody: (input, result): ToolBody | null => {
		const requests = extractFetchUrlsRequests(input);
		if (!requests) return null;
		if (requests.length === 1) return null;
		const items = extractFetchUrlsResults(result) ?? [];
		const lines = requests.map((request, index) => {
			const merged = mergeFetchUrlsDefaults(request, items[index] ?? null);
			const suffix = formatFetchUrlsHeader(merged);
			const text = suffix ? `${merged.url} ${suffix}` : merged.url;
			return { text, color: COLORS.REASONING_DIM };
		});
		return { lines };
	},

	formatResult: formatFetchUrlsResult,
};

export const renderUrlLayout: ToolLayoutConfig = {
	abbreviation: "render",

	getHeader: (input, result): ToolHeader | null => {
		const urlInput = extractRenderUrlInput(input);
		if (!urlInput) return null;
		const merged = mergeFetchUrlsDefaults(
			urlInput,
			isRecord(result) ? (result as FetchUrlsResultItem) : null
		);
		const headerSuffix = formatFetchUrlsHeader(merged);
		return {
			primary: merged.url,
			secondary: headerSuffix || undefined,
		};
	},

	formatResult: formatRenderUrlResult,
};

registerToolLayout("fetchUrls", fetchUrlsLayout);
registerToolLayout("renderUrl", renderUrlLayout);

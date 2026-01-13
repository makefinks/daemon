import type { ToolLayoutConfig, ToolHeader } from "../types";
import { registerToolLayout } from "../registry";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface SearchInput {
	query: string;
	recency?: string;
	includeDomains?: string[];
}

function extractSearchInput(input: unknown): SearchInput | null {
	if (!isRecord(input)) return null;
	if (!("query" in input) || typeof input.query !== "string") return null;

	const recency = "recency" in input && typeof input.recency === "string" ? input.recency : undefined;
	const includeDomains =
		"includeDomains" in input && Array.isArray(input.includeDomains)
			? (input.includeDomains.filter((d) => typeof d === "string") as string[])
			: undefined;

	return { query: input.query, recency, includeDomains };
}

type ExaLikeItem = {
	title?: unknown;
	url?: unknown;
	text?: unknown;
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
	return title || url || "(untitled)";
}

function formatWebSearchResult(result: unknown): string[] | null {
	if (!isRecord(result)) return null;
	if (result.success === false && typeof result.error === "string") {
		return [`error: ${result.error}`];
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

	return top.length > 0 ? top : null;
}

function formatSearchParams(input: SearchInput): string | undefined {
	const parts: string[] = [];
	if (input.recency) {
		parts.push(`recency: ${input.recency}`);
	}
	if (input.includeDomains && input.includeDomains.length > 0) {
		const domains = input.includeDomains.slice(0, 2).join(", ");
		const suffix = input.includeDomains.length > 2 ? ` +${input.includeDomains.length - 2}` : "";
		parts.push(`domains: ${domains}${suffix}`);
	}
	return parts.length > 0 ? parts.join(" · ") : undefined;
}

const MAX_INLINE_CHARS = 60;

export const webSearchLayout: ToolLayoutConfig = {
	abbreviation: "search",

	getHeader: (input): ToolHeader | null => {
		const searchInput = extractSearchInput(input);
		if (!searchInput) return null;
		const truncated =
			searchInput.query.length > MAX_INLINE_CHARS
				? `${searchInput.query.slice(0, MAX_INLINE_CHARS - 1)}…`
				: searchInput.query;
		return {
			primary: `"${truncated}"`,
			secondary: formatSearchParams(searchInput),
		};
	},

	formatResult: formatWebSearchResult,
};

registerToolLayout("webSearch", webSearchLayout);

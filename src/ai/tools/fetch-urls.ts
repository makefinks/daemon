import { tool } from "ai";
import { z } from "zod";
import { getExaClient } from "../exa-client";
import { getCachedPage, setCachedPage } from "../exa-fetch-cache";

const DEFAULT_LINE_LIMIT = 40;
const MAX_CHAR_LIMIT = 50_000;
const MAX_LINE_LIMIT = 1000;
const DEFAULT_HIGHLIGHTS_PER_URL = 5;
const DEFAULT_NUM_SENTENCES = 2;

function normalizeLines(text: string): string[] {
	return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

interface HighlightResult {
	highlights: string[];
	highlightQuery: string;
}

interface TextResult {
	text: string;
	lineOffset: number;
	lineLimit: number;
	totalLines: number;
	remainingLines: number | null;
}

export const fetchUrls = tool({
	description: `Fetch page contents from a URL. Two modes available:

1. **Text mode (default)**: Reads paginated text content. Start with lineLimit 40, use lineOffset for pagination.

2. **Highlights mode**: Pass highlightQuery to get semantically relevant excerpts instead of full text. Great for checking URL relevance or extracting specific facts. Returns the most relevant snippets matching your query.

When highlightQuery is provided, lineOffset/lineLimit are ignored.`,
	inputSchema: z.object({
		url: z.string().url().describe("URL to fetch content from."),
		lineOffset: z
			.number()
			.int()
			.min(0)
			.optional()
			.describe(
				"0-based line offset to start reading from. For pagination (lineOffset > 0), provide lineLimit too."
			),
		lineLimit: z
			.number()
			.int()
			.min(1)
			.max(MAX_LINE_LIMIT)
			.optional()
			.describe(
				`Maximum lines to read per URL (max ${MAX_LINE_LIMIT}). If provided without lineOffset, reads from the start.`
			),
		highlightQuery: z
			.string()
			.optional()
			.describe(
				"Natural language query for semantic highlights. When provided, returns relevant excerpts instead of paginated text."
			),
	}),
	execute: async ({ url, lineOffset, lineLimit, highlightQuery }) => {
		if (highlightQuery) {
			return fetchWithHighlights(url, highlightQuery);
		}
		return fetchWithPagination(url, lineOffset, lineLimit);
	},
});

async function fetchWithHighlights(
	url: string,
	highlightQuery: string
): Promise<
	({ success: true; url: string } & HighlightResult) | { success: false; url: string; error: string }
> {
	const exaClientResult = getExaClient();
	if ("error" in exaClientResult) {
		return { success: false, url, error: exaClientResult.error };
	}

	try {
		const rawData = (await exaClientResult.client.getContents([url], {
			highlights: {
				query: highlightQuery,
				numSentences: DEFAULT_NUM_SENTENCES,
				highlightsPerUrl: DEFAULT_HIGHLIGHTS_PER_URL,
			},
		})) as unknown as {
			results?: Array<{
				url?: string;
				highlights?: string[];
				[key: string]: unknown;
			}>;
		};

		const first = rawData.results?.[0];
		const highlights = first?.highlights ?? [];

		return {
			success: true,
			url,
			highlights,
			highlightQuery,
		};
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		return { success: false, url, error: err.message };
	}
}

async function fetchWithPagination(
	url: string,
	lineOffset?: number,
	lineLimit?: number
): Promise<({ success: true; url: string } & TextResult) | { success: false; url: string; error: string }> {
	const hasLineOffset = typeof lineOffset === "number";
	const hasLineLimit = typeof lineLimit === "number";

	if (hasLineOffset && !hasLineLimit && (lineOffset ?? 0) > 0) {
		return {
			success: false,
			url,
			error: "Provide both lineOffset and lineLimit for paginated reads (lineOffset > 0).",
		};
	}

	const effectiveLineOffset = hasLineOffset ? lineOffset : 0;
	const effectiveLineLimit = hasLineLimit ? lineLimit : DEFAULT_LINE_LIMIT;

	const cached = getCachedPage(url);
	if (cached) {
		return paginateText(url, cached.text, effectiveLineOffset, effectiveLineLimit);
	}

	const exaClientResult = getExaClient();
	if ("error" in exaClientResult) {
		return { success: false, url, error: exaClientResult.error };
	}

	try {
		const rawData = (await exaClientResult.client.getContents([url], {
			text: { maxCharacters: MAX_CHAR_LIMIT },
		})) as unknown as {
			results?: Array<{
				url?: string;
				text?: string;
				[key: string]: unknown;
			}>;
		};

		const first = rawData.results?.[0];
		const fullText = first?.text ?? "";
		const cappedText = fullText.slice(0, MAX_CHAR_LIMIT);

		setCachedPage(url, cappedText);

		return paginateText(url, cappedText, effectiveLineOffset, effectiveLineLimit);
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		return { success: false, url, error: err.message };
	}
}

function paginateText(
	url: string,
	fullText: string,
	lineOffset: number,
	lineLimit: number
): { success: true; url: string } & TextResult {
	const lines = normalizeLines(fullText);
	const cappedOffset = Math.min(lineOffset, lines.length);
	const cappedEnd = Math.min(cappedOffset + lineLimit, lines.length);
	const slicedText = lines.slice(cappedOffset, cappedEnd).join("\n");
	const truncatedByFetchLimit = fullText.length >= MAX_CHAR_LIMIT;
	const remainingLines = truncatedByFetchLimit ? null : Math.max(0, lines.length - cappedEnd);

	return {
		success: true,
		url,
		text: slicedText,
		lineOffset: lineOffset,
		lineLimit: lineLimit,
		totalLines: lines.length,
		remainingLines,
	};
}

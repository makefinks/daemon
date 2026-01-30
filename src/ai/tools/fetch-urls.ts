import { tool } from "ai";
import { z } from "zod";
import { getExaClient } from "../exa-client";
import { getCachedPage, setCachedPage } from "../exa-fetch-cache";

const DEFAULT_LINE_LIMIT = 40;
const MAX_CHAR_LIMIT = 50_000;
const MAX_LINE_LIMIT = 1000;
function normalizeLines(text: string): string[] {
	return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

function escapeXmlAttribute(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

interface TextResult {
	text: string;
	lineOffset: number;
	lineLimit: number;
	totalLines: number;
	remainingLines: number | null;
}

type FetchUrlsItem =
	| ({ success: true; url: string } & TextResult)
	| { success: false; url: string; error: string };

export const fetchUrls = tool({
	description: `Fetch page contents from one or more URLs.

**Text mode (default)**: Reads paginated text content. Start with lineLimit 40, use lineOffset for pagination.`,
	inputSchema: z.object({
		requests: z
			.array(
				z.object({
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
				})
			)
			.min(1)
			.describe("Per-URL fetch requests."),
	}),
	execute: async ({ requests }) => {
		const exaClientResult = getExaClient();
		if ("error" in exaClientResult) {
			return `<fetchUrls error="${escapeXmlAttribute(exaClientResult.error)}" />`;
		}

		const normalizedRequests = requests.map((request) => {
			const hasLineOffset = typeof request.lineOffset === "number";
			const hasLineLimit = typeof request.lineLimit === "number";
			const invalidPagination = hasLineOffset && !hasLineLimit && (request.lineOffset ?? 0) > 0;
			return {
				...request,
				invalidPagination,
				effectiveLineOffset: hasLineOffset ? request.lineOffset : 0,
				effectiveLineLimit: hasLineLimit ? request.lineLimit : DEFAULT_LINE_LIMIT,
			};
		});

		const cachedTextByUrl = new Map<string, string>();
		const urlsToFetch = new Set<string>();

		for (const request of normalizedRequests) {
			if (request.invalidPagination) continue;
			const cached = getCachedPage(request.url);
			if (cached) {
				cachedTextByUrl.set(request.url, cached.text);
			} else {
				urlsToFetch.add(request.url);
			}
		}

		const fetchedTextByUrl = new Map<string, string>();
		let fetchError: string | null = null;
		if (urlsToFetch.size > 0) {
			try {
				const urlList = Array.from(urlsToFetch);
				const rawData = (await exaClientResult.client.getContents(urlList, {
					text: { maxCharacters: MAX_CHAR_LIMIT },
				})) as unknown as {
					results?: Array<{
						url?: string;
						text?: string;
						[key: string]: unknown;
					}>;
				};

				for (const item of rawData.results ?? []) {
					if (typeof item.url !== "string") continue;
					const fullText = typeof item.text === "string" ? item.text : "";
					const cappedText = fullText.slice(0, MAX_CHAR_LIMIT);
					if (cappedText.trim().length > 0) {
						setCachedPage(item.url, cappedText);
						fetchedTextByUrl.set(item.url, cappedText);
					}
				}
			} catch (error) {
				const err = error instanceof Error ? error : new Error(String(error));
				fetchError = err.message;
			}
		}

		if (fetchError && cachedTextByUrl.size === 0 && fetchedTextByUrl.size === 0) {
			return `<fetchUrls error="${escapeXmlAttribute(fetchError)}" />`;
		}

		const results: FetchUrlsItem[] = normalizedRequests.map((request) => {
			if (request.invalidPagination) {
				return {
					success: false,
					url: request.url,
					error: "Provide both lineOffset and lineLimit for paginated reads (lineOffset > 0).",
				};
			}

			const text =
				cachedTextByUrl.get(request.url) ??
				fetchedTextByUrl.get(request.url) ??
				getCachedPage(request.url)?.text ??
				"";

			if (!text) {
				const error = fetchError ? fetchError : "No text returned for URL.";
				return { success: false, url: request.url, error };
			}

			return paginateText(request.url, text, request.effectiveLineOffset, request.effectiveLineLimit);
		});

		return formatFetchUrlsXml(results);
	},
});

function formatFetchUrlsXml(results: FetchUrlsItem[]): string {
	const lines: string[] = ["<fetchUrls>"];

	for (const item of results) {
		const attributes: string[] = [`href="${escapeXmlAttribute(item.url)}"`];

		if ("lineOffset" in item && typeof item.lineOffset === "number") {
			attributes.push(`lineOffset="${item.lineOffset}"`);
		}
		if ("lineLimit" in item && typeof item.lineLimit === "number") {
			attributes.push(`lineLimit="${item.lineLimit}"`);
		}
		if ("totalLines" in item && typeof item.totalLines === "number") {
			attributes.push(`totalLines="${item.totalLines}"`);
		}
		if ("remainingLines" in item) {
			if (typeof item.remainingLines === "number") {
				attributes.push(`remainingLines="${item.remainingLines}"`);
			} else if (item.remainingLines === null) {
				attributes.push(`remainingLines="unknown"`);
			}
		}

		if (item.success === false) {
			attributes.push(`error="${escapeXmlAttribute(item.error)}"`);
			lines.push(`  <url ${attributes.join(" ")} />`);
			continue;
		}

		const textLines = normalizeLines(item.text);
		lines.push(`  <url ${attributes.join(" ")}>`);
		for (const line of textLines) {
			lines.push(`    ${escapeXmlAttribute(line)}`);
		}
		lines.push("  </url>");
	}

	lines.push("</fetchUrls>");
	return lines.join("\n");
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

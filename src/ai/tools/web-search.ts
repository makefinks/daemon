import { tool } from "ai";
import { z } from "zod";
import { getExaClient } from "../exa-client";

const RecencyEnum = z.enum(["day", "week", "month", "year"]);

function recencyToStartDate(recency: z.infer<typeof RecencyEnum>): string {
	const now = new Date();
	switch (recency) {
		case "day":
			now.setDate(now.getDate() - 1);
			break;
		case "week":
			now.setDate(now.getDate() - 7);
			break;
		case "month":
			now.setMonth(now.getMonth() - 1);
			break;
		case "year":
			now.setFullYear(now.getFullYear() - 1);
			break;
	}
	return now.toISOString();
}

export const webSearch = tool({
	description:
		"Searches the web for information. Returns metadata (title, URL, published date) and relevant highlights (query-relevant excerpts) for each result. Highlights are search previews — use them to gauge relevance, then fetch the page with fetchUrls for actual content before relying on claims. Exa is a semantic search engine — use natural language queries describing the ideal page content. Do NOT use boolean operators (AND/OR/NOT), domain prefixes (site:), or other search-engine-specific syntax in the query string; the semantic engine handles relevance automatically. Use the includeDomains parameter instead of 'site:' syntax to scope results to specific domains.",
	inputSchema: z.object({
		query: z
			.string()
			.describe(
				"Natural language search query describing the ideal page content. Do NOT use boolean operators, 'site:', or other search-engine-specific syntax — Exa is a semantic engine."
			),
		numResults: z
			.number()
			.min(1)
			.max(20)
			.default(10)
			.describe("Number of results to return. Defaults to 10, max 20."),
		recency: RecencyEnum.optional().describe(
			"Filter to recent results: 'day', 'week', 'month', or 'year'. Omit for all time."
		),
		includeDomains: z
			.array(z.string())
			.optional()
			.describe(
				"Scope search to specific domains (e.g., ['arxiv.org', 'github.com']). Use this instead of 'site:' or similar operators in the query string."
			),
	}),
	execute: async ({ query, numResults, recency, includeDomains }) => {
		const exaClientResult = getExaClient();
		if ("error" in exaClientResult) {
			return { success: false, error: exaClientResult.error };
		}

		try {
			const searchOptions: Record<string, unknown> = {
				numResults,
				type: "auto",
				contents: { highlights: true },
			};

			if (recency) {
				searchOptions.startPublishedDate = recencyToStartDate(recency);
			}

			if (includeDomains && includeDomains.length > 0) {
				searchOptions.includeDomains = includeDomains;
			}

			const rawData = (await exaClientResult.client.search(query, searchOptions)) as unknown as {
				results: Array<{
					title?: string;
					url?: string;
					publishedDate?: string;
					highlights?: string[];
					[key: string]: unknown;
				}>;
			};

			const results = (rawData.results ?? []).map((r) => {
				const result: {
					title?: string;
					url?: string;
					publishedDate?: string;
					highlights?: string[];
				} = {};
				if (typeof r.title === "string") result.title = r.title;
				if (typeof r.url === "string") result.url = r.url;
				if (typeof r.publishedDate === "string") {
					result.publishedDate = r.publishedDate;
				}
				if (Array.isArray(r.highlights) && r.highlights.length > 0) {
					result.highlights = r.highlights.filter((h): h is string => typeof h === "string");
				}
				return result;
			});

			return {
				success: true,
				data: { results },
				reminder: `<web-search-reminder>
Results here are search previews: title, URL, published date, and short query-relevant highlights. Highlights are excerpts taken out of context and may be incomplete or misleading.
Before relying on any claim from a result, call fetchUrls to read the actual page content. Do not ground statements directly from these highlights.
</web-search-reminder>`,
			};
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			return {
				success: false,
				error: err.message,
			};
		}
	},
});

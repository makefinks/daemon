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
		"Searches the web for information. Returns metadata (title, URL, published date) for relevant web pages. Use this to discover URLs, then use fetchUrls to read contents.",
	inputSchema: z.object({
		query: z.string().describe("The search query to find relevant web pages for."),
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
			.describe("Limit search to specific domains (e.g., ['arxiv.org', 'github.com'])."),
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
			};

			if (recency) {
				searchOptions.startPublishedDate = recencyToStartDate(recency);
			}

			if (includeDomains && includeDomains.length > 0) {
				searchOptions.includeDomains = includeDomains;
			}

			const rawData = (await exaClientResult.client.search(query, searchOptions)) as unknown as {
				results: Array<{ title?: string; url?: string; publishedDate?: string; [key: string]: unknown }>;
			};

			const results = (rawData.results ?? []).map((r) => {
				const result: { title?: string; url?: string; publishedDate?: string } = {};
				if (typeof r.title === "string") result.title = r.title;
				if (typeof r.url === "string") result.url = r.url;
				if (typeof r.publishedDate === "string") {
					result.publishedDate = r.publishedDate;
				}
				return result;
			});

			return {
				success: true,
				data: { results },
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

import { tool } from "ai";
import { z } from "zod";

const EXA_CONTEXT_URL = "https://api.exa.ai/context";

export const codeSearch = tool({
	description:
		"Searches for code examples, documentation, and technical context using Exa's code search API. Returns relevant code snippets and documentation from GitHub repos, docs, and Stack Overflow. Use this when you need real-world code examples, API usage patterns, or implementation references for a library, framework, or language feature.",
	inputSchema: z.object({
		query: z
			.string()
			.describe(
				"Natural language query describing the code or technical context you need. Be specific about the library, language, and use case (e.g., 'bun sqlite WAL mode pragma example', 'react useEffect cleanup async function')."
			),
	}),
	execute: async ({ query }) => {
		const apiKey = process.env.EXA_API_KEY;
		if (!apiKey) {
			return { success: false, error: "EXA_API_KEY environment variable is not set" };
		}

		try {
			const res = await fetch(EXA_CONTEXT_URL, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": apiKey,
				},
				body: JSON.stringify({ query, tokensNum: "dynamic" }),
			});

			if (!res.ok) {
				return { success: false, error: `Exa context API error: ${res.status} ${res.statusText}` };
			}

			const data = (await res.json()) as { response?: string };

			if (!data.response) {
				return { success: false, error: "Exa context API returned empty response" };
			}

			return { success: true, data: { response: data.response } };
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			return { success: false, error: err.message };
		}
	},
});

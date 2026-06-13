import { tool } from "ai";
import { z } from "zod";
import { searchSessions, loadSessionMessages } from "../../state/session-store";
import type { LoadedMessage, SessionSearchHit } from "../../state/session-store";

function escapeXml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

function formatSearchResults(hits: SessionSearchHit[], query: string): string {
	if (hits.length === 0) {
		return `<recall-results query="${escapeXml(query)}" matches="0">No results found.</recall-results>`;
	}

	const bySession = new Map<string, { title: string; date: string; hits: SessionSearchHit[] }>();
	for (const hit of hits) {
		let group = bySession.get(hit.sessionId);
		if (!group) {
			group = { title: hit.sessionTitle, date: hit.messageDate, hits: [] };
			bySession.set(hit.sessionId, group);
		}
		group.hits.push(hit);
	}

	const sessionBlocks: string[] = [];
	for (const [sessionId, group] of bySession) {
		const hitLines = group.hits
			.map(
				(h) => `    <hit message-id="${h.messageId}" role="${h.messageRole}">${escapeXml(h.snippet)}</hit>`
			)
			.join("\n");
		sessionBlocks.push(
			`  <session id="${sessionId}" title="${escapeXml(group.title)}" date="${group.date.slice(0, 10)}">\n${hitLines}\n  </session>`
		);
	}

	return `<recall-results query="${escapeXml(query)}" matches="${hits.length}">\n${sessionBlocks.join("\n")}\n</recall-results>`;
}

function formatLoadedMessages(messages: LoadedMessage[]): string {
	if (messages.length === 0) {
		return `<recall-messages>No matching messages found.</recall-messages>`;
	}

	const first = messages[0]!;
	const messageLines = messages
		.map((m) => `  <message id="${m.messageId}" role="${m.messageRole}">${escapeXml(m.content)}</message>`)
		.join("\n");

	return `<recall-messages session-id="${first.sessionId}" title="${escapeXml(first.sessionTitle)}" date="${first.messageDate.slice(0, 10)}">\n${messageLines}\n</recall-messages>`;
}

export const recall = tool({
	description: `Search past conversations. Use when the user references something discussed previously — "remember when...", "that project we talked about", "what did we decide about...".

Returns session IDs, message IDs, and context snippets. Use the returned IDs to drill down into specific messages if you need more context.

Parameters:
- query: search terms (case-insensitive, searches across all sessions)
- sessionId: scope search to a specific session
- messageIds: load specific messages by ID (requires sessionId)

At least one of query or messageIds must be provided.`,
	inputSchema: z.object({
		query: z.string().optional().describe("Search terms to find in conversation history."),
		sessionId: z.string().optional().describe("Scope search/load to a specific session ID."),
		messageIds: z.array(z.number()).optional().describe("Load specific messages by ID. Requires sessionId."),
	}),
	execute: async ({ query, sessionId, messageIds }) => {
		try {
			if (!query && !messageIds) {
				return {
					success: false,
					error: "Provide at least one of 'query' or 'messageIds'.",
				};
			}

			if (messageIds && !sessionId) {
				return {
					success: false,
					error: "'sessionId' is required when using 'messageIds'.",
				};
			}

			if (query) {
				const hits = await searchSessions(query, {
					sessionId: sessionId ?? undefined,
					messageIds,
					maxResults: 15,
				});
				return {
					success: true,
					xml: formatSearchResults(hits, query),
					count: hits.length,
					sessionTitle: hits[0]?.sessionTitle,
				};
			}

			if (messageIds && sessionId) {
				const messages = await loadSessionMessages(sessionId, messageIds);
				return {
					success: true,
					xml: formatLoadedMessages(messages),
					count: messages.length,
					sessionTitle: messages[0]?.sessionTitle,
				};
			}

			return {
				success: false,
				error: "Could not process request.",
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

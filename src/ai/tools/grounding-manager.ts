import { tool } from "ai";
import { z } from "zod";
import { daemonEvents } from "../../state/daemon-events";
import { getRuntimeContext } from "../../state/runtime-context";
import { loadLatestGroundingMap, saveGroundingMap } from "../../state/session-store";

const groundingSourceSchema = z.object({
	url: z.string().url().describe("The source URL where the information was found."),
	quote: z
		.string()
		.min(1)
		.max(300)
		.describe("A short excerpt (1-2 sentences) from the source that supports the statement."),
	textFragment: z
		.string()
		.min(1)
		.max(150)
		.describe(
			"A short phrase or subphrase (MUST BE COPIED VERBATIM) from the source text for deep-linking. Max 150 characters."
		),
});

const groundedStatementSchema = z.object({
	id: z.string().min(1).describe("Unique identifier for this grounding (e.g., 'g1', 'g2')."),
	statement: z.string().min(1).describe("The factual claim being grounded."),
	source: groundingSourceSchema.describe("The source backing this statement."),
});

// Preprocess items that may arrive as a JSON string (some models stringify arrays)
const itemsSchema = z.preprocess((val) => {
	if (typeof val === "string") {
		try {
			return JSON.parse(val);
		} catch {
			return val; // Let Zod validation handle the error
		}
	}
	return val;
}, z
	.array(groundedStatementSchema)
	.min(1)
	.describe(
		"Array of grounded statements. Each item has an id, a statement (the claim), and a source (URL, quote, and optional text fragment)."
	));

export const groundingManager = tool({
	description:
		"Manage the list of grounded statements (facts supported by sources) for the current session. " +
		"You can 'set' (overwrite) the entire list or 'append' new items to the existing list. " +
		"Use this to maintain a persistent list of verified claims and their sources.",
	inputSchema: z.object({
		action: z
			.enum(["set", "append"])
			.describe("Action to perform: 'set' replaces all groundings, 'append' adds to existing ones."),
		items: itemsSchema,
	}),
	execute: async ({ action, items }) => {
		const context = getRuntimeContext();

		if (!context.sessionId) {
			return {
				success: false,
				error: "No active session for grounding",
			};
		}

		try {
			let finalItems = items;

			if (action === "append") {
				const existingMap = await loadLatestGroundingMap(context.sessionId);
				if (existingMap) {
					finalItems = [...existingMap.items, ...items];
				}
			}

			const groundingMap = await saveGroundingMap(context.sessionId, context.messageId, finalItems);

			daemonEvents.emit("groundingSaved", context.sessionId, context.messageId, groundingMap.id);

			return {
				success: true,
				action,
				addedCount: items.length,
				totalCount: finalItems.length,
				currentItems: finalItems,
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

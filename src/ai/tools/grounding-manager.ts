import { tool } from "ai";
import { z } from "zod";
import { daemonEvents } from "../../state/daemon-events";
import { getRuntimeContext } from "../../state/runtime-context";
import { saveGroundingMap } from "../../state/session-store";

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
			"Browser highlight anchor only. Must be one contiguous verbatim substring from the source text. Do not normalize whitespace or join text across line breaks; if evidence spans a line break, choose a shorter phrase from one side. Prefer 6-15 words that are likely unique. Avoid URLs unless the URL itself appears as a contiguous text segment. Max 150 characters."
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
		"Set the grounded statements (facts supported by sources) for the current response. " +
		"Call this with ALL items that back your response. Each call replaces the previous list.",
	inputSchema: z.object({
		items: itemsSchema,
	}),
	execute: async ({ items }) => {
		const context = getRuntimeContext();

		if (!context.sessionId) {
			return {
				success: false,
				error: "No active session for grounding",
			};
		}

		try {
			const groundingMap = await saveGroundingMap(context.sessionId, context.messageId, items);

			daemonEvents.emit("groundingSaved", context.sessionId, context.messageId, groundingMap.id);

			return {
				success: true,
				itemCount: items.length,
				currentItems: items,
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

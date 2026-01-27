/**
 * Memory injection for first message context.
 * Retrieves relevant memories and formats them for system prompt injection.
 */

import type { MemoryContext, MemoryEntry } from "../../types";
import { debug } from "../../utils/debug-logger";
import { getMemoryManager, isMemoryAvailable } from "./memory-manager";

/** Format memories for injection into message context */
function formatMemoriesForInjection(memories: MemoryEntry[]): string {
	if (memories.length === 0) {
		return "";
	}

	const formatted = memories.map((m, i) => `${i + 1}. ${m.memory}`).join("\n");

	return `<relevant-memories>
The following memories from previous sessions may be relevant:

${formatted}

Use this context to provide more personalized and informed responses.
</relevant-memories>`;
}

/** Retrieve relevant memories for a user message */
export async function getMemoryContextForMessage(
	userMessage: string,
	limit = 5
): Promise<MemoryContext | null> {
	if (!isMemoryAvailable()) {
		return null;
	}

	const memoryManager = getMemoryManager();
	await memoryManager.initialize();

	if (!memoryManager.isAvailable) {
		return null;
	}

	try {
		const memories = await memoryManager.search(userMessage, limit);

		debug.info("memory-injection", {
			message: "Retrieved memories for message",
			query: userMessage.slice(0, 50),
			memoryCount: memories.length,
		});

		return {
			memories,
			retrievedAt: Date.now(),
			query: userMessage,
		};
	} catch (error) {
		debug.error("memory-injection", {
			message: "Failed to retrieve memories",
			error: error instanceof Error ? error.message : String(error),
		});
		return null;
	}
}

/** Build memory injection text for the first message */
export async function buildMemoryInjection(
	userMessage: string,
	options: { limit?: number } = {}
): Promise<string> {
	const { limit = 5 } = options;

	const context = await getMemoryContextForMessage(userMessage, limit);

	if (!context || context.memories.length === 0) {
		return "";
	}

	return formatMemoriesForInjection(context.memories);
}

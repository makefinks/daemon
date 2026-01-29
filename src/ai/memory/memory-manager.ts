/**
 * Singleton memory manager wrapping mem0 for persistent global memory.
 * Memory persists across all sessions and is stored locally.
 */

import path from "node:path";
import { Memory } from "mem0ai/oss";
import type { MemoryAddResult, MemoryEntry, MemorySearchResult } from "../../types";
import { debug, memoryDebug } from "../../utils/debug-logger";
import { getAppConfigDir } from "../../utils/preferences";
import { getMemoryModel } from "../model-config";

const MEMORY_USER_ID = "daemon_global";
const MAX_MEMORY_INPUT_CHARS = 10_000;
/** Raw memory entry from mem0 API */
interface Mem0RawEntry {
	id: string;
	memory: string;
	hash?: string;
	metadata?: Record<string, unknown>;
	score?: number;
	created_at?: string;
	updated_at?: string;
}

/** Raw search result from mem0 API */
interface Mem0RawSearchResult {
	results: Mem0RawEntry[];
}

/** Raw add result from mem0 API */
interface Mem0RawAddResult {
	results: Array<{
		id: string;
		memory: string;
		event: "ADD" | "UPDATE" | "DELETE" | "NONE";
	}>;
}

/** Convert raw mem0 entry to our MemoryEntry type */
function toMemoryEntry(raw: Mem0RawEntry): MemoryEntry {
	return {
		id: raw.id,
		memory: raw.memory,
		hash: raw.hash,
		metadata: raw.metadata,
		score: raw.score,
		createdAt: raw.created_at,
		updatedAt: raw.updated_at,
	};
}

/** Singleton memory manager wrapping mem0 */
class MemoryManager {
	private static instance: MemoryManager | null = null;
	private memory: Memory | null = null;
	private initPromise: Promise<void> | null = null;
	private _isAvailable = false;

	private constructor() {}

	static getInstance(): MemoryManager {
		if (!MemoryManager.instance) {
			MemoryManager.instance = new MemoryManager();
		}
		return MemoryManager.instance;
	}

	/** Check if memory system is available (has required API keys) */
	get isAvailable(): boolean {
		return this._isAvailable;
	}

	/** Initialize mem0 with configuration */
	async initialize(): Promise<boolean> {
		// Return cached result if already initialized
		if (this.initPromise) {
			await this.initPromise;
			return this._isAvailable;
		}

		this.initPromise = this._doInitialize();
		await this.initPromise;
		return this._isAvailable;
	}

	private async _doInitialize(): Promise<void> {
		const openaiKey = process.env.OPENAI_API_KEY;
		const openrouterKey = process.env.OPENROUTER_API_KEY;

		if (!openaiKey) {
			debug.info("memory-init", "Memory system unavailable: OPENAI_API_KEY not set");
			this._isAvailable = false;
			return;
		}

		if (!openrouterKey) {
			debug.info("memory-init", "Memory system unavailable: OPENROUTER_API_KEY not set");
			this._isAvailable = false;
			return;
		}

		try {
			const configDir = getAppConfigDir();
			const vectorDbPath = path.join(configDir, "vector_store.db");
			const llmModel = getMemoryModel();

			this.memory = new Memory({
				version: "v1.1",
				customPrompt: `You are a Personal Information Organizer, specialized in extracting **enduring** facts, user memories, and preferences.
Your role is to extract **only** information that would be useful to recall in a conversation two weeks from now.

# [IMPORTANT]: GENERATE FACTS SOLELY BASED ON THE USER'S MESSAGES.
# [IMPORTANT]: DO NOT INCLUDE INFORMATION FROM ASSISTANT OR SYSTEM MESSAGES.

### WHAT TO STORE (The "Two-Week Test"):
1. **Biographical Details:** Names, age, job title, company, location.
2. **Relationships:** Names of partners, family members, pets, or colleagues.
3. **Enduring Preferences:** Strong likes/dislikes (e.g., food, hobbies, style).
4. **Long-term Plans:** Upcoming trips, long-term projects, or goals.
5. **Direct Instructions:** How the user wants to be addressed or formatted (e.g., "Call me X").
6. **Multi-True Facts:** If multiple preferences or details can all be true (e.g., likes multiple languages, foods, hobbies), store each as a separate fact rather than updating/overwriting an existing one.

### WHAT TO IGNORE (Do NOT store these):
1. **Transient Commands & Questions:** Do not store that the user asked to "summarize a PDF," "translate a sentence," or "write code."
2. **Immediate Context:** Do not store "User said 'continue'" or "User said 'yes'."
3. **General Opinions on News/Politics:** Unless the user explicitly identifies with a stance, avoid summarizing general questions (e.g., ignore "What is the capital of France?").
4. **Meta-Commentary:** Do not store compliments or insults to the bot (e.g., "You are smart") unless it alters how you should behave.

### Examples:

User: Hi there.
Assistant: Hello! How can I help you today?
Output: {{"facts" : []}}

User: Can you summarize this article for me?
Assistant: Sure, please paste the text.
Output: {{"facts" : []}}
(Reasoning: This is a transient task, not a fact about the user.)

User: I am a vegetarian, so please don't suggest any meat dishes.
Assistant: Noted, I will provide vegetarian options only.
Output: {{"facts" : ["Is a vegetarian", "Does not eat meat"]}}

User: I'm planning a hiking trip to Patagonia next November.
Assistant: That sounds amazing!
Output: {{"facts" : ["Planning a hiking trip to Patagonia in November"]}}

User: Who is the president of the US?
Assistant: The current president is...
Output: {{"facts" : []}}

User: My dog's name is Buster. He's a golden retriever.
Assistant: Buster sounds adorable.
Output: {{"facts" : ["Has a dog named Buster", "Dog is a golden retriever"]}}

User: Actually, I moved. I live in Chicago now, not New York.
Assistant: Got it, updated your location.
Output: {{"facts" : ["Lives in Chicago", "No longer lives in New York"]}}

User: I hate Python, I prefer coding in Rust.
Assistant: Understood.
Output: {{"facts" : ["Dislikes Python", "Prefers coding in Rust"]}}

User: test
Assistant: System operational.
Output: {{"facts" : []}}

Return the facts in JSON format as shown above.

Rules:
- If no *enduring* facts are found, return an empty list for "facts".
- Detect the language of the user input and record facts in that same language.
- Write fully self-contained facts (e.g., "Lives in Chicago" instead of "Lives there").`,
				embedder: {
					provider: "openai",
					config: {
						apiKey: openaiKey,
						model: "text-embedding-3-small",
					},
				},
				vectorStore: {
					provider: "memory",
					config: {
						collectionName: "daemon_memories",
						dimension: 1536,
						dbPath: vectorDbPath,
					},
				},
				disableHistory: true,
				llm: {
					provider: "openai",
					config: {
						apiKey: openrouterKey,
						model: llmModel,
						baseURL: "https://openrouter.ai/api/v1",
					},
				},
			});

			this._isAvailable = true;
			debug.info("memory-init", {
				message: `Memory system initialized`,
				vectorDbPath,
				llmModel,
			});
		} catch (error) {
			debug.error("memory-init", {
				message: "Memory initialization failed",
				error: error instanceof Error ? error.message : String(error),
			});
			this._isAvailable = false;
		}
	}

	/** Search memories by semantic query */
	async search(query: string, limit = 10): Promise<MemoryEntry[]> {
		if (!this.memory || !this._isAvailable) {
			debug.info("memory-search", "Search called but memory not available");
			return [];
		}

		const startTime = Date.now();
		try {
			const result = (await this.memory.search(query, {
				limit,
				userId: MEMORY_USER_ID,
			})) as Mem0RawSearchResult;

			const durationMs = Date.now() - startTime;
			debug.info("memory-search", {
				message: `Search completed`,
				query: query.slice(0, 50),
				resultCount: result.results.length,
				durationMs,
			});
			memoryDebug.info("memory-search-result", {
				query,
				resultCount: result.results.length,
				durationMs,
			});
			return result.results.map(toMemoryEntry);
		} catch (error) {
			const durationMs = Date.now() - startTime;
			debug.error("memory-search", {
				message: "Search failed",
				error: error instanceof Error ? error.message : String(error),
				durationMs,
			});
			memoryDebug.error("memory-search-error", {
				query,
				durationMs,
				error: error instanceof Error ? error.message : String(error),
			});
			return [];
		}
	}

	/** Add a new memory from messages */
	async add(
		messages: Array<{ role: string; content: string }>,
		metadata?: Record<string, unknown>,
		infer?: boolean
	): Promise<MemoryAddResult> {
		if (!this.memory || !this._isAvailable) {
			throw new Error("Memory system not available");
		}

		const sanitizedMessages = messages.map((message) => {
			if (message.role !== "user") return message;
			if (message.content.length <= MAX_MEMORY_INPUT_CHARS) return message;
			return {
				...message,
				content: message.content.slice(0, MAX_MEMORY_INPUT_CHARS),
			};
		});

		if (sanitizedMessages !== messages) {
			const truncated = sanitizedMessages.some((message, index) => {
				return message.role === "user" && messages[index]?.content.length !== message.content.length;
			});
			if (truncated) {
				memoryDebug.info("memory-add-truncate", {
					maxChars: MAX_MEMORY_INPUT_CHARS,
					originalLengths: messages.map((message) => message.content.length),
					truncatedLengths: sanitizedMessages.map((message) => message.content.length),
				});
			}
		}

		const startTime = Date.now();
		memoryDebug.info("memory-add-input", {
			infer,
			metadata,
			messages,
		});

		const result = (await this.memory.add(sanitizedMessages, {
			userId: MEMORY_USER_ID,
			metadata,
			infer,
		})) as Mem0RawAddResult;

		const extracted = result.results.map((r) => {
			const event =
				(r as unknown as { metadata?: { event?: string } }).metadata?.event ??
				(r as { event?: string }).event;
			return {
				id: r.id,
				memory: r.memory,
				event,
			};
		});

		const durationMs = Date.now() - startTime;
		debug.info("memory-add", {
			message: "Memory added",
			events: extracted.map((r) => r.event),
			durationMs,
		});
		memoryDebug.info("memory-add-result", {
			events: extracted.map((r) => r.event),
			extracted,
			rawResults: result.results,
			durationMs,
		});
		return { results: extracted };
	}

	/** Get all memories */
	async getAll(): Promise<MemoryEntry[]> {
		if (!this.memory || !this._isAvailable) {
			return [];
		}

		try {
			const result = (await this.memory.getAll({
				userId: MEMORY_USER_ID,
			})) as Mem0RawSearchResult;

			return result.results.map(toMemoryEntry);
		} catch (error) {
			debug.error("memory-getall", {
				message: "GetAll failed",
				error: error instanceof Error ? error.message : String(error),
			});
			return [];
		}
	}

	/** Delete a specific memory by ID */
	async delete(memoryId: string): Promise<boolean> {
		if (!this.memory || !this._isAvailable) {
			return false;
		}

		try {
			await this.memory.delete(memoryId);
			debug.info("memory-delete", { message: "Deleted memory", memoryId });
			return true;
		} catch (error) {
			debug.error("memory-delete", {
				message: "Delete failed",
				error: error instanceof Error ? error.message : String(error),
			});
			return false;
		}
	}

	/** Reset/clear all memories (destructive!) */
	async reset(): Promise<boolean> {
		if (!this.memory || !this._isAvailable) {
			return false;
		}

		try {
			await this.memory.reset();
			debug.info("memory-reset", { message: "All memories cleared" });
			return true;
		} catch (error) {
			debug.error("memory-reset", {
				message: "Reset failed",
				error: error instanceof Error ? error.message : String(error),
			});
			return false;
		}
	}
}

/** Export singleton accessor */
export function getMemoryManager(): MemoryManager {
	return MemoryManager.getInstance();
}

/** Check if memory is available without full initialization */
export function isMemoryAvailable(): boolean {
	return Boolean(process.env.OPENAI_API_KEY && process.env.OPENROUTER_API_KEY);
}

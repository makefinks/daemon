import type { ModelMessage } from "../types";

export class ModelHistoryStore {
	private history: ModelMessage[] = [];

	get(): ModelMessage[] {
		return [...this.history];
	}

	set(history: ModelMessage[]): void {
		this.history = [...history];
	}

	clear(): void {
		this.history = [];
	}

	appendTurn(userText: string, responseMessages: ModelMessage[]): void {
		this.history.push({ role: "user", content: userText }, ...responseMessages);
	}

	/**
	 * Undo the last turn (user message + assistant response) from the model history.
	 * Returns the number of messages removed, or 0 if nothing to undo.
	 */
	undoLastTurn(): number {
		if (this.history.length === 0) return 0;

		// Find the last user message and remove everything from there onwards.
		// This handles multi-message assistant responses (tool calls, etc.).
		let lastUserIndex = -1;
		for (let i = this.history.length - 1; i >= 0; i--) {
			if (this.history[i]?.role === "user") {
				lastUserIndex = i;
				break;
			}
		}

		if (lastUserIndex === -1) return 0;

		const removedCount = this.history.length - lastUserIndex;
		this.history = this.history.slice(0, lastUserIndex);
		return removedCount;
	}
}

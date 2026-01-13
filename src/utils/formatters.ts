/**
 * Utility functions for formatting display values in the UI.
 */

import type { TodoItem } from "../types";
import { REASONING_ANIMATION } from "../ui/constants";

const MAX_TOOL_INPUT_LINES = 10;
const MAX_TOOL_INPUT_LINE_CHARS = 140;

/**
 * Format reasoning content as a single-line preview for ticker/history.
 */
export function formatReasoningPreview(content: string): string {
	const normalized = content.replace(/\n/g, " ");
	if (!normalized) return "";
	if (normalized.length <= REASONING_ANIMATION.LINE_WIDTH) return normalized;
	return normalized.slice(-REASONING_ANIMATION.LINE_WIDTH);
}

/**
 * Check if content has any non-whitespace characters.
 */
export function hasVisibleText(content: string): boolean {
	return content.trim().length > 0;
}

type ElapsedFormatStyle = "compact" | "detailed";

interface FormatElapsedOptions {
	style?: ElapsedFormatStyle;
}

/**
 * Format elapsed time from milliseconds into s / m+s / h+m+s.
 */
export function formatElapsedTime(ms: number, options: FormatElapsedOptions = {}): string {
	const style = options.style ?? "compact";
	if (!Number.isFinite(ms) || ms <= 0) {
		return style === "detailed" ? "0.01s" : "0s";
	}

	if (style === "detailed") {
		const seconds = ms / 1000;
		if (seconds < 1) {
			const clamped = Math.max(0.01, Math.round(seconds * 100) / 100);
			return `${clamped.toFixed(2)}s`;
		}
		if (seconds < 10) {
			const value = seconds.toFixed(1).replace(/\.0$/, "");
			return `${value}s`;
		}
	}

	const totalSeconds = Math.floor(ms / 1000);
	if (totalSeconds < 60) return `${totalSeconds}s`;

	const totalMinutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	if (totalMinutes < 60) {
		return `${totalMinutes}m ${String(seconds).padStart(2, "0")}s`;
	}

	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

/**
 * Format a value for display in tool input
 */
export function formatValue(value: unknown): string {
	if (value === null || value === undefined) return "";
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	if (Array.isArray(value)) {
		if (value.length === 0) return "[]";
		// For arrays of strings, show inline if short enough
		if (value.every((v) => typeof v === "string")) {
			const joined = value.join(", ");
			if (joined.length < 80) return joined;
		}
		return `[${value.length} items]`;
	}
	return JSON.stringify(value);
}

/**
 * Format tool input as display lines
 */
export function formatToolInputLines(input: unknown): string[] {
	try {
		if (typeof input !== "object" || input === null) {
			return [String(input)];
		}

		const lines: string[] = [];
		for (const [key, value] of Object.entries(input)) {
			const formatted = formatValue(value);
			const line = formatted ? `${key}: ${formatted}` : key;
			// Truncate long lines
			if (line.length > MAX_TOOL_INPUT_LINE_CHARS) {
				lines.push(`${line.slice(0, MAX_TOOL_INPUT_LINE_CHARS - 1)}…`);
			} else {
				lines.push(line);
			}
		}

		if (lines.length > MAX_TOOL_INPUT_LINES) {
			return [...lines.slice(0, MAX_TOOL_INPUT_LINES), "… (truncated)"];
		}
		return lines;
	} catch (error: unknown) {
		const err = error instanceof Error ? error : new Error(String(error));
		return [`[error: ${err.message}]`];
	}
}

/**
 * Todo input structure for the todoManager tool
 */
export interface TodoInput {
	action: "write" | "update" | "list";
	todos?: Array<{ content: string; status?: string }>;
	index?: number;
	status?: string;
	sessionId?: string;
}

/**
 * Formatted todo item with display info
 */
export interface FormattedTodoItem {
	text: string;
	status: string;
}

const STATUS_ICON: Record<string, string> = {
	pending: "○",
	in_progress: "◐",
	completed: "●",
	cancelled: "✕",
};

/**
 * Format a single todo item for display
 */
export function formatTodoItem(todo: { content: string; status?: string }, idx: number): FormattedTodoItem {
	const status = todo.status || "pending";
	const icon = STATUS_ICON[status] || "[ ]";
	return {
		text: `${icon} ${todo.content}`,
		status,
	};
}

/**
 * Format todo list for display based on tool input.
 * If a snapshot is provided, use it instead of fetching current state.
 * @param input - The todo tool input
 * @param snapshot - Optional snapshot of todos for historical display
 * @param currentTodos - Current todos from the store (for live display of update/list actions)
 */
export function formatTodoDisplayLines(
	input: TodoInput,
	snapshot?: Array<{ content: string; status: string }>,
	currentTodos: TodoItem[] = []
): FormattedTodoItem[] {
	// If we have a snapshot, always use it (for historical display in conversation)
	if (snapshot && snapshot.length > 0) {
		return snapshot.map((todo, idx) => formatTodoItem(todo, idx));
	}

	if (input.action === "write" && input.todos) {
		return input.todos.map((todo, idx) => formatTodoItem(todo, idx));
	}

	if (input.action === "update" || input.action === "list") {
		// Use passed-in todos for live display
		if (currentTodos.length === 0) {
			return [{ text: "(no todos)", status: "pending" }];
		}
		// For update, apply the pending status change to display what it will look like
		if (input.action === "update" && input.index !== undefined && input.status) {
			const idx = input.index - 1;
			return currentTodos.map((todo: TodoItem, i: number) => {
				if (i === idx) {
					return formatTodoItem({ content: todo.content, status: input.status }, i);
				}
				return formatTodoItem(todo, i);
			});
		}
		// For list or update without changes, just show current state
		return currentTodos.map((todo: TodoItem, idx: number) => formatTodoItem(todo, idx));
	}

	return [{ text: "(unknown action)", status: "pending" }];
}

/**
 * Type guard for TodoInput
 */
export function isTodoInput(input: unknown): input is TodoInput {
	return (
		typeof input === "object" &&
		input !== null &&
		"action" in input &&
		typeof (input as TodoInput).action === "string"
	);
}

/**
 * Format token count with K suffix for thousands
 */
export function formatTokenCount(count: number): string {
	// if (count >= 1000) {
	// 	return `${(count / 1000).toFixed(1)}k`;
	// }
	return String(count);
}

export function formatContextWindowK(contextLength: number): string {
	if (!Number.isFinite(contextLength) || contextLength <= 0) return "";
	if (contextLength < 1000) return String(Math.floor(contextLength));

	const asK = contextLength % 1024 === 0 ? contextLength / 1024 : Math.round(contextLength / 1000);

	return `${asK}K`;
}

/**
 * Format price per 1M tokens for display.
 */
export function formatPrice(price: number): string {
	if (price === 0) {
		return "FREE";
	}
	if (price < 0.01) {
		return `$${price.toFixed(4)}`;
	}
	return `$${price.toFixed(2)}`;
}

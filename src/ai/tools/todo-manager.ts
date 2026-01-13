import { tool } from "ai";
import { z } from "zod";
import type { TodoItem, TodoStatus } from "../../types";

// Session-based todo storage
const todoSessions = new Map<string, TodoItem[]>();

// Default session for single-user mode
const DEFAULT_SESSION = "default";

function getTodos(sessionId: string = DEFAULT_SESSION): TodoItem[] {
	if (!todoSessions.has(sessionId)) {
		todoSessions.set(sessionId, []);
	}
	return todoSessions.get(sessionId)!;
}

function setTodos(sessionId: string, todos: TodoItem[]): void {
	todoSessions.set(sessionId, todos);
}

function formatTodoList(todos: TodoItem[]): string {
	if (todos.length === 0) {
		return "No todos.";
	}

	const statusIcon: Record<TodoItem["status"], string> = {
		pending: "[pending]",
		in_progress: "[in_progress]",
		completed: "[completed]",
		cancelled: "[cancelled]",
	};

	const lines = todos.map((todo, index) => {
		return `${index + 1}. ${statusIcon[todo.status]} ${todo.content}`;
	});

	return lines.join("\n");
}

// Schema for a single todo item in the write action
const todoItemSchema = z.object({
	content: z.string().describe("The todo item description"),
	status: z
		.enum(["pending", "in_progress", "completed", "cancelled"])
		.default("pending")
		.describe("Status of the todo"),
});

export const todoManager = tool({
	description: `Manage a todo list to plan and track your actions.

Actions:
- write: Replace the entire todo list. Each item can have its own status, so you can write the full list AND set one task to in_progress in a single call.
- update: Update a single todo's status by index (1-based)
- list: Show current todos

Example write with status:
{ "action": "write", "todos": [{ "content": "First task", "status": "in_progress" }, { "content": "Second task", "status": "pending" }] }`,
	inputSchema: z.object({
		action: z.enum(["write", "update", "list"]).describe("The action to perform"),
		todos: z.array(todoItemSchema).optional().describe("Array of todo items (required for 'write')"),
		index: z.number().optional().describe("1-based index of the todo to update (required for 'update')"),
		status: z
			.enum(["pending", "in_progress", "completed", "cancelled"])
			.optional()
			.describe("New status for the todo (used with 'update')"),
		sessionId: z.string().optional().describe("Session ID for isolation. Defaults to 'default'."),
	}),
	execute: async ({ action, todos: newTodos, index, status, sessionId }) => {
		const session = sessionId || DEFAULT_SESSION;

		switch (action) {
			case "write": {
				if (!newTodos || newTodos.length === 0) {
					setTodos(session, []);
					return {
						success: true,
						message: "Cleared all todos",
						list: "No todos.",
					};
				}
				const items: TodoItem[] = newTodos.map((t) => ({
					content: t.content,
					status: t.status || "pending",
				}));
				setTodos(session, items);
				return {
					success: true,
					message: `Set ${items.length} todos`,
					list: formatTodoList(items),
				};
			}

			case "update": {
				if (index === undefined) {
					return {
						success: false,
						error: "Index is required for 'update'",
					};
				}
				const todos = getTodos(session);
				const idx = index - 1; // Convert to 0-based
				if (idx < 0 || idx >= todos.length) {
					return {
						success: false,
						error: `Invalid index ${index}. Valid range: 1-${todos.length}`,
					};
				}
				const todo = todos[idx]!;
				if (status) {
					todo.status = status;
				}
				return {
					success: true,
					message: `Updated #${index}: ${todo.content} -> ${todo.status}`,
					list: formatTodoList(todos),
				};
			}

			case "list": {
				const todos = getTodos(session);
				return {
					success: true,
					count: todos.length,
					pending: todos.filter((t) => t.status === "pending").length,
					inProgress: todos.filter((t) => t.status === "in_progress").length,
					completed: todos.filter((t) => t.status === "completed").length,
					list: formatTodoList(todos),
				};
			}

			default:
				return {
					success: false,
					error: `Unknown action: ${action}`,
				};
		}
	},
});

// Export a function to clear all sessions (useful for testing)
export function clearAllTodoSessions(): void {
	todoSessions.clear();
}

// Export function to get current todos for UI display
export function getCurrentTodos(sessionId: string = DEFAULT_SESSION): TodoItem[] {
	return [...getTodos(sessionId)];
}

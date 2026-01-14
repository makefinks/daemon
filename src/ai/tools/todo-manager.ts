import { tool } from "ai";
import { z } from "zod";
import { getRuntimeContext } from "../../state/runtime-context";
import { loadLatestTodoList, saveTodoList } from "../../state/session-store";
import type { TodoItem } from "../../types";

let currentTodos: TodoItem[] = [];
let lastSessionId: string | null = null;

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

async function ensureTodosLoaded(sessionId: string | null): Promise<void> {
	if (sessionId === lastSessionId) return;

	lastSessionId = sessionId;
	if (sessionId) {
		currentTodos = await loadLatestTodoList(sessionId);
	} else {
		currentTodos = [];
	}
}

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
	}),
	execute: async ({ action, todos: newTodos, index, status }) => {
		const context = getRuntimeContext();

		if (!context.sessionId) {
			return {
				success: false,
				error: "No active session for todos",
			};
		}

		await ensureTodosLoaded(context.sessionId);

		switch (action) {
			case "write": {
				if (!newTodos || newTodos.length === 0) {
					currentTodos = [];
					await saveTodoList(context.sessionId, currentTodos);
					return {
						success: true,
						todos: formatTodoList(currentTodos),
					};
				}
				currentTodos = newTodos.map((t) => ({
					content: t.content,
					status: t.status || "pending",
				}));
				await saveTodoList(context.sessionId, currentTodos);
				return {
					success: true,
					todos: formatTodoList(currentTodos),
				};
			}

			case "update": {
				if (index === undefined) {
					return {
						success: false,
						error: "Index is required for 'update'",
					};
				}
				const idx = index - 1;
				if (idx < 0 || idx >= currentTodos.length) {
					return {
						success: false,
						error: `Invalid index ${index}. Valid range: 1-${currentTodos.length}`,
					};
				}
				const todo = currentTodos[idx]!;
				if (status) {
					todo.status = status;
				}
				await saveTodoList(context.sessionId, currentTodos);
				return {
					success: true,
					todos: formatTodoList(currentTodos),
				};
			}

			case "list": {
				return {
					success: true,
					todos: formatTodoList(currentTodos),
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

export function clearAllTodos(): void {
	currentTodos = [];
	lastSessionId = null;
}

export function getCurrentTodos(): TodoItem[] {
	return [...currentTodos];
}

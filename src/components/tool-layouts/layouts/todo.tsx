import { TextAttributes } from "@opentui/core";
import type { ToolLayoutConfig, ToolHeader, ToolLayoutRenderProps } from "../types";
import { registerToolLayout } from "../registry";
import { COLORS } from "../../../ui/constants";
import type { TodoItem } from "../../../types";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface TodoInput {
	action: "write" | "update" | "list";
	todos?: Array<{ content: string; status?: string }>;
	index?: number;
	status?: string;
}

function isTodoInput(input: unknown): input is TodoInput {
	return isRecord(input) && "action" in input && typeof input.action === "string";
}

function extractTodoAction(input: unknown): string | null {
	if (!isRecord(input)) return null;
	if ("action" in input && typeof input.action === "string") {
		return input.action;
	}
	return null;
}

const STATUS_ICON: Record<string, string> = {
	pending: "○",
	in_progress: "◐",
	completed: "●",
	cancelled: "✕",
};

interface FormattedTodoItem {
	text: string;
	status: string;
}

function formatTodoItem(todo: { content: string; status?: string }, _idx: number): FormattedTodoItem {
	const status = todo.status || "pending";
	const icon = STATUS_ICON[status] || "[ ]";
	return {
		text: `${icon} ${todo.content}`,
		status,
	};
}

function formatTodoDisplayLines(
	input: TodoInput,
	snapshot?: Array<{ content: string; status: string }>,
	currentTodos: TodoItem[] = []
): FormattedTodoItem[] {
	if (snapshot && snapshot.length > 0) {
		return snapshot.map((todo, idx) => formatTodoItem(todo, idx));
	}

	if (input.action === "write" && input.todos) {
		return input.todos.map((todo, idx) => formatTodoItem(todo, idx));
	}

	if (input.action === "update" || input.action === "list") {
		if (currentTodos.length === 0) {
			return [{ text: "(no todos)", status: "pending" }];
		}
		if (input.action === "update" && input.index !== undefined && input.status) {
			const idx = input.index - 1;
			return currentTodos.map((todo: TodoItem, i: number) => {
				if (i === idx) {
					return formatTodoItem({ content: todo.content, status: input.status }, i);
				}
				return formatTodoItem(todo, i);
			});
		}
		return currentTodos.map((todo: TodoItem, idx: number) => formatTodoItem(todo, idx));
	}

	return [{ text: "(unknown action)", status: "pending" }];
}

function getTodoColor(status: string): string {
	switch (status) {
		case "in_progress":
			return COLORS.STATUS_RUNNING;
		case "completed":
		case "cancelled":
			return COLORS.STATUS_DONE_DIM;
		default:
			return COLORS.STATUS_PENDING;
	}
}

function getTodoAttributes(status: string): number {
	if (status === "completed" || status === "cancelled") {
		return TextAttributes.STRIKETHROUGH;
	}
	return TextAttributes.NONE;
}

function TodoBody({ call }: ToolLayoutRenderProps) {
	if (!isTodoInput(call.input)) {
		return null;
	}

	const lines = formatTodoDisplayLines(call.input, call.todoSnapshot);

	if (lines.length === 0) {
		return null;
	}

	return (
		<box flexDirection="column" paddingLeft={2}>
			{lines.map((item: FormattedTodoItem, idx: number) => (
				<text key={idx}>
					<span fg={getTodoColor(item.status)} attributes={getTodoAttributes(item.status)}>
						{item.text}
					</span>
				</text>
			))}
		</box>
	);
}

export const todoLayout: ToolLayoutConfig = {
	abbreviation: "todo",

	getHeader: (input): ToolHeader | null => {
		const action = extractTodoAction(input);
		return action ? { secondary: action } : null;
	},

	renderBody: TodoBody,
};

registerToolLayout("todoManager", todoLayout);

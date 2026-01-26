import { describe, it, expect } from "bun:test";
import {
	formatReasoningPreview,
	hasVisibleText,
	formatElapsedTime,
	formatValue,
	formatToolInputLines,
	formatTodoItem,
	formatTodoDisplayLines,
	isTodoInput,
	formatTokenCount,
	formatPrice,
} from "../src/utils/formatters";
import type { TodoItem } from "../src/types";

describe("formatReasoningPreview", () => {
	it("returns empty string for empty input", () => {
		expect(formatReasoningPreview("")).toBe("");
	});

	it("preserves whitespace-only content", () => {
		expect(formatReasoningPreview("   ")).toBe("   ");
	});

	it("preserves short content without truncation", () => {
		const content = "Short reasoning text";
		expect(formatReasoningPreview(content)).toBe(content);
	});

	it("normalizes newlines to spaces", () => {
		const content = "Line 1\nLine 2\nLine 3";
		expect(formatReasoningPreview(content)).toBe("Line 1 Line 2 Line 3");
	});

	it("truncates to last N characters when too long", () => {
		const longText = "a".repeat(150);
		const result = formatReasoningPreview(longText);
		expect(result.length).toBeLessThanOrEqual(200);
		expect(result).toBe("a".repeat(150));
	});
});

describe("hasVisibleText", () => {
	it("returns false for empty strings", () => {
		expect(hasVisibleText("")).toBe(false);
		expect(hasVisibleText("   ")).toBe(false);
		expect(hasVisibleText("\n\t")).toBe(false);
	});

	it("returns true for content", () => {
		expect(hasVisibleText("text")).toBe(true);
		expect(hasVisibleText("  text  ")).toBe(true);
	});
});

describe("formatElapsedTime", () => {
	it("handles invalid/negative values", () => {
		expect(formatElapsedTime(-1)).toBe("0s");
		expect(formatElapsedTime(0)).toBe("0s");
		expect(formatElapsedTime(NaN)).toBe("0s");
	});

	it("formats seconds", () => {
		expect(formatElapsedTime(500)).toBe("0s");
		expect(formatElapsedTime(1000)).toBe("1s");
		expect(formatElapsedTime(30000)).toBe("30s");
	});

	it("formats minutes and seconds", () => {
		expect(formatElapsedTime(60000)).toBe("1m 00s");
		expect(formatElapsedTime(90000)).toBe("1m 30s");
		expect(formatElapsedTime(3599000)).toBe("59m 59s");
	});

	it("formats hours, minutes, and seconds", () => {
		expect(formatElapsedTime(3600000)).toBe("1h 00m 00s");
		expect(formatElapsedTime(3661000)).toBe("1h 01m 01s");
	});

	it("formats detailed style for small values", () => {
		expect(formatElapsedTime(50, { style: "detailed" })).toBe("0.05s");
		expect(formatElapsedTime(100, { style: "detailed" })).toBe("0.10s");
		expect(formatElapsedTime(5000, { style: "detailed" })).toBe("5s");
	});
});

describe("formatValue", () => {
	it("handles null and undefined", () => {
		expect(formatValue(null)).toBe("");
		expect(formatValue(undefined)).toBe("");
	});

	it("formats primitives", () => {
		expect(formatValue("string")).toBe("string");
		expect(formatValue(42)).toBe("42");
		expect(formatValue(true)).toBe("true");
		expect(formatValue(false)).toBe("false");
	});

	it("formats arrays", () => {
		expect(formatValue([])).toBe("[]");
		expect(formatValue(["a", "b", "c"])).toBe("a, b, c");
		expect(formatValue([1, 2, 3, 4, 5])).toBe("[5 items]");
		expect(formatValue(["a".repeat(30), "b".repeat(30)])).toContain("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
	});

	it("formats objects as JSON", () => {
		const obj = { key: "value" };
		expect(formatValue(obj)).toBe(JSON.stringify(obj));
	});
});

describe("formatToolInputLines", () => {
	it("handles non-object input", () => {
		expect(formatToolInputLines("simple string")).toEqual(["simple string"]);
		expect(formatToolInputLines(42)).toEqual(["42"]);
	});

	it("formats object entries", () => {
		const obj = { name: "test", value: 123 };
		expect(formatToolInputLines(obj)).toEqual(["name: test", "value: 123"]);
	});

	it("truncates long lines", () => {
		const longValue = "x".repeat(200);
		const obj = { key: longValue };
		const result = formatToolInputLines(obj);
		expect(result[0]).toHaveLength(140);
		expect(result[0]).toEndWith("…");
	});

	it("truncates too many lines", () => {
		const obj = Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`key${i}`, `value${i}`]));
		const result = formatToolInputLines(obj);
		expect(result).toHaveLength(11);
		expect(result[10]).toBe("… (truncated)");
	});

	it("handles errors gracefully", () => {
		const circular: Record<string, unknown> = {};
		circular.self = circular;
		const result = formatToolInputLines(circular);
		expect(result[0]).toMatch(/\[error:/);
	});
});

describe("formatTodoItem", () => {
	it("formats with default pending status", () => {
		const result = formatTodoItem({ content: "Test task" }, 0);
		expect(result).toEqual({ text: "○ Test task", status: "pending" });
	});

	it("formats with various statuses", () => {
		expect(formatTodoItem({ content: "Test", status: "in_progress" }, 0).text).toBe("◐ Test");
		expect(formatTodoItem({ content: "Test", status: "completed" }, 0).text).toBe("● Test");
		expect(formatTodoItem({ content: "Test", status: "cancelled" }, 0).text).toBe("✕ Test");
	});

	it("uses default icon for unknown status", () => {
		const result = formatTodoItem({ content: "Test", status: "unknown" }, 0);
		expect(result.text).toBe("[ ] Test");
		expect(result.status).toBe("unknown");
	});
});

describe("formatTodoDisplayLines", () => {
	const currentTodos: TodoItem[] = [
		{ content: "First task", status: "pending" },
		{ content: "Second task", status: "completed" },
	];

	it("uses snapshot when provided", () => {
		const snapshot = [{ content: "Snapshot task", status: "completed" }];
		const result = formatTodoDisplayLines({ action: "write" }, snapshot, []);
		expect(result).toHaveLength(1);
		expect(result[0].text).toBe("● Snapshot task");
	});

	it("formats write action with todos", () => {
		const result = formatTodoDisplayLines(
			{ action: "write", todos: [{ content: "New task", status: "pending" }] },
			undefined,
			[]
		);
		expect(result).toHaveLength(1);
		expect(result[0].text).toBe("○ New task");
	});

	it("shows empty state for no todos", () => {
		const result = formatTodoDisplayLines({ action: "list" }, undefined, []);
		expect(result).toEqual([{ text: "(no todos)", status: "pending" }]);
	});

	it("applies status update for update action", () => {
		const result = formatTodoDisplayLines(
			{ action: "update", index: 1, status: "completed" },
			undefined,
			currentTodos
		);
		expect(result[0].text).toBe("● First task");
		expect(result[1].text).toBe("● Second task");
	});

	it("shows current todos for list action", () => {
		const result = formatTodoDisplayLines({ action: "list" }, undefined, currentTodos);
		expect(result).toHaveLength(2);
		expect(result[0].text).toBe("○ First task");
		expect(result[1].text).toBe("● Second task");
	});

	it("handles list action with current todos", () => {
		const result = formatTodoDisplayLines({ action: "list" }, undefined, currentTodos);
		expect(result).toHaveLength(2);
	});
});

describe("isTodoInput", () => {
	it("returns true for valid todo input", () => {
		expect(isTodoInput({ action: "write" })).toBe(true);
		expect(isTodoInput({ action: "update", index: 1 })).toBe(true);
		expect(isTodoInput({ action: "list" })).toBe(true);
	});

	it("returns false for invalid inputs", () => {
		expect(isTodoInput(null)).toBe(false);
		expect(isTodoInput(undefined)).toBe(false);
		expect(isTodoInput({})).toBe(false);
		expect(isTodoInput({ action: 123 })).toBe(false);
		expect(isTodoInput("not an object")).toBe(false);
	});
});

describe("formatTokenCount", () => {
	it("returns string representation", () => {
		expect(formatTokenCount(100)).toBe("100");
		expect(formatTokenCount(1000)).toBe("1.000");
		expect(formatTokenCount(10000)).toBe("10.000");
	});
});

describe("formatPrice", () => {
	it("returns FREE for zero price", () => {
		expect(formatPrice(0)).toBe("FREE");
	});

	it("formats small prices", () => {
		expect(formatPrice(0.0001)).toBe("$0.0001");
		expect(formatPrice(0.001)).toBe("$0.0010");
		expect(formatPrice(0.009)).toBe("$0.0090");
	});

	it("formats medium prices", () => {
		expect(formatPrice(0.01)).toBe("$0.01");
		expect(formatPrice(0.1)).toBe("$0.10");
		expect(formatPrice(0.99)).toBe("$0.99");
	});

	it("formats large prices", () => {
		expect(formatPrice(1)).toBe("$1.00");
		expect(formatPrice(10.5)).toBe("$10.50");
		expect(formatPrice(99.99)).toBe("$99.99");
	});
});

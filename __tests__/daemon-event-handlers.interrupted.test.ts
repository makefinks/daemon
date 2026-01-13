import { describe, it, expect } from "bun:test";
import { buildInterruptedModelMessages } from "../src/hooks/daemon-event-handlers";
import type { ContentBlock, ToolCall } from "../src/types";

describe("buildInterruptedModelMessages", () => {
	it("preserves order across text and tool blocks", () => {
		const toolCall: ToolCall = {
			name: "webSearch",
			input: { query: "test", numResults: 1 },
			toolCallId: "call_1",
			status: "completed",
		};

		const toolResult = { success: true, data: { results: [{ url: "https://example.com" }] } };

		const blocks: ContentBlock[] = [
			{ type: "text", content: "A" },
			{ type: "tool", call: toolCall, result: toolResult },
			{ type: "text", content: "B" },
		];

		const messages = buildInterruptedModelMessages(blocks);

		expect(messages.length).toBe(3);
		expect(messages[0]?.role).toBe("assistant");
		expect(messages[1]?.role).toBe("tool");
		expect(messages[2]?.role).toBe("assistant");

		const firstContent = messages[0]?.content as any[];
		expect(firstContent?.[0]).toEqual({ type: "text", text: "A" });
		expect(firstContent?.[1]).toEqual({
			type: "tool-call",
			toolCallId: "call_1",
			toolName: "webSearch",
			input: { query: "test", numResults: 1 },
		});

		const toolContent = messages[1]?.content as any[];
		expect(toolContent?.length).toBe(1);
		expect(toolContent?.[0]?.type).toBe("tool-result");
		expect(toolContent?.[0]?.toolCallId).toBe("call_1");
		expect(toolContent?.[0]?.toolName).toBe("webSearch");
		expect(toolContent?.[0]?.output).toEqual({ type: "json", value: toolResult });

		const lastContent = messages[2]?.content as any[];
		expect(lastContent?.[0]).toEqual({ type: "text", text: "B" });
	});

	it("persists reasoning blocks in assistant messages", () => {
		const toolCall: ToolCall = {
			name: "webSearch",
			input: { query: "test", numResults: 1 },
			toolCallId: "call_2",
			status: "completed",
		};

		const blocks: ContentBlock[] = [
			{ type: "reasoning", content: "Thoughts." },
			{ type: "tool", call: toolCall, result: { ok: true } },
			{ type: "reasoning", content: "More thoughts." },
		];

		const messages = buildInterruptedModelMessages(blocks);

		expect(messages.length).toBe(3);
		expect(messages[0]?.role).toBe("assistant");
		expect(messages[1]?.role).toBe("tool");
		expect(messages[2]?.role).toBe("assistant");

		const firstContent = messages[0]?.content as any[];
		expect(firstContent?.[0]).toEqual({ type: "reasoning", text: "Thoughts." });
		expect(firstContent?.[1]?.type).toBe("tool-call");

		const lastContent = messages[2]?.content as any[];
		expect(lastContent?.[0]).toEqual({ type: "reasoning", text: "More thoughts." });
	});
});

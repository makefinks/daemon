import { describe, it, expect } from "bun:test";
import type { ModelMessage } from "ai";
import { sanitizeMessagesForInput } from "../src/ai/sanitize-messages";

describe("sanitizeMessagesForInput", () => {
	it("removes providerOptions at any level", () => {
		const messages = [
			{
				role: "assistant",
				content: [
					{
						type: "tool-call",
						toolCallId: "call_1",
						toolName: "webSearch",
						input: {
							q: "hello",
							providerOptions: { shouldBeRemoved: true },
						},
						providerOptions: { alsoRemoved: true },
					},
				],
				providerOptions: { topLevelRemoved: true },
			},
		] as unknown as ModelMessage[];

		const sanitized = sanitizeMessagesForInput(messages);
		const asJson = JSON.stringify(sanitized);

		expect(asJson.includes("providerOptions")).toBe(false);
		expect(sanitized.length).toBe(1);
		expect(Array.isArray(sanitized[0]?.content)).toBe(true);
	});

	it("drops whitespace-only text parts (e.g. newline-only blocks)", () => {
		const messages = [
			{
				role: "assistant",
				content: [
					{ type: "reasoning", text: "thinking..." },
					{ type: "text", text: "\n\n" },
					{
						type: "tool-call",
						toolCallId: "call_2",
						toolName: "webSearch",
						input: { q: "vw hot hatch" },
					},
				],
			},
		] as unknown as ModelMessage[];

		const sanitized = sanitizeMessagesForInput(messages);
		const content = sanitized[0]?.content as unknown[];

		expect(Array.isArray(content)).toBe(true);
		expect(content.length).toBe(2);
		expect((content[0] as { type?: string }).type).toBe("reasoning");
		expect((content[1] as { type?: string }).type).toBe("tool-call");
	});

	it("keeps text parts that contain visible characters", () => {
		const messages = [
			{
				role: "assistant",
				content: [
					{ type: "text", text: "\nHello\n" },
					{ type: "text", text: "World" },
				],
			},
		] as unknown as ModelMessage[];

		const sanitized = sanitizeMessagesForInput(messages);
		const content = sanitized[0]?.content as unknown[];

		expect(content.length).toBe(2);
		expect((content[0] as { type?: string }).type).toBe("text");
		expect((content[1] as { type?: string }).type).toBe("text");
	});

	it("strips message-level reasoning/reasoning_details but preserves reasoning content parts", () => {
		const messages = [
			{
				role: "assistant",
				content: [
					{ type: "reasoning", text: "thinking step by step..." },
					{ type: "text", text: "Here is the answer" },
				],
				reasoning: "raw thinking output that cannot be round-tripped",
				reasoning_details: [{ type: "reasoning.text", text: "details" }],
			},
		] as unknown as ModelMessage[];

		const sanitized = sanitizeMessagesForInput(messages);
		const msg = sanitized[0] as Record<string, unknown>;
		const content = msg.content as unknown[];

		expect(msg.reasoning).toBeUndefined();
		expect(msg.reasoning_details).toBeUndefined();
		expect(content.length).toBe(2);
		expect((content[0] as { type?: string }).type).toBe("reasoning");
		expect((content[0] as { text?: string }).text).toBe("thinking step by step...");
	});
});

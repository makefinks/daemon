import { describe, expect, it } from "bun:test";
import type { ModelMessage } from "ai";

import {
	moveMultimodalToolResultImagesToUserMessages,
	prepareOpenRouterMultimodalToolResults,
} from "../src/ai/providers/openrouter-multimodal-tool-results";

describe("OpenRouter multimodal tool result transform", () => {
	it("moves image tool result content into a synthetic user message", () => {
		const messages: ModelMessage[] = [
			{
				role: "tool",
				content: [
					{
						type: "tool-result",
						toolName: "screenshot",
						toolCallId: "call_1",
						output: {
							type: "content",
							value: [
								{ type: "text", text: "Screenshot captured." },
								{ type: "image-data", data: "base64-image", mediaType: "image/png" },
							],
						},
					},
				],
			},
		];

		const result = moveMultimodalToolResultImagesToUserMessages(messages);

		expect(result).toHaveLength(2);
		expect(result[0]?.role).toBe("tool");
		expect(result[1]?.role).toBe("user");

		const toolContent = result[0]?.content;
		expect(Array.isArray(toolContent)).toBe(true);
		const toolResult = Array.isArray(toolContent) ? toolContent[0] : null;
		expect(toolResult).toMatchObject({
			type: "tool-result",
			output: {
				type: "content",
				value: [
					{ type: "text", text: "Screenshot captured." },
					{
						type: "text",
						text: "Additional image content from this tool result is attached in the next user message.",
					},
				],
			},
		});

		const userContent = result[1]?.content;
		expect(Array.isArray(userContent)).toBe(true);
		expect(userContent).toMatchObject([
			{ type: "text" },
			{ type: "file", mediaType: "image/png", data: "base64-image" },
		]);
	});

	it("leaves text-only tool results unchanged", () => {
		const messages: ModelMessage[] = [
			{
				role: "tool",
				content: [
					{
						type: "tool-result",
						toolName: "readFile",
						toolCallId: "call_2",
						output: { type: "text", value: "hello" },
					},
				],
			},
		];

		expect(moveMultimodalToolResultImagesToUserMessages(messages)).toEqual(messages);
	});

	it("strips image content for non-vision models", () => {
		const messages: ModelMessage[] = [
			{
				role: "tool",
				content: [
					{
						type: "tool-result",
						toolName: "screenshot",
						toolCallId: "call_3",
						output: {
							type: "content",
							value: [
								{ type: "text", text: "Screenshot captured." },
								{ type: "image-data", data: "base64-image", mediaType: "image/png" },
							],
						},
					},
				],
			},
		];

		const result = prepareOpenRouterMultimodalToolResults(messages, { supportsVision: false });

		expect(result).toHaveLength(1);
		const toolContent = result[0]?.content;
		expect(Array.isArray(toolContent)).toBe(true);
		const toolResult = Array.isArray(toolContent) ? toolContent[0] : null;
		expect(toolResult).toMatchObject({
			type: "tool-result",
			output: {
				type: "content",
				value: [
					{ type: "text", text: "Screenshot captured." },
					{
						type: "text",
						text: "[Image omitted: image/png. The active model does not support vision input.]",
					},
				],
			},
		});
	});
});

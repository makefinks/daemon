import type { ContentBlock, ModelMessage, ToolResultOutput } from "../../types";

export const INTERRUPTED_TOOL_RESULT = "Tool execution interrupted by user";

export function normalizeInterruptedToolBlockResult(result: unknown): unknown {
	if (result !== undefined) return result;
	return { success: false, error: INTERRUPTED_TOOL_RESULT };
}

export function normalizeInterruptedToolResultOutput(result: unknown): ToolResultOutput {
	if (result === undefined) {
		return { type: "error-text", value: INTERRUPTED_TOOL_RESULT };
	}

	if (typeof result === "string") {
		return { type: "text", value: result };
	}

	try {
		JSON.stringify(result);
		return { type: "json", value: result as ToolResultOutput["value"] };
	} catch {
		return { type: "text", value: String(result) };
	}
}

export function buildInterruptedContentBlocks(contentBlocks: ContentBlock[]): ContentBlock[] {
	return contentBlocks.map((block) => {
		if (block.type !== "tool") return { ...block };

		const call = { ...block.call };
		if (call.status === "running") {
			call.status = "failed";
			call.error = INTERRUPTED_TOOL_RESULT;
		}
		if (call.subagentSteps) {
			call.subagentSteps = call.subagentSteps.map((step) =>
				step.status === "running" ? { ...step, status: "failed" } : step
			);
		}

		return {
			...block,
			call,
			result: normalizeInterruptedToolBlockResult(block.result),
		};
	});
}

export function buildInterruptedModelMessages(contentBlocks: ContentBlock[]): ModelMessage[] {
	const messages: ModelMessage[] = [];

	type AssistantPart =
		| { type: "text"; text: string }
		| { type: "reasoning"; text: string }
		| { type: "tool-call"; toolCallId: string; toolName: string; input: unknown };

	type ToolResultPart = {
		type: "tool-result";
		toolCallId: string;
		toolName: string;
		output: ToolResultOutput;
	};

	let assistantParts: AssistantPart[] = [];
	let toolResults: ToolResultPart[] = [];

	for (const block of contentBlocks) {
		if (block.type === "reasoning" && block.content) {
			if (toolResults.length > 0) {
				messages.push({
					role: "tool",
					content: [...toolResults],
				} as unknown as ModelMessage);
				toolResults = [];
			}

			assistantParts.push({ type: "reasoning", text: block.content });
			continue;
		}

		if (block.type === "text" && block.content) {
			if (toolResults.length > 0) {
				messages.push({
					role: "tool",
					content: [...toolResults],
				} as unknown as ModelMessage);
				toolResults = [];
			}

			assistantParts.push({ type: "text", text: block.content });
			continue;
		}

		if (block.type === "tool") {
			if (toolResults.length > 0) {
				messages.push({
					role: "tool",
					content: [...toolResults],
				} as unknown as ModelMessage);
				toolResults = [];
			}

			const toolCallId = block.call.toolCallId;
			if (!toolCallId) {
				continue;
			}

			assistantParts.push({
				type: "tool-call",
				toolCallId,
				toolName: block.call.name,
				input: block.call.input ?? {},
			});

			if (assistantParts.length > 0) {
				messages.push({
					role: "assistant",
					content: [...assistantParts],
				} as unknown as ModelMessage);
				assistantParts = [];
			}

			toolResults.push({
				type: "tool-result",
				toolCallId,
				toolName: block.call.name,
				output: normalizeInterruptedToolResultOutput(block.result),
			});
		}
	}

	if (assistantParts.length > 0) {
		messages.push({
			role: "assistant",
			content: [...assistantParts],
		} as unknown as ModelMessage);
	}

	if (toolResults.length > 0) {
		messages.push({
			role: "tool",
			content: [...toolResults],
		} as unknown as ModelMessage);
	}

	return messages;
}

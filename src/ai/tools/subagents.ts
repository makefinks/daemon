/**
 * Subagent tool for delegating tasks.
 * DAEMON can call this tool multiple times in parallel to spawn concurrent subagents.
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { tool } from "ai";
import { type ModelMessage, ToolLoopAgent, stepCountIs } from "ai";
import type { ToolSet } from "ai";
import { z } from "zod";
import { getDaemonManager } from "../../state/daemon-state";
import type { SubagentProgressEmitter } from "../../types";
import { getOpenRouterReportedCost } from "../../utils/openrouter-reported-cost";
import { extractFinalAssistantText } from "../message-utils";
import { buildOpenRouterChatSettings, getSubagentModel } from "../model-config";
import { buildToolSet } from "./tool-registry";

// OpenRouter client for subagents
const openrouter = createOpenRouter();

// Maximum steps for subagent loops
const MAX_SUBAGENT_STEPS = 30;

let cachedSubagentTools: Promise<ToolSet> | null = null;

export function invalidateSubagentToolsCache(): void {
	cachedSubagentTools = null;
}

// Subagent tools (all tools except subagent itself to prevent recursion)
async function getSubagentTools(): Promise<ToolSet> {
	if (cachedSubagentTools) return cachedSubagentTools;

	cachedSubagentTools = (async () => {
		const toggles = getDaemonManager().toolToggles;
		const { tools } = await buildToolSet(toggles, {
			omit: ["groundingManager", "subagent"],
		});
		return tools;
	})();

	return cachedSubagentTools;
}

// System prompt for subagents
function buildSubagentSystemPrompt(webSearchAvailable: boolean): string {
	const disabledNotice = !webSearchAvailable
		? "\nNOTICE: Web search and URL fetching are DISABLED because EXA_API_KEY is not configured.\n"
		: "";

	return `
You are a focused subagent. You have been spawned to complete a specific task by a main agent.${disabledNotice}

RULES:
- Complete the assigned task thoroughly.
- Use tools as needed to accomplish the task.
- Do not ask clarifying questions - make reasonable assumptions.
- Be direct and factual in your response.
- If you cannot complete the task, explain why clearly.
- Return a clear, detailed summary of what you found or accomplished.
- The final summary needs to be self contained and needs to provide enough information to the main agent so it is clear what you have done and what the results are.

Today's date: ${new Date().toISOString().split("T")[0]}
	`;
}

// Global emitter that will be set by the daemon-ai module
let progressEmitter: SubagentProgressEmitter | null = null;

/**
 * Set the progress emitter for subagent updates.
 * Called by daemon-ai when setting up the response generation.
 */
export function setSubagentProgressEmitter(emitter: SubagentProgressEmitter | null): void {
	progressEmitter = emitter;
}

/**
 * The subagent tool - spawns a single subagent to complete a task.
 * DAEMON can call this multiple times in parallel for concurrent execution.
 */
export const subagent = tool({
	description: `Spawn a subagent to complete a specific task. The subagent has access to available tools (bash, system info, etc.) except spawning more subagents.

Call this tool multiple times in parallel to execute tasks concurrently.

Use this when you need to:
- Delegate a research or information-gathering task
- Run an independent operation while continuing other work
- Parallelize multiple lookups or checks

Provide a concise summary for display and a very specific task description (especially for complex work).`,
	inputSchema: z.object({
		summary: z
			.string()
			.describe("A concise summary with a bit of detail (not just a title). Shown in the UI."),
		task: z.string().describe("A specific, scoped description of what the subagent should accomplish."),
	}),
	execute: async ({ summary, task }, { toolCallId }) => {
		try {
			const tools = await getSubagentTools();
			const webSearchAvailable = Boolean((tools as Record<string, unknown>).webSearch);
			const fetchUrlsAvailable = Boolean((tools as Record<string, unknown>).fetchUrls);

			// Create ephemeral subagent
			const subagent = new ToolLoopAgent({
				model: openrouter.chat(getSubagentModel(), buildOpenRouterChatSettings()),
				instructions: buildSubagentSystemPrompt(webSearchAvailable || fetchUrlsAvailable),
				tools,
				stopWhen: stepCountIs(MAX_SUBAGENT_STEPS),
			});

			let costTotal = 0;
			let hasCost = false;

			// Stream the subagent response to capture tool calls for UI
			const stream = await subagent.stream({
				messages: [{ role: "user" as const, content: task }],
			});

			for await (const part of stream.fullStream) {
				if (part.type === "finish-step") {
					const reportedCost = getOpenRouterReportedCost(part.providerMetadata);
					if (reportedCost !== undefined) {
						costTotal += reportedCost;
						hasCost = true;
					}
				} else if (part.type === "tool-call") {
					// Emit tool call event for UI update
					// Use setImmediate to yield to the event loop and allow React to re-render
					setImmediate(() => {
						progressEmitter?.onSubagentToolCall(toolCallId, part.toolName, part.input);
					});
				} else if (part.type === "tool-result") {
					// Emit tool result event
					const success =
						typeof part.output === "object" && part.output !== null && "success" in part.output
							? Boolean((part.output as { success?: unknown }).success)
							: true;
					setImmediate(() => {
						progressEmitter?.onSubagentToolResult(toolCallId, part.toolName, success);
					});
				}
			}

			const responseMessages = await stream.response.then((response) => response.messages);
			const finalResponse = extractFinalAssistantText(responseMessages);

			const streamUsage = await stream.usage;
			if (streamUsage) {
				progressEmitter?.onSubagentUsage({
					promptTokens: streamUsage.inputTokens ?? 0,
					completionTokens: streamUsage.outputTokens ?? 0,
					totalTokens: streamUsage.totalTokens ?? 0,
					reasoningTokens: streamUsage.outputTokenDetails?.reasoningTokens ?? 0,
					cachedInputTokens: streamUsage.inputTokenDetails?.cacheReadTokens ?? 0,
					cost: hasCost ? costTotal : undefined,
				});
			}

			// Emit completion
			progressEmitter?.onSubagentComplete(toolCallId, true);

			return {
				success: true,
				summary,
				response: finalResponse || "Task completed but no text response generated.",
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);

			// Emit failure
			progressEmitter?.onSubagentComplete(toolCallId, false);

			return {
				success: false,
				summary,
				response: `Error: ${errorMessage}`,
			};
		}
	},
});

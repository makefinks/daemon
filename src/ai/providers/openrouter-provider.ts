import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { type ModelMessage, ToolLoopAgent, generateText, stepCountIs } from "ai";
import { getDaemonManager } from "../../state/daemon-state";
import { getRuntimeContext } from "../../state/runtime-context";
import type { ReasoningEffort, ToolApprovalRequest } from "../../types";
import { debug, toolDebug } from "../../utils/debug-logger";
import { getOpenRouterReportedCost } from "../../utils/openrouter-reported-cost";
import { getWorkspacePath } from "../../utils/workspace-manager";
import { extractFinalAssistantText } from "../message-utils";
import { buildOpenRouterChatSettings, getResponseModel } from "../model-config";
import { sanitizeMessagesForInput } from "../sanitize-messages";
import { buildDaemonSystemPrompt } from "../system-prompt";
import { coordinateToolApprovals } from "../tool-approval-coordinator";
import { getCachedToolAvailability, getDaemonTools } from "../tools/index";
import { createToolAvailabilitySnapshot, resolveToolAvailability } from "../tools/tool-registry";
import { getProviderCapabilities } from "./capabilities";
import type { LlmProviderAdapter, ProviderStreamRequest, ProviderStreamResult } from "./types";

const openrouter = createOpenRouter();
const MAX_AGENT_STEPS = 100;

function normalizeStreamError(error: unknown): Error {
	if (error instanceof Error) return error;
	if (error && typeof error === "object" && "message" in error) {
		const message = (error as { message?: unknown }).message;
		if (typeof message === "string") return new Error(message);
	}
	return new Error(String(error));
}

async function createDaemonAgent(
	interactionMode: ProviderStreamRequest["interactionMode"] = "text",
	reasoningEffort?: ReasoningEffort,
	memoryInjection?: string
) {
	const openRouterReasoningEffort = reasoningEffort === "xhigh" ? "high" : reasoningEffort;
	const modelConfig = buildOpenRouterChatSettings(
		openRouterReasoningEffort ? { reasoning: { effort: openRouterReasoningEffort } } : undefined
	);

	const { sessionId } = getRuntimeContext();
	const tools = await getDaemonTools();
	const toolAvailability =
		getCachedToolAvailability() ?? (await resolveToolAvailability(getDaemonManager().toolToggles));

	const workspacePath = sessionId ? getWorkspacePath(sessionId) : undefined;

	return new ToolLoopAgent({
		model: openrouter.chat(getResponseModel(), modelConfig),
		instructions: buildDaemonSystemPrompt({
			mode: interactionMode,
			toolAvailability: createToolAvailabilitySnapshot(toolAvailability),
			workspacePath,
			memoryInjection,
		}),
		tools,
		stopWhen: stepCountIs(MAX_AGENT_STEPS),
		prepareStep: async ({ messages }) => ({
			messages: sanitizeMessagesForInput(messages),
		}),
	});
}

async function streamOpenRouterResponse(
	request: ProviderStreamRequest
): Promise<ProviderStreamResult | null> {
	const {
		userMessage,
		callbacks,
		conversationHistory,
		interactionMode,
		abortSignal,
		reasoningEffort,
		memoryInjection,
	} = request;

	const messages: ModelMessage[] = [...conversationHistory];
	messages.push({ role: "user" as const, content: userMessage });

	const agent = await createDaemonAgent(interactionMode, reasoningEffort, memoryInjection);

	let currentMessages = messages;
	let fullText = "";
	let streamError: Error | null = null;
	let allResponseMessages: ModelMessage[] = [];

	while (true) {
		const stream = await agent.stream({
			messages: currentMessages,
		});

		const pendingApprovals: ToolApprovalRequest[] = [];

		for await (const part of stream.fullStream) {
			if (abortSignal?.aborted) {
				return null;
			}

			if (part.type === "error") {
				const err = normalizeStreamError(part.error);
				streamError = err;
				debug.error("agent-stream-error", {
					message: err.message,
					error: part.error,
				});
				callbacks.onError?.(err);
			} else if (part.type === "abort") {
				return null;
			} else if (part.type === "reasoning-delta") {
				callbacks.onReasoningToken?.(part.text);
			} else if (part.type === "text-delta") {
				fullText += part.text;
				callbacks.onToken?.(part.text);
			} else if (part.type === "tool-input-start") {
				callbacks.onToolCallStart?.(part.toolName, part.id);
			} else if (part.type === "tool-call") {
				callbacks.onToolCall?.(part.toolName, part.input, part.toolCallId);
			} else if (part.type === "tool-result") {
				callbacks.onToolResult?.(part.toolName, part.output, part.toolCallId);
			} else if (part.type === "tool-error") {
				const errorMessage = part.error instanceof Error ? part.error.message : String(part.error);
				toolDebug.error("tool-error", {
					toolName: part.toolName,
					toolCallId: part.toolCallId,
					input: part.input,
					error: errorMessage,
				});
				callbacks.onToolResult?.(part.toolName, { error: errorMessage, input: part.input }, part.toolCallId);
			} else if (part.type === "tool-approval-request") {
				const approvalRequest: ToolApprovalRequest = {
					approvalId: part.approvalId,
					toolName: part.toolCall.toolName,
					toolCallId: part.toolCall.toolCallId,
					input: part.toolCall.input,
				};
				pendingApprovals.push(approvalRequest);
				callbacks.onToolApprovalRequest?.(approvalRequest);
			} else if (part.type === "finish-step") {
				if (part.usage && callbacks.onStepUsage) {
					const reportedCost = getOpenRouterReportedCost(part.providerMetadata);

					callbacks.onStepUsage({
						promptTokens: part.usage.inputTokens ?? 0,
						completionTokens: part.usage.outputTokens ?? 0,
						totalTokens: part.usage.totalTokens ?? 0,
						reasoningTokens: part.usage.outputTokenDetails?.reasoningTokens ?? 0,
						cachedInputTokens: part.usage.inputTokenDetails?.cacheReadTokens ?? 0,
						cost: reportedCost,
					});
				}
			}
		}

		if (streamError) {
			return null;
		}

		const rawResponseMessages = await stream.response.then((response) => response.messages);
		const responseMessages = sanitizeMessagesForInput(rawResponseMessages);
		allResponseMessages = [...allResponseMessages, ...responseMessages];
		currentMessages = [...currentMessages, ...responseMessages];

		if (pendingApprovals.length > 0 && callbacks.onAwaitingApprovals) {
			const { toolMessage } = await coordinateToolApprovals({
				pendingApprovals,
				requestApprovals: callbacks.onAwaitingApprovals,
			});

			if (toolMessage) {
				currentMessages = [...currentMessages, toolMessage];
			}

			continue;
		}

		break;
	}

	if (streamError) {
		return null;
	}

	const finalText = extractFinalAssistantText(allResponseMessages);
	if (!fullText && allResponseMessages.length === 0) {
		callbacks.onError?.(new Error("Model returned empty response. Check API key and model availability."));
		return null;
	}

	return {
		fullText,
		responseMessages: allResponseMessages,
		finalText,
	};
}

async function generateOpenRouterSessionTitle(firstMessage: string): Promise<string> {
	const result = await generateText({
		model: openrouter.chat(getResponseModel(), buildOpenRouterChatSettings()),
		system:
			'You are a title generator. Generate a very short, descriptive title (3-6 words) for a conversation based on the user\'s first message. The title should capture the main topic or intent. Do not use quotes, punctuation, or prefixes like "Title:". Just output the title text directly.',
		messages: [
			{
				role: "user",
				content: `Generate a short descriptive title for the following message <message>${firstMessage}</message>`,
			},
		],
	});

	return result.text.trim() || "New Session";
}

export const openRouterProviderAdapter: LlmProviderAdapter = {
	id: "openrouter",
	capabilities: getProviderCapabilities("openrouter"),
	streamResponse: streamOpenRouterResponse,
	generateSessionTitle: generateOpenRouterSessionTitle,
};

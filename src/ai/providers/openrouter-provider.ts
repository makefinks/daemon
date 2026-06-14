import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { type ModelMessage, ToolLoopAgent, generateText, stepCountIs } from "ai";
import { getDaemonManager } from "../../state/daemon-state";
import { getRuntimeContext } from "../../state/runtime-context";
import type { ReasoningEffort, ToolApprovalRequest } from "../../types";
import { debug, toolDebug } from "../../utils/debug-logger";
import { getOpenRouterReportedCost } from "../../utils/openrouter-reported-cost";
import { getWorkspacePath } from "../../utils/workspace-manager";
import { extractFinalAssistantText } from "../message-utils";
import { getMcpManager } from "../mcp/mcp-manager";
import { buildOpenRouterChatSettings, getResponseModel } from "../model-config";
import { prepareOpenRouterMultimodalToolResults } from "./openrouter-multimodal-tool-results";
import { sanitizeMessagesForInput } from "../sanitize-messages";
import { getSkillCatalog } from "../skills/skill-manager";
import { buildDaemonSystemPrompt } from "../system-prompt";
import { coordinateToolApprovals } from "../tool-approval-coordinator";
import { getCachedToolAvailability, getDaemonTools } from "../tools/index";
import { createToolAvailabilitySnapshot, resolveToolAvailability } from "../tools/tool-registry";
import { getModelMetadataForProvider } from "../../utils/model-metadata";
import {
	createBackgroundNotificationInjector,
	type BackgroundNotificationInjector,
} from "./background-notification-injection";
import { getProviderCapabilities } from "./capabilities";
import type { LlmProviderAdapter, ProviderStreamRequest, ProviderStreamResult } from "./types";
import { buildUserModelMessage } from "./user-content";

const openrouter = createOpenRouter();
const MAX_AGENT_STEPS = 100;

let streamRunCounter = 0;

function normalizeStreamError(error: unknown): Error {
	if (error instanceof Error) return error;
	if (error && typeof error === "object" && "message" in error) {
		const message = (error as { message?: unknown }).message;
		if (typeof message === "string") return new Error(message);
	}
	return new Error(String(error));
}

function summarizeValue(value: unknown): Record<string, unknown> {
	const type = Array.isArray(value) ? "array" : typeof value;
	let jsonLength: number | undefined;
	let preview: string | undefined;

	try {
		const json = JSON.stringify(value);
		jsonLength = json.length;
		preview = json.length > 500 ? `${json.slice(0, 500)}...` : json;
	} catch {
		preview = String(value).slice(0, 500);
	}

	return { type, jsonLength, preview };
}

async function createDaemonAgent(
	interactionMode: ProviderStreamRequest["interactionMode"] = "text",
	reasoningEffort?: ReasoningEffort,
	memoryInjection?: string,
	getNotificationInjector?: () => BackgroundNotificationInjector | null
) {
	const modelConfig = buildOpenRouterChatSettings(
		reasoningEffort ? { reasoning: { effort: reasoningEffort } } : undefined
	);

	const { sessionId } = getRuntimeContext();
	const tools = await getDaemonTools();
	const toolAvailability =
		getCachedToolAvailability() ?? (await resolveToolAvailability(getDaemonManager().toolToggles));

	const workspacePath = sessionId ? getWorkspacePath(sessionId) : undefined;
	const skillCatalog = await getSkillCatalog();
	const modelMetadata = await getModelMetadataForProvider(getResponseModel(), "openrouter");
	const supportsVision = modelMetadata?.supportsVision === true;
	const mcpToolGuidance = getMcpManager().getPromptGuidanceSnapshot({ supportsVision });

	return new ToolLoopAgent({
		model: openrouter.chat(getResponseModel(), modelConfig),
		instructions: buildDaemonSystemPrompt({
			mode: interactionMode,
			toolAvailability: createToolAvailabilitySnapshot(toolAvailability),
			mcpToolGuidance,
			workspacePath,
			cwdPath: process.cwd(),
			memoryInjection,
			skillCatalog,
		}),
		tools,
		stopWhen: stepCountIs(MAX_AGENT_STEPS),
		prepareStep: async ({ messages }) => ({
			messages: prepareOpenRouterMultimodalToolResults(
				sanitizeMessagesForInput(getNotificationInjector?.()?.prepareStepMessages(messages) ?? messages),
				{
					supportsVision,
				}
			),
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
		imageAttachments = [],
	} = request;

	const messages: ModelMessage[] = [...conversationHistory];
	messages.push(buildUserModelMessage(userMessage, imageAttachments));

	const { sessionId } = getRuntimeContext();
	let activeNotificationInjector: BackgroundNotificationInjector | null = null;
	const agent = await createDaemonAgent(
		interactionMode,
		reasoningEffort,
		memoryInjection,
		() => activeNotificationInjector
	);

	const streamRunId = ++streamRunCounter;
	let currentMessages = messages;
	let fullText = "";
	let streamError: Error | null = null;
	let allResponseMessages: ModelMessage[] = [];
	let stepIndex = 0;

	debug.info("agent-stream-start", {
		streamRunId,
		model: getResponseModel(),
		provider: "openrouter",
		conversationMessages: conversationHistory.length,
		userMessageLength: userMessage.length,
		imageAttachments: imageAttachments.length,
		interactionMode,
		reasoningEffort,
	});

	while (true) {
		stepIndex += 1;
		const notificationInjector = createBackgroundNotificationInjector(sessionId ?? null, callbacks);
		activeNotificationInjector = notificationInjector;
		const stream = await agent.stream({
			messages: currentMessages,
		});

		debug.info("agent-stream-step-start", {
			streamRunId,
			stepIndex,
			messageCount: currentMessages.length,
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
				toolDebug.info("tool-input-start", {
					streamRunId,
					stepIndex,
					toolName: part.toolName,
					toolCallId: part.id,
				});
				callbacks.onToolCallStart?.(part.toolName, part.id);
			} else if (part.type === "tool-input-delta") {
				callbacks.onToolCallInputDelta?.(part.id, part.delta);
			} else if (part.type === "tool-call") {
				toolDebug.info("tool-call", {
					streamRunId,
					stepIndex,
					toolName: part.toolName,
					toolCallId: part.toolCallId,
					input: summarizeValue(part.input),
				});
				callbacks.onToolCall?.(part.toolName, part.input, part.toolCallId);
			} else if (part.type === "tool-result") {
				toolDebug.info("tool-result", {
					streamRunId,
					stepIndex,
					toolName: part.toolName,
					toolCallId: part.toolCallId,
					output: summarizeValue(part.output),
				});
				callbacks.onToolResult?.(part.toolName, part.output, part.toolCallId);
			} else if (part.type === "tool-error") {
				const errorMessage = part.error instanceof Error ? part.error.message : String(part.error);
				toolDebug.error("tool-error", {
					streamRunId,
					stepIndex,
					toolName: part.toolName,
					toolCallId: part.toolCallId,
					input: summarizeValue(part.input),
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
			debug.error("agent-stream-step-failed", {
				streamRunId,
				stepIndex,
				message: streamError.message,
				fullTextLength: fullText.length,
			});
			return null;
		}

		let rawResponseMessages: ModelMessage[];
		try {
			rawResponseMessages = await stream.response.then((response) => response.messages);
		} catch (error) {
			const err = normalizeStreamError(error);
			streamError = err;
			debug.error("agent-stream-response-error", {
				streamRunId,
				stepIndex,
				message: err.message,
				stack: err.stack,
				fullTextLength: fullText.length,
				responseMessageCount: allResponseMessages.length,
			});
			callbacks.onError?.(err);
			return null;
		}
		const responseMessages = notificationInjector.applyToResponseMessages(
			sanitizeMessagesForInput(rawResponseMessages)
		);
		allResponseMessages = [...allResponseMessages, ...responseMessages];
		currentMessages = [...currentMessages, ...responseMessages];
		debug.info("agent-stream-step-complete", {
			streamRunId,
			stepIndex,
			rawResponseMessages: rawResponseMessages.length,
			responseMessages: responseMessages.length,
			allResponseMessages: allResponseMessages.length,
			fullTextLength: fullText.length,
			pendingApprovals: pendingApprovals.length,
		});

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

	debug.info("agent-stream-complete", {
		streamRunId,
		steps: stepIndex,
		fullTextLength: fullText.length,
		responseMessages: allResponseMessages.length,
		finalTextLength: finalText.length,
	});

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

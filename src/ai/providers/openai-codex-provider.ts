import { createOpenAI } from "@ai-sdk/openai";
import { type ModelMessage, ToolLoopAgent, stepCountIs, streamText } from "ai";
import { getDaemonManager } from "../../state/daemon-state";
import { getRuntimeContext } from "../../state/runtime-context";
import type { ReasoningEffort, ToolApprovalRequest } from "../../types";
import { debug, toolDebug } from "../../utils/debug-logger";
import { getWorkspacePath } from "../../utils/workspace-manager";
import { OPENAI_CODEX_BASE_URL, openAiCodexAuthenticatedFetch } from "../openai-codex-fetch";
import { extractFinalAssistantText } from "../message-utils";
import { getMcpManager } from "../mcp/mcp-manager";
import { getResponseModel } from "../model-config";
import { sanitizeMessagesForInput } from "../sanitize-messages";
import { getSkillCatalog } from "../skills/skill-manager";
import { buildDaemonSystemPrompt } from "../system-prompt";
import { coordinateToolApprovals } from "../tool-approval-coordinator";
import { getCachedToolAvailability, getDaemonTools } from "../tools/index";
import { createToolAvailabilitySnapshot, resolveToolAvailability } from "../tools/tool-registry";
import { getProviderCapabilities } from "./capabilities";
import type { LlmProviderAdapter, ProviderStreamRequest, ProviderStreamResult } from "./types";

const openAiCodex = createOpenAI({
	apiKey: "chatgpt-oauth",
	baseURL: OPENAI_CODEX_BASE_URL,
	name: "openai-codex",
	fetch: ((input, init) => openAiCodexAuthenticatedFetch(input, init)) as typeof fetch,
});

const MAX_AGENT_STEPS = 1000;

/** Normalize AI SDK stream errors to a concrete Error instance. */
function normalizeStreamError(error: unknown): Error {
	if (error instanceof Error) return error;
	if (error && typeof error === "object" && "message" in error) {
		const message = (error as { message?: unknown }).message;
		if (typeof message === "string") return new Error(message);
	}
	return new Error(String(error));
}

/** Build Codex-specific provider options for responses and tool-loop execution. */
function buildProviderOptions(
	reasoningEffort: ReasoningEffort | undefined,
	promptCacheKey: string | undefined
): NonNullable<ConstructorParameters<typeof ToolLoopAgent>[0]["providerOptions"]> {
	return {
		openai: {
			store: false,
			include: ["reasoning.encrypted_content"],
			reasoningEffort,
			reasoningSummary: "auto",
			textVerbosity: "medium",
			promptCacheKey,
		},
	};
}

/** Create the Codex-backed tool-loop agent for the current session. */
async function createDaemonAgent(
	interactionMode: ProviderStreamRequest["interactionMode"] = "text",
	reasoningEffort?: ReasoningEffort,
	memoryInjection?: string
) {
	const { sessionId } = getRuntimeContext();
	const tools = await getDaemonTools();
	const toolAvailability =
		getCachedToolAvailability() ?? (await resolveToolAvailability(getDaemonManager().toolToggles));
	const workspacePath = sessionId ? getWorkspacePath(sessionId) : undefined;
	const mcpToolGuidance = getMcpManager().getPromptGuidanceSnapshot();
	const skillCatalog = await getSkillCatalog();

	return new ToolLoopAgent({
		model: openAiCodex.responses(getResponseModel()),
		instructions: buildDaemonSystemPrompt({
			mode: interactionMode,
			toolAvailability: createToolAvailabilitySnapshot(toolAvailability),
			mcpToolGuidance,
			workspacePath,
			memoryInjection,
			skillCatalog,
		}),
		tools,
		providerOptions: buildProviderOptions(reasoningEffort, sessionId ?? undefined),
		stopWhen: stepCountIs(MAX_AGENT_STEPS),
		prepareStep: async ({ messages }) => ({
			messages: sanitizeMessagesForInput(messages),
		}),
	});
}

/** Stream a Codex response and bridge tool approvals/events back into DAEMON callbacks. */
async function streamOpenAiCodexResponse(
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
				debug.error("openai-codex-stream-error", {
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
			} else if (part.type === "tool-input-delta") {
				callbacks.onToolCallInputDelta?.(part.id, part.delta);
			} else if (part.type === "tool-call") {
				callbacks.onToolCall?.(part.toolName, part.input, part.toolCallId);
			} else if (part.type === "tool-result") {
				callbacks.onToolResult?.(part.toolName, part.output, part.toolCallId);
			} else if (part.type === "tool-error") {
				const errorMessage = part.error instanceof Error ? part.error.message : String(part.error);
				toolDebug.error("openai-codex-tool-error", {
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
					callbacks.onStepUsage({
						promptTokens: part.usage.inputTokens ?? 0,
						completionTokens: part.usage.outputTokens ?? 0,
						totalTokens: part.usage.totalTokens ?? 0,
						reasoningTokens: part.usage.outputTokenDetails?.reasoningTokens ?? 0,
						cachedInputTokens: part.usage.inputTokenDetails?.cacheReadTokens ?? 0,
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
		callbacks.onError?.(
			new Error("Model returned empty response. Check OpenAI Codex login and model availability.")
		);
		return null;
	}

	return {
		fullText,
		responseMessages: allResponseMessages,
		finalText,
	};
}

/** Generate a short session title using the active Codex model. */
async function generateOpenAiCodexSessionTitle(firstMessage: string): Promise<string> {
	const { sessionId } = getRuntimeContext();
	const result = streamText({
		model: openAiCodex.responses(getResponseModel()),
		providerOptions: buildProviderOptions(undefined, sessionId ?? undefined),
		system:
			'You are a title generator. Generate a very short, descriptive title (3-6 words) for a conversation based on the user\'s first message. The title should capture the main topic or intent. Do not use quotes, punctuation, or prefixes like "Title:". Just output the title text directly.',
		messages: [
			{
				role: "user",
				content: `Generate a short descriptive title for the following message <message>${firstMessage}</message>`,
			},
		],
	});

	const text = await result.text;
	return text.trim() || "New Session";
}

export const openAiCodexProviderAdapter: LlmProviderAdapter = {
	id: "openai-codex",
	capabilities: getProviderCapabilities("openai-codex"),
	streamResponse: streamOpenAiCodexResponse,
	generateSessionTitle: generateOpenAiCodexSessionTitle,
};

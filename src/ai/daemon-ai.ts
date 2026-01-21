/**
 * AI integration for DAEMON using Vercel AI SDK.
 * Handles transcription and response generation.
 */

import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
	type ModelMessage,
	ToolLoopAgent,
	generateText,
	stepCountIs,
	experimental_transcribe as transcribe,
} from "ai";
import { getDaemonManager } from "../state/daemon-state";
import { getRuntimeContext } from "../state/runtime-context";
import type {
	ReasoningEffort,
	StreamCallbacks,
	TokenUsage,
	ToolApprovalRequest,
	ToolApprovalResponse,
	TranscriptionResult,
} from "../types";
import { debug, toolDebug } from "../utils/debug-logger";
import { getOpenRouterReportedCost } from "../utils/openrouter-reported-cost";
import { getWorkspacePath } from "../utils/workspace-manager";
import { extractFinalAssistantText } from "./message-utils";
import { TRANSCRIPTION_MODEL, buildOpenRouterChatSettings, getResponseModel } from "./model-config";
import { sanitizeMessagesForInput } from "./sanitize-messages";
import { type InteractionMode, buildDaemonSystemPrompt } from "./system-prompt";
import { coordinateToolApprovals } from "./tool-approval-coordinator";
import { getCachedToolAvailability, getDaemonTools } from "./tools/index";
import { setSubagentProgressEmitter } from "./tools/subagents";
import { createToolAvailabilitySnapshot, resolveToolAvailability } from "./tools/tool-registry";

// Re-export ModelMessage from AI SDK since it's commonly needed by consumers
export type { ModelMessage } from "ai";

// OpenRouter client for AI SDK (response generation)
const openrouter = createOpenRouter();

// OpenAI client for transcription (OpenRouter doesn't support transcription)
const openai = createOpenAI({});

// Maximum steps for the agent loop to prevent infinite loops
const MAX_AGENT_STEPS = 100;

function normalizeStreamError(error: unknown): Error {
	if (error instanceof Error) return error;
	if (error && typeof error === "object" && "message" in error) {
		const message = (error as { message?: unknown }).message;
		if (typeof message === "string") return new Error(message);
	}
	return new Error(String(error));
}

/**
 * The DAEMON agent instance.
 * Handles the agent loop internally, allowing for multi-step tool usage.
 * Created dynamically to use the current model selection and reasoning effort.
 * @param interactionMode - "text" for terminal output, "voice" for speech-optimized
 * @param reasoningEffort - Optional reasoning effort level for models that support it
 */
async function createDaemonAgent(
	interactionMode: InteractionMode = "text",
	reasoningEffort?: ReasoningEffort
) {
	const modelConfig = buildOpenRouterChatSettings(
		reasoningEffort ? { reasoning: { effort: reasoningEffort } } : undefined
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
		}),
		tools,
		stopWhen: stepCountIs(MAX_AGENT_STEPS),
		prepareStep: async ({ messages }) => ({
			messages: sanitizeMessagesForInput(messages),
		}),
	});
}

/**
 * Transcribe audio using GPT-4o transcribe model via AI SDK.
 * @param audioBuffer - WAV audio buffer to transcribe
 * @param abortSignal - Optional abort signal to cancel the request
 * @returns Transcription result with text
 */
export async function transcribeAudio(
	audioBuffer: Buffer,
	abortSignal?: AbortSignal
): Promise<TranscriptionResult> {
	try {
		const result = await transcribe({
			model: openai.transcription(TRANSCRIPTION_MODEL),
			audio: audioBuffer,
			abortSignal,
		});

		return {
			text: result.text,
		};
	} catch (error) {
		// Check if this was an abort
		if (error instanceof Error && error.name === "AbortError") {
			throw error; // Re-throw abort errors as-is
		}
		const err = error instanceof Error ? error : new Error(String(error));
		throw new Error(`Transcription failed: ${err.message}`);
	}
}

/**
 * Generate a streaming response from DAEMON using the Agent class.
 * The agent handles the tool loop internally.
 *
 * @param userMessage - The transcribed user message
 * @param callbacks - Callbacks for streaming tokens, tool calls, and completion
 * @param conversationHistory - Previous AI SDK messages for context
 * @param interactionMode - "text" for terminal output, "voice" for speech-optimized
 * @param abortSignal - Optional abort signal to cancel the request
 * @param reasoningEffort - Optional reasoning effort level for models that support it
 */
export async function generateResponse(
	userMessage: string,
	callbacks: StreamCallbacks,
	conversationHistory: ModelMessage[] = [],
	interactionMode: InteractionMode = "text",
	abortSignal?: AbortSignal,
	reasoningEffort?: ReasoningEffort
): Promise<void> {
	// Set up subagent progress emitter to forward events to callbacks
	setSubagentProgressEmitter({
		onSubagentToolCall: (toolCallId: string, toolName: string, input?: unknown) => {
			callbacks.onSubagentToolCall?.(toolCallId, toolName, input);
		},
		onSubagentUsage: (usage) => {
			callbacks.onSubagentUsage?.(usage);
		},
		onSubagentToolResult: (toolCallId: string, toolName: string, success: boolean) => {
			callbacks.onSubagentToolResult?.(toolCallId, toolName, success);
		},
		onSubagentComplete: (toolCallId: string, success: boolean) => {
			callbacks.onSubagentComplete?.(toolCallId, success);
		},
	});

	try {
		// Build messages array with history and new user message
		const messages: ModelMessage[] = [
			...conversationHistory,
			{ role: "user" as const, content: userMessage },
		];

		// Stream response from the agent with mode-specific system prompt
		const agent = await createDaemonAgent(interactionMode, reasoningEffort);

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
					return;
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
					return;
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
					toolDebug.error("tool-error", {
						toolName: part.toolName,
						toolCallId: part.toolCallId,
						input: part.input,
						error: part.error,
					});
					callbacks.onToolResult?.(part.toolName, { error: part.error, input: part.input }, part.toolCallId);
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

						// reportedCost may be undefined when provider doesn't supply it

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
				return;
			}

			const rawResponseMessages = await stream.response.then((r) => r.messages);
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
			return;
		}

		const finalText = extractFinalAssistantText(allResponseMessages);

		if (!fullText && allResponseMessages.length === 0) {
			callbacks.onError?.(new Error("Model returned empty response. Check API key and model availability."));
			return;
		}

		callbacks.onComplete?.(fullText, allResponseMessages, undefined, finalText);
	} catch (error) {
		// Check if this was an abort - don't treat as error
		if (abortSignal?.aborted) {
			return;
		}
		if (error instanceof Error && error.name === "AbortError") {
			return;
		}
		const err = error instanceof Error ? error : new Error(String(error));
		let errorMessage = err.message;
		callbacks.onError?.(new Error(errorMessage));
	} finally {
		// Clean up the subagent progress emitter
		setSubagentProgressEmitter(null);
	}
}

/**
 * Generate a short descriptive title for a session based on the first user message.
 * Uses the currently selected model.
 * @param firstMessage - The first user message in the session
 * @returns A short title (3-6 words) describing the session topic
 */
export async function generateSessionTitle(firstMessage: string): Promise<string> {
	try {
		const result = await generateText({
			model: openrouter.chat(getResponseModel(), buildOpenRouterChatSettings()),
			system: `You are a title generator. Generate a very short, descriptive title (3-6 words) for a conversation based on the user's first message. The title should capture the main topic or intent. Do not use quotes, punctuation, or prefixes like "Title:". Just output the title text directly.`,
			messages: [
				{
					role: "user",
					content: `Generate a short descriptive title for the following message <message>${firstMessage}</message>`,
				},
			],
		});
		return result.text.trim() || "New Session";
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		debug.error("session-title-generation-failed", { message: err.message });
		return "New Session";
	}
}

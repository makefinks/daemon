/**
 * Event handler factories for daemon state manager events.
 * Extracted from use-daemon-events.ts for better maintainability.
 */

import { toast } from "@opentui-ui/toast/react";
import { getCurrentTodos } from "../ai/tools/todo-manager";
import type { DaemonAvatarRenderable } from "../avatar/DaemonAvatarRenderable";
import type { ToolCategory } from "../avatar/DaemonAvatarRenderable";
import { clearRuntimeContext, setRuntimeContext } from "../state/runtime-context";
import { saveSessionSnapshot } from "../state/session-store";
import type {
	ContentBlock,
	ConversationMessage,
	MemoryToastPreview,
	ModelMessage,
	SubagentStep,
	TokenUsage,
	ToolApprovalRequest,
	ToolCall,
	ToolResultOutput,
} from "../types";
import { DaemonState } from "../types";
import { REASONING_COLORS, STATE_COLORS } from "../types/theme";
import { REASONING_ANIMATION } from "../ui/constants";
import { debug, messageDebug } from "../utils/debug-logger";
import { hasVisibleText } from "../utils/formatters";
import {
	INTERRUPTED_TOOL_RESULT,
	buildInterruptedContentBlocks,
	buildInterruptedModelMessages,
	normalizeInterruptedToolBlockResult,
	normalizeInterruptedToolResultOutput,
} from "./daemon-event-handlers/interrupted-turn";

export { buildInterruptedModelMessages };

function getToolCategory(toolName: string): ToolCategory | "fast" | undefined {
	if (toolName === "subagent") return "subagent";
	if (toolName === "webSearch" || toolName === "fetchUrls" || toolName === "renderUrl") return "web";
	if (toolName === "runBash" || toolName === "getSystemInfo") return "bash";
	if (
		toolName === "readFile" ||
		toolName === "getFragmentCandidates" ||
		toolName === "todoManager" ||
		toolName === "groundingManager"
	)
		return "fast";
	return undefined;
}

function clearAvatarToolEffects(avatar: DaemonAvatarRenderable | null): void {
	if (!avatar) return;
	avatar.triggerToolComplete();
	avatar.setToolActive(false);
	avatar.setReasoningMode(false);
	avatar.setTypingMode(false);
}

function normalizeToolCallId(toolCallId: string | undefined): string | undefined {
	if (typeof toolCallId !== "string") return undefined;
	const trimmed = toolCallId.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function isInProgressToolCall(toolCall: ToolCall | undefined): boolean {
	const status = toolCall?.status;
	return status === "streaming" || status === "running" || status === "awaiting_approval";
}

function findExistingToolCall(
	refs: EventHandlerRefs,
	toolName: string,
	toolCallId: string | undefined
): ToolCall | undefined {
	if (toolCallId) {
		return refs.toolCallsByIdRef.current.get(toolCallId);
	}

	return [...refs.toolCallsRef.current]
		.reverse()
		.find((call) => call.name === toolName && isInProgressToolCall(call));
}

export function createMemorySavedHandler() {
	return (preview: MemoryToastPreview) => {
		const description = preview.description?.trim();
		if (!description) return;
		toast.success(`Memory saved (${preview.operation})`, { description });
	};
}

function finalizePendingUserMessage(
	prev: ConversationMessage[],
	userText: string,
	daemonMessage: ConversationMessage | null,
	nextMessageId: () => number
): ConversationMessage[] {
	let pendingIndex = -1;
	for (let i = prev.length - 1; i >= 0; i--) {
		const msg = prev[i];
		if (msg?.type === "user" && msg.pending) {
			pendingIndex = i;
			break;
		}
	}

	const next = [...prev];
	if (pendingIndex >= 0) {
		const pendingMessage = next[pendingIndex];
		if (pendingMessage) {
			next[pendingIndex] = { ...pendingMessage, pending: false };
		} else {
			next.push({
				id: nextMessageId(),
				type: "user",
				content: userText,
				messages: [{ role: "user", content: userText }],
			});
		}
	} else {
		next.push({
			id: nextMessageId(),
			type: "user",
			content: userText,
			messages: [{ role: "user", content: userText }],
		});
	}

	if (daemonMessage) {
		next.push(daemonMessage);
	}

	return next;
}

/**
 * Shared refs and state for event handlers.
 */
export interface EventHandlerRefs {
	avatarRef: React.RefObject<DaemonAvatarRenderable | null>;
	hasStartedSpeakingRef: React.MutableRefObject<boolean>;
	streamPhaseRef: React.MutableRefObject<"reasoning" | "text" | null>;
	messageIdRef: React.MutableRefObject<number>;
	currentUserInputRef: React.MutableRefObject<string>;
	toolCallsRef: React.MutableRefObject<ToolCall[]>;
	toolCallsByIdRef: React.MutableRefObject<Map<string, ToolCall>>;
	contentBlocksRef: React.MutableRefObject<ContentBlock[]>;
	reasoningStartAtRef: React.MutableRefObject<number | null>;
	reasoningDurationMsRef: React.MutableRefObject<number | null>;
	currentReasoningBlockRef: React.MutableRefObject<ContentBlock | null>;
	sessionUsageRef: React.MutableRefObject<TokenUsage>;
	fullReasoningRef: React.RefObject<string>;
}

/**
 * State setters for event handlers.
 */
export interface EventHandlerSetters {
	setDaemonState: (state: DaemonState) => void;
	setCurrentTranscription: (text: string) => void;
	setCurrentResponse: React.Dispatch<React.SetStateAction<string>>;
	setCurrentContentBlocks: React.Dispatch<React.SetStateAction<ContentBlock[]>>;
	setConversationHistory: React.Dispatch<React.SetStateAction<ConversationMessage[]>>;
	setSessionUsage: React.Dispatch<React.SetStateAction<TokenUsage>>;
	setError: (error: string) => void;
	setReasoningQueue: (queue: string | ((prev: string) => string)) => void;
	setFullReasoning: (full: string | ((prev: string) => string)) => void;
}

/**
 * Callbacks and dependencies for event handlers.
 */
export interface EventHandlerDeps {
	applyAvatarForState: (state: DaemonState) => void;
	clearReasoningState: () => void;
	clearReasoningTicker: () => void;
	finalizeReasoningDuration: (endAt: number) => void;
	sessionId: string | null;
	sessionIdRef: React.RefObject<string | null>;
	ensureSessionId: () => Promise<string>;
	onFirstMessage?: (sessionId: string, message: string) => void;
	addToHistory: (input: string) => void;
	syncModelHistory: (history: ConversationMessage[]) => void;
}

/**
 * Create handler for state change events.
 */
export function createStateChangeHandler(
	refs: EventHandlerRefs,
	setters: EventHandlerSetters,
	deps: EventHandlerDeps
) {
	return (state: DaemonState) => {
		setters.setDaemonState(state);

		if (state === DaemonState.IDLE) {
			refs.hasStartedSpeakingRef.current = false;
			refs.streamPhaseRef.current = null;
			refs.reasoningStartAtRef.current = null;
			refs.reasoningDurationMsRef.current = null;
			refs.currentReasoningBlockRef.current = null;
			clearRuntimeContext();
		} else if (state === DaemonState.RESPONDING) {
			refs.hasStartedSpeakingRef.current = false;
			refs.streamPhaseRef.current = "reasoning";
			refs.reasoningStartAtRef.current = null;
			refs.reasoningDurationMsRef.current = null;
			refs.currentReasoningBlockRef.current = null;
			deps.clearReasoningState();
			setters.setCurrentResponse("");
			setters.setCurrentContentBlocks([]);
			refs.toolCallsRef.current = [];
			refs.toolCallsByIdRef.current.clear();
			refs.contentBlocksRef.current = [];
			setRuntimeContext(deps.sessionIdRef.current, refs.messageIdRef.current);
		}

		deps.applyAvatarForState(state);
	};
}

/**
 * Create handler for mic level events.
 */
export function createMicLevelHandler(refs: EventHandlerRefs, managerState: () => DaemonState) {
	return (level: number) => {
		const avatar = refs.avatarRef.current;
		if (!avatar) return;
		if (managerState() !== DaemonState.LISTENING) return;

		const boosted = Math.min(1, level * 1.2);
		avatar.setAudioLevel(boosted);
	};
}

/**
 * Create handler for TTS level events.
 */
export function createTtsLevelHandler(refs: EventHandlerRefs, managerState: () => DaemonState) {
	return (level: number) => {
		const avatar = refs.avatarRef.current;
		if (!avatar) return;
		if (managerState() !== DaemonState.SPEAKING) return;
		avatar.setAudioLevel(level);
	};
}

/**
 * Create handler for transcription events.
 */
export function createTranscriptionHandler(refs: EventHandlerRefs, setters: EventHandlerSetters) {
	return (text: string) => {
		setters.setCurrentTranscription(text);
		refs.currentUserInputRef.current = text;
	};
}

/**
 * Create handler for user message events.
 */
export function createUserMessageHandler(
	refs: EventHandlerRefs,
	setters: EventHandlerSetters,
	deps: EventHandlerDeps
) {
	return (text: string) => {
		if (!text.trim()) return;

		deps.addToHistory(text);

		if (!deps.sessionId) {
			void deps.ensureSessionId();
		}

		const userMessage: ConversationMessage = {
			id: refs.messageIdRef.current++,
			type: "user",
			content: text,
			messages: [{ role: "user", content: text }],
			pending: true,
		};
		refs.currentUserInputRef.current = text;
		setters.setCurrentTranscription("");

		setters.setConversationHistory((prev: ConversationMessage[]) => {
			const isFirstMessage = prev.length === 0;
			const next = [...prev, userMessage];
			void (async () => {
				const targetSessionId = deps.sessionId ?? (await deps.ensureSessionId());
				await saveSessionSnapshot(
					{
						conversationHistory: next,
						sessionUsage: refs.sessionUsageRef.current,
					},
					targetSessionId
				);
				if (isFirstMessage && deps.onFirstMessage) {
					deps.onFirstMessage(targetSessionId, text);
				}
			})();
			return next;
		});
	};
}

/**
 * Create handler for reasoning token events.
 */
export function createReasoningTokenHandler(refs: EventHandlerRefs, setters: EventHandlerSetters) {
	return (token: string) => {
		refs.streamPhaseRef.current = "reasoning";
		const cleanToken = token.replace(/\n/g, " ");
		if (refs.reasoningStartAtRef.current === null) {
			refs.reasoningStartAtRef.current = Date.now();
		}
		setters.setReasoningQueue((prev: string) => prev + cleanToken);
		setters.setFullReasoning((prev: string) => prev + token);
		refs.fullReasoningRef.current = refs.fullReasoningRef.current + token;

		const blocks = refs.contentBlocksRef.current;
		const lastBlock = blocks[blocks.length - 1];
		if (lastBlock && lastBlock.type === "reasoning") {
			lastBlock.content += token;
			refs.currentReasoningBlockRef.current = lastBlock;
		} else {
			const newBlock: ContentBlock = { type: "reasoning", content: token };
			blocks.push(newBlock);
			refs.currentReasoningBlockRef.current = newBlock;
		}
		setters.setCurrentContentBlocks([...blocks]);

		// If the model emits additional reasoning mid-stream (after some text),
		// shift the avatar back into the low-intensity reasoning phase.
		if (refs.avatarRef.current) {
			refs.avatarRef.current.setColors(REASONING_COLORS);
			refs.avatarRef.current.setIntensity(REASONING_ANIMATION.INTENSITY);
			refs.avatarRef.current.setReasoningMode(true);
		}
	};
}

/**
 * Create handler for response token events.
 */
export function createTokenHandler(
	refs: EventHandlerRefs,
	setters: EventHandlerSetters,
	deps: EventHandlerDeps
) {
	return (token: string) => {
		if (!token) return;

		// Some models/providers emit standalone whitespace/newline "text-delta" tokens
		// between reasoning/tool events. If we turn those into their own text blocks,
		// the UI renders them as empty vertical gaps. Only keep whitespace tokens once
		// we have visible text in the current text block.
		const isWhitespaceOnly = token.trim().length === 0;
		const blocks = refs.contentBlocksRef.current;
		const lastBlock = blocks[blocks.length - 1];
		if (isWhitespaceOnly) {
			if (lastBlock?.type !== "text") return;
			if (!hasVisibleText(lastBlock.content)) return;
		} else {
			refs.streamPhaseRef.current = "text";
		}

		// Any time we transition from reasoning back to text output, finalize the
		// reasoning duration and clear the ticker (even if this isn't the first token).
		// Some providers interleave whitespace-only text tokens (e.g. "\n")
		// while still emitting reasoning deltas. Those tokens should not be treated as
		// a "back to speaking" transition for avatar state or reasoning timing.
		if (!isWhitespaceOnly && refs.reasoningStartAtRef.current !== null) {
			deps.finalizeReasoningDuration(Date.now());
			deps.clearReasoningTicker();
		}

		// Only treat "started speaking" as true once visible text arrives. This keeps
		// the avatar in the reasoning phase if the model emits leading newlines.
		if (!refs.hasStartedSpeakingRef.current && !isWhitespaceOnly) {
			refs.hasStartedSpeakingRef.current = true;
		}

		setters.setCurrentResponse((prev: string) => prev + token);

		if (lastBlock && lastBlock.type === "text") {
			lastBlock.content += token;
		} else {
			blocks.push({ type: "text", content: token });
		}
		setters.setCurrentContentBlocks([...blocks]);

		// Only switch the avatar into high-intensity speaking mode when we receive
		// visible text. Whitespace-only tokens should not override a reasoning phase.
		if (refs.avatarRef.current && !isWhitespaceOnly) {
			refs.avatarRef.current.setColors(STATE_COLORS[DaemonState.RESPONDING]);
			refs.avatarRef.current.setIntensity(0.7);
			refs.avatarRef.current.setReasoningMode(false);
		}
	};
}

/**
 * Create handler for tool input start events (streaming tool call detected).
 */
export function createToolInputStartHandler(
	refs: EventHandlerRefs,
	setters: EventHandlerSetters,
	deps: EventHandlerDeps
) {
	return (toolName: string, toolCallId: string) => {
		refs.streamPhaseRef.current = "reasoning";
		if (refs.avatarRef.current) {
			refs.avatarRef.current.setColors(REASONING_COLORS);
			refs.avatarRef.current.setIntensity(REASONING_ANIMATION.INTENSITY);
			refs.avatarRef.current.setReasoningMode(true);
		}

		deps.finalizeReasoningDuration(Date.now());
		deps.clearReasoningTicker();

		const blocks = refs.contentBlocksRef.current;
		const lastBlock = blocks[blocks.length - 1];
		if (lastBlock?.type === "text" && !hasVisibleText(lastBlock.content)) {
			blocks.pop();
		}

		const normalizedToolCallId = normalizeToolCallId(toolCallId);
		const existingToolCall = findExistingToolCall(refs, toolName, normalizedToolCallId);
		if (existingToolCall) {
			if (existingToolCall.status === undefined || existingToolCall.status === "streaming") {
				existingToolCall.status = "streaming";
			}
			setters.setCurrentContentBlocks([...blocks]);
			return;
		}

		const toolCall: ToolCall = {
			name: toolName,
			input: undefined,
			toolCallId: normalizedToolCallId,
			status: "streaming",
			subagentSteps: toolName === "subagent" ? [] : undefined,
		};
		refs.toolCallsRef.current.push(toolCall);
		if (normalizedToolCallId) {
			refs.toolCallsByIdRef.current.set(normalizedToolCallId, toolCall);
		}

		blocks.push({ type: "tool", call: toolCall });
		setters.setCurrentContentBlocks([...blocks]);
	};
}

/**
 * Create handler for tool invocation events.
 */
export function createToolInvocationHandler(
	refs: EventHandlerRefs,
	setters: EventHandlerSetters,
	deps: EventHandlerDeps
) {
	return (toolName: string, input: unknown, toolCallId?: string) => {
		refs.streamPhaseRef.current = "reasoning";
		if (refs.avatarRef.current) {
			refs.avatarRef.current.setColors(REASONING_COLORS);
			refs.avatarRef.current.setIntensity(REASONING_ANIMATION.INTENSITY);
			refs.avatarRef.current.setReasoningMode(true);
		}

		deps.finalizeReasoningDuration(Date.now());
		deps.clearReasoningTicker();

		const blocks = refs.contentBlocksRef.current;

		const normalizedToolCallId = normalizeToolCallId(toolCallId);
		const existingToolCall = findExistingToolCall(refs, toolName, normalizedToolCallId);
		if (existingToolCall) {
			const shouldActivateToolAnimation =
				existingToolCall.status === undefined ||
				existingToolCall.status === "streaming" ||
				existingToolCall.status === "awaiting_approval";

			existingToolCall.input = input;
			if (shouldActivateToolAnimation) {
				existingToolCall.status = "running";
			}
			setters.setCurrentContentBlocks([...blocks]);

			if (shouldActivateToolAnimation) {
				const avatar = refs.avatarRef.current;
				if (avatar) {
					const category = getToolCategory(toolName);
					avatar.triggerToolFlash(category as ToolCategory | undefined);
					if (category !== "fast") {
						avatar.setToolActive(true, category as ToolCategory | undefined);
					}
				}
			}
			return;
		}

		const lastBlock = blocks[blocks.length - 1];
		if (lastBlock?.type === "text" && !hasVisibleText(lastBlock.content)) {
			blocks.pop();
		}

		const toolCall: ToolCall = {
			name: toolName,
			input,
			toolCallId: normalizedToolCallId,
			status: "running",
			subagentSteps: toolName === "subagent" ? [] : undefined,
		};
		refs.toolCallsRef.current.push(toolCall);

		if (normalizedToolCallId) {
			refs.toolCallsByIdRef.current.set(normalizedToolCallId, toolCall);
		}

		blocks.push({ type: "tool", call: toolCall });
		setters.setCurrentContentBlocks([...blocks]);

		const avatar = refs.avatarRef.current;
		if (avatar) {
			const category = getToolCategory(toolName);
			avatar.triggerToolFlash(category as ToolCategory | undefined);
			if (category !== "fast") {
				avatar.setToolActive(true, category as ToolCategory | undefined);
			}
		}
	};
}

/**
 * Create handler for tool approval request events.
 * Updates the tool call status to "awaiting_approval" when approval is needed.
 */
export function createToolApprovalRequestHandler(refs: EventHandlerRefs, setters: EventHandlerSetters) {
	return (request: ToolApprovalRequest) => {
		const toolCall = refs.toolCallsByIdRef.current.get(request.toolCallId);
		if (toolCall) {
			toolCall.status = "awaiting_approval";
			setters.setCurrentContentBlocks([...refs.contentBlocksRef.current]);
		}
	};
}

/**
 * Create handler for tool approval resolved events.
 * Updates the tool call's approvalResult when user approves/denies.
 */
export function createToolApprovalResolvedHandler(refs: EventHandlerRefs, setters: EventHandlerSetters) {
	return (toolCallId: string, approved: boolean) => {
		const toolCall = refs.toolCallsByIdRef.current.get(toolCallId);
		if (toolCall) {
			toolCall.approvalResult = approved ? "approved" : "denied";
			setters.setCurrentContentBlocks([...refs.contentBlocksRef.current]);
		}
	};
}

/**
 * Create handler for subagent tool call events.
 */
export function createSubagentToolCallHandler(refs: EventHandlerRefs, setters: EventHandlerSetters) {
	return (toolCallId: string, toolName: string, input?: unknown) => {
		const toolCall = refs.toolCallsByIdRef.current.get(toolCallId);
		if (!toolCall || !toolCall.subagentSteps) return;

		const step: SubagentStep = {
			toolName,
			status: "running",
			input,
		};
		toolCall.subagentSteps = [...toolCall.subagentSteps, step];
		setters.setCurrentContentBlocks([...refs.contentBlocksRef.current]);
	};
}

/**
 * Create handler for subagent tool result events.
 */
export function createSubagentToolResultHandler(refs: EventHandlerRefs, setters: EventHandlerSetters) {
	return (toolCallId: string, toolName: string, success: boolean) => {
		const toolCall = refs.toolCallsByIdRef.current.get(toolCallId);
		if (!toolCall || !toolCall.subagentSteps) return;

		let updated = false;
		const nextSteps: SubagentStep[] = toolCall.subagentSteps.map((step) => {
			if (!updated && step.toolName === toolName && step.status === "running") {
				updated = true;
				return {
					...step,
					status: (success ? "completed" : "failed") as SubagentStep["status"],
				};
			}
			return step;
		});
		toolCall.subagentSteps = nextSteps;
		setters.setCurrentContentBlocks([...refs.contentBlocksRef.current]);
	};
}

/**
 * Create handler for subagent complete events.
 */
export function createSubagentCompleteHandler(refs: EventHandlerRefs, setters: EventHandlerSetters) {
	return (toolCallId: string, success: boolean) => {
		const toolCall = refs.toolCallsByIdRef.current.get(toolCallId);
		if (!toolCall) return;
		toolCall.status = success ? "completed" : "failed";
		setters.setCurrentContentBlocks([...refs.contentBlocksRef.current]);
	};
}

function mergeTokenUsage(prev: TokenUsage, usage: TokenUsage, isSubagent: boolean): TokenUsage {
	const currentCost =
		prev.cost !== undefined || usage.cost !== undefined ? (prev.cost ?? 0) + (usage.cost ?? 0) : undefined;

	if (isSubagent) {
		return {
			...prev,
			cost: currentCost,
			subagentTotalTokens: (prev.subagentTotalTokens ?? 0) + usage.totalTokens,
			subagentPromptTokens: (prev.subagentPromptTokens ?? 0) + usage.promptTokens,
			subagentCompletionTokens: (prev.subagentCompletionTokens ?? 0) + usage.completionTokens,
		};
	}

	return {
		cost: currentCost,
		promptTokens: prev.promptTokens + usage.promptTokens,
		completionTokens: prev.completionTokens + usage.completionTokens,
		totalTokens: prev.totalTokens + usage.totalTokens,
		reasoningTokens: (prev.reasoningTokens ?? 0) + (usage.reasoningTokens ?? 0) || undefined,
		cachedInputTokens: (prev.cachedInputTokens ?? 0) + (usage.cachedInputTokens ?? 0) || undefined,
		subagentTotalTokens: prev.subagentTotalTokens,
		subagentPromptTokens: prev.subagentPromptTokens,
		subagentCompletionTokens: prev.subagentCompletionTokens,
		latestTurnPromptTokens: usage.promptTokens,
		latestTurnCompletionTokens: usage.completionTokens,
	};
}

/**
 * Create handler for step usage events.
 */
export function createStepUsageHandler(setters: EventHandlerSetters) {
	return (usage: TokenUsage) => {
		setters.setSessionUsage((prev: TokenUsage) => mergeTokenUsage(prev, usage, false));
	};
}

/**
 * Create handler for subagent usage events.
 */
export function createSubagentUsageHandler(setters: EventHandlerSetters) {
	return (usage: TokenUsage) => {
		setters.setSessionUsage((prev: TokenUsage) => mergeTokenUsage(prev, usage, true));
	};
}

/**
 * Create handler for tool result events.
 */
export function createToolResultHandler(refs: EventHandlerRefs, setters: EventHandlerSetters) {
	return (toolName: string, result: unknown, toolCallId?: string) => {
		const errorMessage =
			typeof result === "object" &&
			result !== null &&
			"error" in result &&
			typeof (result as { error?: unknown }).error === "string"
				? ((result as { error?: string }).error ?? "").trim()
				: undefined;
		const isErrorResult = errorMessage !== undefined && errorMessage.length > 0;

		// Mark the tool as completed or failed based on the payload.
		const toolCall =
			(toolCallId ? refs.toolCallsByIdRef.current.get(toolCallId) : undefined) ??
			[...refs.toolCallsRef.current].reverse().find((t) => t.name === toolName && t.status === "running");
		if (toolCall) {
			toolCall.status = isErrorResult ? "failed" : "completed";
			if (isErrorResult) {
				toolCall.error = errorMessage;
			}
			const blocks = refs.contentBlocksRef.current;
			const toolBlock = [...blocks].reverse().find((b) => b.type === "tool" && b.call === toolCall);
			if (toolBlock && toolBlock.type === "tool") {
				toolBlock.result = result;
			}
		}

		if (toolName === "todoManager" && toolCallId) {
			const todoToolCall = refs.toolCallsByIdRef.current.get(toolCallId);
			if (todoToolCall) {
				const currentTodos = getCurrentTodos();
				todoToolCall.todoSnapshot = currentTodos.map((t) => ({
					content: t.content,
					status: t.status,
				}));
			}
		}

		setters.setCurrentContentBlocks([...refs.contentBlocksRef.current]);

		const avatar = refs.avatarRef.current;
		if (avatar) {
			const category = getToolCategory(toolName);
			if (category !== "fast") {
				avatar.triggerToolComplete();
				avatar.setToolActive(false);
			}
		}
	};
}

/**
 * Create handler for response complete events.
 */
export function createCompleteHandler(
	refs: EventHandlerRefs,
	setters: EventHandlerSetters,
	deps: EventHandlerDeps
) {
	return (fullText: string, responseMessages: ModelMessage[], _usage: TokenUsage | undefined) => {
		refs.hasStartedSpeakingRef.current = false;
		deps.finalizeReasoningDuration(Date.now());
		clearAvatarToolEffects(refs.avatarRef.current);

		const userText = refs.currentUserInputRef.current;
		const contentBlocks =
			refs.contentBlocksRef.current.length > 0 ? [...refs.contentBlocksRef.current] : undefined;
		if (userText) {
			const daemonMessage: ConversationMessage = {
				id: refs.messageIdRef.current++,
				type: "daemon",
				content: fullText,
				messages: responseMessages,
				contentBlocks,
			};

			setters.setConversationHistory((prev: ConversationMessage[]) => {
				const next = finalizePendingUserMessage(
					prev,
					userText,
					daemonMessage,
					() => refs.messageIdRef.current++
				);

				void (async () => {
					const targetSessionId = deps.sessionId ?? (await deps.ensureSessionId());
					await saveSessionSnapshot(
						{
							conversationHistory: next,
							sessionUsage: refs.sessionUsageRef.current,
						},
						targetSessionId
					);
				})();

				return next;
			});
		}

		setters.setCurrentTranscription("");
		deps.clearReasoningState();
		setters.setCurrentResponse("");
		setters.setCurrentContentBlocks([]);
		refs.toolCallsRef.current = [];
		refs.toolCallsByIdRef.current.clear();
		refs.contentBlocksRef.current = [];
		refs.currentUserInputRef.current = "";
	};
}

/**
 * Create handler for cancelled events.
 */
export function createCancelledHandler(
	refs: EventHandlerRefs,
	setters: EventHandlerSetters,
	deps: EventHandlerDeps
) {
	return () => {
		refs.hasStartedSpeakingRef.current = false;
		deps.finalizeReasoningDuration(Date.now());
		clearAvatarToolEffects(refs.avatarRef.current);

		const userText = refs.currentUserInputRef.current;
		const hasBlocks = refs.contentBlocksRef.current.length > 0;
		const contentBlocks = hasBlocks ? buildInterruptedContentBlocks(refs.contentBlocksRef.current) : [];

		messageDebug.info("agent-turn-incomplete", {
			userText,
			contentBlocks,
		});

		if (userText) {
			const responseMessages = hasBlocks ? buildInterruptedModelMessages(contentBlocks) : [];
			const daemonMessage: ConversationMessage | null = hasBlocks
				? {
						id: refs.messageIdRef.current++,
						type: "daemon",
						content: "",
						messages: responseMessages,
						contentBlocks,
					}
				: null;

			messageDebug.info("agent-turn-incomplete-messages", {
				responseMessages,
			});

			setters.setConversationHistory((prev: ConversationMessage[]) => {
				const next = finalizePendingUserMessage(
					prev,
					userText,
					daemonMessage,
					() => refs.messageIdRef.current++
				);

				void (async () => {
					const targetSessionId = deps.sessionId ?? (await deps.ensureSessionId());
					await saveSessionSnapshot(
						{
							conversationHistory: next,
							sessionUsage: refs.sessionUsageRef.current,
						},
						targetSessionId
					);
				})();

				deps.syncModelHistory(next);

				return next;
			});
		}

		setters.setCurrentTranscription("");
		deps.clearReasoningState();
		setters.setCurrentResponse("");
		setters.setCurrentContentBlocks([]);
		refs.toolCallsRef.current = [];
		refs.toolCallsByIdRef.current.clear();
		refs.contentBlocksRef.current = [];
		refs.currentUserInputRef.current = "";
	};
}

/**
 * Create handler for error events.
 */
export function createErrorHandler(setters: EventHandlerSetters) {
	return (err: Error) => {
		setters.setError(err.message);
		setTimeout(() => setters.setError(""), 5000);
	};
}

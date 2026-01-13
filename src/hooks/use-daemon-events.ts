/**
 * Hook for subscribing to DaemonStateManager events and managing UI state.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clearFetchCache } from "../ai/exa-fetch-cache";
import { DaemonAvatarRenderable } from "../avatar/DaemonAvatarRenderable";
import { daemonEvents } from "../state/daemon-events";
import { getDaemonManager } from "../state/daemon-state";
import { buildModelHistoryFromConversation } from "../state/session-store";
import { DaemonState } from "../types";
import type { ContentBlock, ConversationMessage, TokenUsage, ToolCall } from "../types";
import { REASONING_COLORS, STATE_COLORS } from "../types/theme";
import { REASONING_ANIMATION } from "../ui/constants";
import { type ModelMetadata, getModelMetadata } from "../utils/model-metadata";
import {
	type EventHandlerDeps,
	type EventHandlerRefs,
	type EventHandlerSetters,
	createCancelledHandler,
	createCompleteHandler,
	createErrorHandler,
	createMicLevelHandler,
	createReasoningTokenHandler,
	createStateChangeHandler,
	createStepUsageHandler,
	createSubagentCompleteHandler,
	createSubagentToolCallHandler,
	createSubagentToolResultHandler,
	createSubagentUsageHandler,
	createTokenHandler,
	createToolApprovalRequestHandler,
	createToolApprovalResolvedHandler,
	createToolInputStartHandler,
	createToolInvocationHandler,
	createToolResultHandler,
	createTranscriptionHandler,
	createTtsLevelHandler,
	createUserMessageHandler,
} from "./daemon-event-handlers";

export interface UseDaemonEventsParams {
	currentModelId: string;
	preferencesLoaded: boolean;
	setReasoningQueue: (queue: string | ((prev: string) => string)) => void;
	setFullReasoning: (full: string | ((prev: string) => string)) => void;
	clearReasoningState: () => void;
	clearReasoningTicker: () => void;
	fullReasoningRef: React.RefObject<string>;
	sessionId: string | null;
	sessionIdRef: React.RefObject<string | null>;
	ensureSessionId: () => Promise<string>;
	addToHistory: (input: string) => void;
	onFirstMessage?: (sessionId: string, message: string) => void;
}

export interface UseDaemonEventsReturn {
	daemonState: DaemonState;
	conversationHistory: ConversationMessage[];
	currentTranscription: string;
	currentResponse: string;
	currentContentBlocks: ContentBlock[];
	error: string;
	sessionUsage: TokenUsage;
	modelMetadata: ModelMetadata | null;
	avatarRef: React.RefObject<DaemonAvatarRenderable | null>;
	hasStartedSpeakingRef: React.RefObject<boolean>;
	currentUserInputRef: React.RefObject<string>;
	setConversationHistory: React.Dispatch<React.SetStateAction<ConversationMessage[]>>;
	hydrateConversationHistory: (history: ConversationMessage[]) => void;
	setCurrentTranscription: React.Dispatch<React.SetStateAction<string>>;
	setCurrentResponse: React.Dispatch<React.SetStateAction<string>>;
	clearCurrentContentBlocks: () => void;
	resetSessionUsage: () => void;
	setSessionUsage: React.Dispatch<React.SetStateAction<TokenUsage>>;
	applyAvatarForState: (state: DaemonState) => void;
}

export function useDaemonEvents(params: UseDaemonEventsParams): UseDaemonEventsReturn {
	const {
		currentModelId,
		preferencesLoaded,
		setReasoningQueue,
		setFullReasoning,
		clearReasoningState,
		clearReasoningTicker,
		fullReasoningRef,
		sessionId,
		sessionIdRef,
		ensureSessionId,
		addToHistory,
		onFirstMessage,
	} = params;

	const [daemonState, setDaemonState] = useState<DaemonState>(DaemonState.IDLE);
	const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([]);
	const [currentTranscription, setCurrentTranscription] = useState<string>("");
	const [currentResponse, setCurrentResponse] = useState<string>("");
	const [currentContentBlocks, setCurrentContentBlocks] = useState<ContentBlock[]>([]);
	const [error, setError] = useState<string>("");
	const initialSessionUsage: TokenUsage = {
		promptTokens: 0,
		completionTokens: 0,
		totalTokens: 0,
		subagentTotalTokens: 0,
		subagentPromptTokens: 0,
		subagentCompletionTokens: 0,
	};
	const [sessionUsage, setSessionUsage] = useState<TokenUsage>(initialSessionUsage);
	const sessionUsageRef = useRef<TokenUsage>(initialSessionUsage);
	const [modelMetadata, setModelMetadata] = useState<ModelMetadata | null>(null);

	const resetSessionUsage = useCallback(() => {
		setSessionUsage(initialSessionUsage);
	}, []);

	useEffect(() => {
		if (!preferencesLoaded) return;
		let cancelled = false;
		getModelMetadata(currentModelId).then((metadata) => {
			if (!cancelled) setModelMetadata(metadata);
		});
		return () => {
			cancelled = true;
		};
	}, [currentModelId, preferencesLoaded]);

	useEffect(() => {
		clearFetchCache();
	}, [sessionId]);

	const avatarRef = useRef<DaemonAvatarRenderable | null>(null);
	const hasStartedSpeakingRef = useRef(false);
	const streamPhaseRef = useRef<"reasoning" | "text" | null>(null);
	const messageIdRef = useRef(0);
	const currentUserInputRef = useRef<string>("");
	const toolCallsRef = useRef<ToolCall[]>([]);
	const toolCallsByIdRef = useRef<Map<string, ToolCall>>(new Map());
	const contentBlocksRef = useRef<ContentBlock[]>([]);
	const reasoningStartAtRef = useRef<number | null>(null);
	const reasoningDurationMsRef = useRef<number | null>(null);
	const currentReasoningBlockRef = useRef<ContentBlock | null>(null);

	useEffect(() => {
		sessionUsageRef.current = sessionUsage;
	}, [sessionUsage]);

	const clearCurrentContentBlocks = useCallback(() => {
		setCurrentContentBlocks([]);
		toolCallsRef.current = [];
		toolCallsByIdRef.current.clear();
		contentBlocksRef.current = [];
	}, []);

	const hydrateConversationHistory = useCallback((history: ConversationMessage[]) => {
		const sanitized = history.map((msg) => ({ ...msg, pending: false }));
		setConversationHistory(sanitized);
		const maxId = sanitized.reduce((max, msg) => Math.max(max, msg.id), -1);
		messageIdRef.current = maxId + 1;
	}, []);

	const manager = getDaemonManager();

	const applyAvatarForState = useCallback((state: DaemonState) => {
		const avatar = avatarRef.current;
		if (!avatar) return;

		// While RESPONDING, the avatar style is driven by the current stream phase.
		// Most models emit reasoning first and then text, but some providers can
		// interleave or resume reasoning mid-stream. In those cases, we should
		// switch back into the low-intensity reasoning style until visible text
		// resumes.
		if (state === DaemonState.RESPONDING && streamPhaseRef.current === "reasoning") {
			avatar.setColors(REASONING_COLORS);
			avatar.setIntensity(REASONING_ANIMATION.INTENSITY);
			avatar.setAudioLevel(0);
			avatar.setReasoningMode(true);
			avatar.setTypingMode(false);
			return;
		}

		// Fallback: if we're responding and haven't seen visible text yet, keep the
		// avatar in the reasoning phase even if the stream phase hasn't been set.
		if (state === DaemonState.RESPONDING && !hasStartedSpeakingRef.current) {
			avatar.setColors(REASONING_COLORS);
			avatar.setIntensity(REASONING_ANIMATION.INTENSITY);
			avatar.setAudioLevel(0);
			avatar.setReasoningMode(true);
			avatar.setTypingMode(false);
			return;
		}

		avatar.setReasoningMode(false);
		avatar.setTypingMode(state === DaemonState.TYPING);
		avatar.setColors(STATE_COLORS[state]);
		const intensity =
			state === DaemonState.RESPONDING
				? 0.7
				: state === DaemonState.SPEAKING
					? 0.3
					: state === DaemonState.TRANSCRIBING
						? 0.35
						: state === DaemonState.LISTENING
							? 0.2
							: state === DaemonState.TYPING
								? 0.2
								: 0;
		avatar.setIntensity(intensity);
		avatar.setAudioLevel(0);
		if (state !== DaemonState.RESPONDING) {
			avatar.setToolActive(false);
		}
	}, []);

	const finalizeReasoningDuration = useCallback(
		(endAt: number) => {
			const startAt = reasoningStartAtRef.current;
			if (startAt === null) return;
			const durationMs = Math.max(0, endAt - startAt);
			reasoningDurationMsRef.current = durationMs;

			const blocks = contentBlocksRef.current;
			let target = currentReasoningBlockRef.current;
			if (!target) {
				target =
					[...blocks].reverse().find((b) => b.type === "reasoning" && b.durationMs === undefined) ?? null;
			}
			if (target && target.type === "reasoning") {
				target.durationMs = durationMs;
				setCurrentContentBlocks([...blocks]);
			}
			reasoningStartAtRef.current = null;
			currentReasoningBlockRef.current = null;
		},
		[setCurrentContentBlocks]
	);

	// Build refs, setters, and deps objects for event handler factories
	const refs: EventHandlerRefs = useMemo(
		() => ({
			avatarRef,
			hasStartedSpeakingRef,
			streamPhaseRef,
			messageIdRef,
			currentUserInputRef,
			toolCallsRef,
			toolCallsByIdRef,
			contentBlocksRef,
			reasoningStartAtRef,
			reasoningDurationMsRef,
			currentReasoningBlockRef,
			sessionUsageRef,
			fullReasoningRef,
		}),
		[fullReasoningRef]
	);

	const setters: EventHandlerSetters = useMemo(
		() => ({
			setDaemonState,
			setCurrentTranscription,
			setCurrentResponse,
			setCurrentContentBlocks,
			setConversationHistory,
			setSessionUsage,
			setError,
			setReasoningQueue,
			setFullReasoning,
		}),
		[setReasoningQueue, setFullReasoning]
	);

	const deps: EventHandlerDeps = useMemo(
		() => ({
			applyAvatarForState,
			clearReasoningState,
			clearReasoningTicker,
			finalizeReasoningDuration,
			sessionId,
			sessionIdRef,
			ensureSessionId,
			addToHistory,
			onFirstMessage,
			syncModelHistory: (history: ConversationMessage[]) => {
				manager.setConversationHistory(buildModelHistoryFromConversation(history));
			},
		}),
		[
			applyAvatarForState,
			clearReasoningState,
			clearReasoningTicker,
			finalizeReasoningDuration,
			sessionId,
			sessionIdRef,
			ensureSessionId,
			addToHistory,
			onFirstMessage,
			manager,
		]
	);

	// Set up event listeners for daemon state changes
	useEffect(() => {
		const handleStateChange = createStateChangeHandler(refs, setters, deps);
		const handleMicLevel = createMicLevelHandler(refs, () => manager.state);
		const handleTtsLevel = createTtsLevelHandler(refs, () => manager.state);
		const handleTranscription = createTranscriptionHandler(refs, setters);
		const handleUserMessage = createUserMessageHandler(refs, setters, deps);
		const handleReasoningToken = createReasoningTokenHandler(refs, setters);
		const handleToken = createTokenHandler(refs, setters, deps);
		const handleToolInputStart = createToolInputStartHandler(refs, setters, deps);
		const handleToolInvocation = createToolInvocationHandler(refs, setters, deps);
		const handleToolApprovalRequest = createToolApprovalRequestHandler(refs, setters);
		const handleToolApprovalResolved = createToolApprovalResolvedHandler(refs, setters);
		const handleSubagentToolCall = createSubagentToolCallHandler(refs, setters);
		const handleSubagentToolResult = createSubagentToolResultHandler(refs, setters);
		const handleSubagentComplete = createSubagentCompleteHandler(refs, setters);
		const handleStepUsage = createStepUsageHandler(setters);
		const handleSubagentUsage = createSubagentUsageHandler(setters);
		const handleToolResult = createToolResultHandler(refs, setters);
		const handleComplete = createCompleteHandler(refs, setters, deps);
		const handleCancelled = createCancelledHandler(refs, setters, deps);
		const handleError = createErrorHandler(setters);

		daemonEvents.on("stateChange", handleStateChange);
		daemonEvents.on("micLevel", handleMicLevel);
		daemonEvents.on("ttsLevel", handleTtsLevel);
		daemonEvents.on("transcriptionUpdate", handleTranscription);
		daemonEvents.on("reasoningToken", handleReasoningToken);
		daemonEvents.on("toolInputStart", handleToolInputStart);
		daemonEvents.on("toolInvocation", handleToolInvocation);
		daemonEvents.on("toolApprovalRequest", handleToolApprovalRequest);
		daemonEvents.on("toolApprovalResolved", handleToolApprovalResolved);
		daemonEvents.on("toolResult", handleToolResult);
		daemonEvents.on("subagentToolCall", handleSubagentToolCall);
		daemonEvents.on("subagentUsage", handleSubagentUsage);
		daemonEvents.on("subagentToolResult", handleSubagentToolResult);
		daemonEvents.on("subagentComplete", handleSubagentComplete);
		daemonEvents.on("stepUsage", handleStepUsage);
		daemonEvents.on("responseToken", handleToken);
		daemonEvents.on("responseComplete", handleComplete);
		daemonEvents.on("cancelled", handleCancelled);
		daemonEvents.on("userMessage", handleUserMessage);
		daemonEvents.on("error", handleError);

		// Sync immediately in case the user triggered a state change before this effect attached listeners.
		const currentState = manager.state;
		setters.setDaemonState(currentState);
		deps.applyAvatarForState(currentState);

		return () => {
			daemonEvents.off("stateChange", handleStateChange);
			daemonEvents.off("micLevel", handleMicLevel);
			daemonEvents.off("ttsLevel", handleTtsLevel);
			daemonEvents.off("transcriptionUpdate", handleTranscription);
			daemonEvents.off("reasoningToken", handleReasoningToken);
			daemonEvents.off("toolInputStart", handleToolInputStart);
			daemonEvents.off("toolInvocation", handleToolInvocation);
			daemonEvents.off("toolApprovalRequest", handleToolApprovalRequest);
			daemonEvents.off("toolApprovalResolved", handleToolApprovalResolved);
			daemonEvents.off("toolResult", handleToolResult);
			daemonEvents.off("subagentToolCall", handleSubagentToolCall);
			daemonEvents.off("subagentUsage", handleSubagentUsage);
			daemonEvents.off("subagentToolResult", handleSubagentToolResult);
			daemonEvents.off("subagentComplete", handleSubagentComplete);
			daemonEvents.off("stepUsage", handleStepUsage);
			daemonEvents.off("responseToken", handleToken);
			daemonEvents.off("responseComplete", handleComplete);
			daemonEvents.off("cancelled", handleCancelled);
			daemonEvents.off("userMessage", handleUserMessage);
			daemonEvents.off("error", handleError);
		};
	}, [manager, refs, setters, deps]);

	return {
		daemonState,
		conversationHistory,
		currentTranscription,
		currentResponse,
		currentContentBlocks,
		error,
		sessionUsage,
		modelMetadata,
		avatarRef,
		hasStartedSpeakingRef,
		currentUserInputRef,
		setConversationHistory,
		hydrateConversationHistory,
		setCurrentTranscription,
		setCurrentResponse,
		clearCurrentContentBlocks,
		resetSessionUsage,
		setSessionUsage,
		applyAvatarForState,
	};
}

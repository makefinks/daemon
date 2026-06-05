import type { ScrollBoxRenderable } from "@opentui/core";
import { useCallback, useEffect, useRef } from "react";
import type { MutableRefObject } from "react";

import { useDaemonEvents } from "./use-daemon-events";
import { useInputHistory } from "./use-input-history";
import { useReasoningAnimation } from "./use-reasoning-animation";
import { useResponseTimer } from "./use-response-timer";
import { useTypingMode } from "./use-typing-mode";

import { daemonEvents } from "../state/daemon-events";
import { getDaemonManager } from "../state/daemon-state";
import type { LlmProvider } from "../types";

export interface DaemonRuntimeControllerResult {
	reasoning: ReturnType<typeof useReasoningAnimation>;

	daemonState: ReturnType<typeof useDaemonEvents>["daemonState"];
	conversationHistory: ReturnType<typeof useDaemonEvents>["conversationHistory"];
	currentTranscription: ReturnType<typeof useDaemonEvents>["currentTranscription"];
	currentResponse: ReturnType<typeof useDaemonEvents>["currentResponse"];
	currentContentBlocks: ReturnType<typeof useDaemonEvents>["currentContentBlocks"];
	error: ReturnType<typeof useDaemonEvents>["error"];
	sessionUsage: ReturnType<typeof useDaemonEvents>["sessionUsage"];
	modelMetadata: ReturnType<typeof useDaemonEvents>["modelMetadata"];
	avatarRef: ReturnType<typeof useDaemonEvents>["avatarRef"];
	currentUserInputRef: ReturnType<typeof useDaemonEvents>["currentUserInputRef"];
	hydrateConversationHistory: ReturnType<typeof useDaemonEvents>["hydrateConversationHistory"];
	setCurrentTranscription: ReturnType<typeof useDaemonEvents>["setCurrentTranscription"];
	setCurrentResponse: ReturnType<typeof useDaemonEvents>["setCurrentResponse"];
	clearCurrentContentBlocks: ReturnType<typeof useDaemonEvents>["clearCurrentContentBlocks"];
	resetSessionUsage: ReturnType<typeof useDaemonEvents>["resetSessionUsage"];
	setSessionUsage: ReturnType<typeof useDaemonEvents>["setSessionUsage"];
	applyAvatarForState: ReturnType<typeof useDaemonEvents>["applyAvatarForState"];

	typing: ReturnType<typeof useTypingMode>;

	responseElapsedMs: number;

	conversationScrollRef: MutableRefObject<ScrollBoxRenderable | null>;

	hasInteracted: boolean;
}

export function useDaemonRuntimeController({
	currentModelProvider,
	currentModelId,
	preferencesLoaded,
	openAiCodexAuthenticated,
	sessionId,
	sessionIdRef,
	ensureSessionId,
	onFirstMessage,
}: {
	currentModelProvider: LlmProvider;
	currentModelId: string;
	preferencesLoaded: boolean;
	openAiCodexAuthenticated: boolean;
	sessionId: string | null;
	sessionIdRef: MutableRefObject<string | null>;
	ensureSessionId: () => Promise<string>;
	onFirstMessage: (sessionId: string, message: string) => Promise<string | null>;
}): DaemonRuntimeControllerResult {
	const reasoning = useReasoningAnimation();
	const { addToHistory, navigateUp, navigateDown, resetNavigation } = useInputHistory();
	const manager = getDaemonManager();

	useEffect(() => {
		manager.setGetCurrentSessionId(() => sessionIdRef.current);
		return () => manager.setGetCurrentSessionId(null);
	}, [manager, sessionIdRef]);

	const {
		daemonState,
		conversationHistory,
		currentTranscription,
		currentResponse,
		currentContentBlocks,
		error,
		sessionUsage,
		modelMetadata,
		avatarRef,
		currentUserInputRef,
		hydrateConversationHistory,
		setCurrentTranscription,
		setCurrentResponse,
		clearCurrentContentBlocks,
		resetSessionUsage,
		setSessionUsage,
		applyAvatarForState,
	} = useDaemonEvents({
		currentModelProvider,
		currentModelId,
		preferencesLoaded,
		openAiCodexAuthenticated,
		setReasoningQueue: reasoning.setReasoningQueue,
		clearReasoningState: reasoning.clearReasoningState,
		clearReasoningTicker: reasoning.clearReasoningTicker,
		sessionId,
		sessionIdRef,
		ensureSessionId,
		addToHistory,
		onFirstMessage,
	});

	const typing = useTypingMode({
		daemonState,
		currentUserInputRef,
		setCurrentTranscription,
		onTypingActivity: useCallback(() => {
			avatarRef.current?.triggerTypingPulse();
		}, [avatarRef]),
		navigateUp,
		navigateDown,
		resetNavigation,
	});

	useEffect(() => {
		const handleTranscriptionReady = (text: string) => {
			typing.prefillTypingInput(text);
		};
		daemonEvents.on("transcriptionReady", handleTranscriptionReady);
		return () => {
			daemonEvents.off("transcriptionReady", handleTranscriptionReady);
		};
	}, [typing.prefillTypingInput]);

	const { responseElapsedMs } = useResponseTimer({ daemonState });

	const conversationScrollRef = useRef<ScrollBoxRenderable | null>(null);

	const hasInteracted =
		conversationHistory.length > 0 || currentTranscription.length > 0 || currentContentBlocks.length > 0;

	useEffect(() => {
		manager.setGetSessionViewVisible(() => hasInteracted);
		return () => manager.setGetSessionViewVisible(null);
	}, [manager, hasInteracted]);

	return {
		reasoning,
		daemonState,
		conversationHistory,
		currentTranscription,
		currentResponse,
		currentContentBlocks,
		error,
		sessionUsage,
		modelMetadata,
		avatarRef,
		currentUserInputRef,
		hydrateConversationHistory,
		setCurrentTranscription,
		setCurrentResponse,
		clearCurrentContentBlocks,
		resetSessionUsage,
		setSessionUsage,
		applyAvatarForState,
		typing,
		responseElapsedMs,
		conversationScrollRef,
		hasInteracted,
	};
}

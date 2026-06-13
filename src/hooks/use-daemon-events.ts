/**
 * Hook for subscribing to the selected session runtime and exposing UI state.
 */

import { toast } from "@opentui-ui/toast/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { clearFetchCache } from "../ai/exa-fetch-cache";
import { DaemonAvatarRenderable } from "../avatar/DaemonAvatarRenderable";
import { daemonEvents } from "../state/daemon-events";
import { getDaemonManager } from "../state/daemon-state";
import { sessionRuntimeStore } from "../state/session-runtime-store";
import { buildModelHistoryFromConversation } from "../state/session-store";
import { DaemonState } from "../types";
import type { ContentBlock, ConversationMessage, LlmProvider, TokenUsage } from "../types";
import { REASONING_COLORS, STATE_COLORS } from "../types/theme";
import { REASONING_ANIMATION } from "../ui/constants";
import { type ModelMetadata, getModelMetadataForProvider } from "../utils/model-metadata";

export interface UseDaemonEventsParams {
	currentModelProvider: LlmProvider;
	currentModelId: string;
	preferencesLoaded: boolean;
	openAiCodexAuthenticated: boolean;
	setReasoningQueue: (queue: string | ((prev: string) => string)) => void;
	clearReasoningState: () => void;
	clearReasoningTicker: () => void;
	sessionId: string | null;
	sessionIdRef: React.RefObject<string | null>;
	ensureSessionId: () => Promise<string>;
	onFirstMessage?: (sessionId: string, message: string) => Promise<string | null>;
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

const INITIAL_USAGE: TokenUsage = {
	promptTokens: 0,
	completionTokens: 0,
	totalTokens: 0,
	subagentTotalTokens: 0,
	subagentPromptTokens: 0,
	subagentCompletionTokens: 0,
};

export function useDaemonEvents(params: UseDaemonEventsParams): UseDaemonEventsReturn {
	const {
		currentModelProvider,
		currentModelId,
		preferencesLoaded,
		openAiCodexAuthenticated,
		clearReasoningState,
		sessionId,
		sessionIdRef,
		onFirstMessage,
	} = params;

	const manager = getDaemonManager();
	const avatarRef = useRef<DaemonAvatarRenderable | null>(null);
	const hasStartedSpeakingRef = useRef(false);
	const currentUserInputRef = useRef<string>("");
	const daemonStateRef = useRef<DaemonState>(DaemonState.IDLE);

	// Stable refs for reasoning callbacks to avoid effect re-registration
	const setReasoningQueueRef = useRef(params.setReasoningQueue);
	setReasoningQueueRef.current = params.setReasoningQueue;
	const clearReasoningTickerRef = useRef(params.clearReasoningTicker);
	clearReasoningTickerRef.current = params.clearReasoningTicker;
	const clearReasoningStateRef = useRef(clearReasoningState);
	clearReasoningStateRef.current = clearReasoningState;

	// Track whether reasoning tokens are currently flowing — set by
	// handleReasoningToken, cleared when a new non-reasoning block appears.
	const reasoningActiveRef = useRef(false);
	// Track count of non-reasoning blocks to detect when a new one is added.
	const lastNonReasoningCountRef = useRef(0);

	const [daemonState, setDaemonState] = useState<DaemonState>(DaemonState.IDLE);
	const [conversationHistory, setConversationHistoryState] = useState<ConversationMessage[]>([]);
	const [currentTranscription, setCurrentTranscriptionState] = useState("");
	const [currentResponse, setCurrentResponseState] = useState("");
	const [currentContentBlocks, setCurrentContentBlocksState] = useState<ContentBlock[]>([]);
	const [error, setErrorState] = useState("");
	const [sessionUsage, setSessionUsageState] = useState<TokenUsage>(INITIAL_USAGE);
	const [modelMetadata, setModelMetadata] = useState<ModelMetadata | null>(null);

	const applyRuntimeSnapshot = useCallback(
		(targetSessionId: string | null) => {
			if (!targetSessionId) {
				setDaemonState(DaemonState.IDLE);
				manager.syncVisibleState(DaemonState.IDLE);
				setConversationHistoryState([]);
				setCurrentTranscriptionState("");
				setCurrentResponseState("");
				setCurrentContentBlocksState([]);
				setSessionUsageState(INITIAL_USAGE);
				setErrorState("");
				currentUserInputRef.current = "";
				return;
			}

			const snapshot = sessionRuntimeStore.getSnapshot(targetSessionId);
			if (!snapshot) {
				setDaemonState(DaemonState.IDLE);
				manager.syncVisibleState(DaemonState.IDLE);
				setConversationHistoryState([]);
				setCurrentTranscriptionState("");
				setCurrentResponseState("");
				setCurrentContentBlocksState([]);
				setSessionUsageState(INITIAL_USAGE);
				setErrorState("");
				currentUserInputRef.current = "";
				return;
			}

			setDaemonState(snapshot.state);
			manager.syncVisibleState(snapshot.state);
			setConversationHistoryState(snapshot.conversationHistory);
			setCurrentTranscriptionState(snapshot.currentTranscription);
			setCurrentResponseState(snapshot.currentResponse);
			setCurrentContentBlocksState(snapshot.currentContentBlocks);
			setSessionUsageState(snapshot.sessionUsage);
			setErrorState(snapshot.error);
			currentUserInputRef.current = snapshot.currentUserInput;
		},
		[manager]
	);

	useEffect(() => {
		manager.setOnFirstMessage(onFirstMessage ?? null);
		return () => manager.setOnFirstMessage(null);
	}, [manager, onFirstMessage]);

	useEffect(() => {
		applyRuntimeSnapshot(sessionId);
	}, [applyRuntimeSnapshot, sessionId]);

	useEffect(() => {
		const handleRuntimeUpdate = (updatedSessionId: string) => {
			if (updatedSessionId === sessionIdRef.current) {
				applyRuntimeSnapshot(updatedSessionId);

				// Clear ticker when a new non-reasoning block (text/tool) appears
				// while reasoning is active. Block counting handles successive
				// reasoning→tool cycles within a single response.
				const snapshot = sessionRuntimeStore.getSnapshot(updatedSessionId);
				if (snapshot) {
					const nonReasoningCount = snapshot.currentContentBlocks.filter(
						(b) => b.type !== "reasoning"
					).length;
					const newNonReasoningAdded = nonReasoningCount > lastNonReasoningCountRef.current;
					if (reasoningActiveRef.current && newNonReasoningAdded) {
						clearReasoningTickerRef.current();
						reasoningActiveRef.current = false;
					}
					lastNonReasoningCountRef.current = nonReasoningCount;
				}
			}
		};
		const handleStateChange = (state: DaemonState) => {
			const activeSessionId = sessionIdRef.current;
			if (state !== DaemonState.RESPONDING) {
				clearReasoningStateRef.current();
				reasoningActiveRef.current = false;
				lastNonReasoningCountRef.current = 0;
			}
			if (!activeSessionId) {
				setDaemonState(state);
				return;
			}
			if (state === DaemonState.RESPONDING) {
				clearReasoningStateRef.current();
				reasoningActiveRef.current = false;
				lastNonReasoningCountRef.current = 0;
				setDaemonState(state);
			} else if (
				state === DaemonState.SPEAKING ||
				state === DaemonState.LISTENING ||
				state === DaemonState.TRANSCRIBING
			) {
				setDaemonState(state);
			} else if (state === DaemonState.IDLE) {
				applyRuntimeSnapshot(activeSessionId);
			}
		};
		const handleApprovalResolved = (toolCallId: string, approved: boolean, approvalSessionId?: string) => {
			sessionRuntimeStore.toolApprovalResolved(toolCallId, approved, approvalSessionId);
		};
		const handleError = (err: Error) => {
			const activeSessionId = sessionIdRef.current;
			if (activeSessionId) {
				sessionRuntimeStore.setError(activeSessionId, err.message);
				setTimeout(() => sessionRuntimeStore.clearError(activeSessionId), 5000);
			} else {
				setErrorState(err.message);
				setTimeout(() => setErrorState(""), 5000);
			}
		};
		const handleMemorySaved = (preview: { operation: string; description?: string }) => {
			const description = preview.description?.trim();
			if (!description) return;
			toast.success(`Memory saved (${preview.operation})`, { description });
		};

		sessionRuntimeStore.events.on("updated", handleRuntimeUpdate);
		daemonEvents.on("stateChange", handleStateChange);
		daemonEvents.on("toolApprovalResolved", handleApprovalResolved);
		daemonEvents.on("error", handleError);
		daemonEvents.on("memorySaved", handleMemorySaved);
		const handleReasoningToken = (token: string) => {
			const isNewReasoningSegment = !reasoningActiveRef.current;
			reasoningActiveRef.current = true;
			setReasoningQueueRef.current((prev: string) =>
				isNewReasoningSegment ? token.replace(/\n/g, " ") : prev + token.replace(/\n/g, " ")
			);
		};
		daemonEvents.on("reasoningToken", handleReasoningToken);
		return () => {
			sessionRuntimeStore.events.off("updated", handleRuntimeUpdate);
			daemonEvents.off("stateChange", handleStateChange);
			daemonEvents.off("toolApprovalResolved", handleApprovalResolved);
			daemonEvents.off("error", handleError);
			daemonEvents.off("memorySaved", handleMemorySaved);
			daemonEvents.off("reasoningToken", handleReasoningToken);
		};
	}, [applyRuntimeSnapshot, sessionIdRef]);

	useEffect(() => {
		clearFetchCache();
	}, [sessionId]);

	useEffect(() => {
		if (!preferencesLoaded) return;
		if (currentModelProvider === "copilot") {
			setModelMetadata(null);
			return;
		}
		if (currentModelProvider === "openai-codex" && !openAiCodexAuthenticated) {
			setModelMetadata(null);
			return;
		}
		let cancelled = false;
		getModelMetadataForProvider(currentModelId, currentModelProvider).then((metadata) => {
			if (!cancelled) setModelMetadata(metadata);
		});
		return () => {
			cancelled = true;
		};
	}, [currentModelId, currentModelProvider, openAiCodexAuthenticated, preferencesLoaded]);

	const applyAvatarForState = useCallback((state: DaemonState) => {
		const avatar = avatarRef.current;
		if (!avatar) return;

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
		if (state !== DaemonState.RESPONDING) avatar.setToolActive(false);
	}, []);

	useEffect(() => {
		daemonStateRef.current = daemonState;
		applyAvatarForState(daemonState);
	}, [applyAvatarForState, daemonState]);

	useEffect(() => {
		const handleMicLevel = (level: number) => {
			const avatar = avatarRef.current;
			if (!avatar || daemonStateRef.current !== DaemonState.LISTENING) return;
			const boosted = Math.min(1, Math.pow(level, 1.15) * 1.05);
			avatar.setAudioLevel(boosted);
		};
		const handleTtsLevel = (level: number) => {
			const avatar = avatarRef.current;
			if (!avatar || daemonStateRef.current !== DaemonState.SPEAKING) return;
			const boosted = Math.min(1, Math.pow(level, 0.85) * 1.15);
			avatar.setAudioLevel(boosted);
		};

		daemonEvents.on("micLevel", handleMicLevel);
		daemonEvents.on("ttsLevel", handleTtsLevel);
		return () => {
			daemonEvents.off("micLevel", handleMicLevel);
			daemonEvents.off("ttsLevel", handleTtsLevel);
		};
	}, []);

	const setConversationHistory: React.Dispatch<React.SetStateAction<ConversationMessage[]>> = useCallback(
		(next) => {
			setConversationHistoryState((prev) => {
				const value = typeof next === "function" ? next(prev) : next;
				const activeSessionId = sessionIdRef.current;
				if (activeSessionId) {
					sessionRuntimeStore.hydrate(activeSessionId, value, sessionUsage);
				}
				return value;
			});
		},
		[sessionIdRef, sessionUsage]
	);

	const hydrateConversationHistory = useCallback(
		(history: ConversationMessage[]) => {
			const activeSessionId = sessionIdRef.current;
			if (activeSessionId) {
				sessionRuntimeStore.hydrate(activeSessionId, history, sessionUsage);
			} else {
				setConversationHistoryState(history.map((msg) => ({ ...msg, pending: false })));
			}
		},
		[sessionIdRef, sessionUsage]
	);

	const setCurrentTranscription: React.Dispatch<React.SetStateAction<string>> = useCallback(
		(next) => {
			const value = typeof next === "function" ? next(currentTranscription) : next;
			const activeSessionId = sessionIdRef.current;
			if (activeSessionId) sessionRuntimeStore.setCurrentTranscription(activeSessionId, value);
			setCurrentTranscriptionState(value);
		},
		[currentTranscription, sessionIdRef]
	);

	const setCurrentResponse: React.Dispatch<React.SetStateAction<string>> = useCallback((next) => {
		setCurrentResponseState(next);
	}, []);

	const clearCurrentContentBlocks = useCallback(() => {
		setCurrentContentBlocksState([]);
	}, []);

	const resetSessionUsage = useCallback(() => {
		setSessionUsageState(INITIAL_USAGE);
		const activeSessionId = sessionIdRef.current;
		if (activeSessionId) sessionRuntimeStore.hydrate(activeSessionId, conversationHistory, INITIAL_USAGE);
	}, [conversationHistory, sessionIdRef]);

	const setSessionUsage: React.Dispatch<React.SetStateAction<TokenUsage>> = useCallback(
		(next) => {
			setSessionUsageState((prev) => {
				const value = typeof next === "function" ? next(prev) : next;
				const activeSessionId = sessionIdRef.current;
				if (activeSessionId) sessionRuntimeStore.hydrate(activeSessionId, conversationHistory, value);
				return value;
			});
		},
		[conversationHistory, sessionIdRef]
	);

	useEffect(() => {
		const activeSessionId = sessionIdRef.current;
		if (!activeSessionId) return;
		manager.setConversationHistory(buildModelHistoryFromConversation(conversationHistory));
	}, [conversationHistory, manager, sessionIdRef]);

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

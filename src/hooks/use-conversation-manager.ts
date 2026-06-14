import { toast } from "@opentui-ui/toast/react";
import { useCallback } from "react";
import { getDaemonManager } from "../state/daemon-state";
import { sessionRuntimeStore } from "../state/session-runtime-store";
import {
	buildModelHistoryFromConversation,
	loadSessionSnapshot,
	saveSessionSnapshot,
} from "../state/session-store";
import { DaemonState } from "../types";
import type { ConversationMessage, TokenUsage } from "../types";

export interface UseConversationManagerParams {
	conversationHistory: ConversationMessage[];
	sessionUsage: TokenUsage;
	currentSessionId: string | null;
	ensureSessionId: () => Promise<string>;
	setCurrentSessionIdSafe: (sessionId: string | null) => void;
	currentSessionIdRef: React.RefObject<string | null>;

	hydrateConversationHistory: (history: ConversationMessage[]) => void;
	setCurrentTranscription: React.Dispatch<React.SetStateAction<string>>;
	setCurrentResponse: React.Dispatch<React.SetStateAction<string>>;
	clearCurrentContentBlocks: () => void;
	clearReasoningState: () => void;
	resetSessionUsage: () => void;
	currentUserInputRef: React.RefObject<string>;
}

export interface UseConversationManagerReturn {
	clearConversationState: () => void;
	loadSessionById: (sessionId: string) => Promise<void>;
	startNewSession: () => void;
	undoLastTurn: () => void;
}

export function useConversationManager(params: UseConversationManagerParams): UseConversationManagerReturn {
	const {
		conversationHistory,
		sessionUsage,
		currentSessionId,
		ensureSessionId,
		setCurrentSessionIdSafe,
		currentSessionIdRef,

		hydrateConversationHistory,
		setCurrentTranscription,
		setCurrentResponse,
		clearCurrentContentBlocks,
		clearReasoningState,
		resetSessionUsage,
		currentUserInputRef,
	} = params;

	const manager = getDaemonManager();

	const clearConversationState = useCallback(() => {
		const activeSessionId = currentSessionIdRef.current;
		if (activeSessionId) sessionRuntimeStore.clearConversation(activeSessionId);
		hydrateConversationHistory([]);
		setCurrentTranscription("");
		setCurrentResponse("");
		clearCurrentContentBlocks();
		clearReasoningState();
		resetSessionUsage();
		currentUserInputRef.current = "";
	}, [
		currentSessionIdRef,
		hydrateConversationHistory,
		setCurrentTranscription,
		setCurrentResponse,
		clearCurrentContentBlocks,
		clearReasoningState,
		resetSessionUsage,
		currentUserInputRef,
	]);

	const loadSessionById = useCallback(
		async (sessionId: string) => {
			const existingRuntime = sessionRuntimeStore.getSnapshot(sessionId);
			if (
				existingRuntime &&
				(existingRuntime.state !== DaemonState.IDLE ||
					existingRuntime.conversationHistory.length > 0 ||
					existingRuntime.currentContentBlocks.length > 0)
			) {
				setCurrentSessionIdSafe(sessionId);
				manager.setConversationHistory(existingRuntime.modelHistory);
				return;
			}

			const snapshot = await loadSessionSnapshot(sessionId);
			if (snapshot) {
				sessionRuntimeStore.hydrate(sessionId, snapshot.conversationHistory, snapshot.sessionUsage);
				manager.setConversationHistory(buildModelHistoryFromConversation(snapshot.conversationHistory));
			} else {
				sessionRuntimeStore.hydrate(sessionId, [], {
					promptTokens: 0,
					completionTokens: 0,
					totalTokens: 0,
					subagentTotalTokens: 0,
					subagentPromptTokens: 0,
					subagentCompletionTokens: 0,
				});
			}
			setCurrentSessionIdSafe(sessionId);
		},
		[manager, setCurrentSessionIdSafe]
	);

	const startNewSession = useCallback(() => {
		if (manager.state === DaemonState.SPEAKING) manager.stopSpeaking();
		void (async () => {
			if (conversationHistory.length > 0) {
				const targetSessionId = currentSessionId ?? (await ensureSessionId());
				await saveSessionSnapshot(
					{
						conversationHistory,
						sessionUsage,
					},
					targetSessionId
				);
			}

			setCurrentSessionIdSafe(null);
		})();
	}, [
		conversationHistory,
		sessionUsage,
		currentSessionId,
		ensureSessionId,
		setCurrentSessionIdSafe,
		manager,
	]);

	const undoLastTurn = useCallback(() => {
		if (conversationHistory.length === 0) {
			toast.info("Nothing to undo");
			return;
		}

		const userMessageCount = conversationHistory.filter((m) => m.type === "user").length;
		if (userMessageCount <= 1) {
			toast.warning("Cannot delete the first message", {
				description: "Start a new session to clear conversation",
			});
			return;
		}

		const lastDaemonIdx = [...conversationHistory].reverse().findIndex((m) => m.type === "daemon");
		if (lastDaemonIdx === -1) {
			toast.info("Nothing to undo");
			return;
		}

		const actualIdx = conversationHistory.length - 1 - lastDaemonIdx;
		const userMsgIdx =
			actualIdx > 0 && conversationHistory[actualIdx - 1]?.type === "user" ? actualIdx - 1 : actualIdx;

		const newHistory = conversationHistory.slice(0, userMsgIdx);
		hydrateConversationHistory(newHistory);

		manager.stopSpeaking();
		const activeSessionId = currentSessionIdRef.current;
		if (activeSessionId) {
			sessionRuntimeStore.hydrate(activeSessionId, newHistory, sessionUsage);
		}
		manager.setConversationHistory(buildModelHistoryFromConversation(newHistory));
		toast.info("Last message deleted");
	}, [conversationHistory, hydrateConversationHistory, manager, currentSessionIdRef, sessionUsage]);

	return {
		clearConversationState,
		loadSessionById,
		startNewSession,
		undoLastTurn,
	};
}

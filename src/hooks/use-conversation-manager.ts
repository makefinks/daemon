import { useCallback } from "react";
import { toast } from "@opentui-ui/toast/react";
import { getDaemonManager } from "../state/daemon-state";
import {
	buildModelHistoryFromConversation,
	deleteSession,
	loadSessionSnapshot,
	saveSessionSnapshot,
} from "../state/session-store";
import type { ConversationMessage, SessionInfo, TokenUsage } from "../types";

export interface UseConversationManagerParams {
	conversationHistory: ConversationMessage[];
	sessionUsage: TokenUsage;
	currentSessionId: string | null;
	ensureSessionId: () => Promise<string>;
	setCurrentSessionIdSafe: (sessionId: string | null) => void;
	currentSessionIdRef: React.RefObject<string | null>;
	setSessions: React.Dispatch<React.SetStateAction<SessionInfo[]>>;

	hydrateConversationHistory: (history: ConversationMessage[]) => void;
	setCurrentTranscription: React.Dispatch<React.SetStateAction<string>>;
	setCurrentResponse: React.Dispatch<React.SetStateAction<string>>;
	clearCurrentContentBlocks: () => void;
	clearReasoningState: () => void;
	resetSessionUsage: () => void;
	setSessionUsage: React.Dispatch<React.SetStateAction<TokenUsage>>;
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
		setSessions,

		hydrateConversationHistory,
		setCurrentTranscription,
		setCurrentResponse,
		clearCurrentContentBlocks,
		clearReasoningState,
		resetSessionUsage,
		setSessionUsage,
		currentUserInputRef,
	} = params;

	const manager = getDaemonManager();

	const clearConversationState = useCallback(() => {
		manager.clearHistory();
		manager.setConversationHistory([]);
		hydrateConversationHistory([]);
		setCurrentTranscription("");
		setCurrentResponse("");
		clearCurrentContentBlocks();
		clearReasoningState();
		resetSessionUsage();
		currentUserInputRef.current = "";
	}, [
		manager,
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
			const snapshot = await loadSessionSnapshot(sessionId);
			clearConversationState();
			if (snapshot) {
				hydrateConversationHistory(snapshot.conversationHistory);
				setSessionUsage(snapshot.sessionUsage);
				manager.setConversationHistory(buildModelHistoryFromConversation(snapshot.conversationHistory));
			}
			setCurrentSessionIdSafe(sessionId);
		},
		[clearConversationState, hydrateConversationHistory, setSessionUsage, manager, setCurrentSessionIdSafe]
	);

	const startNewSession = useCallback(() => {
		manager.stopSpeaking();
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

			clearConversationState();
			setCurrentSessionIdSafe(null);
		})();
	}, [
		conversationHistory,
		sessionUsage,
		currentSessionId,
		ensureSessionId,
		clearConversationState,
		setCurrentSessionIdSafe,
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

		const modelMessagesRemoved = manager.undoLastTurn();

		if (modelMessagesRemoved > 0) {
			toast.info("Last message deleted");
		}
	}, [conversationHistory, hydrateConversationHistory, manager]);

	return {
		clearConversationState,
		loadSessionById,
		startNewSession,
		undoLastTurn,
	};
}

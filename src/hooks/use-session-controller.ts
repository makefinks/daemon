import { useEffect } from "react";
import type { MutableRefObject } from "react";

import { useAppSessions } from "./use-app-sessions";
import { useGrounding } from "./use-grounding";
import { useGroundingMenuController } from "./use-grounding-menu-controller";

import { getDaemonManager } from "../state/daemon-state";

export interface SessionControllerResult {
	currentSessionId: string | null;
	setCurrentSessionIdSafe: (id: string | null) => void;
	currentSessionIdRef: MutableRefObject<string | null>;
	ensureSessionId: () => Promise<string>;
	setSessions: ReturnType<typeof useAppSessions>["setSessions"];
	sessionMenuItems: ReturnType<typeof useAppSessions>["sessionMenuItems"];
	handleFirstMessage: ReturnType<typeof useAppSessions>["handleFirstMessage"];

	latestGroundingMap: ReturnType<typeof useGrounding>["latestGroundingMap"];
	hasGrounding: boolean;

	groundingInitialIndex: number;
	groundingSelectedIndex: number;
	setGroundingSelectedIndex: (idx: number) => void;
	onGroundingSelect: (idx: number) => void;
	onGroundingIndexChange: (idx: number) => void;
}

export function useSessionController({
	showSessionMenu,
}: {
	showSessionMenu: boolean;
}): SessionControllerResult {
	const {
		currentSessionId,
		setCurrentSessionIdSafe,
		currentSessionIdRef,
		ensureSessionId,
		setSessions,
		sessionMenuItems,
		handleFirstMessage,
	} = useAppSessions({ showSessionMenu });

	useEffect(() => {
		const manager = getDaemonManager();
		manager.setEnsureSessionId(() => ensureSessionId());
		return () => manager.setEnsureSessionId(null);
	}, [ensureSessionId]);

	const { latestGroundingMap, hasGrounding } = useGrounding(currentSessionId);
	const {
		groundingInitialIndex,
		groundingSelectedIndex,
		setGroundingSelectedIndex,
		onGroundingSelect,
		onGroundingIndexChange,
	} = useGroundingMenuController({ sessionId: currentSessionId, latestGroundingMap });

	useEffect(() => {
		setGroundingSelectedIndex(0);
	}, [currentSessionId, setGroundingSelectedIndex]);

	return {
		currentSessionId,
		setCurrentSessionIdSafe,
		currentSessionIdRef,
		ensureSessionId,
		setSessions,
		sessionMenuItems,
		handleFirstMessage,
		latestGroundingMap,
		hasGrounding,
		groundingInitialIndex,
		groundingSelectedIndex,
		setGroundingSelectedIndex,
		onGroundingSelect,
		onGroundingIndexChange,
	};
}

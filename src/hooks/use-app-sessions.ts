import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { generateSessionTitle } from "../ai/daemon-ai";
import { createSession, listSessions, updateSessionTitle } from "../state/session-store";
import { sessionRuntimeStore } from "../state/session-runtime-store";
import type { SessionRuntimeStatus } from "../state/session-runtime-store";
import type { SessionInfo } from "../types";

export type SessionMenuRuntimeItem = SessionInfo & {
	isNew: boolean;
	runtimeStatus?: SessionRuntimeStatus;
};

export interface UseAppSessionsParams {
	showSessionMenu: boolean;
}

export interface UseAppSessionsReturn {
	currentSessionId: string | null;
	setCurrentSessionIdSafe: (nextSessionId: string | null) => void;
	currentSessionIdRef: React.RefObject<string | null>;
	ensureSessionId: () => Promise<string>;

	sessions: SessionInfo[];
	setSessions: React.Dispatch<React.SetStateAction<SessionInfo[]>>;

	sessionCreateRef: React.RefObject<Promise<SessionInfo> | null>;

	sessionMenuItems: SessionMenuRuntimeItem[];

	handleFirstMessage: (targetSessionId: string, message: string) => void;
}

export function useAppSessions(params: UseAppSessionsParams): UseAppSessionsReturn {
	const { showSessionMenu } = params;

	const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
	const currentSessionIdRef = useRef<string | null>(null);
	const [sessions, setSessions] = useState<SessionInfo[]>([]);
	const [runtimeStatusVersion, setRuntimeStatusVersion] = useState(0);
	const sessionCreateRef = useRef<Promise<SessionInfo> | null>(null);

	const setCurrentSessionIdSafe = useCallback((nextSessionId: string | null) => {
		currentSessionIdRef.current = nextSessionId;
		setCurrentSessionId(nextSessionId);
	}, []);

	useEffect(() => {
		currentSessionIdRef.current = currentSessionId;
	}, [currentSessionId]);

	const ensureSessionId = useCallback(async (): Promise<string> => {
		if (currentSessionIdRef.current) return currentSessionIdRef.current;
		if (!sessionCreateRef.current) {
			sessionCreateRef.current = createSession()
				.then((session) => {
					setCurrentSessionIdSafe(session.id);
					setSessions((prev) => [session, ...prev]);
					return session;
				})
				.finally(() => {
					sessionCreateRef.current = null;
				});
		}
		const session = await sessionCreateRef.current;
		currentSessionIdRef.current = session.id;
		return session.id;
	}, [setCurrentSessionIdSafe]);

	const sessionMenuItems = useMemo(() => {
		const statuses = sessionRuntimeStore.getStatusMap();
		return sessions.map((session) => ({
			...session,
			isNew: false,
			runtimeStatus: statuses.get(session.id),
		}));
	}, [sessions, runtimeStatusVersion]);

	useEffect(() => {
		const onStatusChanged = () => setRuntimeStatusVersion((prev) => prev + 1);
		sessionRuntimeStore.events.on("statusChanged", onStatusChanged);
		return () => {
			sessionRuntimeStore.events.off("statusChanged", onStatusChanged);
		};
	}, []);

	useEffect(() => {
		if (!showSessionMenu) return;
		let cancelled = false;

		(async () => {
			const list = await listSessions();
			if (cancelled) return;
			setSessions(list);
			const currentIdx = currentSessionIdRef.current
				? list.findIndex((session) => session.id === currentSessionIdRef.current)
				: -1;
		})();

		return () => {
			cancelled = true;
		};
	}, [showSessionMenu]);

	const handleFirstMessage = useCallback((targetSessionId: string, message: string) => {
		void (async () => {
			const title = await generateSessionTitle(message);
			await updateSessionTitle(targetSessionId, title);
			setSessions((prev) => prev.map((s) => (s.id === targetSessionId ? { ...s, title } : s)));
		})();
	}, []);

	return {
		currentSessionId,
		setCurrentSessionIdSafe,
		currentSessionIdRef,
		ensureSessionId,
		sessions,
		setSessions,
		sessionCreateRef,
		sessionMenuItems,
		handleFirstMessage,
	};
}

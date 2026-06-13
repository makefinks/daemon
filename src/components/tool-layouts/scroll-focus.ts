import { useEffect, useState } from "react";
import { sessionRuntimeStore } from "../../state/session-runtime-store";

const focusedScrollboxes = new Map<string, string>();
const focusListeners = new Set<() => void>();

function notifyFocusListeners(): void {
	for (const listener of focusListeners) listener();
}

export function setToolScrollFocus(toolCallId: string, focused: boolean, sessionId: string | null): void {
	const had = focusedScrollboxes.has(toolCallId);
	if (focused && !had) {
		if (focusedScrollboxes.size > 0) {
			for (const prevSession of focusedScrollboxes.values()) {
				if (prevSession) sessionRuntimeStore.requestRenderTick(prevSession);
			}
			focusedScrollboxes.clear();
		}
		focusedScrollboxes.set(toolCallId, sessionId ?? "");
		notifyFocusListeners();
	} else if (!focused && had) {
		focusedScrollboxes.delete(toolCallId);
		notifyFocusListeners();
	}
	if (sessionId) sessionRuntimeStore.requestRenderTick(sessionId);
}

export function clearToolScrollFocus(): void {
	if (focusedScrollboxes.size === 0) return;
	const sessions = new Set(focusedScrollboxes.values());
	focusedScrollboxes.clear();
	notifyFocusListeners();
	for (const sessionId of sessions) {
		if (sessionId) sessionRuntimeStore.requestRenderTick(sessionId);
	}
}

export function isToolScrollFocused(toolCallId: string | undefined): boolean {
	return toolCallId ? focusedScrollboxes.has(toolCallId) : false;
}

export function useToolScrollFocus(toolCallId: string | undefined): boolean {
	const [, setTick] = useState(0);
	useEffect(() => {
		const listener = () => setTick((tick) => tick + 1);
		focusListeners.add(listener);
		return () => {
			focusListeners.delete(listener);
		};
	}, []);
	return isToolScrollFocused(toolCallId);
}

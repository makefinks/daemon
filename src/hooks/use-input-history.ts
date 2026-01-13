import { useCallback, useRef, useState, useEffect } from "react";
import { loadPreferences, updatePreferences } from "../utils/preferences";

const MAX_HISTORY_SIZE = 20;

export interface UseInputHistoryReturn {
	addToHistory: (input: string) => void;
	navigateUp: (currentInput: string) => string | null;
	navigateDown: () => string | null;
	resetNavigation: () => void;
	isNavigating: boolean;
}

export function useInputHistory(): UseInputHistoryReturn {
	const [history, setHistory] = useState<string[]>([]);
	const navigationIndexRef = useRef<number>(-1);
	const savedCurrentInputRef = useRef<string>("");
	const isNavigatingRef = useRef<boolean>(false);

	useEffect(() => {
		loadPreferences().then((prefs) => {
			if (prefs?.inputHistory) {
				setHistory(prefs.inputHistory);
			}
		});
	}, []);

	const addToHistory = useCallback((input: string) => {
		const trimmed = input.trim();
		if (!trimmed) return;

		setHistory((prev) => {
			const filtered = prev.filter((item) => item !== trimmed);
			const next = [trimmed, ...filtered].slice(0, MAX_HISTORY_SIZE);
			void updatePreferences({ inputHistory: next });
			return next;
		});

		navigationIndexRef.current = -1;
		savedCurrentInputRef.current = "";
		isNavigatingRef.current = false;
	}, []);

	const navigateUp = useCallback(
		(currentInput: string): string | null => {
			if (history.length === 0) return null;

			if (!isNavigatingRef.current) {
				savedCurrentInputRef.current = currentInput;
				isNavigatingRef.current = true;
				navigationIndexRef.current = 0;
				return history[0] ?? null;
			}

			const nextIndex = navigationIndexRef.current + 1;
			if (nextIndex >= history.length) return null;

			navigationIndexRef.current = nextIndex;
			return history[nextIndex] ?? null;
		},
		[history]
	);

	const navigateDown = useCallback((): string | null => {
		if (!isNavigatingRef.current) return null;

		const nextIndex = navigationIndexRef.current - 1;

		if (nextIndex < 0) {
			isNavigatingRef.current = false;
			navigationIndexRef.current = -1;
			return savedCurrentInputRef.current;
		}

		navigationIndexRef.current = nextIndex;
		return history[nextIndex] ?? null;
	}, [history]);

	const resetNavigation = useCallback(() => {
		navigationIndexRef.current = -1;
		savedCurrentInputRef.current = "";
		isNavigatingRef.current = false;
	}, []);

	return {
		addToHistory,
		navigateUp,
		navigateDown,
		resetNavigation,
		isNavigating: isNavigatingRef.current,
	};
}

import { useEffect, useRef, useState } from "react";
import { REASONING_ANIMATION } from "../ui/constants";

export interface ReasoningState {
	reasoningQueue: string;
	reasoningDisplay: string;
}

export interface UseReasoningAnimationReturn {
	reasoningQueue: string;
	reasoningDisplay: string;
	lastCharTimestamp: number;
	setReasoningQueue: (queue: string | ((prev: string) => string)) => void;
	clearReasoningState: () => void;
	clearReasoningTicker: () => void;
}

export function useReasoningAnimation(): UseReasoningAnimationReturn {
	const [reasoningQueue, setReasoningQueue] = useState<string>("");
	const [reasoningDisplay, setReasoningDisplay] = useState<string>("");
	const lastCharTsRef = useRef(0);
	const renderTickRef = useRef(0);
	const [renderTick, setRenderTick] = useState(0);
	const reasoningAnimRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const clearReasoningState = () => {
		setReasoningQueue("");
		setReasoningDisplay("");
		lastCharTsRef.current = 0;
	};
	const clearReasoningTicker = () => {
		setReasoningQueue("");
		setReasoningDisplay("");
	};

	// Ticker animation: move chars from queue to display
	useEffect(() => {
		if (reasoningAnimRef.current) {
			clearTimeout(reasoningAnimRef.current);
			reasoningAnimRef.current = null;
		}

		if (!reasoningQueue) return;

		const tick = () => {
			setReasoningQueue((queue: string) => {
				if (!queue) return queue;

				const charsToMove = Math.min(REASONING_ANIMATION.CHARS_PER_TICK, queue.length);
				const movedChars = queue.slice(0, charsToMove);
				const remainingQueue = queue.slice(charsToMove);

				const terminalWidth =
					typeof process !== "undefined" && process.stdout?.columns ? process.stdout.columns : undefined;
				const maxWidth = terminalWidth ? Math.max(20, terminalWidth - 14) : REASONING_ANIMATION.LINE_WIDTH;
				const lineWidth = Math.min(REASONING_ANIMATION.LINE_WIDTH, maxWidth);

				setReasoningDisplay((display: string) => {
					const newDisplay = display + movedChars;
					if (newDisplay.length >= lineWidth) {
						return movedChars;
					}
					return newDisplay;
				});

				lastCharTsRef.current = Date.now();
				renderTickRef.current += 1;
				setRenderTick(renderTickRef.current);

				return remainingQueue;
			});

			reasoningAnimRef.current = setTimeout(tick, REASONING_ANIMATION.TICK_INTERVAL_MS);
		};

		reasoningAnimRef.current = setTimeout(tick, REASONING_ANIMATION.TICK_INTERVAL_MS);

		return () => {
			if (reasoningAnimRef.current) {
				clearTimeout(reasoningAnimRef.current);
				reasoningAnimRef.current = null;
			}
		};
	}, [reasoningQueue]);

	// Periodic re-render to drive fade animation; stops once fade completes
	useEffect(() => {
		if (fadeTimerRef.current) {
			clearTimeout(fadeTimerRef.current);
			fadeTimerRef.current = null;
		}

		const elapsed = Date.now() - lastCharTsRef.current;
		const fadeDone = elapsed >= REASONING_ANIMATION.FADE_MS;
		if (!reasoningQueue && fadeDone) return;

		const tick = () => {
			const now = Date.now();
			const age = now - lastCharTsRef.current;
			if (!reasoningQueue && age >= REASONING_ANIMATION.FADE_MS) return;

			renderTickRef.current += 1;
			setRenderTick(renderTickRef.current);
			fadeTimerRef.current = setTimeout(tick, 100);
		};

		fadeTimerRef.current = setTimeout(tick, 100);

		return () => {
			if (fadeTimerRef.current) {
				clearTimeout(fadeTimerRef.current);
				fadeTimerRef.current = null;
			}
		};
	}, [reasoningQueue, reasoningDisplay, renderTick]);

	return {
		reasoningQueue,
		reasoningDisplay,
		lastCharTimestamp: lastCharTsRef.current,
		setReasoningQueue,
		clearReasoningState,
		clearReasoningTicker,
	};
}

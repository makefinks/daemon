import { useEffect, useRef, useState } from "react";
import { REASONING_ANIMATION } from "../ui/constants";

export interface ReasoningState {
	reasoningQueue: string;
	reasoningDisplay: string;
	fullReasoning: string;
}

export interface UseReasoningAnimationReturn {
	reasoningQueue: string;
	reasoningDisplay: string;
	fullReasoning: string;
	setReasoningQueue: (queue: string | ((prev: string) => string)) => void;
	setFullReasoning: (full: string | ((prev: string) => string)) => void;
	fullReasoningRef: React.RefObject<string>;
	clearReasoningState: () => void;
	clearReasoningTicker: () => void;
}

export function useReasoningAnimation(): UseReasoningAnimationReturn {
	const [reasoningQueue, setReasoningQueue] = useState<string>("");
	const [reasoningDisplay, setReasoningDisplay] = useState<string>("");
	const [fullReasoning, setFullReasoning] = useState<string>("");
	const reasoningAnimRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const fullReasoningRef = useRef<string>("");

	const clearReasoningState = () => {
		setReasoningQueue("");
		setReasoningDisplay("");
		setFullReasoning("");
		fullReasoningRef.current = "";
	};
	const clearReasoningTicker = () => {
		setReasoningQueue("");
		setReasoningDisplay("");
	};

	// Smooth flowing animation for reasoning text
	// This creates a "ticker" effect where text flows through the single line
	useEffect(() => {
		// Clear any existing animation
		if (reasoningAnimRef.current) {
			clearTimeout(reasoningAnimRef.current);
			reasoningAnimRef.current = null;
		}

		// If no queue content, nothing to animate
		if (!reasoningQueue) return;

		const tick = () => {
			setReasoningQueue((queue: string) => {
				if (!queue) return queue;

				// Take characters from the front of the queue
				const charsToMove = Math.min(REASONING_ANIMATION.CHARS_PER_TICK, queue.length);
				const movedChars = queue.slice(0, charsToMove);
				const remainingQueue = queue.slice(charsToMove);

				const terminalWidth =
					typeof process !== "undefined" && process.stdout?.columns ? process.stdout.columns : undefined;
				const maxWidth = terminalWidth ? Math.max(20, terminalWidth - 12) : REASONING_ANIMATION.LINE_WIDTH;
				const lineWidth = Math.min(REASONING_ANIMATION.LINE_WIDTH, maxWidth);

				// Add to display, restart when reaching the line width
				setReasoningDisplay((display: string) => {
					const newDisplay = display + movedChars;
					if (newDisplay.length >= lineWidth) {
						return movedChars;
					}
					return newDisplay;
				});

				return remainingQueue;
			});

			// Schedule next tick if there's still content in the queue
			reasoningAnimRef.current = setTimeout(tick, REASONING_ANIMATION.TICK_INTERVAL_MS);
		};

		// Start the animation
		reasoningAnimRef.current = setTimeout(tick, REASONING_ANIMATION.TICK_INTERVAL_MS);

		return () => {
			if (reasoningAnimRef.current) {
				clearTimeout(reasoningAnimRef.current);
				reasoningAnimRef.current = null;
			}
		};
	}, [reasoningQueue]);

	return {
		reasoningQueue,
		reasoningDisplay,
		fullReasoning,
		setReasoningQueue,
		setFullReasoning,
		fullReasoningRef,
		clearReasoningState,
		clearReasoningTicker,
	};
}

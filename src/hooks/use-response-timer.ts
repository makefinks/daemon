/**
 * Hook for tracking response elapsed time during RESPONDING state.
 */

import { useEffect, useRef, useState } from "react";
import { DaemonState } from "../types";

export interface UseResponseTimerParams {
	daemonState: DaemonState;
}

export interface UseResponseTimerReturn {
	responseElapsedMs: number;
}

export function useResponseTimer(params: UseResponseTimerParams): UseResponseTimerReturn {
	const { daemonState } = params;

	const prevDaemonStateRef = useRef<DaemonState>(DaemonState.IDLE);
	const [responseStartAt, setResponseStartAt] = useState<number | null>(null);
	const [responseElapsedMs, setResponseElapsedMs] = useState(0);

	// Track state transitions to start/stop timer
	useEffect(() => {
		const prevState = prevDaemonStateRef.current;
		if (daemonState === DaemonState.RESPONDING && prevState !== DaemonState.RESPONDING) {
			setResponseStartAt(Date.now());
			setResponseElapsedMs(0);
		} else if (daemonState !== DaemonState.RESPONDING && prevState === DaemonState.RESPONDING) {
			setResponseStartAt(null);
			setResponseElapsedMs(0);
		}
		prevDaemonStateRef.current = daemonState;
	}, [daemonState]);

	// Update elapsed time while responding
	useEffect(() => {
		if (daemonState !== DaemonState.RESPONDING || responseStartAt === null) return;
		const tick = () => {
			setResponseStartAt((start) => {
				if (start !== null) {
					setResponseElapsedMs(Date.now() - start);
				}
				return start;
			});
		};
		tick();
		const interval = setInterval(tick, 250);
		return () => clearInterval(interval);
	}, [daemonState, responseStartAt]);

	return {
		responseElapsedMs,
	};
}

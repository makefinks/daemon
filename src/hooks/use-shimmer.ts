import { useEffect, useState } from "react";

export interface ShimmerConfig {
	durationMs: number;
	gradientWidth: number;
}

const DEFAULT_CONFIG: ShimmerConfig = {
	durationMs: 1800,
	gradientWidth: 6,
};

/**
 * Returns a phase value from 0 to 1 representing the position of a
 * shimmer highlight as it sweeps across text. One full cycle from
 * left to right completes in `durationMs` milliseconds.
 */
export function useShimmer(config: ShimmerConfig = DEFAULT_CONFIG): number {
	const [phase, setPhase] = useState(0);

	useEffect(() => {
		const fps = 60;
		const intervalMs = config.durationMs / fps;
		const interval = setInterval(() => {
			setPhase((prev) => (prev + 1 / fps) % 1);
		}, intervalMs);
		return () => clearInterval(interval);
	}, [config.durationMs]);

	return phase;
}

export { DEFAULT_CONFIG };

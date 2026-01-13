import { useState, useEffect, useCallback } from "react";
import type { GroundingMap } from "../types";
import { loadLatestGroundingMap } from "../state/session-store";
import { daemonEvents } from "../state/daemon-events";

export interface UseGroundingReturn {
	latestGroundingMap: GroundingMap | null;
	hasGrounding: boolean;
	refreshGrounding: () => Promise<void>;
}

export function useGrounding(sessionId: string | null): UseGroundingReturn {
	const [latestGroundingMap, setLatestGroundingMap] = useState<GroundingMap | null>(null);

	const refreshGrounding = useCallback(async () => {
		if (!sessionId) {
			setLatestGroundingMap(null);
			return;
		}
		const map = await loadLatestGroundingMap(sessionId);
		setLatestGroundingMap(map);
	}, [sessionId]);

	useEffect(() => {
		void refreshGrounding();
	}, [refreshGrounding]);

	useEffect(() => {
		const handleGroundingSaved = (savedSessionId: string) => {
			if (savedSessionId === sessionId) {
				void refreshGrounding();
			}
		};

		daemonEvents.on("groundingSaved", handleGroundingSaved);
		return () => {
			daemonEvents.off("groundingSaved", handleGroundingSaved);
		};
	}, [sessionId, refreshGrounding]);

	return {
		latestGroundingMap,
		hasGrounding: latestGroundingMap !== null && latestGroundingMap.items.length > 0,
		refreshGrounding,
	};
}

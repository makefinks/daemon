import { useCallback, useEffect, useMemo, useState } from "react";
import type { GroundingMap } from "../types";
import { openUrlInBrowser } from "../utils/preferences";
import { buildTextFragmentUrl } from "../utils/text-fragment";

export function useGroundingMenuController(params: {
	sessionId: string | null;
	latestGroundingMap: GroundingMap | null;
}) {
	const { sessionId, latestGroundingMap } = params;
	const [selectedIndex, setSelectedIndex] = useState(0);

	useEffect(() => {
		setSelectedIndex(0);
	}, [sessionId]);

	const initialIndex = useMemo(() => {
		if (!latestGroundingMap) return 0;
		return Math.min(selectedIndex, Math.max(0, latestGroundingMap.items.length - 1));
	}, [latestGroundingMap, selectedIndex]);

	const openGroundingSource = useCallback(
		(idx: number) => {
			if (!latestGroundingMap) return;
			const item = latestGroundingMap.items[idx];
			if (!item) return;
			const { source } = item;
			const url = source.textFragment
				? buildTextFragmentUrl(source.url, { fragmentText: source.textFragment })
				: source.url;
			openUrlInBrowser(url);
		},
		[latestGroundingMap]
	);

	const handleSelect = useCallback(
		(index: number) => {
			setSelectedIndex(index);
			openGroundingSource(index);
		},
		[openGroundingSource]
	);

	return {
		groundingInitialIndex: initialIndex,
		groundingSelectedIndex: selectedIndex,
		setGroundingSelectedIndex: setSelectedIndex,
		onGroundingSelect: handleSelect,
		onGroundingIndexChange: setSelectedIndex,
	};
}

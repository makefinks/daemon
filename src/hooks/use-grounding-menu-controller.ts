import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "@opentui-ui/toast/react";
import type { GroundingMap } from "../types";
import { writeClipboardText } from "../utils/clipboard";
import { openUrlInBrowser } from "../utils/preferences";
import { buildStructuredTextFragmentUrl, textFragmentDisplayText } from "../utils/text-fragment";

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
			const url = buildStructuredTextFragmentUrl(source.url, source.textFragment);
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

	const handleCopyHighlight = useCallback(
		async (index: number) => {
			if (!latestGroundingMap) return;
			const item = latestGroundingMap.items[index];
			const textFragment = item ? textFragmentDisplayText(item.source.textFragment) : "";

			if (!textFragment) {
				toast.info("No highlight available for this source");
				return;
			}

			const didCopy = await writeClipboardText(textFragment);
			if (didCopy) {
				toast.info("Highlight copied to clipboard");
			} else {
				toast.warning("Could not copy highlight");
			}
		},
		[latestGroundingMap]
	);

	return {
		groundingInitialIndex: initialIndex,
		groundingSelectedIndex: selectedIndex,
		setGroundingSelectedIndex: setSelectedIndex,
		onGroundingSelect: handleSelect,
		onGroundingCopyHighlight: handleCopyHighlight,
		onGroundingIndexChange: setSelectedIndex,
	};
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "@opentui-ui/toast/react";
import { DaemonState, type GroundedStatement, type GroundingMap } from "../types";
import { getDaemonManager } from "../state/daemon-state";
import { writeClipboardText } from "../utils/clipboard";
import { openUrlInBrowser } from "../utils/preferences";
import { buildStructuredTextFragmentUrl, textFragmentDisplayText } from "../utils/text-fragment";

function formatGroundingForAgent(item: GroundedStatement, index: number): string {
	const textFragment = textFragmentDisplayText(item.source.textFragment);
	return [
		`Grounding ${index + 1}:`,
		`Statement: ${item.statement}`,
		`URL: ${item.source.url}`,
		item.source.title ? `Title: ${item.source.title}` : null,
		`Quote: ${item.source.quote}`,
		textFragment ? `Text fragment: ${textFragment}` : null,
	]
		.filter((line): line is string => line !== null)
		.join("\n");
}

function submitGroundingHighlightRequest(message: string): boolean {
	const manager = getDaemonManager();
	if (manager.state === DaemonState.RESPONDING || manager.state === DaemonState.TRANSCRIBING) {
		toast.info("Wait for the current response to finish");
		return false;
	}

	void manager.submitText(message);
	return true;
}

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
		(idx: number, groundingMap = latestGroundingMap) => {
			if (!groundingMap) return;
			const item = groundingMap.items[idx];
			if (!item) return;
			const { source } = item;
			const url = buildStructuredTextFragmentUrl(source.url, source.textFragment);
			openUrlInBrowser(url);
		},
		[latestGroundingMap]
	);

	const handleSelect = useCallback(
		(index: number, groundingMap?: GroundingMap) => {
			setSelectedIndex(index);
			openGroundingSource(index, groundingMap);
		},
		[openGroundingSource]
	);

	const handleAgentHighlight = useCallback(
		(index: number, groundingMap?: GroundingMap): boolean => {
			const map = groundingMap ?? latestGroundingMap;
			if (!map) return false;
			const item = map.items[index];
			if (!item) return false;

			const message = [
				`Highlight grounding ${index + 1} in the browser.`,
				"Open the browser visibly and apply the textmarker highlight to the exact source text. Do not use the text-fragment URL as the only highlighting mechanism; use Puppeteer DOM search/highlighting if needed.",
				formatGroundingForAgent(item, index),
			].join("\n\n");

			const submitted = submitGroundingHighlightRequest(message);
			if (submitted) toast.info(`Asking DAEMON to highlight grounding ${index + 1}`);
			return submitted;
		},
		[latestGroundingMap]
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
		onGroundingAgentHighlight: handleAgentHighlight,
		onGroundingCopyHighlight: handleCopyHighlight,
		onGroundingIndexChange: setSelectedIndex,
	};
}

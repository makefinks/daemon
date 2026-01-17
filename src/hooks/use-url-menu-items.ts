import { useMemo } from "react";
import type { ContentBlock, ConversationMessage, GroundingMap, UrlMenuItem } from "../types";
import { deriveUrlMenuItems } from "../utils/derive-url-menu-items";

export function useUrlMenuItems(params: {
	conversationHistory: ConversationMessage[];
	currentContentBlocks: ContentBlock[];
	latestGroundingMap: GroundingMap | null;
}): UrlMenuItem[] {
	const { conversationHistory, currentContentBlocks, latestGroundingMap } = params;

	return useMemo(() => {
		return deriveUrlMenuItems({
			conversationHistory,
			currentContentBlocks,
			latestGroundingMap,
		});
	}, [conversationHistory, currentContentBlocks, latestGroundingMap]);
}

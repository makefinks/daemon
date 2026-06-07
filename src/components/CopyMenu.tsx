import { toast } from "@opentui-ui/toast/react";
import { useCallback, useMemo } from "react";
import { useMenuKeyboard } from "../hooks/use-menu-keyboard";
import type { ContentBlock, ConversationMessage, GroundingMap } from "../types";
import { COLORS } from "../ui/constants";
import { writeClipboardText } from "../utils/clipboard";

interface CopyMenuProps {
	conversationHistory: ConversationMessage[];
	currentContentBlocks: ContentBlock[];
	latestGroundingMap: GroundingMap | null;
	allGroundingMaps: Map<number, GroundingMap>;
	onClose: () => void;
}

interface CopyItem {
	label: string;
	description: string;
	getText: () => string;
}

function textFromBlocks(blocks: ContentBlock[] | undefined): string {
	return (blocks ?? [])
		.filter((block): block is Extract<ContentBlock, { type: "text" }> => block.type === "text")
		.map((block) => block.content.trim())
		.filter(Boolean)
		.join("\n\n");
}

function textFromMessage(message: ConversationMessage): string {
	return message.content.trim() || textFromBlocks(message.contentBlocks);
}

function extractGroundingRefs(text: string): Set<number> {
	const refs = new Set<number>();
	for (const match of text.matchAll(/\*\*\(G(\d+)\)\*\*/g)) {
		const raw = match[1];
		if (!raw) continue;
		refs.add(Number.parseInt(raw, 10));
	}
	return refs;
}

function resolveSourcesForText(text: string, groundingMap: GroundingMap | null): string {
	if (!groundingMap || groundingMap.items.length === 0) return text;

	const refs = extractGroundingRefs(text);
	if (refs.size === 0) return text;

	const sorted = [...refs].sort((a, b) => a - b);
	const lines: string[] = [];
	for (const i of sorted) {
		if (i >= 1 && i <= groundingMap.items.length) {
			const item = groundingMap.items[i - 1];
			if (item) {
				lines.push(`(G${i}) ${item.source.url}`);
			}
		}
	}

	if (lines.length === 0) return text;
	return `${text}\n\nSources:\n${lines.join("\n")}`;
}

function formatTranscript(
	messages: ConversationMessage[],
	currentDaemonText: string,
	allGroundingMaps: Map<number, GroundingMap>,
	latestGroundingMap: GroundingMap | null
): string {
	const lines = messages
		.map((message) => {
			const text = textFromMessage(message);
			if (!text) return "";
			let block = `${message.type === "user" ? "USER" : "DAEMON"}:\n${text}`;
			if (message.type === "daemon") {
				const map = allGroundingMaps.get(message.id);
				const sources = resolveSourcesForText(text, map ?? null);
				if (sources !== text) block = sources;
			}
			return block;
		})
		.filter(Boolean);

	if (currentDaemonText) {
		const withSources = resolveSourcesForText(currentDaemonText, latestGroundingMap);
		lines.push(`DAEMON:\n${withSources}`);
	}

	return lines.join("\n\n");
}

export function CopyMenu({
	conversationHistory,
	currentContentBlocks,
	latestGroundingMap,
	allGroundingMaps,
	onClose,
}: CopyMenuProps) {
	const currentDaemonText = useMemo(() => textFromBlocks(currentContentBlocks), [currentContentBlocks]);

	const copyItems = useMemo<CopyItem[]>(
		() => [
			{
				label: "Last daemon message",
				description: "Copy the latest daemon response only",
				getText: () => {
					if (currentDaemonText) return currentDaemonText;
					const lastDaemonMessage = [...conversationHistory]
						.reverse()
						.find((message) => message.type === "daemon");
					return lastDaemonMessage ? textFromMessage(lastDaemonMessage) : "";
				},
			},
			{
				label: "Full conversation",
				description: "Copy the complete visible chat transcript",
				getText: () =>
					formatTranscript(conversationHistory, currentDaemonText, allGroundingMaps, latestGroundingMap),
			},
		],
		[conversationHistory, currentDaemonText]
	);

	const handleSelect = useCallback(
		(index: number) => {
			const item = copyItems[index];
			if (!item) return;

			void (async () => {
				const raw = item.getText();
				if (!raw) {
					toast.info("Nothing to copy yet");
					return;
				}

				const isSingleMessage = index === 0;
				const text = isSingleMessage ? resolveSourcesForText(raw, latestGroundingMap) : raw;
				const didCopy = await writeClipboardText(text);
				if (didCopy) {
					toast.info(`${item.label} copied to clipboard`);
					onClose();
				} else {
					toast.warning("Could not copy to clipboard");
				}
			})();
		},
		[copyItems, latestGroundingMap, onClose]
	);

	const { selectedIndex } = useMenuKeyboard({
		itemCount: copyItems.length,
		onClose,
		onSelect: handleSelect,
	});

	return (
		<box
			position="absolute"
			left={0}
			top={0}
			width="100%"
			height="100%"
			flexDirection="column"
			alignItems="center"
			justifyContent="center"
			zIndex={100}
		>
			<box
				flexDirection="column"
				backgroundColor={COLORS.MENU_BG}
				borderStyle="single"
				borderColor={COLORS.MENU_BORDER}
				paddingLeft={2}
				paddingRight={2}
				paddingTop={1}
				paddingBottom={1}
				width="50%"
				minWidth={48}
				maxWidth={90}
			>
				<box marginBottom={1}>
					<text>
						<span fg={COLORS.DAEMON_LABEL}>[ COPY ]</span>
					</text>
				</box>

				<box marginBottom={1}>
					<text>
						<span fg={COLORS.REASONING_DIM}>↑/↓ j/k navigate · ENTER copy · ESC close</span>
					</text>
				</box>

				<box flexDirection="column">
					{copyItems.map((item, index) => {
						const selected = index === selectedIndex;
						return (
							<box
								key={item.label}
								flexDirection="column"
								paddingLeft={1}
								paddingRight={1}
								paddingTop={0}
								paddingBottom={0}
								marginBottom={1}
								backgroundColor={selected ? COLORS.MENU_SELECTED_BG : COLORS.MENU_BG}
							>
								<text>
									<span fg={selected ? COLORS.TYPING_PROMPT : COLORS.MENU_TEXT}>
										{selected ? "> " : "  "}
										{item.label}
									</span>
								</text>
								<text>
									<span fg={COLORS.REASONING_DIM}> {item.description}</span>
								</text>
							</box>
						);
					})}
				</box>
			</box>
		</box>
	);
}

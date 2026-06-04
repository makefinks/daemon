import { toast } from "@opentui-ui/toast/react";
import { useCallback, useMemo } from "react";
import { useMenuKeyboard } from "../hooks/use-menu-keyboard";
import type { ContentBlock, ConversationMessage } from "../types";
import { COLORS } from "../ui/constants";
import { writeClipboardText } from "../utils/clipboard";

interface CopyMenuProps {
	conversationHistory: ConversationMessage[];
	currentContentBlocks: ContentBlock[];
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

function formatTranscript(messages: ConversationMessage[], currentDaemonText: string): string {
	const lines = messages
		.map((message) => {
			const text = textFromMessage(message);
			if (!text) return "";
			return `${message.type === "user" ? "USER" : "DAEMON"}:\n${text}`;
		})
		.filter(Boolean);

	if (currentDaemonText) {
		lines.push(`DAEMON:\n${currentDaemonText}`);
	}

	return lines.join("\n\n");
}

export function CopyMenu({ conversationHistory, currentContentBlocks, onClose }: CopyMenuProps) {
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
				getText: () => formatTranscript(conversationHistory, currentDaemonText),
			},
		],
		[conversationHistory, currentDaemonText]
	);

	const handleSelect = useCallback(
		(index: number) => {
			const item = copyItems[index];
			if (!item) return;

			void (async () => {
				const text = item.getText();
				if (!text) {
					toast.info("Nothing to copy yet");
					return;
				}

				const didCopy = await writeClipboardText(text);
				if (didCopy) {
					toast.info(`${item.label} copied to clipboard`);
					onClose();
				} else {
					toast.warning("Could not copy to clipboard");
				}
			})();
		},
		[copyItems, onClose]
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

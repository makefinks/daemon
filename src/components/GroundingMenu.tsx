import type { KeyEvent, ScrollBoxRenderable } from "@opentui/core";
import { useKeyboard, useRenderer } from "@opentui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMenuKeyboard } from "../hooks/use-menu-keyboard";
import type { ConversationMessage, GroundedStatement, GroundingMap } from "../types";
import { COLORS } from "../ui/constants";
import { textFragmentDisplayText } from "../utils/text-fragment";

const QUOTE_INDENT = 2;
const QUOTE_MARKER_WIDTH = 2;
const QUOTE_SUFFIX_WIDTH = 2;
const STATEMENT_MARKER_WIDTH = 2;

const ITEM_PADDING_TOP = 1;
const ITEM_PADDING_BOTTOM = 1;
const ITEM_MARGIN_BOTTOM = 1;
const MARGIN_QUOTE = 1;
const MARGIN_SOURCE = 1;
const SOURCE_LINE_HEIGHT = 1;

function truncateText(text: string, maxLen: number): string {
	if (text.length <= maxLen) return text;
	return text.slice(0, maxLen - 1) + "…";
}

function wrapText(text: string, maxWidth: number): string[] {
	if (!text || maxWidth <= 0) return [];
	const words = text.split(/\s+/);
	const lines: string[] = [];
	let currentLine = "";

	for (const word of words) {
		if (currentLine.length === 0) {
			currentLine = word;
		} else if (currentLine.length + 1 + word.length <= maxWidth) {
			currentLine += " " + word;
		} else {
			lines.push(currentLine);
			currentLine = word;
		}
	}
	if (currentLine.length > 0) {
		lines.push(currentLine);
	}
	return lines;
}

function findUserMessage(
	daemonMessageId: number,
	conversationHistory: ConversationMessage[]
): ConversationMessage | undefined {
	const daemonIndex = conversationHistory.findIndex((m) => m.id === daemonMessageId);
	if (daemonIndex <= 0) return undefined;
	const prev = conversationHistory[daemonIndex - 1];
	return prev?.type === "user" ? prev : undefined;
}

function messageContent(message: ConversationMessage): string {
	const text = (message.content || "").trim().replace(/\s+/g, " ");
	return text || `Message #${message.id}`;
}

interface LayoutItem {
	item: GroundedStatement;
	statementLines: string[];
	quoteLines: string[];
	textFragment: string;
	sourceDomain: string;
	height: number;
}

interface GroundingMenuProps {
	allGroundingMaps: Map<number, GroundingMap>;
	conversationHistory: ConversationMessage[];
	initialIndex?: number;
	onClose: () => void;
	onSelect: (index: number) => void;
	onCopyHighlight: (index: number) => void;
	onSelectedIndexChange?: (index: number) => void;
}

export function GroundingMenu({
	allGroundingMaps,
	conversationHistory,
	initialIndex = 0,
	onClose,
	onSelect,
	onCopyHighlight,
	onSelectedIndexChange,
}: GroundingMenuProps) {
	const scrollRef = useRef<ScrollBoxRenderable | null>(null);
	const renderer = useRenderer();

	const sortedMaps = useMemo(
		() => [...allGroundingMaps.values()].sort((a, b) => a.messageId - b.messageId),
		[allGroundingMaps]
	);

	const [mapIndex, setMapIndex] = useState(() => (sortedMaps.length > 0 ? sortedMaps.length - 1 : 0));

	// Jump to latest on mount and when maps change
	useEffect(() => {
		if (sortedMaps.length > 0) {
			setMapIndex(sortedMaps.length - 1);
		}
	}, [allGroundingMaps]);

	const activeMap = sortedMaps[mapIndex] ?? sortedMaps[sortedMaps.length - 1] ?? null;
	const items = activeMap?.items ?? [];
	const totalMaps = sortedMaps.length;
	const mapPosition = totalMaps > 0 ? mapIndex + 1 : 0;

	const menuWidth = useMemo(() => {
		return Math.max(80, Math.min(300, Math.floor(renderer.terminalWidth * 0.85)));
	}, [renderer.terminalWidth]);

	const { statementWidth, quoteWidth } = useMemo(() => {
		const cw = menuWidth - 6;
		return {
			contentWidth: cw,
			statementWidth: cw - 2 - STATEMENT_MARKER_WIDTH,
			quoteWidth: cw - 2 - QUOTE_INDENT - QUOTE_MARKER_WIDTH - QUOTE_SUFFIX_WIDTH,
		};
	}, [menuWidth]);

	const { selectedIndex } = useMenuKeyboard({
		itemCount: items.length,
		initialIndex,
		onClose,
		onSelect,
	});

	const handleCycleKey = useCallback(
		(key: KeyEvent) => {
			if (key.eventType !== "press") return;
			if (totalMaps <= 1) return;

			if (key.name === "left" || key.sequence === "h") {
				setMapIndex((prev) => (prev <= 0 ? totalMaps - 1 : prev - 1));
				key.preventDefault();
			} else if (key.name === "right" || key.sequence === "l") {
				setMapIndex((prev) => (prev >= totalMaps - 1 ? 0 : prev + 1));
				key.preventDefault();
			}
		},
		[totalMaps]
	);

	useKeyboard(handleCycleKey);

	const handleCopyKey = useCallback(
		(key: KeyEvent) => {
			if (key.eventType !== "press") return;
			if (items.length === 0) return;
			if (key.sequence !== "c" && key.sequence !== "C") return;

			onCopyHighlight(selectedIndex);
			key.preventDefault();
		},
		[items.length, onCopyHighlight, selectedIndex]
	);

	useKeyboard(handleCopyKey);

	const layoutItems = useMemo<LayoutItem[]>(() => {
		return items.map((item: GroundedStatement) => {
			const statementLines = wrapText(item.statement, statementWidth);

			const quoteText = (item.source.quote ?? "").trim();
			const quoteLinesAll = wrapText(quoteText, quoteWidth);
			const quoteLines = quoteLinesAll.slice(0, 4);
			if (quoteLinesAll.length > 4) {
				const lastLine = quoteLines[3] ?? "";
				quoteLines[3] = truncateText(lastLine, quoteWidth - 3);
			}

			const textFragment = textFragmentDisplayText(item.source.textFragment);

			let sourceDomain = "";
			try {
				sourceDomain = new URL(item.source.url).hostname;
			} catch {
				sourceDomain = truncateText(item.source.url, 40);
			}

			let h = ITEM_PADDING_TOP;
			h += statementLines.length;

			if (quoteLines.length > 0) {
				h += MARGIN_QUOTE;
				h += quoteLines.length;
			}

			h += MARGIN_SOURCE + SOURCE_LINE_HEIGHT;
			h += ITEM_PADDING_BOTTOM;

			return {
				item,
				statementLines,
				quoteLines,
				textFragment,
				sourceDomain,
				height: h,
			};
		});
	}, [items, statementWidth, quoteWidth]);

	useEffect(() => {
		const scrollbox = scrollRef.current;
		if (!scrollbox || layoutItems.length === 0) return;

		const viewportHeight = scrollbox.viewport?.height ?? 0;
		if (viewportHeight <= 0) return;

		const selectedLayout = layoutItems[selectedIndex];
		if (!selectedLayout) return;

		let itemTop = 0;
		for (let i = 0; i < selectedIndex; i++) {
			const layout = layoutItems[i];
			if (layout) {
				itemTop += layout.height + ITEM_MARGIN_BOTTOM;
			}
		}
		const itemBottom = itemTop + selectedLayout.height;

		const currentScrollTop = scrollbox.scrollTop;
		const currentScrollBottom = currentScrollTop + viewportHeight;
		const maxScrollTop = Math.max(0, scrollbox.scrollHeight - viewportHeight);

		let nextScrollTop = currentScrollTop;

		if (itemTop < currentScrollTop) {
			nextScrollTop = itemTop;
		} else if (itemBottom > currentScrollBottom) {
			nextScrollTop = itemBottom - viewportHeight;
		}

		nextScrollTop = Math.max(0, Math.min(nextScrollTop, maxScrollTop));
		if (nextScrollTop !== currentScrollTop) {
			scrollbox.scrollTop = nextScrollTop;
		}
	}, [selectedIndex, layoutItems]);

	useEffect(() => {
		onSelectedIndexChange?.(selectedIndex);
	}, [onSelectedIndexChange, selectedIndex]);

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
				paddingLeft={3}
				paddingRight={3}
				paddingTop={1}
				paddingBottom={1}
				width={menuWidth}
				maxHeight="85%"
			>
				<box marginBottom={1} flexDirection="row" width="100%">
					<text>
						<strong>
							<span fg={COLORS.DAEMON_LABEL}>[ GROUNDING ]</span>
						</strong>
						{totalMaps > 1 && <span fg={COLORS.REASONING_DIM}>{"  "}</span>}
						{totalMaps > 1 && <span fg={COLORS.TYPING_PROMPT}>◀ </span>}
						{totalMaps > 1 && (
							<strong>
								<span fg={COLORS.TYPING_PROMPT}>
									{mapPosition}/{totalMaps}
								</span>
							</strong>
						)}
						{totalMaps > 1 && <span fg={COLORS.TYPING_PROMPT}> ▶</span>}
						{activeMap && <span fg={COLORS.REASONING_DIM}>{"  "}</span>}
						{activeMap && (
							<strong>
								<span fg={COLORS.DAEMON_TEXT}>
									{items.length} source{items.length !== 1 ? "s" : ""}
								</span>
							</strong>
						)}
					</text>
					<box flexGrow={1} />
					<text>
						<span fg={COLORS.USER_LABEL}>
							{totalMaps > 1 && (
								<>
									<span fg={COLORS.DAEMON_LABEL}>←/→</span>
									<span> switch · </span>
								</>
							)}
							<span fg={COLORS.DAEMON_LABEL}>ENTER</span>
							<span> open · </span>
							<span fg={COLORS.DAEMON_LABEL}>C</span>
							<span> copy · </span>
							<span fg={COLORS.DAEMON_LABEL}>ESC</span>
							<span> close</span>
						</span>
					</text>
				</box>

				{activeMap &&
					totalMaps > 0 &&
					(() => {
						const daemonMsg = conversationHistory.find((m) => m.id === activeMap.messageId);
						const userMsg = daemonMsg ? findUserMessage(activeMap.messageId, conversationHistory) : undefined;
						return (
							<box flexDirection="column" marginBottom={1}>
								{userMsg && (
									<box
										marginBottom={0}
										backgroundColor={COLORS.USER_BG}
										paddingLeft={1}
										paddingRight={1}
										flexDirection="row"
										alignSelf="flex-start"
									>
										<box width={9}>
											<text>
												<strong>
													<span fg={COLORS.USER_LABEL}>MESSAGE</span>
												</strong>
											</text>
										</box>
										<text>
											<span fg={COLORS.REASONING_DIM}>│ </span>
											<span fg={COLORS.USER_TEXT}>{truncateText(messageContent(userMsg), 80)}</span>
										</text>
									</box>
								)}
								{daemonMsg && (
									<box
										marginTop={userMsg ? 0 : 0}
										backgroundColor={COLORS.MENU_SELECTED_BG}
										paddingLeft={1}
										paddingRight={1}
										flexDirection="row"
										alignSelf="flex-start"
									>
										<box width={9}>
											<text>
												<strong>
													<span fg={COLORS.DAEMON_LABEL}>RESPONSE</span>
												</strong>
											</text>
										</box>
										<text>
											<span fg={COLORS.REASONING_DIM}>│ </span>
											<span fg={COLORS.DAEMON_TEXT}>{truncateText(messageContent(daemonMsg), 80)}</span>
										</text>
									</box>
								)}
							</box>
						);
					})()}

				{items.length === 0 ? (
					<box height={3} justifyContent="center" alignItems="center">
						<text>
							<span fg={COLORS.USER_TEXT}>No grounded statements recorded.</span>
						</text>
					</box>
				) : (
					<scrollbox
						ref={scrollRef}
						flexGrow={1}
						flexShrink={1}
						focused={false}
						scrollY={true}
						scrollX={false}
					>
						<box flexDirection="column" paddingBottom={1}>
							{layoutItems.map((layout, idx) => {
								const isSelected = idx === selectedIndex;
								const { item, statementLines, quoteLines, textFragment, sourceDomain } = layout;

								return (
									<box
										key={item.id}
										flexDirection="column"
										padding={1}
										backgroundColor={isSelected ? COLORS.MENU_SELECTED_BG : undefined}
										marginBottom={1}
									>
										{statementLines.map((line, i) => (
											<box key={`s-${i}`} flexDirection="row">
												<box width={STATEMENT_MARKER_WIDTH}>
													<text>
														<span fg={isSelected ? COLORS.DAEMON_TEXT : COLORS.USER_TEXT}>
															{i === 0 && isSelected ? "▶" : ""}
														</span>
													</text>
												</box>
												<text width={statementWidth}>
													<span fg={isSelected ? COLORS.DAEMON_TEXT : COLORS.USER_TEXT}>{line}</span>
												</text>
											</box>
										))}

										{quoteLines.length > 0 && (
											<box marginTop={1} marginLeft={QUOTE_INDENT} flexDirection="column">
												{quoteLines.map((line, i) => (
													<box key={`q-${i}`} flexDirection="row">
														<box width={QUOTE_MARKER_WIDTH}>
															<text>
																<span fg={COLORS.REASONING_DIM}>{i === 0 ? "❝" : ""}</span>
															</text>
														</box>
														<text width={quoteWidth}>
															<span fg={COLORS.REASONING_DIM}>{line}</span>
														</text>
														<box width={QUOTE_SUFFIX_WIDTH}>
															<text>
																<span fg={COLORS.REASONING_DIM}>
																	{i === quoteLines.length - 1 ? " ❞" : ""}
																</span>
															</text>
														</box>
													</box>
												))}
											</box>
										)}

										<box marginTop={1} marginLeft={2}>
											<text>
												<span fg={isSelected ? COLORS.DAEMON_LABEL : COLORS.REASONING_DIM}>
													[{idx + 1}] ↗ {sourceDomain}
												</span>
												{textFragment && (
													<span fg={COLORS.REASONING_DIM}>
														{" · highlight: "}
														{truncateText(textFragment, 70)}
													</span>
												)}
												{item.source.title && (
													<span fg={COLORS.REASONING_DIM}>
														{" · "}
														{truncateText(item.source.title, 50)}
													</span>
												)}
											</text>
										</box>
									</box>
								);
							})}
						</box>
					</scrollbox>
				)}
			</box>
		</box>
	);
}

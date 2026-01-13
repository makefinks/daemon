import type { ScrollBoxRenderable } from "@opentui/core";
import { useRenderer } from "@opentui/react";
import { useEffect, useMemo, useRef } from "react";
import { useMenuKeyboard } from "../hooks/use-menu-keyboard";
import type { GroundedStatement, GroundingMap } from "../types";
import { COLORS } from "../ui/constants";

const QUOTE_INDENT = 2;

const ITEM_PADDING_TOP = 1;
const ITEM_PADDING_BOTTOM = 1;
const ITEM_MARGIN_BOTTOM = 1;
const MARGIN_QUOTE = 1;
const MARGIN_SOURCE = 1;
const SOURCE_LINE_HEIGHT = 1;
const DEBUG_FRAGMENTS =
	process.env.DAEMON_DEBUG_FRAGMENTS === "true" || process.env.DAEMON_DEBUG_FRAGMENTS === "1";

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

interface LayoutItem {
	item: GroundedStatement;
	statementLines: string[];
	quoteLines: string[];
	fragmentLines: string[];
	sourceDomain: string;
	height: number;
}

interface GroundingMenuProps {
	groundingMap: GroundingMap;
	initialIndex?: number;
	onClose: () => void;
	onSelect: (index: number) => void;
	onSelectedIndexChange?: (index: number) => void;
}

export function GroundingMenu({
	groundingMap,
	initialIndex = 0,
	onClose,
	onSelect,
	onSelectedIndexChange,
}: GroundingMenuProps) {
	const items = groundingMap.items;
	const scrollRef = useRef<ScrollBoxRenderable | null>(null);
	const renderer = useRenderer();

	const menuWidth = useMemo(() => {
		return Math.max(80, Math.min(300, Math.floor(renderer.terminalWidth * 0.85)));
	}, [renderer.terminalWidth]);

	const { contentWidth, statementWidth, quoteWidth } = useMemo(() => {
		const cw = menuWidth - 6;
		return {
			contentWidth: cw,
			statementWidth: cw - 2,
			quoteWidth: cw - QUOTE_INDENT - 4,
		};
	}, [menuWidth]);

	const { selectedIndex } = useMenuKeyboard({
		itemCount: items.length,
		initialIndex,
		onClose,
		onSelect,
	});

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

			let fragmentLines: string[] = [];
			if (DEBUG_FRAGMENTS && item.source.textFragment) {
				fragmentLines = wrapText(`[Fragment] ${item.source.textFragment}`, quoteWidth);
			}

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

			if (fragmentLines.length > 0) {
				h += MARGIN_QUOTE;
				h += fragmentLines.length;
			}

			h += MARGIN_SOURCE + SOURCE_LINE_HEIGHT;
			h += ITEM_PADDING_BOTTOM;

			return {
				item,
				statementLines,
				quoteLines,
				fragmentLines,
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
						<span fg={COLORS.DAEMON_LABEL}>[ GROUNDING ]</span>
						<span fg={COLORS.REASONING_DIM}>
							{" "}
							— {items.length} source{items.length !== 1 ? "s" : ""}
						</span>
					</text>
					<box flexGrow={1} />
					<text>
						<span fg={COLORS.USER_LABEL}>
							<span fg={COLORS.DAEMON_LABEL}>ENTER</span> open · <span fg={COLORS.DAEMON_LABEL}>ESC</span>{" "}
							close
						</span>
					</text>
				</box>

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
								const { item, statementLines, quoteLines, fragmentLines, sourceDomain } = layout;

								return (
									<box
										key={item.id}
										flexDirection="column"
										padding={1}
										backgroundColor={isSelected ? COLORS.MENU_SELECTED_BG : undefined}
										marginBottom={1}
									>
										{statementLines.map((line, i) => (
											<text key={`s-${i}`}>
												<span fg={isSelected ? COLORS.DAEMON_TEXT : COLORS.USER_TEXT}>
													{i === 0 && isSelected ? "▶ " : "  "}
													{line}
												</span>
											</text>
										))}

										{quoteLines.length > 0 && (
											<box marginTop={1} marginLeft={QUOTE_INDENT} flexDirection="column">
												{quoteLines.map((line, i) => (
													<text key={`q-${i}`}>
														<span fg={COLORS.REASONING_DIM}>
															{i === 0 ? "❝ " : "  "}
															{line}
															{i === quoteLines.length - 1 ? " ❞" : ""}
														</span>
													</text>
												))}
											</box>
										)}

										{fragmentLines.length > 0 && (
											<box marginTop={1} marginLeft={QUOTE_INDENT} flexDirection="column">
												{fragmentLines.map((line, i) => (
													<text key={`f-${i}`}>
														<span fg={COLORS.DAEMON_ERROR}>{line}</span>
													</text>
												))}
											</box>
										)}

										<box marginTop={1} marginLeft={2}>
											<text>
												<span fg={isSelected ? COLORS.DAEMON_LABEL : COLORS.REASONING_DIM}>
													[{idx + 1}] ↗ {sourceDomain}
												</span>
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

import type { ScrollBoxRenderable, TextareaRenderable } from "@opentui/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { useKeyboard } from "@opentui/react";
import type { SessionInfo } from "../types";
import { useMenuKeyboard } from "../hooks/use-menu-keyboard";
import { COLORS } from "../ui/constants";

export interface SessionMenuItem extends SessionInfo {
	isNew?: boolean;
}

interface SessionMenuProps {
	items: SessionMenuItem[];
	currentSessionId: string | null;
	onClose: () => void;
	onSelect: (index: number) => void;
	onDelete: (index: number) => void;
}

const SESSION_ITEM_HEIGHT = 2;
const MAX_SCROLLBOX_HEIGHT = 20;

function formatTimestamp(value: string): string {
	if (!value) return "";
	return value.replace("T", " ").slice(0, 16);
}

export function SessionMenu({ items, currentSessionId, onClose, onSelect, onDelete }: SessionMenuProps) {
	const [searchQuery, setSearchQuery] = useState("");
	const [isSearchFocused, setIsSearchFocused] = useState(false);
	const searchInputRef = useRef<TextareaRenderable | null>(null);

	const filteredItems = useMemo(() => {
		if (!searchQuery) return items;
		const lowerQuery = searchQuery.toLowerCase();
		return items.filter(
			(item) => item.title.toLowerCase().includes(lowerQuery) || item.id.toLowerCase().includes(lowerQuery)
		);
	}, [items, searchQuery]);

	const handleSelect = (filteredIndex: number) => {
		const item = filteredItems[filteredIndex];
		if (!item) return;
		const originalIndex = items.indexOf(item);
		if (originalIndex >= 0) {
			onSelect(originalIndex);
		}
	};

	const handleDelete = (filteredIndex: number) => {
		const item = filteredItems[filteredIndex];
		if (!item || item.isNew) return;
		const originalIndex = items.indexOf(item);
		if (originalIndex >= 0) {
			onDelete(originalIndex);
		}
	};

	const initialIndex = useMemo(() => {
		if (filteredItems.length === 0) return 0;
		if (!currentSessionId) return 0;
		const idx = filteredItems.findIndex((item) => item.id === currentSessionId);
		return idx >= 0 ? idx : 0;
	}, [filteredItems, currentSessionId]);

	const { selectedIndex } = useMenuKeyboard({
		itemCount: filteredItems.length,
		initialIndex,
		onClose,
		onSelect: handleSelect,
		enableViKeys: !isSearchFocused,
		ignoreEscape: isSearchFocused,
	});

	useKeyboard((key) => {
		if (key.eventType !== "press") return;

		if (!isSearchFocused && (key.name === "x" || key.sequence?.toLowerCase() === "x")) {
			handleDelete(selectedIndex);
			key.preventDefault();
			return;
		}

		if ((key.name === "tab" && key.shift) || (!isSearchFocused && key.name === "/")) {
			setIsSearchFocused(true);
			searchInputRef.current?.focus();
			key.preventDefault();
		}
	});

	const scrollRef = useRef<ScrollBoxRenderable | null>(null);
	const scrollboxHeight = Math.min(
		MAX_SCROLLBOX_HEIGHT,
		Math.max(SESSION_ITEM_HEIGHT, filteredItems.length * SESSION_ITEM_HEIGHT)
	);

	useEffect(() => {
		const scrollbox = scrollRef.current;
		if (!scrollbox) return;
		const viewportHeight = scrollbox.viewport?.height ?? 0;
		if (viewportHeight <= 0) return;

		const maxScrollTop = Math.max(0, scrollbox.scrollHeight - viewportHeight);
		const itemTop = selectedIndex * SESSION_ITEM_HEIGHT;
		const itemBottom = itemTop + SESSION_ITEM_HEIGHT;
		const currentTop = scrollbox.scrollTop;
		const currentBottom = currentTop + viewportHeight;
		let nextTop = currentTop;

		if (itemTop < currentTop) {
			nextTop = itemTop;
		} else if (itemBottom > currentBottom) {
			nextTop = itemBottom - viewportHeight;
		}

		nextTop = Math.max(0, Math.min(nextTop, maxScrollTop));
		if (nextTop !== currentTop) {
			scrollbox.scrollTop = nextTop;
		}
	}, [filteredItems.length, selectedIndex]);

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
				alignItems="flex-start"
				backgroundColor={COLORS.MENU_BG}
				borderStyle="single"
				borderColor={COLORS.MENU_BORDER}
				paddingLeft={2}
				paddingRight={2}
				paddingTop={1}
				paddingBottom={1}
				width="70%"
				minWidth={56}
				maxWidth={130}
			>
				<box marginBottom={1}>
					<text>
						<span fg={COLORS.DAEMON_LABEL}>[ SESSIONS ]</span>
					</text>
				</box>

				<box marginBottom={1}>
					<text>
						<span fg={COLORS.REASONING_DIM}>
							↑/↓ j/k navigate · ENTER load · X delete · / search · ESC close
						</span>
					</text>
				</box>

				<box marginBottom={0}>
					<text>
						<span fg={COLORS.USER_LABEL}>— SEARCH —</span>
					</text>
				</box>

				<box
					marginBottom={1}
					marginTop={0}
					width="100%"
					height={1}
					flexDirection="row"
					alignItems="center"
					paddingLeft={1}
					backgroundColor={isSearchFocused ? COLORS.MENU_SELECTED_BG : COLORS.MENU_BG}
				>
					<box width={2}>
						<text>
							<span fg={isSearchFocused ? COLORS.TYPING_PROMPT : COLORS.REASONING_DIM}>/ </span>
						</text>
					</box>
					<box flexGrow={1} height={1}>
						<textarea
							ref={searchInputRef}
							focused={isSearchFocused}
							width="100%"
							height={1}
							placeholder="Type to filter... (/ or Shift+Tab)"
							style={{
								backgroundColor: "transparent",
								focusedBackgroundColor: "transparent",
								textColor: COLORS.MENU_TEXT,
								focusedTextColor: COLORS.TYPING_PROMPT,
								cursorColor: COLORS.TYPING_PROMPT,
							}}
							onContentChange={() => {
								const text = searchInputRef.current?.plainText ?? "";
								const cleaned = text.replace(/[\r\n]/g, "");
								if (cleaned !== text) {
									searchInputRef.current?.setText(cleaned);
								}
								setSearchQuery(cleaned);
							}}
							onKeyDown={(key) => {
								if (key.eventType === "press") {
									if (key.name === "escape") {
										setIsSearchFocused(false);
										key.preventDefault();
									}
									if (key.name === "return") {
										key.preventDefault();
									}
								}
							}}
						/>
					</box>
				</box>

				<box marginBottom={0}>
					<text>
						<span fg={COLORS.USER_LABEL}>— SESSIONS —</span>
					</text>
				</box>

				{filteredItems.length === 0 ? (
					<box marginTop={1} paddingLeft={1}>
						<text>
							<span fg={COLORS.REASONING_DIM}>No sessions found</span>
						</text>
					</box>
				) : (
					<scrollbox
						ref={scrollRef}
						height={scrollboxHeight}
						alignSelf="flex-start"
						focused={false}
						scrollY={true}
						scrollX={false}
						style={{
							rootOptions: { backgroundColor: COLORS.MENU_BG },
							wrapperOptions: { backgroundColor: COLORS.MENU_BG },
							viewportOptions: { backgroundColor: COLORS.MENU_BG },
							contentOptions: { backgroundColor: COLORS.MENU_BG },
						}}
					>
						<box flexDirection="column">
							{filteredItems.map((item, idx) => {
								const isSelected = idx === selectedIndex;
								const isCurrent = !item.isNew && item.id === currentSessionId;

								const labelColor = item.isNew
									? isSelected
										? COLORS.DAEMON_TEXT
										: COLORS.DAEMON_TEXT
									: isSelected
										? COLORS.DAEMON_LABEL
										: COLORS.MENU_TEXT;

								const currentIndicatorColor = COLORS.TYPING_PROMPT;
								const detailColor = COLORS.REASONING_DIM;
								const detail = item.isNew
									? "Start a fresh conversation"
									: `Updated ${formatTimestamp(item.updatedAt)}`;

								return (
									<box
										key={item.id}
										backgroundColor={isSelected ? COLORS.MENU_SELECTED_BG : COLORS.MENU_BG}
										paddingLeft={1}
										paddingRight={1}
										flexDirection="column"
									>
										<box>
											<text>
												<span fg={labelColor}>
													{isSelected ? "▶ " : "  "}
													{item.isNew ? "+ NEW SESSION" : item.title}
												</span>
												{isCurrent && <span fg={currentIndicatorColor}> ●</span>}
											</text>
										</box>
										<box marginLeft={4}>
											<text>
												<span fg={detailColor}>{detail}</span>
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

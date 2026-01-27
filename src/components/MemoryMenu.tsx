import type { ScrollBoxRenderable, TextareaRenderable } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getMemoryManager, isMemoryAvailable } from "../ai/memory";
import { useMenuKeyboard } from "../hooks/use-menu-keyboard";
import type { MemoryEntry } from "../types";
import { COLORS } from "../ui/constants";

interface MemoryMenuProps {
	onClose: () => void;
}

const MEMORY_ITEM_HEIGHT = 2;
const MAX_SCROLLBOX_HEIGHT = 16;

function formatTimestamp(value: string | undefined): string {
	if (!value) return "";
	return value.replace("T", " ").slice(0, 16);
}

function truncateText(text: string, maxLen: number): string {
	if (text.length <= maxLen) return text;
	if (maxLen <= 3) return text.slice(0, Math.max(0, maxLen));
	return text.slice(0, Math.max(0, maxLen - 3)) + "...";
}

export function MemoryMenu({ onClose }: MemoryMenuProps) {
	const [searchQuery, setSearchQuery] = useState("");
	const [isSearchFocused, setIsSearchFocused] = useState(false);
	const [memories, setMemories] = useState<MemoryEntry[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const searchInputRef = useRef<TextareaRenderable | null>(null);
	const scrollRef = useRef<ScrollBoxRenderable | null>(null);

	// Load all memories on mount
	useEffect(() => {
		let cancelled = false;

		const loadMemories = async () => {
			if (!isMemoryAvailable()) {
				setError("Memory system not available (requires OPENAI_API_KEY and OPENROUTER_API_KEY)");
				setIsLoading(false);
				return;
			}

			try {
				const manager = getMemoryManager();
				await manager.initialize();

				if (!manager.isAvailable) {
					setError("Memory system not available (check API keys and configuration)");
					setIsLoading(false);
					return;
				}

				const allMemories = await manager.getAll();
				if (!cancelled) {
					setMemories(allMemories);
					setIsLoading(false);
				}
			} catch (err) {
				if (!cancelled) {
					setError(err instanceof Error ? err.message : String(err));
					setIsLoading(false);
				}
			}
		};

		void loadMemories();
		return () => {
			cancelled = true;
		};
	}, []);

	const filteredMemories = useMemo(() => {
		const query = searchQuery.trim().toLowerCase();
		if (!query) return memories;
		return memories.filter((memory) => memory.memory.toLowerCase().includes(query));
	}, [memories, searchQuery]);

	const handleDelete = useCallback(
		async (index: number) => {
			const memory = filteredMemories[index];
			if (!memory) return;

			try {
				const manager = getMemoryManager();
				const success = await manager.delete(memory.id);
				if (success) {
					setMemories((prev) => prev.filter((entry) => entry.id !== memory.id));
				}
			} catch {
				// Silently fail delete
			}
		},
		[filteredMemories]
	);

	const { selectedIndex } = useMenuKeyboard({
		itemCount: filteredMemories.length,
		onClose,
		onSelect: () => {}, // No action on select, just navigation
		enableViKeys: !isSearchFocused,
		ignoreEscape: isSearchFocused,
		closeOnSelect: false,
	});

	useKeyboard((key) => {
		if (key.eventType !== "press") return;

		// X to delete selected memory
		if (!isSearchFocused && (key.name === "x" || key.sequence?.toLowerCase() === "x")) {
			void handleDelete(selectedIndex);
			key.preventDefault();
			return;
		}

		// / or Shift+Tab to focus search
		if ((key.name === "tab" && key.shift) || (!isSearchFocused && key.name === "/")) {
			setIsSearchFocused(true);
			searchInputRef.current?.focus();
			key.preventDefault();
		}
	});

	const scrollboxHeight = Math.min(
		MAX_SCROLLBOX_HEIGHT,
		Math.max(MEMORY_ITEM_HEIGHT, filteredMemories.length * MEMORY_ITEM_HEIGHT)
	);

	// Auto-scroll to selected item
	useEffect(() => {
		const scrollbox = scrollRef.current;
		if (!scrollbox) return;
		const viewportHeight = scrollbox.viewport?.height ?? 0;
		if (viewportHeight <= 0) return;

		const maxScrollTop = Math.max(0, scrollbox.scrollHeight - viewportHeight);
		const itemTop = selectedIndex * MEMORY_ITEM_HEIGHT;
		const itemBottom = itemTop + MEMORY_ITEM_HEIGHT;
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
	}, [filteredMemories.length, selectedIndex]);

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
				width="80%"
				minWidth={60}
				maxWidth={140}
			>
				<box marginBottom={1}>
					<text>
						<span fg={COLORS.DAEMON_LABEL}>[ MEMORIES ]</span>
					</text>
				</box>

				<box marginBottom={1}>
					<text>
						<span fg={COLORS.REASONING_DIM}>↑/↓ j/k navigate · X delete · / search · ESC close</span>
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
							placeholder="Type to search memories... (/ or Shift+Tab)"
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
						<span fg={COLORS.USER_LABEL}>— MEMORIES ({filteredMemories.length}) —</span>
					</text>
				</box>

				{isLoading ? (
					<box marginTop={1} paddingLeft={1}>
						<text>
							<span fg={COLORS.REASONING_DIM}>Loading memories...</span>
						</text>
					</box>
				) : error ? (
					<box marginTop={1} paddingLeft={1}>
						<text>
							<span fg={COLORS.STATUS_FAILED}>{error}</span>
						</text>
					</box>
				) : filteredMemories.length === 0 ? (
					<box marginTop={1} paddingLeft={1}>
						<text>
							<span fg={COLORS.REASONING_DIM}>
								{searchQuery ? "No memories match your search" : "No memories stored yet"}
							</span>
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
						<box flexDirection="column" width="100%">
							{filteredMemories.map((memory, idx) => {
								const isSelected = idx === selectedIndex;
								const labelColor = isSelected ? COLORS.DAEMON_LABEL : COLORS.MENU_TEXT;
								const detailColor = COLORS.REASONING_DIM;
								const scoreText = memory.score !== undefined ? ` (${(memory.score * 100).toFixed(0)}%)` : "";
								const dateText = formatTimestamp(memory.createdAt || memory.updatedAt);

								return (
									<box
										key={memory.id}
										backgroundColor={isSelected ? COLORS.MENU_SELECTED_BG : COLORS.MENU_BG}
										paddingLeft={1}
										paddingRight={1}
										flexDirection="column"
										width="100%"
									>
										<box>
											<text>
												<span fg={labelColor}>
													{isSelected ? "▶ " : "  "}
													{truncateText(memory.memory, 80)}
												</span>
												{scoreText && <span fg={COLORS.STATUS_COMPLETED}>{scoreText}</span>}
											</text>
										</box>
										<box marginLeft={4}>
											<text>
												<span fg={detailColor}>
													{dateText}
													{memory.metadata?.category ? ` · ${memory.metadata.category}` : ""}
												</span>
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

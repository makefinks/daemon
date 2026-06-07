import type { ScrollBoxRenderable, TextareaRenderable } from "@opentui/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { useKeyboard } from "@opentui/react";
import type { SessionInfo } from "../types";
import type { SessionRuntimeStatus } from "../state/session-runtime-store";
import { useMenuKeyboard } from "../hooks/use-menu-keyboard";
import { formatCost } from "../utils/model-metadata";
import { COLORS } from "../ui/constants";

export interface SessionMenuItem extends SessionInfo {
	isNew?: boolean;
	runtimeStatus?: SessionRuntimeStatus;
}

interface SessionMenuProps {
	items: SessionMenuItem[];
	currentSessionId: string | null;
	onClose: () => void;
	onSelect: (index: number) => void;
	onDelete: (index: number) => void;
}

const SESSION_ITEM_HEIGHT = 1;
const MAX_SCROLLBOX_HEIGHT = 20;

function formatTimestamp(value: string): string {
	if (!value) return "";
	return value.replace("T", " ").slice(0, 16);
}

function formatRuntimeDuration(startedAt: number | null | undefined): string {
	if (!startedAt) return "0s";
	const totalSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	if (minutes <= 0) return `${seconds}s`;
	return `${minutes}m${seconds.toString().padStart(2, "0")}s`;
}

function formatTokenCount(totalTokens: number | undefined): string {
	const value = Math.max(0, totalTokens ?? 0);
	if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
	if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
	return String(value);
}

export function SessionMenu({ items, currentSessionId, onClose, onSelect, onDelete }: SessionMenuProps) {
	const [searchQuery, setSearchQuery] = useState("");
	const [isSearchFocused, setIsSearchFocused] = useState(false);
	const [, setRuntimeTick] = useState(0);
	const searchInputRef = useRef<TextareaRenderable | null>(null);

	const filteredItems = useMemo(() => {
		if (!searchQuery) return items;
		const lowerQuery = searchQuery.toLowerCase();
		return items.filter(
			(item) => item.title.toLowerCase().includes(lowerQuery) || item.id.toLowerCase().includes(lowerQuery)
		);
	}, [items, searchQuery]);

	useEffect(() => {
		if (
			!filteredItems.some(
				(item) => item.runtimeStatus?.isRunning || item.runtimeStatus?.hasRunningBackgroundJobs
			)
		)
			return;
		const interval = setInterval(() => setRuntimeTick((tick) => tick + 1), 1000);
		return () => clearInterval(interval);
	}, [filteredItems]);

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
	const nameColumnWidth = "38%";
	const statusColumnWidth = "16%";
	const costColumnWidth = "12%";
	const tokensColumnWidth = "12%";
	const updatedColumnWidth = "22%";
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
					<box flexDirection="row" width="100%" paddingLeft={1} paddingRight={1}>
						<box width={nameColumnWidth}>
							<text>
								<span fg={COLORS.USER_LABEL}>NAME</span>
							</text>
						</box>
						<box width={statusColumnWidth}>
							<text>
								<span fg={COLORS.USER_LABEL}>STATUS</span>
							</text>
						</box>
						<box width={tokensColumnWidth} justifyContent="flex-end">
							<text>
								<span fg={COLORS.USER_LABEL}>TOKENS</span>
							</text>
						</box>
						<box width={costColumnWidth} justifyContent="flex-end">
							<text>
								<span fg={COLORS.USER_LABEL}>COST</span>
							</text>
						</box>
						<box width={updatedColumnWidth} justifyContent="flex-end">
							<text>
								<span fg={COLORS.USER_LABEL}>UPDATED AT</span>
							</text>
						</box>
					</box>
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
								const runtimeStatus = item.runtimeStatus;
								const isAwaitingApproval = runtimeStatus?.isAwaitingApproval ?? false;
								const isRunning = (runtimeStatus?.isRunning ?? false) && !isAwaitingApproval;
								const hasBgJobs =
									(runtimeStatus?.hasRunningBackgroundJobs ?? false) && !isRunning && !isAwaitingApproval;
								const runningLabel = isRunning
									? `RUNNING (${formatRuntimeDuration(runtimeStatus?.startedAt)})`
									: "";
								const approvalLabel = isAwaitingApproval
									? `APPROVAL${runtimeStatus?.pendingApprovalCount ? ` (${runtimeStatus.pendingApprovalCount})` : ""}`
									: "";
								const bgJobsLabel = hasBgJobs ? "BG JOBS" : "";
								const statusColor = isAwaitingApproval
									? "#fb923c"
									: isRunning
										? COLORS.STATUS_RUNNING
										: hasBgJobs
											? COLORS.TOOLS
											: COLORS.REASONING_DIM;
								const detailColor = COLORS.REASONING_DIM;
								const detail = item.isNew ? "Start fresh" : formatTimestamp(item.updatedAt);
								const tokenCount = runtimeStatus?.totalTokens ?? item.totalTokens;
								const costValue = runtimeStatus?.cost ?? item.cost;

								return (
									<box
										key={item.id}
										backgroundColor={isSelected ? COLORS.MENU_SELECTED_BG : COLORS.MENU_BG}
										paddingLeft={1}
										paddingRight={1}
										flexDirection="row"
										alignItems="center"
										height={1}
									>
										<box width={nameColumnWidth}>
											<text>
												<span fg={labelColor}>
													{isSelected ? "▶ " : "  "}
													{item.isNew ? "+ NEW SESSION" : item.title}
												</span>
												{isCurrent && <span fg={currentIndicatorColor}> ●</span>}
											</text>
										</box>
										<box width={statusColumnWidth} height={1} flexDirection="row" alignItems="center">
											{runningLabel ? (
												<box flexDirection="row" alignItems="center">
													<spinner name="dots" color={statusColor} />
													<text marginLeft={1}>
														<span fg={statusColor}>{runningLabel}</span>
													</text>
												</box>
											) : approvalLabel ? (
												<text>
													<span fg={statusColor}>{approvalLabel.trim()}</span>
												</text>
											) : bgJobsLabel ? (
												<box flexDirection="row" alignItems="center">
													<spinner name="dots" color={statusColor} />
													<text marginLeft={1}>
														<span fg={statusColor}>{bgJobsLabel}</span>
													</text>
												</box>
											) : (
												<text>
													<span fg={statusColor}>IDLE</span>
												</text>
											)}
										</box>
										<box width={tokensColumnWidth} justifyContent="flex-end">
											<text>
												<span fg={detailColor}>{formatTokenCount(tokenCount)}</span>
											</text>
										</box>
										<box width={costColumnWidth} justifyContent="flex-end">
											<text>
												<span fg={detailColor}>{costValue != null ? formatCost(costValue) : "—"}</span>
											</text>
										</box>
										<box width={updatedColumnWidth} justifyContent="flex-end">
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

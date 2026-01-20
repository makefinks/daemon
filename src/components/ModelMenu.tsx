import type { ScrollBoxRenderable, TextareaRenderable } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMenuKeyboard } from "../hooks/use-menu-keyboard";
import type { ModelOption } from "../types";
import { COLORS } from "../ui/constants";
import { formatContextWindowK, formatPrice } from "../utils/formatters";

const COL_WIDTH = {
	CTX: 6,
	IN: 10,
	OUT: 10,
	CACHE: 6,
} as const;

const ALL_MODEL_ITEM_HEIGHT = 1;
const MAX_ALL_SCROLLBOX_HEIGHT = 20;
const MIN_ALL_MODEL_QUERY_LENGTH = 3;

interface ModelMenuProps {
	curatedModels: ModelOption[];
	allModels: ModelOption[];
	allModelsLoading: boolean;
	allModelsUpdatedAt: number | null;
	currentModelId: string;
	onClose: () => void;
	onSelect: (model: ModelOption) => void;
	onRefreshAllModels: () => void;
}

function formatUpdatedAt(timestamp: number | null): string {
	if (!timestamp) return "";
	return new Date(timestamp).toISOString().replace("T", " ").slice(0, 16);
}

export function ModelMenu({
	curatedModels,
	allModels,
	allModelsLoading,
	allModelsUpdatedAt,
	currentModelId,
	onClose,
	onSelect,
	onRefreshAllModels,
}: ModelMenuProps) {
	const [searchQuery, setSearchQuery] = useState("");
	const [isSearchFocused, setIsSearchFocused] = useState(false);
	const searchInputRef = useRef<TextareaRenderable | null>(null);

	const sortedCurated = useMemo(() => {
		return [...curatedModels].sort((a, b) => {
			const priceA = a.pricing ? a.pricing.prompt + a.pricing.completion : Number.MAX_SAFE_INTEGER;
			const priceB = b.pricing ? b.pricing.prompt + b.pricing.completion : Number.MAX_SAFE_INTEGER;
			if (priceA !== priceB) return priceA - priceB;
			return a.name.localeCompare(b.name);
		});
	}, [curatedModels]);

	const curatedIdSet = useMemo(() => new Set(sortedCurated.map((model) => model.id)), [sortedCurated]);

	const savedModel = useMemo(() => {
		if (!currentModelId) return null;
		if (curatedIdSet.has(currentModelId)) return null;
		const match = allModels.find((model) => model.id === currentModelId);
		return match ?? { id: currentModelId, name: currentModelId };
	}, [allModels, curatedIdSet, currentModelId]);

	const savedModels = useMemo(() => (savedModel ? [savedModel] : []), [savedModel]);

	const allModelsWithFallback = useMemo(() => {
		if (!currentModelId) return allModels;
		if (curatedIdSet.has(currentModelId)) return allModels;
		if (savedModel) return allModels;
		return [...allModels, { id: currentModelId, name: currentModelId }];
	}, [allModels, curatedIdSet, currentModelId, savedModel]);

	const filteredAllModels = useMemo(() => {
		const filtered = allModelsWithFallback.filter(
			(model) => !curatedIdSet.has(model.id) && model.id !== savedModel?.id
		);
		const query = searchQuery.trim().toLowerCase();
		if (query.length < MIN_ALL_MODEL_QUERY_LENGTH) {
			return [];
		}
		const matching = query
			? filtered.filter(
					(model) => model.name.toLowerCase().includes(query) || model.id.toLowerCase().includes(query)
				)
			: filtered;

		return matching.sort((a, b) => a.name.localeCompare(b.name));
	}, [allModelsWithFallback, curatedIdSet, savedModel?.id, searchQuery]);

	const totalItems = sortedCurated.length + savedModels.length + filteredAllModels.length;

	const initialIndex = useMemo(() => {
		if (totalItems === 0) return 0;
		const curatedIdx = sortedCurated.findIndex((model) => model.id === currentModelId);
		if (curatedIdx >= 0) return curatedIdx;
		const savedIdx = savedModels.findIndex((model) => model.id === currentModelId);
		if (savedIdx >= 0) return sortedCurated.length + savedIdx;
		const allIdx = filteredAllModels.findIndex((model) => model.id === currentModelId);
		if (allIdx >= 0) return sortedCurated.length + savedModels.length + allIdx;
		return 0;
	}, [sortedCurated, savedModels, filteredAllModels, currentModelId, totalItems]);

	const { selectedIndex } = useMenuKeyboard({
		itemCount: totalItems,
		initialIndex,
		onClose,
		onSelect: (selectedIdx) => {
			if (selectedIdx < sortedCurated.length) {
				const model = sortedCurated[selectedIdx];
				if (model) {
					onSelect(model);
				}
				return;
			}

			const afterCurated = selectedIdx - sortedCurated.length;
			if (afterCurated < savedModels.length) {
				const model = savedModels[afterCurated];
				if (model) {
					onSelect(model);
				}
				return;
			}

			const model = filteredAllModels[afterCurated - savedModels.length];
			if (model) {
				onSelect(model);
			}
		},
		enableViKeys: !isSearchFocused,
		ignoreEscape: isSearchFocused,
	});

	useKeyboard((key) => {
		if (key.eventType !== "press") return;

		if (!isSearchFocused && (key.name === "r" || key.sequence?.toLowerCase() === "r")) {
			onRefreshAllModels();
			key.preventDefault();
			return;
		}

		if ((key.name === "tab" && key.shift) || (!isSearchFocused && key.name === "/")) {
			setIsSearchFocused(true);
			searchInputRef.current?.focus();
			key.preventDefault();
		}
	});

	const allSelectedIndex = selectedIndex - sortedCurated.length - savedModels.length;
	const isAllSectionSelected = allSelectedIndex >= 0;

	const scrollRef = useRef<ScrollBoxRenderable | null>(null);
	const scrollboxHeight = Math.min(
		MAX_ALL_SCROLLBOX_HEIGHT,
		Math.max(ALL_MODEL_ITEM_HEIGHT, filteredAllModels.length * ALL_MODEL_ITEM_HEIGHT)
	);

	useEffect(() => {
		if (!isAllSectionSelected) return;
		const scrollbox = scrollRef.current;
		if (!scrollbox) return;
		const viewportHeight = scrollbox.viewport?.height ?? 0;
		if (viewportHeight <= 0) return;

		const maxScrollTop = Math.max(0, scrollbox.scrollHeight - viewportHeight);
		const itemTop = allSelectedIndex * ALL_MODEL_ITEM_HEIGHT;
		const itemBottom = itemTop + ALL_MODEL_ITEM_HEIGHT;
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
	}, [allSelectedIndex, filteredAllModels.length, isAllSectionSelected]);

	const updatedAtLabel = formatUpdatedAt(allModelsUpdatedAt);

	const renderModelRow = (model: ModelOption, isSelected: boolean, isCurrent: boolean) => {
		const pricing = model.pricing;
		const ctxText =
			typeof model.contextLength === "number" && model.contextLength > 0
				? formatContextWindowK(model.contextLength)
				: "--";

		const inText = pricing ? formatPrice(pricing.prompt) : "--";
		const outText = pricing ? formatPrice(pricing.completion) : "--";

		const supportsCaching = Boolean(model.supportsCaching);
		const cacheText = supportsCaching ? "✓" : "x";

		return (
			<box
				key={model.id}
				backgroundColor={isSelected ? COLORS.MENU_SELECTED_BG : COLORS.MENU_BG}
				paddingLeft={1}
				paddingRight={1}
				flexDirection="row"
				justifyContent="space-between"
			>
				<text>
					<span fg={isSelected ? COLORS.DAEMON_LABEL : COLORS.MENU_TEXT}>
						{isSelected ? "▶ " : "  "}
						{model.name}
						{isCurrent ? " ●" : ""}
					</span>
				</text>
				<text>
					<span fg={COLORS.MENU_TEXT}>{ctxText.padStart(COL_WIDTH.CTX)} </span>
					<span fg={COLORS.TYPING_PROMPT}>
						{inText.padStart(COL_WIDTH.IN)} {outText.padStart(COL_WIDTH.OUT)}{" "}
					</span>
					<span fg={supportsCaching ? COLORS.DAEMON_TEXT : COLORS.REASONING_DIM}>
						{cacheText.padStart(COL_WIDTH.CACHE)}
					</span>
				</text>
			</box>
		);
	};

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
				width="75%"
				minWidth={60}
				maxWidth={170}
			>
				<box marginBottom={1}>
					<text>
						<span fg={COLORS.DAEMON_LABEL}>[ MODEL SELECTION ]</span>
					</text>
				</box>
				<box marginBottom={1}>
					<text>
						<span fg={COLORS.USER_LABEL}>↑/↓ or j/k navigate · ENTER select · R refresh · ESC cancel</span>
					</text>
				</box>
				<box marginBottom={1}>
					<text>
						<span fg={COLORS.REASONING_DIM}>Shift+Tab or / search · Esc blur search</span>
					</text>
				</box>

				<box marginBottom={0}>
					<text>
						<span fg={COLORS.USER_LABEL}>— SEARCH ALL MODELS —</span>
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

				{updatedAtLabel ? (
					<box marginBottom={1}>
						<text>
							<span fg={COLORS.REASONING_DIM}>All models updated: {updatedAtLabel}</span>
						</text>
					</box>
				) : null}

				<box marginBottom={1} marginTop={1}>
					<text>
						<span fg={COLORS.DAEMON_LABEL}>[ RECOMMENDED ]</span>
					</text>
				</box>

				{sortedCurated.length === 0 ? (
					<box marginBottom={1} paddingLeft={1}>
						<text>
							<span fg={COLORS.REASONING_DIM}>No curated models available</span>
						</text>
					</box>
				) : (
					<>
						<box marginBottom={1}>
							<box flexDirection="row" justifyContent="space-between">
								<text>
									<span fg={COLORS.REASONING_DIM}>MODEL</span>
								</text>
								<text>
									<span fg={COLORS.REASONING_DIM}>
										{"CTX".padStart(COL_WIDTH.CTX)} {"IN".padStart(COL_WIDTH.IN)}{" "}
										{"OUT".padStart(COL_WIDTH.OUT)} {"CACHE".padStart(COL_WIDTH.CACHE)}
									</span>
								</text>
							</box>
						</box>
						<box flexDirection="column">
							{sortedCurated.map((model, idx) =>
								renderModelRow(model, idx === selectedIndex, model.id === currentModelId)
							)}
						</box>
					</>
				)}

				{savedModels.length > 0 ? (
					<>
						<box marginBottom={1} marginTop={1}>
							<text>
								<span fg={COLORS.DAEMON_LABEL}>[ SAVED ]</span>
							</text>
						</box>
						<box flexDirection="column">
							{savedModels.map((model, idx) =>
								renderModelRow(
									model,
									sortedCurated.length + idx === selectedIndex,
									model.id === currentModelId
								)
							)}
						</box>
					</>
				) : null}

				<box marginBottom={1} marginTop={1}>
					<text>
						<span fg={COLORS.DAEMON_LABEL}>[ ALL MODELS ]</span>
						{allModelsLoading ? <span fg={COLORS.REASONING_DIM}> (refreshing...)</span> : null}
					</text>
				</box>

				{filteredAllModels.length === 0 ? (
					<box marginTop={0} paddingLeft={1}>
						<text>
							<span fg={COLORS.REASONING_DIM}>
								{searchQuery.trim().length < MIN_ALL_MODEL_QUERY_LENGTH
									? `Type ${MIN_ALL_MODEL_QUERY_LENGTH}+ characters to search`
									: allModelsLoading
										? "Loading models..."
										: "No models found"}
							</span>
						</text>
					</box>
				) : (
					<>
						<box marginBottom={1}>
							<box flexDirection="row" justifyContent="space-between">
								<text>
									<span fg={COLORS.REASONING_DIM}>MODEL</span>
								</text>
								<text>
									<span fg={COLORS.REASONING_DIM}>
										{"CTX".padStart(COL_WIDTH.CTX)} {"IN".padStart(COL_WIDTH.IN)}{" "}
										{"OUT".padStart(COL_WIDTH.OUT)} {"CACHE".padStart(COL_WIDTH.CACHE)}
									</span>
								</text>
							</box>
						</box>
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
								{filteredAllModels.map((model, idx) =>
									renderModelRow(
										model,
										sortedCurated.length + idx === selectedIndex,
										model.id === currentModelId
									)
								)}
							</box>
						</scrollbox>
					</>
				)}
			</box>
		</box>
	);
}

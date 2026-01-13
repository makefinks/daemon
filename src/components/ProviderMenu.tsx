import { useMemo } from "react";
import { useMenuKeyboard } from "../hooks/use-menu-keyboard";
import { COLORS } from "../ui/constants";
import { formatContextWindowK, formatPrice } from "../utils/formatters";
import type { ModelPricing } from "../types";

const COL_WIDTH = {
	CTX: 6,
	IN: 10,
	OUT: 10,
	CACHE: 6,
} as const;

export interface ProviderMenuItem {
	/** Provider slug (OpenRouter routing tag). Use null for "Auto". */
	tag: string | null;
	label: string;
	contextLength?: number;
	pricing?: ModelPricing;
	supportsCaching?: boolean;
}

interface ProviderMenuProps {
	items: ProviderMenuItem[];
	currentProviderTag: string | undefined;
	modelId: string;
	onClose: () => void;
	onSelect: (tag: string | undefined) => void;
}

export function ProviderMenu({ items, currentProviderTag, modelId, onClose, onSelect }: ProviderMenuProps) {
	const sortedItems = useMemo(() => {
		return [...items].sort((a, b) => {
			if (a.tag === null) return -1;
			if (b.tag === null) return 1;

			const priceA = a.pricing ? a.pricing.prompt + a.pricing.completion : Number.MAX_SAFE_INTEGER;
			const priceB = b.pricing ? b.pricing.prompt + b.pricing.completion : Number.MAX_SAFE_INTEGER;
			if (priceA !== priceB) return priceA - priceB;
			return a.label.localeCompare(b.label);
		});
	}, [items]);

	const initialIndex = useMemo(() => {
		if (sortedItems.length === 0) return 0;
		const desiredTag = currentProviderTag ?? null;
		const idx = sortedItems.findIndex((item) => item.tag === desiredTag);
		return idx >= 0 ? idx : 0;
	}, [sortedItems, currentProviderTag]);

	const { selectedIndex } = useMenuKeyboard({
		itemCount: sortedItems.length,
		initialIndex,
		onClose,
		onSelect: (selectedIdx) => {
			const selected = sortedItems[selectedIdx];
			if (!selected) return;
			if (selected.tag === null) {
				onSelect(undefined);
			} else {
				onSelect(selected.tag);
			}
		},
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
				width="75%"
				minWidth={68}
				maxWidth={160}
			>
				<box marginBottom={1}>
					<text>
						<span fg={COLORS.DAEMON_LABEL}>[ INFERENCE PROVIDER ]</span>
					</text>
				</box>
				<box marginBottom={1}>
					<text>
						<span fg={COLORS.REASONING_DIM}>Model: {modelId}</span>
					</text>
				</box>
				<box marginBottom={1}>
					<text>
						<span fg={COLORS.USER_LABEL}>↑/↓ or j/k to navigate, ENTER to select, ESC to cancel</span>
					</text>
				</box>

				{sortedItems.length === 0 ? (
					<box>
						<text>
							<span fg={COLORS.USER_LABEL}>No providers available</span>
						</text>
					</box>
				) : (
					<>
						<box marginBottom={1}>
							<box flexDirection="row" justifyContent="space-between">
								<text>
									<span fg={COLORS.REASONING_DIM}>PROVIDER</span>
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
							{sortedItems.map((item, idx) => {
								const isSelected = idx === selectedIndex;
								const isCurrent = item.tag === null ? !currentProviderTag : item.tag === currentProviderTag;
								const hasPrice = Boolean(item.pricing);
								const supportsCaching = Boolean(item.supportsCaching);

								const ctxText =
									typeof item.contextLength === "number" && item.contextLength > 0
										? formatContextWindowK(item.contextLength)
										: "--";
								const inText = hasPrice ? formatPrice(item.pricing!.prompt) : "--";
								const outText = hasPrice ? formatPrice(item.pricing!.completion) : "--";
								const cacheText = supportsCaching ? "✓" : "x";

								return (
									<box
										key={item.tag ?? "auto"}
										backgroundColor={isSelected ? COLORS.MENU_SELECTED_BG : COLORS.MENU_BG}
										paddingLeft={1}
										paddingRight={1}
										flexDirection="row"
										justifyContent="space-between"
									>
										<text>
											<span fg={isSelected ? COLORS.DAEMON_LABEL : COLORS.MENU_TEXT}>
												{isSelected ? "▶ " : "  "}
												{item.label}
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
							})}
						</box>
					</>
				)}
			</box>
		</box>
	);
}

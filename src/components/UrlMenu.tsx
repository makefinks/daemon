import type { KeyEvent, ScrollBoxRenderable } from "@opentui/core";
import { useKeyboard, useRenderer } from "@opentui/react";
import { useCallback, useMemo, useRef } from "react";
import { COLORS } from "../ui/constants";

import type { UrlMenuItem } from "../types";

interface UrlMenuProps {
	items: UrlMenuItem[];
	onClose: () => void;
}

const SCROLL_AMOUNT = 1;

function splitUrl(url: string): { origin: string; path: string } {
	try {
		const parsed = new URL(url);
		return { origin: parsed.origin, path: parsed.pathname + parsed.search + parsed.hash };
	} catch {
		const match = url.match(/^(https?:\/\/[^/]+)(\/.*)?$/);
		if (match) {
			return { origin: match[1] ?? url, path: match[2] ?? "" };
		}
		return { origin: url, path: "" };
	}
}

export function UrlMenu({ items, onClose }: UrlMenuProps) {
	const scrollRef = useRef<ScrollBoxRenderable | null>(null);
	const renderer = useRenderer();

	const sortedItems = useMemo(() => {
		const next = [...items];
		next.sort((a, b) => {
			const groundedDelta = b.groundedCount - a.groundedCount;
			if (groundedDelta !== 0) return groundedDelta;

			const aPercent = a.readPercent ?? -1;
			const bPercent = b.readPercent ?? -1;
			if (aPercent !== bPercent) return bPercent - aPercent;

			return b.lastSeenIndex - a.lastSeenIndex;
		});
		return next;
	}, [items]);

	const menuWidth = useMemo(() => {
		return Math.max(80, Math.min(220, Math.floor(renderer.terminalWidth * 0.8)));
	}, [renderer.terminalWidth]);

	const menuHeight = useMemo(() => {
		const headerHeight = 4;
		const rowCount = sortedItems.length;
		const contentHeight = rowCount > 0 ? rowCount : 1;
		const minHeight = Math.floor(renderer.terminalHeight * 0.5);
		const maxHeight = Math.floor(renderer.terminalHeight * 0.8);
		return Math.max(minHeight, Math.min(headerHeight + contentHeight + 2, maxHeight));
	}, [sortedItems.length, renderer.terminalHeight]);

	const scrollBy = useCallback((delta: number) => {
		const scrollbox = scrollRef.current;
		if (!scrollbox) return;
		const viewportHeight = scrollbox.viewport?.height ?? 0;
		const maxScrollTop = Math.max(0, scrollbox.scrollHeight - viewportHeight);
		const nextScrollTop = Math.max(0, Math.min(scrollbox.scrollTop + delta, maxScrollTop));
		scrollbox.scrollTop = nextScrollTop;
	}, []);

	const handleKeyPress = useCallback(
		(key: KeyEvent) => {
			if (key.eventType !== "press") return;

			if (key.name === "escape" || key.sequence === "u" || key.sequence === "U") {
				onClose();
				key.preventDefault();
				return;
			}

			if (key.sequence === "j" || key.sequence === "J" || key.name === "down") {
				scrollBy(SCROLL_AMOUNT);
				key.preventDefault();
				return;
			}

			if (key.sequence === "k" || key.sequence === "K" || key.name === "up") {
				scrollBy(-SCROLL_AMOUNT);
				key.preventDefault();
				return;
			}
		},
		[onClose, scrollBy]
	);

	useKeyboard(handleKeyPress);

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
				width={menuWidth}
				height={menuHeight}
			>
				<box marginBottom={1} flexDirection="row" width="100%">
					<text>
						<span fg={COLORS.DAEMON_LABEL}>[ URLS ]</span>
						<span fg={COLORS.REASONING_DIM}> — {sortedItems.length} fetched</span>
					</text>
					<box flexGrow={1} />
					<text>
						<span fg={COLORS.USER_LABEL}>
							<span fg={COLORS.DAEMON_LABEL}>j/k</span> scroll · <span fg={COLORS.DAEMON_LABEL}>ESC</span>{" "}
							close
						</span>
					</text>
				</box>

				<box marginBottom={1} flexDirection="row" width="100%" justifyContent="space-between">
					<text>
						<span fg={COLORS.REASONING_DIM}>
							{"G".padEnd(2)}
							{"READ".padEnd(6)}URL
						</span>
					</text>
					<text>
						<span fg={COLORS.REASONING_DIM}>(G=grounded, READ=% or HL=highlights)</span>
					</text>
				</box>

				<scrollbox ref={scrollRef} flexGrow={1} width="100%" overflow="scroll">
					{sortedItems.length === 0 ? (
						<text>
							<span fg={COLORS.REASONING_DIM}>No URLs fetched yet</span>
						</text>
					) : (
						sortedItems.map((item, idx) => {
							const { origin, path } = splitUrl(item.url);
							const grounded = item.groundedCount > 0;
							const readLabel =
								item.readPercent !== undefined
									? `${item.readPercent}%`
									: item.highlightsCount !== undefined
										? `HL:${item.highlightsCount}`
										: "—";

							return (
								<box key={idx} flexDirection="row" marginBottom={0}>
									<text>
										<span fg={grounded ? COLORS.DAEMON_TEXT : COLORS.REASONING_DIM}>
											{grounded ? "G" : "·"}
										</span>
										<span fg={COLORS.REASONING_DIM}> </span>
										<span fg={COLORS.REASONING_DIM}>{readLabel.padStart(4, " ")}</span>
										<span fg={COLORS.REASONING_DIM}> </span>
										<span fg={item.status === "error" ? COLORS.ERROR : COLORS.DAEMON_LABEL}>{origin}</span>
										<span fg={COLORS.REASONING_DIM}>{path}</span>
									</text>
								</box>
							);
						})
					)}
				</scrollbox>
			</box>
		</box>
	);
}

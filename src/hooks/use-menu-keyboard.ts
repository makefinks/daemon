import type { KeyEvent } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useState } from "react";
import { handleMenuKey, isNavigateDownKey, isNavigateUpKey } from "./menu-navigation";

interface UseMenuKeyboardParams {
	itemCount: number;
	initialIndex?: number;
	onClose: () => void;
	onSelect: (selectedIndex: number) => void;
	enableViKeys?: boolean;
	closeOnSelect?: boolean;
	ignoreEscape?: boolean;
	disabled?: boolean;
}

interface UseMenuKeyboardReturn {
	selectedIndex: number;
	setSelectedIndex: Dispatch<SetStateAction<number>>;
}

export function useMenuKeyboard({
	itemCount,
	initialIndex = 0,
	onClose,
	onSelect,
	enableViKeys = true,
	closeOnSelect = true,
	ignoreEscape = false,
	disabled = false,
}: UseMenuKeyboardParams): UseMenuKeyboardReturn {
	const [selectedIndex, setSelectedIndex] = useState(initialIndex);

	useEffect(() => {
		setSelectedIndex(initialIndex);
	}, [initialIndex]);

	useEffect(() => {
		if (itemCount <= 0) {
			setSelectedIndex(0);
			return;
		}
		setSelectedIndex((prev) => {
			if (prev < 0) return 0;
			if (prev >= itemCount) return itemCount - 1;
			return prev;
		});
	}, [itemCount]);

	const handleKeyPress = useCallback(
		(key: KeyEvent) => {
			if (key.eventType !== "press") return;
			if (disabled) {
				return;
			}
			if (ignoreEscape && key.name === "escape") {
				return;
			}

			if (itemCount === 0) {
				if (key.name === "escape") {
					onClose();
					key.preventDefault();
					return;
				}
				if (
					key.name === "return" ||
					isNavigateUpKey(key, enableViKeys) ||
					isNavigateDownKey(key, enableViKeys)
				) {
					key.preventDefault();
				}
				return;
			}

			const result = handleMenuKey(key, selectedIndex, itemCount, enableViKeys, closeOnSelect);
			if (!result.handled) return;

			setSelectedIndex(result.selectedIndex);

			if (result.itemSelected) {
				onSelect(result.selectedIndex);
			}

			if (result.shouldClose) {
				onClose();
			}

			key.preventDefault();
		},
		[itemCount, selectedIndex, onClose, onSelect, enableViKeys, closeOnSelect, ignoreEscape, disabled]
	);

	useKeyboard(handleKeyPress);

	return { selectedIndex, setSelectedIndex };
}

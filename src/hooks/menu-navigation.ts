/**
 * Generic menu navigation utilities.
 * Reduces duplication across device, model, and session menus.
 */

import type { KeyEvent } from "@opentui/core";

/**
 * Navigate up in a list, wrapping around to the end.
 */
export function navigateUp(currentIdx: number, itemCount: number): number {
	if (itemCount === 0) return 0;
	return currentIdx > 0 ? currentIdx - 1 : itemCount - 1;
}

/**
 * Navigate down in a list, wrapping around to the beginning.
 */
export function navigateDown(currentIdx: number, itemCount: number): number {
	if (itemCount === 0) return 0;
	return currentIdx < itemCount - 1 ? currentIdx + 1 : 0;
}

/**
 * Check if a key is a navigation up key (up arrow or k).
 */
export function isNavigateUpKey(key: KeyEvent, enableViKeys = true): boolean {
	return key.name === "up" || (enableViKeys && key.sequence === "k");
}

/**
 * Check if a key is a navigation down key (down arrow or j).
 */
export function isNavigateDownKey(key: KeyEvent, enableViKeys = true): boolean {
	return key.name === "down" || (enableViKeys && key.sequence === "j");
}

/**
 * Check if a key is a confirm key (enter/return).
 */
export function isConfirmKey(key: KeyEvent): boolean {
	return key.name === "return";
}

/**
 * Check if a key is a cancel key (escape).
 */
export function isCancelKey(key: KeyEvent): boolean {
	return key.name === "escape";
}

/**
 * Handle generic menu navigation.
 * Returns the new selected index, or null if the key wasn't a navigation key.
 */
export function handleMenuNavigation(
	key: KeyEvent,
	currentIdx: number,
	itemCount: number,
	enableViKeys = true
): { newIndex: number; handled: boolean } {
	if (key.eventType !== "press") {
		return { newIndex: currentIdx, handled: false };
	}

	if (isNavigateUpKey(key, enableViKeys)) {
		return { newIndex: navigateUp(currentIdx, itemCount), handled: true };
	}

	if (isNavigateDownKey(key, enableViKeys)) {
		return { newIndex: navigateDown(currentIdx, itemCount), handled: true };
	}

	return { newIndex: currentIdx, handled: false };
}

/**
 * Result of a menu key handler.
 */
export interface MenuKeyResult {
	/** Whether the key was handled */
	handled: boolean;
	/** Whether the menu should close */
	shouldClose: boolean;
	/** The new selected index */
	selectedIndex: number;
	/** Whether an item was selected (enter pressed) */
	itemSelected: boolean;
}

/**
 * Handle all menu keyboard input with a standardized pattern.
 */
export function handleMenuKey(
	key: KeyEvent,
	currentIdx: number,
	itemCount: number,
	enableViKeys = true,
	closeOnSelect = true
): MenuKeyResult {
	if (key.eventType !== "press") {
		return {
			handled: false,
			shouldClose: false,
			selectedIndex: currentIdx,
			itemSelected: false,
		};
	}

	// Cancel
	if (isCancelKey(key)) {
		return {
			handled: true,
			shouldClose: true,
			selectedIndex: currentIdx,
			itemSelected: false,
		};
	}

	// Navigation
	const navResult = handleMenuNavigation(key, currentIdx, itemCount, enableViKeys);
	if (navResult.handled) {
		return {
			handled: true,
			shouldClose: false,
			selectedIndex: navResult.newIndex,
			itemSelected: false,
		};
	}

	// Confirm selection
	if (isConfirmKey(key)) {
		return {
			handled: true,
			shouldClose: closeOnSelect,
			selectedIndex: currentIdx,
			itemSelected: true,
		};
	}

	return {
		handled: false,
		shouldClose: false,
		selectedIndex: currentIdx,
		itemSelected: false,
	};
}

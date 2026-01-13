/**
 * Shared typing input row used in both initial and conversation layouts.
 * Ensures the OpenTUI input has a usable width and supports multi-line text.
 */

import type { KeyBinding, TextareaRenderable, PasteEvent, KeyEvent } from "@opentui/core";
import { useRef, type RefObject } from "react";
import { COLORS } from "../ui/constants";
import { debug } from "../utils/debug-logger";
import { pasteClipboardIntoTextarea } from "../utils/paste";

export interface TypingInputBarProps {
	onSubmit: () => void;
	onContentChange?: (value: string) => void;
	onHistoryUp?: () => void;
	onHistoryDown?: () => void;
	placeholder?: string;
	width?: number | "auto" | `${number}%`;
	maxWidth?: number | "auto" | `${number}%`;
	minWidth?: number | "auto" | `${number}%`;
	height?: number;
	textareaRef?: RefObject<TextareaRenderable | null>;
	keyBindings?: KeyBinding[];
}

export function TypingInputBar({
	onSubmit,
	onContentChange,
	onHistoryUp,
	onHistoryDown,
	placeholder = "",
	width = "100%",
	maxWidth = "100%",
	minWidth = 20,
	height = 4,
	textareaRef,
	keyBindings = [
		{ name: "return", action: "submit" },
		{ name: "linefeed", action: "newline" },
	],
}: TypingInputBarProps) {
	const localRef = useRef<TextareaRenderable | null>(null);
	const activeRef = textareaRef ?? localRef;

	const handleContentChange = () => {
		const text = activeRef.current?.plainText ?? "";
		onContentChange?.(text);
	};

	const handlePaste = (event: PasteEvent) => {
		debug.log("[TypingInputBar] onPaste received", {
			textLength: event.text.length,
			textPreview: event.text.slice(0, 50),
			defaultPrevented: event.defaultPrevented,
		});
		if (!event.text.trim()) {
			event.preventDefault();
			void pasteClipboardIntoTextarea(activeRef.current, { source: "typing-onPaste" });
		}
		// Otherwise, let the textarea handle it
	};

	const handleKeyDown = (key: KeyEvent) => {
		if (key.eventType !== "press") return;

		if (key.name === "up" && onHistoryUp) {
			key.preventDefault();
			onHistoryUp();
			return;
		}
		if (key.name === "down" && onHistoryDown) {
			key.preventDefault();
			onHistoryDown();
			return;
		}

		if (key.name !== "v") return;
		if (!(key.ctrl || key.meta || key.super)) return;
		key.preventDefault();
		void pasteClipboardIntoTextarea(activeRef.current, { source: "typing-shortcut" });
	};

	return (
		<box flexDirection="column" width={width} maxWidth={maxWidth} minWidth={minWidth}>
			<box
				border={true}
				borderStyle="single"
				borderColor="#3f4651"
				backgroundColor="#0d0d14"
				flexDirection="row"
				alignItems="stretch"
				width="100%"
				height={height}
				paddingLeft={1}
				paddingRight={1}
			>
				<box paddingTop={0} paddingRight={2}>
					<text>
						<span fg="#6b7280">{">"}</span>
					</text>
				</box>
				<textarea
					ref={activeRef}
					placeholder={placeholder}
					focused={true}
					wrapMode="word"
					keyBindings={keyBindings}
					onContentChange={handleContentChange}
					onPaste={handlePaste}
					onKeyDown={handleKeyDown}
					onSubmit={() => onSubmit()}
					width="100%"
					height="100%"
					style={{
						backgroundColor: "transparent",
						focusedBackgroundColor: "transparent",
						textColor: "#9ca3af",
						focusedTextColor: "#e5e7eb",
						cursorColor: COLORS.TYPING_PROMPT,
						cursorStyle: { style: "block", blinking: true },
					}}
				/>
			</box>
			<box justifyContent="center" width="100%" marginTop={0}>
				<text>
					<span fg="#4b5563">Ctrl+V to paste · Ctrl+J for new line</span>
				</text>
			</box>
		</box>
	);
}

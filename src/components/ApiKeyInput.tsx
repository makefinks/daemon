/**
 * API key input component for onboarding.
 * Simple single-line input using OpenTUI textarea.
 */

import type { TextareaRenderable, PasteEvent, KeyEvent } from "@opentui/core";
import { useRef, type RefObject } from "react";
import { COLORS } from "../ui/constants";
import { debug } from "../utils/debug-logger";
import { pasteClipboardIntoTextarea } from "../utils/paste";

export interface ApiKeyInputProps {
	onSubmit: () => void;
	placeholder?: string;
	textareaRef?: RefObject<TextareaRenderable | null>;
}

export function ApiKeyInput({
	onSubmit,
	placeholder = "Paste your API key here...",
	textareaRef,
}: ApiKeyInputProps) {
	const localRef = useRef<TextareaRenderable | null>(null);
	const activeRef = textareaRef ?? localRef;

	const handleContentChange = () => {
		const text = activeRef.current?.plainText ?? "";
		// Strip newlines - API keys should be single line
		const cleanedText = text.replace(/[\r\n]/g, "");
		if (cleanedText !== text) {
			activeRef.current?.setText(cleanedText);
		}
	};

	const handlePaste = (event: PasteEvent) => {
		debug.log("[ApiKeyInput] onPaste received", {
			textLength: event.text.length,
			textPreview: event.text.slice(0, 50),
			defaultPrevented: event.defaultPrevented,
		});
		if (!event.text.trim()) {
			event.preventDefault();
			void pasteClipboardIntoTextarea(activeRef.current, {
				singleLine: true,
				source: "apikey-onPaste",
			});
		}
		// Otherwise, let the textarea handle it
	};

	const handleKeyDown = (key: KeyEvent) => {
		if (key.eventType !== "press") return;
		if (key.name !== "v") return;
		if (!(key.ctrl || key.meta || key.super)) return;
		key.preventDefault();
		void pasteClipboardIntoTextarea(activeRef.current, {
			singleLine: true,
			source: "apikey-shortcut",
		});
	};

	return (
		<box
			border={true}
			borderStyle="single"
			borderColor={COLORS.MENU_BORDER}
			backgroundColor={COLORS.MENU_SELECTED_BG}
			flexDirection="row"
			alignItems="stretch"
			width="100%"
			maxWidth={100}
			height={3}
			paddingLeft={1}
			paddingRight={1}
		>
			<textarea
				ref={activeRef}
				placeholder={placeholder}
				focused={true}
				wrapMode="none"
				keyBindings={[{ name: "return", action: "submit" }]}
				onContentChange={handleContentChange}
				onPaste={handlePaste}
				onKeyDown={handleKeyDown}
				onSubmit={() => onSubmit()}
				width="100%"
				height="100%"
				style={{
					backgroundColor: "transparent",
					focusedBackgroundColor: "transparent",
					textColor: COLORS.DAEMON_LABEL,
					focusedTextColor: COLORS.DAEMON_LABEL,
					cursorColor: COLORS.DAEMON_LABEL,
					cursorStyle: { style: "block", blinking: true },
				}}
			/>
		</box>
	);
}

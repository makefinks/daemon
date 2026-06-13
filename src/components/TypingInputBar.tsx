/**
 * Shared typing input row used in both initial and conversation layouts.
 * Ensures the OpenTUI input has a usable width and supports multi-line text.
 */

import {
	type KeyBinding,
	type KeyEvent,
	type PasteEvent,
	type TextareaRenderable,
	SyntaxStyle,
	decodePasteBytes,
} from "@opentui/core";
import { useRenderer } from "@opentui/react";
import { type RefObject, useMemo, useRef } from "react";
import type { PromptImageAttachment } from "../types";
import { COLORS } from "../ui/constants";
import { toast } from "@opentui-ui/toast/react";
import { readClipboardImage } from "../utils/clipboard";
import { debug } from "../utils/debug-logger";
import { pasteClipboardIntoTextarea } from "../utils/paste";
import { PASTE_SUMMARY_STYLE_NAME, PASTE_SUMMARY_TYPE_NAME, isLargePaste } from "../utils/paste-summary";

export interface TypingInputBarProps {
	onSubmit: () => void;
	onContentChange?: (value: string) => void;
	onHistoryUp?: () => void;
	onHistoryDown?: () => void;
	placeholder?: string;
	width?: number | "auto" | `${number}%`;
	maxWidth?: number | "auto" | `${number}%`;
	minWidth?: number | "auto" | `${number}%`;
	minHeight?: number;
	maxHeight?: number;
	textareaRef?: RefObject<TextareaRenderable | null>;
	keyBindings?: KeyBinding[];
	imagePasteEnabled?: boolean;
	onImageAttach?: (attachment: PromptImageAttachment) => { id: string; label: string };
	onImageAttachmentsChange?: (attachmentIds: string[]) => void;
	imageAttachmentCount?: number;
	pasteSummaryEnabled?: boolean;
	onPasteSummaryAttach?: (text: string) => { id: string; label: string };
	onPasteSummaryChange?: (pasteIds: string[]) => void;
}

const IMAGE_ATTACHMENT_STYLE_NAME = "daemon.imageAttachment";
const IMAGE_ATTACHMENT_TYPE_NAME = "daemon-image-attachment";
const PROMPT_SYNTAX_STYLE = SyntaxStyle.fromTheme([
	{
		scope: [IMAGE_ATTACHMENT_STYLE_NAME],
		style: {
			foreground: "#000000",
			background: "#fbbf24",
			bold: true,
		},
	},
	{
		scope: [PASTE_SUMMARY_STYLE_NAME],
		style: {
			foreground: "#a5b4fc",
			italic: true,
		},
	},
]);
const IMAGE_ATTACHMENT_STYLE_ID = PROMPT_SYNTAX_STYLE.getStyleId(IMAGE_ATTACHMENT_STYLE_NAME) ?? undefined;
const PASTE_SUMMARY_STYLE_ID = PROMPT_SYNTAX_STYLE.getStyleId(PASTE_SUMMARY_STYLE_NAME) ?? undefined;

export function TypingInputBar({
	onSubmit,
	onContentChange,
	onHistoryUp,
	onHistoryDown,
	placeholder = "",
	width = "100%",
	maxWidth = "100%",
	minWidth = 20,
	minHeight = 1,
	maxHeight,
	textareaRef,
	keyBindings = [
		{ name: "return", action: "submit" },
		{ name: "linefeed", action: "newline" },
		{ name: "j", ctrl: true, action: "newline" },
		{ name: "return", shift: true, action: "newline" },
	],
	imagePasteEnabled = false,
	onImageAttach,
	onImageAttachmentsChange,
	imageAttachmentCount = 0,
	pasteSummaryEnabled = true,
	onPasteSummaryAttach,
	onPasteSummaryChange,
}: TypingInputBarProps) {
	const localRef = useRef<TextareaRenderable | null>(null);
	const activeRef = textareaRef ?? localRef;
	const creatingImageAttachmentRef = useRef(false);
	const renderer = useRenderer();
	const effectiveMaxHeight = useMemo(
		() => maxHeight ?? Math.max(4, Math.floor(renderer.height / 3)),
		[maxHeight, renderer.height]
	);

	const syncImageAttachments = () => {
		if (!onImageAttachmentsChange || !activeRef.current) return;
		const typeId = activeRef.current.extmarks.getTypeId(IMAGE_ATTACHMENT_TYPE_NAME);
		if (typeId === null) {
			onImageAttachmentsChange([]);
			return;
		}
		const ids = activeRef.current.extmarks
			.getAllForTypeId(typeId)
			.map((mark) => (typeof mark.data?.attachmentId === "string" ? mark.data.attachmentId : ""))
			.filter((id) => id.length > 0);
		onImageAttachmentsChange(ids);
	};

	const syncPasteSummaries = () => {
		if (!onPasteSummaryChange || !activeRef.current) return;
		const typeId = activeRef.current.extmarks.getTypeId(PASTE_SUMMARY_TYPE_NAME);
		if (typeId === null) {
			onPasteSummaryChange([]);
			return;
		}
		const ids = activeRef.current.extmarks
			.getAllForTypeId(typeId)
			.map((mark) => (typeof mark.data?.pasteId === "string" ? mark.data.pasteId : ""))
			.filter((id) => id.length > 0);
		onPasteSummaryChange(ids);
	};

	const handleContentChange = () => {
		const text = activeRef.current?.plainText ?? "";
		if (!creatingImageAttachmentRef.current) {
			syncImageAttachments();
			syncPasteSummaries();
		}
		onContentChange?.(text);
	};

	const insertPasteSummary = (text: string) => {
		if (!onPasteSummaryAttach) {
			activeRef.current?.insertText(text);
			return;
		}
		const textarea = activeRef.current;
		if (!textarea) return;
		const summary = onPasteSummaryAttach(text);
		creatingImageAttachmentRef.current = true;
		const start = textarea.cursorOffset ?? 0;
		textarea.insertText(summary.label);
		const typeId = textarea.extmarks.registerType(PASTE_SUMMARY_TYPE_NAME);
		textarea.extmarks.create({
			start,
			end: start + summary.label.length,
			virtual: true,
			styleId: PASTE_SUMMARY_STYLE_ID,
			typeId,
			data: { pasteId: summary.id },
		});
		creatingImageAttachmentRef.current = false;
		syncPasteSummaries();
		debug.log("[TypingInputBar] inserted paste summary", {
			id: summary.id,
			label: summary.label,
			originalLength: text.length,
		});
	};

	const pasteClipboardImage = async (source: string): Promise<boolean> => {
		const image = await readClipboardImage();
		if (!image) return false;
		if (!imagePasteEnabled || !onImageAttach) {
			toast.warning("Model does not support images");
			return true;
		}

		const attachment = onImageAttach({
			type: "image",
			filename: image.filename,
			mediaType: image.mediaType,
			data: image.data,
		});
		const textarea = activeRef.current;
		const start = textarea?.cursorOffset ?? 0;
		creatingImageAttachmentRef.current = true;
		textarea?.insertText(`${attachment.label} `);
		if (textarea) {
			const typeId = textarea.extmarks.registerType(IMAGE_ATTACHMENT_TYPE_NAME);
			textarea.extmarks.create({
				start,
				end: start + attachment.label.length,
				virtual: true,
				styleId: IMAGE_ATTACHMENT_STYLE_ID,
				typeId,
				data: { attachmentId: attachment.id },
			});
		}
		creatingImageAttachmentRef.current = false;
		syncImageAttachments();
		debug.log("[TypingInputBar] pasted image attachment", {
			source,
			mediaType: image.mediaType,
			base64Length: image.data.length,
		});
		return true;
	};

	const handlePaste = (event: PasteEvent) => {
		const pasteText = decodePasteBytes(event.bytes);
		debug.log("[TypingInputBar] onPaste received", {
			textLength: pasteText.length,
			textPreview: pasteText.slice(0, 50),
			defaultPrevented: event.defaultPrevented,
		});
		if (!pasteText.trim()) {
			event.preventDefault();
			void (async () => {
				if (await pasteClipboardImage("typing-onPaste")) return;
				await pasteClipboardIntoTextarea(activeRef.current, { source: "typing-onPaste" });
			})();
			return;
		}
		if (pasteSummaryEnabled && isLargePaste(pasteText)) {
			event.preventDefault();
			insertPasteSummary(pasteText);
		}
		// Otherwise, let the textarea handle it natively
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
		void (async () => {
			if (await pasteClipboardImage("typing-shortcut")) return;
			await pasteClipboardIntoTextarea(activeRef.current, { source: "typing-shortcut" });
		})();
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
					minHeight={minHeight}
					maxHeight={effectiveMaxHeight}
					style={{
						backgroundColor: "transparent",
						focusedBackgroundColor: "transparent",
						textColor: "#9ca3af",
						focusedTextColor: "#e5e7eb",
						cursorColor: COLORS.TYPING_PROMPT,
						cursorStyle: { style: "block", blinking: true },
						syntaxStyle: PROMPT_SYNTAX_STYLE,
					}}
				/>
			</box>
			<box justifyContent="center" width="100%" marginTop={0}>
				<text>
					<span fg="#4b5563">
						Ctrl+V to paste{textImageHint(imagePasteEnabled, imageAttachmentCount)} · Ctrl+J for new line
					</span>
				</text>
			</box>
		</box>
	);
}

function textImageHint(enabled: boolean, count: number): string {
	if (!enabled) return "";
	return count > 0 ? ` · ${count} image${count === 1 ? "" : "s"} attached` : " images";
}

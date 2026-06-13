/**
 * Hook for managing typing mode state and handlers.
 */

import type { TextareaRenderable } from "@opentui/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { getDaemonManager } from "../state/daemon-state";
import { DaemonState, type PromptImageAttachment } from "../types";
import {
	PASTE_SUMMARY_TYPE_NAME,
	expandPastePlaceholders,
	formatPastePlaceholder,
} from "../utils/paste-summary";

export interface UseTypingModeParams {
	daemonState: DaemonState;
	currentUserInputRef: React.MutableRefObject<string>;
	setCurrentTranscription: (text: string) => void;
	onTypingActivity?: () => void;
	onSpaceOrNewline?: () => void;
	navigateUp: (currentInput: string) => string | null;
	navigateDown: () => string | null;
	resetNavigation: () => void;
	addToHistory: (input: string) => void;
}

export interface UseTypingModeReturn {
	typingInput: string;
	setTypingInput: React.Dispatch<React.SetStateAction<string>>;
	typingTextareaRef: React.RefObject<TextareaRenderable | null>;
	handleTypingContentChange: (value: string) => void;
	handleTypingSubmit: () => void;
	prefillTypingInput: (text: string) => void;
	handleHistoryUp: () => void;
	handleHistoryDown: () => void;
	handleImageAttach: (attachment: PromptImageAttachment) => { id: string; label: string };
	handleImageAttachmentsChange: (attachmentIds: string[]) => void;
	imageAttachmentCount: number;
	handlePasteSummaryAttach: (text: string) => { id: string; label: string };
	handlePasteSummaryChange: (pasteIds: string[]) => void;
}

export function useTypingMode(params: UseTypingModeParams): UseTypingModeReturn {
	const {
		daemonState,
		currentUserInputRef,
		setCurrentTranscription,
		onTypingActivity,
		onSpaceOrNewline,
		navigateUp,
		navigateDown,
		resetNavigation,
		addToHistory,
	} = params;

	const [typingInput, setTypingInput] = useState<string>("");
	const [imageAttachmentCount, setImageAttachmentCount] = useState(0);
	const typingTextareaRef = useRef<TextareaRenderable | null>(null);
	const imageAttachmentsRef = useRef<Array<PromptImageAttachment & { id: string; label: string }>>([]);
	const nextImageAttachmentIdRef = useRef(0);
	const pasteSummariesRef = useRef<Map<string, string>>(new Map());
	const nextPasteSummaryIdRef = useRef(0);
	const pendingPrefillRef = useRef<string | null>(null);
	const lastInputValueRef = useRef("");

	useEffect(() => {
		if (daemonState === DaemonState.TYPING && pendingPrefillRef.current !== null) {
			const text = pendingPrefillRef.current;
			const tryApplyPrefill = () => {
				if (typingTextareaRef.current) {
					typingTextareaRef.current.setText(text);
					typingTextareaRef.current.gotoBufferEnd();
					pendingPrefillRef.current = null;
				} else {
					setTimeout(tryApplyPrefill, 10);
				}
			};
			tryApplyPrefill();
		}
	}, [daemonState]);

	useEffect(() => {
		if (daemonState !== DaemonState.TYPING) {
			if (typingTextareaRef.current?.plainText) {
				typingTextareaRef.current.setText("");
			}
			setTypingInput("");
			setImageAttachmentCount(0);
			imageAttachmentsRef.current = [];
			pasteSummariesRef.current.clear();
			pendingPrefillRef.current = null;
			lastInputValueRef.current = "";
			resetNavigation();
		}
	}, [daemonState, resetNavigation]);

	const handleTypingContentChange = useCallback(
		(value: string) => {
			setTypingInput(value);
			const prev = lastInputValueRef.current;
			lastInputValueRef.current = value;
			if (onSpaceOrNewline && value.length > prev.length) {
				const inserted = value.slice(prev.length);
				if (/[\s\n\r]/.test(inserted)) {
					onSpaceOrNewline();
					return;
				}
			}
			onTypingActivity?.();
		},
		[onTypingActivity, onSpaceOrNewline]
	);

	const expandInputText = useCallback((textarea: TextareaRenderable | null, text: string): string => {
		if (!textarea) return text;
		const typeId = textarea.extmarks.getTypeId(PASTE_SUMMARY_TYPE_NAME);
		if (typeId === null) return text;
		const ranges = textarea.extmarks
			.getAllForTypeId(typeId)
			.map((mark) => {
				const pasteId = typeof mark.data?.pasteId === "string" ? mark.data.pasteId : null;
				if (pasteId === null) return null;
				return { start: mark.start, end: mark.end, pasteId };
			})
			.filter((range): range is { start: number; end: number; pasteId: string } => range !== null);
		if (ranges.length === 0) return text;
		return expandPastePlaceholders(text, ranges, {
			getFullText: (pasteId) => pasteSummariesRef.current.get(pasteId),
		});
	}, []);

	const handleTypingSubmit = useCallback(() => {
		const textarea = typingTextareaRef.current;
		const rawInput = expandInputText(textarea, textarea?.plainText ?? typingInput);
		const input = rawInput.trim();
		const imageAttachments = imageAttachmentsRef.current;
		if (input || imageAttachments.length > 0) {
			const manager = getDaemonManager();
			currentUserInputRef.current = input;
			setCurrentTranscription(input);
			addToHistory(input);
			manager.submitText(input, imageAttachments);
		}
		typingTextareaRef.current?.setText("");
		setTypingInput("");
		setImageAttachmentCount(0);
		imageAttachmentsRef.current = [];
		pasteSummariesRef.current.clear();
	}, [typingInput, setCurrentTranscription, currentUserInputRef, addToHistory, expandInputText]);

	const handleImageAttach = useCallback(
		(attachment: PromptImageAttachment): { id: string; label: string } => {
			const id = `image-${++nextImageAttachmentIdRef.current}`;
			const bytes = Buffer.byteLength(attachment.data, "base64");
			const label = `[Image ${imageAttachmentsRef.current.length + 1} ${formatBytes(bytes)}]`;
			imageAttachmentsRef.current = [...imageAttachmentsRef.current, { ...attachment, id, label }];
			const count = imageAttachmentsRef.current.length;
			setImageAttachmentCount(count);
			return { id, label };
		},
		[]
	);

	const handleImageAttachmentsChange = useCallback((attachmentIds: string[]) => {
		const liveIds = new Set(attachmentIds);
		const nextAttachments = imageAttachmentsRef.current.filter((attachment) => liveIds.has(attachment.id));
		if (nextAttachments.length === imageAttachmentsRef.current.length) return;
		imageAttachmentsRef.current = nextAttachments;
		setImageAttachmentCount(nextAttachments.length);
	}, []);

	const handlePasteSummaryAttach = useCallback((text: string): { id: string; label: string } => {
		const id = `paste-${++nextPasteSummaryIdRef.current}`;
		const label = formatPastePlaceholder(text);
		pasteSummariesRef.current.set(id, text);
		return { id, label };
	}, []);

	const handlePasteSummaryChange = useCallback((pasteIds: string[]) => {
		const liveIds = new Set(pasteIds);
		let mutated = false;
		for (const id of Array.from(pasteSummariesRef.current.keys())) {
			if (!liveIds.has(id)) {
				pasteSummariesRef.current.delete(id);
				mutated = true;
			}
		}
		if (!mutated) return;
	}, []);

	const prefillTypingInput = useCallback((text: string) => {
		setTypingInput(text);
		setImageAttachmentCount(0);
		imageAttachmentsRef.current = [];
		pasteSummariesRef.current.clear();
		pendingPrefillRef.current = text;
		if (typingTextareaRef.current) {
			typingTextareaRef.current.setText(text);
			typingTextareaRef.current.gotoBufferEnd();
			pendingPrefillRef.current = null;
		}
	}, []);

	const setTextareaValue = useCallback((value: string) => {
		setTypingInput(value);
		setImageAttachmentCount(0);
		imageAttachmentsRef.current = [];
		pasteSummariesRef.current.clear();
		if (typingTextareaRef.current) {
			typingTextareaRef.current.setText(value);
			typingTextareaRef.current.gotoBufferEnd();
		}
	}, []);

	const handleHistoryUp = useCallback(() => {
		const currentInput = typingTextareaRef.current?.plainText ?? typingInput;
		const historyItem = navigateUp(currentInput);
		if (historyItem !== null) {
			setTextareaValue(historyItem);
		}
	}, [typingInput, navigateUp, setTextareaValue]);

	const handleHistoryDown = useCallback(() => {
		const historyItem = navigateDown();
		if (historyItem !== null) {
			setTextareaValue(historyItem);
		}
	}, [navigateDown, setTextareaValue]);

	return {
		typingInput,
		setTypingInput,
		typingTextareaRef,
		handleTypingContentChange,
		handleTypingSubmit,
		prefillTypingInput,
		handleHistoryUp,
		handleHistoryDown,
		handleImageAttach,
		handleImageAttachmentsChange,
		imageAttachmentCount,
		handlePasteSummaryAttach,
		handlePasteSummaryChange,
	};
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const kb = bytes / 1024;
	if (kb < 1024) return `${kb.toFixed(1)} KB`;
	return `${(kb / 1024).toFixed(1)} MB`;
}

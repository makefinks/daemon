import type { TextareaRenderable } from "@opentui/core";
import { readClipboardText } from "./clipboard";
import { debug } from "./debug-logger";

export interface PasteOptions {
	singleLine?: boolean;
	source?: string;
}

export function normalizeClipboardText(text: string): string {
	return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export async function pasteClipboardIntoTextarea(
	textarea: TextareaRenderable | null,
	options: PasteOptions = {}
): Promise<boolean> {
	const raw = await readClipboardText();
	const normalized = normalizeClipboardText(raw);
	const text = options.singleLine ? normalized.replace(/[\r\n]/g, "") : normalized;

	if (!text) {
		debug.log("[Paste] Clipboard empty", { source: options.source });
		return false;
	}

	textarea?.insertText(text);
	debug.log("[Paste] Inserted clipboard text", {
		source: options.source,
		length: text.length,
	});
	return true;
}

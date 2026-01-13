import { useCallback } from "react";
import { toast } from "@opentui-ui/toast/react";
import { useRenderer } from "@opentui/react";
import { writeClipboardText } from "../utils/clipboard";

export interface UseCopyOnSelectReturn {
	handleCopyOnSelectMouseUp: () => Promise<void>;
}

export function useCopyOnSelect(): UseCopyOnSelectReturn {
	const renderer = useRenderer();

	const handleCopyOnSelectMouseUp = useCallback(async () => {
		if (process.env.DAEMON_DISABLE_COPY_ON_SELECT) {
			renderer.clearSelection();
			return;
		}

		const selection = renderer.getSelection();
		if (!selection) return;

		try {
			const text = selection.getSelectedText();
			if (!text) return;

			try {
				const base64 = Buffer.from(text).toString("base64");
				const osc52 = `\x1b]52;c;${base64}\x07`;
				const finalOsc52 = process.env.TMUX ? `\x1bPtmux;\x1b${osc52}\x1b\\` : osc52;
				// @ts-expect-error - OpenTUI keeps this private, but it's safe to use here.
				renderer.writeOut(finalOsc52);
			} catch {
				// Ignore OSC52 failures (unsupported terminal, etc).
			}

			try {
				const didCopy = await writeClipboardText(text);
				if (didCopy) {
					toast.info("Text copied to clipboard");
				}
			} catch {
				// Ignore clipboard failures; OSC52 may still work.
			}
		} finally {
			renderer.clearSelection();
		}
	}, [renderer]);

	return { handleCopyOnSelectMouseUp };
}

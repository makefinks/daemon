import type { ModelMessage } from "ai";

export function extractFinalAssistantText(messages: ModelMessage[]): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (msg?.role === "assistant") {
			const content = msg.content;
			if (Array.isArray(content)) {
				for (let j = content.length - 1; j >= 0; j--) {
					const part = content[j];
					if (
						part &&
						typeof part === "object" &&
						"type" in part &&
						part.type === "text" &&
						"text" in part &&
						typeof part.text === "string"
					) {
						return part.text;
					}
				}
			}
		}
	}
	return "";
}

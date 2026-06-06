import type { ModelMessage, PromptImageAttachment } from "../../types";

export function buildUserModelMessage(
	text: string,
	imageAttachments: PromptImageAttachment[] = []
): ModelMessage {
	if (imageAttachments.length === 0) return { role: "user", content: text };

	const content: unknown[] = [];
	const trimmed = text.trim();
	if (trimmed) content.push({ type: "text", text: trimmed });
	for (const image of imageAttachments) {
		content.push({
			type: "file",
			mediaType: image.mediaType,
			data: image.data,
			filename: image.filename,
		});
	}

	return { role: "user", content } as ModelMessage;
}

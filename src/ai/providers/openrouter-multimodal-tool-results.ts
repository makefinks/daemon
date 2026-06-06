import type { ModelMessage } from "ai";

interface ExtractedMediaPart {
	toolName: string;
	toolCallId: string;
	type: "image-data" | "file-data" | "image-url" | "file-url" | "media";
	data?: string;
	url?: string;
	mediaType?: string;
	filename?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isImageMediaType(mediaType: unknown): mediaType is string {
	return typeof mediaType === "string" && mediaType.toLowerCase().startsWith("image/");
}

function isImageUrl(url: unknown): url is string {
	if (typeof url !== "string" || !url.trim()) return false;
	const lower = url.toLowerCase();
	return lower.startsWith("data:image/") || /\.(png|jpe?g|webp|gif)(\?|#|$)/.test(lower);
}

function extractMediaPart(
	part: Record<string, unknown>,
	toolName: string,
	toolCallId: string
): ExtractedMediaPart | null {
	if (part.type === "image-data" && typeof part.data === "string") {
		return {
			toolName,
			toolCallId,
			type: "image-data",
			data: part.data,
			mediaType: isImageMediaType(part.mediaType) ? part.mediaType : "image/png",
		};
	}

	if (part.type === "file-data" && typeof part.data === "string" && isImageMediaType(part.mediaType)) {
		return {
			toolName,
			toolCallId,
			type: "file-data",
			data: part.data,
			mediaType: part.mediaType,
			filename: typeof part.filename === "string" ? part.filename : undefined,
		};
	}

	if (part.type === "media" && typeof part.data === "string" && isImageMediaType(part.mediaType)) {
		return {
			toolName,
			toolCallId,
			type: "media",
			data: part.data,
			mediaType: part.mediaType,
		};
	}

	if (part.type === "image-url" && isImageUrl(part.url)) {
		return { toolName, toolCallId, type: "image-url", url: part.url };
	}

	if (part.type === "file-url" && isImageUrl(part.url)) {
		return { toolName, toolCallId, type: "file-url", url: part.url };
	}

	return null;
}

function buildTextPart(text: string): { type: "text"; text: string } {
	return { type: "text", text };
}

function splitToolResultOutput(
	output: unknown,
	toolName: string,
	toolCallId: string,
	supportsVision: boolean
): { output: unknown; media: ExtractedMediaPart[] } {
	if (!isRecord(output) || output.type !== "content" || !Array.isArray(output.value)) {
		return { output, media: [] };
	}

	const media: ExtractedMediaPart[] = [];
	const value: unknown[] = [];

	for (const item of output.value) {
		if (!isRecord(item)) {
			value.push(item);
			continue;
		}

		const extracted = extractMediaPart(item, toolName, toolCallId);
		if (extracted) {
			media.push(extracted);
			if (!supportsVision) {
				const mediaType = extracted.mediaType ?? "image";
				value.push(
					buildTextPart(`[Image omitted: ${mediaType}. The active model does not support vision input.]`)
				);
			}
			continue;
		}

		value.push(item);
	}

	if (!supportsVision) {
		return { output: { ...output, value }, media: [] };
	}

	if (media.length > 0 && value.length === 0) {
		value.push(buildTextPart("Tool returned image content. The image is attached in the next user message."));
	} else if (media.length > 0) {
		value.push(
			buildTextPart("Additional image content from this tool result is attached in the next user message.")
		);
	}

	return { output: { ...output, value }, media };
}

function buildUserContentForMedia(media: ExtractedMediaPart[]): unknown[] {
	const content: unknown[] = [
		buildTextPart(
			`The previous tool result returned ${media.length} image${media.length === 1 ? "" : "s"}. Treat the attached image content as part of that tool result.`
		),
	];

	for (const item of media) {
		if (item.data) {
			content.push({
				type: "file",
				mediaType: item.mediaType ?? "image/png",
				data: item.data,
				filename: item.filename,
			});
			continue;
		}

		if (item.url) {
			try {
				content.push({ type: "image", image: new URL(item.url) });
			} catch {
				content.push(buildTextPart(`[Image URL omitted: ${item.url}]`));
			}
		}
	}

	return content;
}

/**
 * Some OpenAI-compatible providers accept direct user images but reject images
 * inside role=tool messages. Preserve the tool-result contract as text, then
 * attach media as a synthetic user message for the next model call.
 */
export function prepareOpenRouterMultimodalToolResults(
	messages: ModelMessage[],
	options: { supportsVision: boolean }
): ModelMessage[] {
	const next: ModelMessage[] = [];

	for (const message of messages) {
		if (message.role !== "tool" || !Array.isArray(message.content)) {
			next.push(message);
			continue;
		}

		const extractedMedia: ExtractedMediaPart[] = [];
		const content = message.content.map((part) => {
			const rawPart: unknown = part;
			if (!isRecord(rawPart) || rawPart.type !== "tool-result" || !isRecord(rawPart.output)) {
				return part;
			}

			const toolName = typeof rawPart.toolName === "string" ? rawPart.toolName : "tool";
			const toolCallId = typeof rawPart.toolCallId === "string" ? rawPart.toolCallId : "unknown";
			const split = splitToolResultOutput(rawPart.output, toolName, toolCallId, options.supportsVision);
			extractedMedia.push(...split.media);

			return {
				...rawPart,
				output: split.output,
			};
		});

		next.push({ ...message, content } as ModelMessage);

		if (extractedMedia.length > 0) {
			next.push({
				role: "user",
				content: buildUserContentForMedia(extractedMedia),
			} as ModelMessage);
		}
	}

	return next;
}

export function moveMultimodalToolResultImagesToUserMessages(messages: ModelMessage[]): ModelMessage[] {
	return prepareOpenRouterMultimodalToolResults(messages, { supportsVision: true });
}

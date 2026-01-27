import { formatMarkdownTables } from "./markdown-tables";

export interface MarkdownRenderOptions {
	maxWidth?: number;
	streaming?: boolean;
}

export async function renderMarkdown(text: string, options: MarkdownRenderOptions = {}): Promise<string> {
	const trimmed = options.streaming ? text : text.trimEnd();
	if (options.streaming) {
		return trimmed;
	}
	return formatMarkdownTables(trimmed, { maxWidth: options.maxWidth });
}

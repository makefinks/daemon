/**
 * Component for rendering a single content block (reasoning, tool, or text).
 */

import type { ContentBlock } from "../types";
import { COLORS, REASONING_MARKDOWN_STYLE } from "../ui/constants";
import { renderReasoningTicker } from "../ui/reasoning-ticker";
import { formatElapsedTime, hasVisibleText } from "../utils/formatters";
import { DaemonText } from "./DaemonText";
import { ToolCallView } from "./ToolCallView";

interface ContentBlockViewProps {
	block: ContentBlock;
	isLastReasoningBlock: boolean;
	isLastTextBlock: boolean;
	isLastBlock?: boolean;
	isStreaming: boolean;
	showFullReasoning: boolean;
	showToolOutput?: boolean;
	reasoningDisplay?: string;
	showReasoningTicker?: boolean;
}

export function ContentBlockView({
	block,
	isLastReasoningBlock,
	isLastTextBlock,
	isLastBlock = false,
	isStreaming,
	showFullReasoning,
	showToolOutput = true,
	reasoningDisplay,
	showReasoningTicker,
}: ContentBlockViewProps) {
	if (block.type === "reasoning") {
		if (shouldHideContentBlock(block)) {
			return null;
		}

		const cleanedContent = block.content.replace(/\[REDACTED\]/g, "");

		// Show full reasoning if enabled
		if (showFullReasoning) {
			const durationLabel =
				block.durationMs !== undefined
					? ` · ${formatElapsedTime(block.durationMs, { style: "detailed" })}`
					: "";
			return (
				<box
					flexDirection="column"
					border={["left"]}
					borderStyle="heavy"
					borderColor={COLORS.REASONING_DIM}
					paddingLeft={1}
				>
					<text>
						<span fg={COLORS.REASONING}>{"REASONING"}</span>
						<span fg={COLORS.REASONING_DIM}>{durationLabel}</span>
					</text>
					<code
						content={cleanedContent}
						filetype="markdown"
						syntaxStyle={REASONING_MARKDOWN_STYLE}
						streaming={isStreaming && isLastBlock}
						drawUnstyledText={false}
					/>
				</box>
			);
		}

		// For non-full-reasoning mode, show animated display only for the latest reasoning block
		if (showReasoningTicker && isLastReasoningBlock && reasoningDisplay) {
			return renderReasoningTicker(reasoningDisplay);
		}
		const durationLabel =
			block.durationMs !== undefined
				? ` · ${formatElapsedTime(block.durationMs, { style: "detailed" })}`
				: "";
		return (
			<text>
				<span fg={COLORS.REASONING_DIM}>
					{"REASONING"}
					{durationLabel}
				</span>
			</text>
		);
	}

	if (block.type === "tool") {
		return (
			<box flexDirection="column">
				<ToolCallView call={block.call} result={block.result} showOutput={showToolOutput} />
			</box>
		);
	}

	if (block.type === "text") {
		return (
			<box flexDirection="column">
				<DaemonText
					content={block.content}
					showLabel={isLastTextBlock && hasVisibleText(block.content)}
					streaming={isStreaming}
				/>
			</box>
		);
	}

	return null;
}

/**
 * Helper to find if a block is the last text block in a list
 */
export function isLastTextBlockInList(blocks: ContentBlock[], block: ContentBlock): boolean {
	const lastTextBlock = [...blocks].reverse().find((b) => b.type === "text");
	return lastTextBlock === block;
}

/**
 * Helper to find if a block is the last reasoning block in a list
 */
export function isLastReasoningBlockInList(blocks: ContentBlock[], block: ContentBlock): boolean {
	const lastReasoningBlock = [...blocks].reverse().find((b) => b.type === "reasoning");
	return lastReasoningBlock === block;
}

/**
 * Helper to determine if a content block should be hidden entirely
 * (e.g. reasoning blocks that only contain redacted content)
 */
export function shouldHideContentBlock(block: ContentBlock): boolean {
	if (block.type === "reasoning") {
		const cleanedContent = block.content.replace(/\[REDACTED\]/g, "");
		if (cleanedContent.trim().length === 0 && block.content.includes("[REDACTED]")) {
			return true;
		}
	}
	return false;
}

import { formatMarkdownTables } from "../utils/markdown-tables";
import { COLORS, DAEMON_MARKDOWN_STYLE } from "../ui/constants";

export interface DaemonTextProps {
	content: string;
	showLabel?: boolean;
	streaming?: boolean;
}

export function DaemonText({ content, showLabel = false, streaming = false }: DaemonTextProps) {
	const maxWidth =
		typeof process !== "undefined" && process.stdout?.columns ? process.stdout.columns : undefined;
	// Trim trailing whitespace when not streaming to avoid gaps before subsequent blocks
	const trimmedContent = streaming ? content : content.trimEnd();
	const renderedContent = streaming ? trimmedContent : formatMarkdownTables(trimmedContent, { maxWidth });

	return (
		<box flexDirection="column">
			{showLabel && (
				<text>
					<span fg={COLORS.DAEMON_LABEL}>DAEMON: </span>
				</text>
			)}
			<code
				content={renderedContent}
				filetype="markdown"
				syntaxStyle={DAEMON_MARKDOWN_STYLE}
				conceal={true}
				streaming={streaming}
				drawUnstyledText={false}
			/>
		</box>
	);
}

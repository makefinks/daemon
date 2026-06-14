import { COLORS, DAEMON_MARKDOWN_STYLE } from "../ui/constants";

export interface DaemonTextProps {
	content: string;
	showLabel?: boolean;
	streaming?: boolean;
}

export function DaemonText({ content, showLabel = false, streaming = false }: DaemonTextProps) {
	// Trim trailing whitespace when not streaming to avoid gaps before subsequent blocks
	const trimmedContent = streaming ? content : content.trimEnd();

	return (
		<box flexDirection="column">
			{showLabel && (
				<text>
					<span fg={COLORS.DAEMON_LABEL}>DAEMON: </span>
				</text>
			)}
			<markdown
				content={trimmedContent}
				syntaxStyle={DAEMON_MARKDOWN_STYLE}
				conceal={true}
				streaming={streaming}
				tableOptions={{
					widthMode: "full",
					columnFitter: "balanced",
					wrapMode: "word",
					borders: true,
					outerBorder: true,
					borderStyle: "single",
					selectable: true,
				}}
			/>
		</box>
	);
}

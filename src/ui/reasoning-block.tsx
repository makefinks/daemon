import { TextAttributes } from "@opentui/core";
import { COLORS, REASONING_ANIMATION } from "./constants";
import { computeFadeProgress, segmentColor } from "./reasoning-colors";
import { formatElapsedTime } from "../utils/formatters";

interface RenderReasoningBlockOptions {
	highlightTail?: boolean;
}

export function renderReasoningBlock(
	content: string,
	durationMs?: number,
	lastCharTimestamp?: number,
	options: RenderReasoningBlockOptions = {}
) {
	const segmentLength = REASONING_ANIMATION.SEGMENT_LENGTH;
	const lines = content.split("\n");
	const fadeProgress = computeFadeProgress(lastCharTimestamp);
	const highlightTail = options.highlightTail === true;

	let totalChars = 0;
	for (const line of lines) {
		totalChars += line.length;
	}
	const tailStart = Math.max(0, totalChars - REASONING_ANIMATION.TAIL_LENGTH);

	const durationLabel =
		durationMs !== undefined ? ` · ${formatElapsedTime(durationMs, { style: "detailed" })}` : "";

	let charOffset = 0;
	return (
		<box
			flexDirection="column"
			border={["left"]}
			borderStyle="heavy"
			borderColor={COLORS.REASONING_DIM}
			paddingLeft={1}
		>
			<text>
				<span fg={COLORS.REASONING} attributes={TextAttributes.BOLD}>
					{"REASONING"}
				</span>
				<span fg={COLORS.REASONING_DIM}>{durationLabel}</span>
			</text>
			{lines.map((line, lineIdx) => {
				const lineStart = charOffset;
				charOffset += line.length;
				if (!highlightTail || lineStart + line.length <= tailStart) {
					return (
						<text key={`reasoning-line-${lineIdx}`}>
							<span fg={COLORS.REASONING_DIM} attributes={TextAttributes.ITALIC}>
								{line}
							</span>
						</text>
					);
				}

				const tailOffset = Math.max(0, tailStart - lineStart);
				const plainText = line.slice(0, tailOffset);
				const tailText = line.slice(tailOffset);
				const segments: Array<{ text: string; color: string }> = [];
				const segmentCount = Math.max(1, Math.ceil(tailText.length / segmentLength));

				for (let i = 0; i < segmentCount; i += 1) {
					const start = i * segmentLength;
					const text = tailText.slice(start, start + segmentLength);
					const charPos = lineStart + tailOffset + start + text.length / 2;
					const remapped = (charPos - tailStart) / Math.min(REASONING_ANIMATION.TAIL_LENGTH, totalChars);
					segments.push({ text, color: segmentColor(remapped, fadeProgress) });
				}

				return (
					<text key={`reasoning-line-${lineIdx}`}>
						{plainText && (
							<span fg={COLORS.REASONING_DIM} attributes={TextAttributes.ITALIC}>
								{plainText}
							</span>
						)}
						{segments.map((segment, segIdx) => (
							<span
								fg={segment.color}
								key={`reasoning-seg-${lineIdx}-${segIdx}`}
								attributes={TextAttributes.ITALIC}
							>
								{segment.text}
							</span>
						))}
					</text>
				);
			})}
		</box>
	);
}

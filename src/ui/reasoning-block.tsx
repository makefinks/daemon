import { TextAttributes } from "@opentui/core";
import { COLORS, REASONING_ANIMATION } from "./constants";
import { computeFadeProgress, segmentColor } from "./reasoning-colors";
import { formatElapsedTime } from "../utils/formatters";

export function renderReasoningBlock(content: string, durationMs?: number, lastCharTimestamp?: number) {
	const segmentLength = REASONING_ANIMATION.SEGMENT_LENGTH;
	const lines = content.split("\n");
	const fadeProgress = computeFadeProgress(lastCharTimestamp);

	let totalChars = 0;
	for (const line of lines) {
		totalChars += line.length;
	}

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
				const segments: Array<{ text: string; color: string }> = [];
				const segmentCount = Math.max(1, Math.ceil(line.length / segmentLength));

				for (let i = 0; i < segmentCount; i += 1) {
					const start = i * segmentLength;
					const text = line.slice(start, start + segmentLength);
					const charPos = charOffset + start + text.length / 2;
					const tailStart = Math.max(0, totalChars - REASONING_ANIMATION.TAIL_LENGTH);
					const remapped =
						charPos < tailStart
							? 0
							: (charPos - tailStart) / Math.min(REASONING_ANIMATION.TAIL_LENGTH, totalChars);
					segments.push({ text, color: segmentColor(remapped, fadeProgress) });
				}

				charOffset += line.length;

				return (
					<text key={`reasoning-line-${lineIdx}`}>
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

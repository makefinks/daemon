import { TextAttributes } from "@opentui/core";
import { COLORS, REASONING_ANIMATION } from "./constants";
import { computeFadeProgress, segmentColor } from "./reasoning-colors";

export function renderReasoningTicker(reasoningDisplay: string, lastCharTimestamp?: number) {
	const segmentLength = REASONING_ANIMATION.SEGMENT_LENGTH;
	const segments: Array<{ text: string; color: string }> = [];
	const segmentCount = Math.max(1, Math.ceil(reasoningDisplay.length / segmentLength));
	const fadeProgress = computeFadeProgress(lastCharTimestamp);

	for (let index = 0; index < segmentCount; index += 1) {
		const start = index * segmentLength;
		const text = reasoningDisplay.slice(start, start + segmentLength);
		const normalized = segmentCount > 1 ? index / (segmentCount - 1) : 1;

		segments.push({ text, color: segmentColor(normalized, fadeProgress) });
	}

	return (
		<text>
			<span fg={COLORS.REASONING_DIM} attributes={TextAttributes.BOLD}>
				{"REASONING"}
			</span>
			<span fg={REASONING_ANIMATION.PREFIX_COLOR}>{" | "}</span>
			{segments.map((segment, index) => (
				<span fg={segment.color} key={`reasoning-seg-${index}`} attributes={TextAttributes.ITALIC}>
					{segment.text}
				</span>
			))}
		</text>
	);
}

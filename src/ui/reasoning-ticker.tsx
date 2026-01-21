import { TextAttributes } from "@opentui/core";
import { COLORS, REASONING_ANIMATION } from "./constants";

export function renderReasoningTicker(reasoningDisplay: string) {
	const segmentLength = REASONING_ANIMATION.SEGMENT_LENGTH;
	const segments: Array<{ text: string; color: string }> = [];
	const segmentCount = Math.max(1, Math.ceil(reasoningDisplay.length / segmentLength));
	for (let index = 0; index < segmentCount; index += 1) {
		const start = index * segmentLength;
		const text = reasoningDisplay.slice(start, start + segmentLength);
		const normalized = segmentCount > 1 ? index / (segmentCount - 1) : 1;

		let color: string = COLORS.REASONING_DIM;
		if (normalized >= 0.9) {
			color = "#b2a2e0";
		} else if (normalized >= 0.75) {
			color = "#9c8ac8";
		} else if (normalized >= 0.6) {
			color = "#8774b0";
		} else if (normalized >= 0.45) {
			color = "#725e98";
		} else if (normalized >= 0.3) {
			color = "#5e4a80";
		}

		segments.push({ text, color });
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

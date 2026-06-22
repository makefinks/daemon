import { useEffect, useRef, useState } from "react";

import { COLORS } from "../../ui/constants";

const TRANSCRIPTION_FADE_MS = 450;
const TRANSCRIPTION_TICK_MS = 33;

type Rgb = readonly [number, number, number];

function hexToRgb(hex: string): Rgb {
	const v = hex.replace("#", "");
	return [
		Number.parseInt(v.slice(0, 2), 16),
		Number.parseInt(v.slice(2, 4), 16),
		Number.parseInt(v.slice(4, 6), 16),
	] as const;
}

const TAIL_START_RGB: Rgb = hexToRgb("#64748b");
const TAIL_END_RGB: Rgb = hexToRgb(COLORS.USER_TEXT);

function mixRgb(from: Rgb, to: Rgb, progress: number): string {
	const t = Math.max(0, Math.min(1, progress));
	const r = Math.round(from[0] + (to[0] - from[0]) * t);
	const g = Math.round(from[1] + (to[1] - from[1]) * t);
	const b = Math.round(from[2] + (to[2] - from[2]) * t);
	return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b
		.toString(16)
		.padStart(2, "0")}`;
}

function commonPrefixLength(a: string, b: string): number {
	let i = 0;
	while (i < a.length && i < b.length && a[i] === b[i]) i++;
	return i;
}

export function LiveTranscriptionPreview({ text }: { text: string }) {
	const previousTextRef = useRef(text);
	const [tailStart, setTailStart] = useState(text.length);
	const [fadeStartedAt, setFadeStartedAt] = useState(Date.now());
	const [, setTick] = useState(0);

	useEffect(() => {
		const previous = previousTextRef.current;
		if (text === previous) return;
		setTailStart(text.startsWith(previous) ? previous.length : commonPrefixLength(previous, text));
		previousTextRef.current = text;
		setFadeStartedAt(Date.now());
	}, [text]);

	useEffect(() => {
		const interval = setInterval(() => {
			const elapsed = Date.now() - fadeStartedAt;
			if (elapsed >= TRANSCRIPTION_FADE_MS) {
				setTick((t) => t + 1);
				clearInterval(interval);
			} else {
				setTick((t) => t + 1);
			}
		}, TRANSCRIPTION_TICK_MS);
		return () => clearInterval(interval);
	}, [fadeStartedAt]);

	const progress = Math.min(1, (Date.now() - fadeStartedAt) / TRANSCRIPTION_FADE_MS);
	const stableText = text.slice(0, tailStart);
	const tailText = text.slice(tailStart);
	const tailColor = mixRgb(TAIL_START_RGB, TAIL_END_RGB, progress);

	return (
		<text>
			<span fg={COLORS.USER_LABEL}>YOU: </span>
			<span fg={COLORS.USER_TEXT}>{stableText}</span>
			<span fg={tailColor}>{tailText}</span>
		</text>
	);
}

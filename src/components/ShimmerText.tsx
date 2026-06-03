import { TextAttributes } from "@opentui/core";
import { useShimmer } from "../hooks/use-shimmer";
import type { ShimmerConfig } from "../hooks/use-shimmer";

function lerpColor(c1: string, c2: string, t: number): string {
	const r1 = Number.parseInt(c1.slice(1, 3), 16);
	const g1 = Number.parseInt(c1.slice(3, 5), 16);
	const b1 = Number.parseInt(c1.slice(5, 7), 16);
	const r2 = Number.parseInt(c2.slice(1, 3), 16);
	const g2 = Number.parseInt(c2.slice(3, 5), 16);
	const b2 = Number.parseInt(c2.slice(5, 7), 16);
	const r = Math.round(r1 + (r2 - r1) * t);
	const g = Math.round(g1 + (g2 - g1) * t);
	const b = Math.round(b1 + (b2 - b1) * t);
	return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function smoothstep(t: number): number {
	return t * t * (3 - 2 * t);
}

export interface ShimmerTextProps {
	text: string;
	baseColor: string;
	highlightColor?: string;
	attributes?: number;
	config?: ShimmerConfig;
}

export function ShimmerText({
	text,
	baseColor,
	highlightColor = "#ffffff",
	attributes = TextAttributes.NONE,
	config,
}: ShimmerTextProps) {
	const phase = useShimmer(config);
	const gradWidth = config?.gradientWidth ?? 6;
	const totalSweep = text.length + 2 * gradWidth;
	const highlightPos = phase * totalSweep - gradWidth;

	return (
		<>
			{Array.from(text).map((char, i) => {
				const dist = Math.abs(i - highlightPos);
				const rawIntensity = Math.max(0, 1 - dist / gradWidth);
				const eased = smoothstep(rawIntensity);
				const color = lerpColor(baseColor, highlightColor, eased);
				return (
					<span fg={color} attributes={attributes} key={`shimmer-${i}`}>
						{char}
					</span>
				);
			})}
		</>
	);
}

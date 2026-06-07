import { COLORS, REASONING_ANIMATION } from "./constants";

export const GRADIENT_COLORS = ["#5e4a80", "#725e98", "#8774b0", "#9c8ac8", "#b2a2e0"] as const;

function hexToRgb(hex: string): [number, number, number] {
	const h = hex.replace("#", "");
	return [
		Number.parseInt(h.slice(0, 2), 16),
		Number.parseInt(h.slice(2, 4), 16),
		Number.parseInt(h.slice(4, 6), 16),
	];
}

function rgbToHex(r: number, g: number, b: number): string {
	const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
	return `#${clamp(r).toString(16).padStart(2, "0")}${clamp(g).toString(16).padStart(2, "0")}${clamp(b).toString(16).padStart(2, "0")}`;
}

export function lerpColor(from: string, to: string, t: number): string {
	const [r1, g1, b1] = hexToRgb(from);
	const [r2, g2, b2] = hexToRgb(to);
	return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

export function gradientColorForNormalized(normalized: number): string {
	if (normalized >= 0.9) return GRADIENT_COLORS[4];
	if (normalized >= 0.75) return GRADIENT_COLORS[3];
	if (normalized >= 0.6) return GRADIENT_COLORS[2];
	if (normalized >= 0.45) return GRADIENT_COLORS[1];
	if (normalized >= 0.3) return GRADIENT_COLORS[0];
	return COLORS.REASONING_DIM;
}

export function computeFadeProgress(lastCharTimestamp?: number): number {
	if (!lastCharTimestamp) return 0;
	const age = Date.now() - lastCharTimestamp;
	return Math.min(1, Math.max(0, age / REASONING_ANIMATION.FADE_MS));
}

export function segmentColor(normalized: number, fadeProgress: number): string {
	const brightColor = gradientColorForNormalized(normalized);
	if (fadeProgress >= 1) return COLORS.REASONING_DIM;
	return lerpColor(brightColor, COLORS.REASONING_DIM, fadeProgress);
}

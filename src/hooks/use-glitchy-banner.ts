import { useEffect, useState } from "react";

import { STARTUP_BANNER_DURATION_MS } from "../ui/startup";

const DAEMON_BANNER_LINES = [
	"88888888ba,         db         88888888888  88b           d88    ,ad8888ba,    888b      88",
	'88      `"8b       d88b        88           888b         d888   d8"\'    `"8b   8888b     88',
	"88        `8b     d8'`8b       88           88`8b       d8'88  d8'        `8b  88 `8b    88",
	"88         88    d8'  `8b      88aaaaa      88 `8b     d8' 88  88          88  88  `8b   88",
	'88         88   d8YaaaaY8b     88"""""      88  `8b   d8\'  88  88          88  88   `8b  88',
	'88         8P  d8""""""""8b    88           88   `8b d8\'   88  Y8,        ,8P  88    `8b 88',
	"88      .a8P  d8'        `8b   88           88    `888'    88   Y8a.    .a8P   88     `8888",
	"88888888Y\"'  d8'          `8b  88888888888  88     `8'     88    `\"Y8888Y\"'    88      `888",
];

const BANNER_GRADIENT = [
	"#8a3434",
	"#7a2f2f",
	"#692929",
	"#582323",
	"#481c1c",
	"#371515",
	"#260f0f",
	"#160808",
];

// glitch chars
const GLITCH_CHARS = "!@#$%^&*()_+-=[]{}|;:',.<>?/\\`~01";

const BANNER_ANIMATION_DURATION = STARTUP_BANNER_DURATION_MS;
const LINE_STAGGER_MS = 80;

export interface GlitchyBannerState {
	lines: string[];
	colors: string[];
	progress: number;
	complete: boolean;
}

/**
 * Generates a glitched version of a string.
 * @param original The original string
 * @param glitchAmount 0-1, where 1 = fully glitched
 * @param revealProgress 0-1, where 1 = fully revealed from left
 */
function glitchString(original: string, glitchAmount: number, revealProgress: number): string {
	const revealedLength = Math.floor(original.length * revealProgress);
	let result = "";

	for (let i = 0; i < original.length; i++) {
		const char = original[i];

		if (i >= revealedLength) {
			// Not yet revealed - either empty or glitch
			if (Math.random() < glitchAmount * 0.7) {
				result += GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
			} else {
				result += " ";
			}
		} else {
			// Revealed area - occasional glitch corruption
			if (char !== " " && Math.random() < glitchAmount * 0.15) {
				result += GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
			} else {
				result += char;
			}
		}
	}

	return result;
}

/**
 * Generates glitched color - subtle brightness/saturation shifts within red spectrum
 */
function glitchColor(baseColor: string, glitchAmount: number): string {
	if (glitchAmount > 0.2 && Math.random() < glitchAmount * 0.4) {
		const hex = baseColor.replace("#", "");
		const r = parseInt(hex.substring(0, 2), 16);
		const g = parseInt(hex.substring(2, 4), 16);
		const b = parseInt(hex.substring(4, 6), 16);

		// Subtle variation: shift brightness and add slight color temperature changes
		const brightnessShift = (Math.random() - 0.3) * glitchAmount * 80;
		const newR = Math.max(0, Math.min(255, r + brightnessShift + Math.random() * 30));
		const newG = Math.max(0, Math.min(255, g + brightnessShift * 0.3));
		const newB = Math.max(0, Math.min(255, b + brightnessShift * 0.2));

		return `#${Math.round(newR).toString(16).padStart(2, "0")}${Math.round(newG).toString(16).padStart(2, "0")}${Math.round(newB).toString(16).padStart(2, "0")}`;
	}
	return baseColor;
}

export function useGlitchyBanner(isActive: boolean): GlitchyBannerState {
	const [state, setState] = useState<GlitchyBannerState>({
		lines: DAEMON_BANNER_LINES.map(() => ""),
		colors: BANNER_GRADIENT.map(() => "#000000"),
		progress: 0,
		complete: false,
	});

	// Animation loop
	useEffect(() => {
		if (!isActive) {
			setState({
				lines: DAEMON_BANNER_LINES.map(() => ""),
				colors: BANNER_GRADIENT.map(() => "#000000"),
				progress: 0,
				complete: false,
			});
			return;
		}

		const startTime = performance.now();
		const animate = () => {
			const elapsed = performance.now() - startTime;
			const progress = Math.min(1, elapsed / BANNER_ANIMATION_DURATION);

			if (progress >= 1) {
				// Animation complete, show final state
				setState({
					lines: [...DAEMON_BANNER_LINES],
					colors: [...BANNER_GRADIENT],
					progress: 1,
					complete: true,
				});
				return;
			}

			// Calculate glitch intensity (high at start, fades out)
			const glitchIntensity = Math.pow(1 - progress, 2);

			// Generate glitched lines with staggered reveal
			const lines = DAEMON_BANNER_LINES.map((line, i) => {
				const lineStartTime = i * LINE_STAGGER_MS;
				const lineElapsed = Math.max(0, elapsed - lineStartTime);
				const lineProgress = Math.min(1, lineElapsed / (BANNER_ANIMATION_DURATION - i * LINE_STAGGER_MS));

				// Reveal from left + glitch effect
				const revealProgress = Math.pow(lineProgress, 0.7); // Ease out
				return glitchString(line, glitchIntensity, revealProgress);
			});

			// Generate colors with occasional glitch flash
			const colors = BANNER_GRADIENT.map((color, i) => {
				const lineStartTime = i * LINE_STAGGER_MS;
				const lineElapsed = Math.max(0, elapsed - lineStartTime);
				const lineProgress = Math.min(1, lineElapsed / (BANNER_ANIMATION_DURATION - i * LINE_STAGGER_MS));

				if (lineProgress < 0.1) {
					return "#000000";
				}
				return glitchColor(color, glitchIntensity);
			});

			setState({
				lines,
				colors,
				progress,
				complete: false,
			});
		};

		// Run at ~30fps for glitchy effect
		const intervalId = setInterval(animate, 33);
		// Run once immediately
		animate();

		return () => clearInterval(intervalId);
	}, [isActive]);

	return state;
}

export { DAEMON_BANNER_LINES, BANNER_GRADIENT };

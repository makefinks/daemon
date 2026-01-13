/**
 * Avatar and UI color themes for different daemon states.
 */

import { DaemonState } from "./index";
import type { AvatarColorTheme } from "./index";

/**
 * Avatar color themes for each daemon state
 */
export const STATE_COLORS: Record<DaemonState, AvatarColorTheme> = {
	[DaemonState.IDLE]: {
		primary: 0x9ca3af, // Gray
		glow: 0x67e8f9, // Cyan glow
		eye: 0xff0000, // Red
	},
	[DaemonState.LISTENING]: {
		primary: 0x22d3ee, // Bright cyan
		glow: 0x67e8f9,
		eye: 0x22d3ee,
	},
	[DaemonState.TRANSCRIBING]: {
		primary: 0xa78bfa, // Purple
		glow: 0xc4b5fd,
		eye: 0xa78bfa,
	},
	[DaemonState.RESPONDING]: {
		primary: 0x4ade80, // Green
		glow: 0x86efac,
		eye: 0x4ade80,
	},
	[DaemonState.SPEAKING]: {
		primary: 0x22d3ee, // Cyan - voice output
		glow: 0x67e8f9,
		eye: 0x22d3ee,
	},
	[DaemonState.TYPING]: {
		primary: 0x9ca3af,
		glow: 0x67e8f9,
		eye: 0xff0000,
	},
};

/**
 * Special color theme for reasoning phase (before speaking).
 * Soft blue-gray - contemplative, calm, less aggressive.
 */
export const REASONING_COLORS: AvatarColorTheme = {
	primary: 0x64748b, // Slate gray-blue
	glow: 0x94a3b8, // Lighter slate
	eye: 0x94a3b8, // Soft glow
};

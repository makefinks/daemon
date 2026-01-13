/**
 * UI constants including colors, status text, and markdown syntax styles.
 */

import { SyntaxStyle, RGBA } from "@opentui/core";
import { DaemonState } from "../types";

// Status text displayed for each daemon state
export const STATUS_TEXT: Record<DaemonState, string> = {
	[DaemonState.IDLE]: "SPACE speak · SHIFT+TAB type · M models · S settings · L sessions · ? hotkeys",
	[DaemonState.LISTENING]: "LISTENING · SPACE stop · ESC cancel",
	[DaemonState.TRANSCRIBING]: "PROCESSING VOICE... · ESC cancel",
	[DaemonState.RESPONDING]: "DAEMON SPEAKS... · ESC cancel · T reasoning",
	[DaemonState.SPEAKING]: "DAEMON SPEAKS... · ESC stop",
	[DaemonState.TYPING]: "TYPE MODE · ENTER submit · ESC cancel",
};

// Hex colors for status bar text per state
export const STATE_COLOR_HEX: Record<DaemonState, string> = {
	[DaemonState.IDLE]: "#9ca3af",
	[DaemonState.LISTENING]: "#22d3ee",
	[DaemonState.TRANSCRIBING]: "#a78bfa",
	[DaemonState.RESPONDING]: "#4ade80",
	[DaemonState.SPEAKING]: "#22d3ee",
	[DaemonState.TYPING]: "#fbbf24",
};

// Animation settings for reasoning text ticker
export const REASONING_ANIMATION = {
	LINE_WIDTH: 120,
	CHARS_PER_TICK: 6,
	TICK_INTERVAL_MS: 16,
	INTENSITY: 0.5,
} as const;

// UI colors
export const COLORS = {
	BACKGROUND: "#050509",
	LISTENING_DIM: "#050509A8",
	ERROR: "#ef4444",
	DAEMON_ERROR: "#ef4444",
	REASONING: "#a78bfa",
	REASONING_DIM: "#525252",
	TOOLS: "#3f4651",
	TOOL_INPUT_BG: "#0a0a0f60",
	TOOL_INPUT_BORDER: "#3f465180",
	TOOL_INPUT_TEXT: "#9ca3af",
	USER_LABEL: "#bfdbfe",
	USER_TEXT: "#ffffff",
	USER_BG: "#1e293b",
	DAEMON_LABEL: "#22d3ee",
	DAEMON_TEXT: "#4ade80",
	TYPING_PROMPT: "#fbbf24",
	EMPTY_STATE: "#374151",
	MENU_BORDER: "#22d3ee",
	MENU_BG: "#0a0a0f",
	MENU_SELECTED_BG: "#1a1a2e",
	MENU_TEXT: "#9ca3af",
	TOKEN_USAGE: "#6b7280",
	TOKEN_USAGE_LABEL: "#525252",
	STATUS_BORDER: "#3f4651",
	WORKING_SPINNER_BORDER: "#1e293b",

	// General status colors (used across tool views, todos, subagent steps)
	STATUS_RUNNING: "#fbbf24",
	STATUS_COMPLETED: "#4ade80",
	STATUS_FAILED: "#ef4444",
	STATUS_PENDING: "#9ca3af",
	STATUS_DONE_DIM: "#2d333d",
	STATUS_APPROVAL: "#f472b6",
} as const;

// Markdown syntax style for daemon responses - alien/cultic aesthetic
export const DAEMON_MARKDOWN_STYLE = SyntaxStyle.fromStyles({
	// Default text inherits daemon green
	default: { fg: RGBA.fromHex(COLORS.DAEMON_TEXT) },
	// Headings - cyan hierarchy (daemon label color)
	"markup.heading.1": { fg: RGBA.fromHex("#22d3ee"), bold: true },
	"markup.heading.2": { fg: RGBA.fromHex("#06b6d4"), bold: true },
	"markup.heading.3": { fg: RGBA.fromHex("#0891b2"), bold: true },
	"markup.heading.4": { fg: RGBA.fromHex("#0e7490") },
	"markup.heading.5": { fg: RGBA.fromHex("#155e75") },
	"markup.heading.6": { fg: RGBA.fromHex("#164e63") },
	// Emphasis
	"markup.strong": { fg: RGBA.fromHex("#ffffff"), bold: true },
	"markup.italic": { fg: RGBA.fromHex("#a78bfa"), italic: true },
	"markup.strikethrough": { fg: RGBA.fromHex("#6b7280"), dim: true },
	// Code - purple/violet (reasoning color)
	"markup.raw": { fg: RGBA.fromHex("#c4b5fd") },
	"markup.raw.block": { fg: RGBA.fromHex("#c4b5fd") },
	// Links - cyan like daemon label
	"markup.link": { fg: RGBA.fromHex("#22d3ee") },
	"markup.link.url": { fg: RGBA.fromHex("#67e8f9"), underline: true },
	"markup.link.label": { fg: RGBA.fromHex("#22d3ee") },
	// Lists
	"markup.list": { fg: RGBA.fromHex("#9ca3af") },
	"markup.list.checked": { fg: RGBA.fromHex("#4ade80") },
	"markup.list.unchecked": { fg: RGBA.fromHex("#6b7280") },
	// Quotes - dimmed
	"markup.quote": { fg: RGBA.fromHex("#9ca3af"), italic: true },
	// Code block syntax highlighting
	keyword: { fg: RGBA.fromHex("#f472b6") },
	string: { fg: RGBA.fromHex("#a5d6ff") },
	comment: { fg: RGBA.fromHex("#6b7280"), italic: true },
	number: { fg: RGBA.fromHex("#fbbf24") },
	function: { fg: RGBA.fromHex("#7dd3fc") },
	type: { fg: RGBA.fromHex("#c4b5fd") },
	variable: { fg: RGBA.fromHex("#4ade80") },
	constant: { fg: RGBA.fromHex("#fbbf24") },
	operator: { fg: RGBA.fromHex("#f472b6") },
	punctuation: { fg: RGBA.fromHex("#9ca3af") },
	"punctuation.special": { fg: RGBA.fromHex("#6b7280") },
	label: { fg: RGBA.fromHex("#67e8f9") },
});

// Markdown syntax style for reasoning - dimmed/gray aesthetic
export const REASONING_MARKDOWN_STYLE = SyntaxStyle.fromStyles({
	// Default text inherits reasoning dim color
	default: { fg: RGBA.fromHex(COLORS.REASONING_DIM) },
	// Headings - slightly brighter
	"markup.heading.1": { fg: RGBA.fromHex("#a3a3a3"), bold: true },
	"markup.heading.2": { fg: RGBA.fromHex("#a3a3a3"), bold: true },
	"markup.heading.3": { fg: RGBA.fromHex("#a3a3a3"), bold: true },
	"markup.heading.4": { fg: RGBA.fromHex("#a3a3a3") },
	"markup.heading.5": { fg: RGBA.fromHex("#a3a3a3") },
	"markup.heading.6": { fg: RGBA.fromHex("#a3a3a3") },
	// Emphasis
	"markup.strong": { fg: RGBA.fromHex("#d4d4d4"), bold: true },
	"markup.italic": { fg: RGBA.fromHex("#a78bfa"), italic: true }, // Keep purple for italic
	"markup.strikethrough": { fg: RGBA.fromHex("#404040"), dim: true },
	// Code - keep purple theme but distinct
	"markup.raw": { fg: RGBA.fromHex("#8b5cf6") }, // Violet-500
	"markup.raw.block": { fg: RGBA.fromHex("#8b5cf6") },
	// Links
	"markup.link": { fg: RGBA.fromHex("#0891b2") }, // Cyan-600
	"markup.link.url": { fg: RGBA.fromHex("#0891b2"), underline: true },
	"markup.link.label": { fg: RGBA.fromHex("#0891b2") },
	// Lists
	"markup.list": { fg: RGBA.fromHex("#525252") },
	"markup.list.checked": { fg: RGBA.fromHex("#a3a3a3") },
	"markup.list.unchecked": { fg: RGBA.fromHex("#525252") },
	// Quotes
	"markup.quote": { fg: RGBA.fromHex("#525252"), italic: true },
	// Code block syntax highlighting - dimmed versions
	keyword: { fg: RGBA.fromHex("#db2777") }, // Pink-600
	string: { fg: RGBA.fromHex("#60a5fa") }, // Blue-400
	comment: { fg: RGBA.fromHex("#404040"), italic: true },
	number: { fg: RGBA.fromHex("#d97706") }, // Amber-600
	function: { fg: RGBA.fromHex("#0ea5e9") }, // Sky-500
	type: { fg: RGBA.fromHex("#8b5cf6") }, // Violet-500
	variable: { fg: RGBA.fromHex("#22c55e") }, // Green-500
	constant: { fg: RGBA.fromHex("#d97706") },
	operator: { fg: RGBA.fromHex("#db2777") },
	punctuation: { fg: RGBA.fromHex("#525252") },
	"punctuation.special": { fg: RGBA.fromHex("#525252") },
	label: { fg: RGBA.fromHex("#0891b2") },
});

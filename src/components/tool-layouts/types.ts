/**
 * Type definitions for the tool layout system.
 * Enables per-tool customization of display in ToolCallView.
 */

import type { ReactNode } from "react";
import type { ToolCall } from "../../types";

/**
 * Header content extracted from tool input/result.
 */
export interface ToolHeader {
	/** Main content after tool name (e.g., URL, query, file path) */
	primary?: string;
	/** Secondary dimmed content (e.g., params, description) */
	secondary?: string;
	/** Style for secondary text */
	secondaryStyle?: "dim" | "italic";
}

/**
 * A single line in the tool body.
 */
export interface ToolBodyLine {
	/** The text content */
	text: string;
	/** Optional color override (hex) */
	color?: string;
	/** Optional icon/sigil prefix */
	icon?: string;
	/** Optional text attributes (from TextAttributes) */
	attributes?: number;
	/** Optional status for icon coloring */
	status?: "running" | "completed" | "failed" | "pending";
}

/**
 * A segment of a result preview line. Allows per-segment coloring so layouts
 * can highlight portions (e.g. matched query keywords) within a dimmed line.
 */
export interface ToolPreviewSegment {
	text: string;
	/** Optional color override (hex). Defaults to dim. */
	color?: string;
}

export interface ToolResultFormatOptions {
	/** When true, return the complete tool result for the focused scrollbox. */
	expanded?: boolean;
}

/**
 * Body content for boxed/custom tool layouts.
 */
export interface ToolBody {
	/** Lines to render in the body */
	lines: ToolBodyLine[];
}

/**
 * Props passed to custom layout render functions.
 */
export interface ToolLayoutRenderProps {
	/** The tool call data */
	call: ToolCall;
	/** The tool result (if available) */
	result?: unknown;
	/** Whether to show output preview */
	showOutput?: boolean;
}

/**
 * Configuration for how a tool should be displayed.
 * Simple tools can use extractors; complex tools can provide a custom render.
 */
export interface ToolLayoutConfig {
	/** Display name abbreviation shown in header */
	abbreviation: string;

	/**
	 * Extract header info from tool input/result.
	 * Called to populate the header line after the tool name.
	 */
	getHeader?: (input: unknown, result?: unknown) => ToolHeader | null;

	/**
	 * Extract body content for rendering below the header.
	 * For tools that need multi-line display (e.g., bash command, steps).
	 */
	getBody?: (input: unknown, result?: unknown, call?: ToolCall) => ToolBody | null;

	/**
	 * Format result preview lines.
	 * Returns an array of strings (dimmed) or rich segments with optional
	 * color overrides to highlight portions of the line.
	 */
	formatResult?: (
		result: unknown,
		input?: unknown,
		options?: ToolResultFormatOptions
	) => Array<string | ToolPreviewSegment[]> | null;

	/**
	 * Optional override for the card's border color (e.g. to indicate focus).
	 * Receives the current `ToolCall` for context.
	 */
	getBorderColor?: (call: ToolCall) => string | undefined;

	/**
	 * Custom render function for complete control over the tool body.
	 * When provided, getBody is ignored and this renders instead.
	 * The header is still rendered by the shared component.
	 */
	renderBody?: (props: ToolLayoutRenderProps) => ReactNode;
}

/**
 * Type for the tool layout registry map.
 */
export type ToolLayoutRegistry = Map<string, ToolLayoutConfig>;

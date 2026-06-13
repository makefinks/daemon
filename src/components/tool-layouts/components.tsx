import { useEffect, useMemo, useRef } from "react";
import type { MouseEvent, ScrollBoxRenderable } from "@opentui/core";
import { TextAttributes } from "@opentui/core";
import type { LiveToolOutput, ToolCallStatus } from "../../types";
import { COLORS } from "../../ui/constants";
import type { ToolBody, ToolBodyLine, ToolHeader, ToolPreviewSegment } from "./types";

interface ToolHeaderViewProps {
	toolName: string;
	header: ToolHeader | null;
	isRunning: boolean;
	toolColor: string;
	requestSize?: string | null;
	runningLabel?: string | null;
}

export function ToolHeaderView({
	toolName,
	header,
	isRunning,
	toolColor,
	requestSize,
	runningLabel,
}: ToolHeaderViewProps) {
	const displayName = toolName.toUpperCase();
	return (
		<box flexDirection="row" alignItems="center" justifyContent="space-between" width="100%">
			<text>
				<span fg={toolColor}>{"↯ "}</span>
				<span fg={toolColor}>{displayName}</span>
				{header?.primary && <span fg={COLORS.TOOL_INPUT_TEXT}>{` ${header.primary}`}</span>}
				{header?.secondary && (
					<span
						fg={COLORS.REASONING_DIM}
						attributes={header.secondaryStyle === "italic" ? TextAttributes.ITALIC : TextAttributes.NONE}
					>
						{` ${header.secondary}`}
					</span>
				)}
				{requestSize && <span fg={COLORS.REASONING_DIM}>{` · ${requestSize}`}</span>}
			</text>
			{isRunning && runningLabel ? (
				<box flexDirection="row" alignItems="center">
					<text>
						<span fg={COLORS.STATUS_RUNNING}>{`${runningLabel} `}</span>
					</text>
					<spinner name="dots" color={COLORS.STATUS_RUNNING} />
				</box>
			) : isRunning ? (
				<spinner name="dots" color={COLORS.STATUS_RUNNING} />
			) : null}
		</box>
	);
}

interface ToolBodyViewProps {
	body: ToolBody;
}

function getLineColor(line: ToolBodyLine): string {
	if (line.color) return line.color;
	if (line.status) {
		switch (line.status) {
			case "running":
				return COLORS.STATUS_RUNNING;
			case "completed":
				return COLORS.STATUS_COMPLETED;
			case "failed":
				return COLORS.STATUS_FAILED;
			default:
				return COLORS.STATUS_PENDING;
		}
	}
	return COLORS.TOOL_INPUT_TEXT;
}

export function ToolBodyView({ body }: ToolBodyViewProps) {
	return (
		<box flexDirection="column" paddingLeft={2} marginTop={0}>
			{body.lines.map((line, idx) => (
				<box key={idx} flexDirection="row" alignItems="center">
					{line.status === "running" ? (
						<spinner name="dots" color={getLineColor(line)} />
					) : line.icon ? (
						<text>
							<span fg={getLineColor(line)}>{line.icon}</span>
						</text>
					) : null}
					<text marginLeft={line.icon || line.status === "running" ? 1 : 0}>
						<span fg={getLineColor(line)} attributes={line.attributes ?? TextAttributes.NONE}>
							{line.text}
						</span>
					</text>
				</box>
			))}
		</box>
	);
}

interface ResultPreviewViewProps {
	lines: Array<string | ToolPreviewSegment[]>;
}

function toSegments(line: string | ToolPreviewSegment[]): ToolPreviewSegment[] {
	if (typeof line === "string") {
		return [{ text: `› ${line}` }];
	}
	return line.map((seg, segIdx) => (segIdx === 0 ? { ...seg, text: `› ${seg.text}` } : seg));
}

export function ResultPreviewView({ lines }: ResultPreviewViewProps) {
	return (
		<box flexDirection="column" paddingLeft={2}>
			{lines.map((line, idx) => {
				const segments = toSegments(line);
				return (
					<text key={idx}>
						{segments.map((segment, segIdx) => (
							<span key={segIdx} fg={segment.color ?? COLORS.REASONING_DIM}>
								{segment.text}
							</span>
						))}
					</text>
				);
			})}
		</box>
	);
}

interface ErrorPreviewViewProps {
	error: string;
	maxLength?: number;
}

export function ErrorPreviewView({ error, maxLength = 120 }: ErrorPreviewViewProps) {
	const displayError = error.length > maxLength ? `${error.slice(0, maxLength)}…` : error;

	return (
		<box flexDirection="column" paddingLeft={2}>
			<text>
				<span fg={COLORS.STATUS_FAILED}>{`⚠ ${displayError}`}</span>
			</text>
		</box>
	);
}

export function getStatusBorderColor(status: ToolCallStatus | undefined): string {
	switch (status) {
		case "completed":
			return COLORS.TOOL_INPUT_BORDER;
		case "failed":
			return COLORS.STATUS_FAILED;
		default:
			return COLORS.TOOL_INPUT_BORDER;
	}
}

interface BashLiveOutputViewProps {
	live: LiveToolOutput | null;
	maxHeight?: number;
	/** When true, scroll events are captured by the inner pane and don't bubble. */
	captureScroll?: boolean;
}

const DEFAULT_BASH_LIVE_HEIGHT = 12;

/**
 * Live terminal output for a running bash tool call. Auto-scrolls to the
 * bottom as new chunks arrive; the parent re-renders the entire tool card
 * on every emitted delta so this just reads the latest snapshot.
 */
export function BashLiveOutputView({ live, maxHeight, captureScroll = false }: BashLiveOutputViewProps) {
	const scrollRef = useRef<ScrollBoxRenderable | null>(null);

	// Intercept wheel/scroll events. When the card is "focused" (clicked), the
	// inner pane handles scrolling and we stop propagation so the conversation
	// doesn't also scroll. When NOT focused, we want the wheel to fall through
	// to the conversation; the ScrollBox's own `onMouseEvent` runs after this
	// hook regardless, so we restore `scrollTop` on the next frame to undo
	// the inner scroll it just applied.
	const handleScrollboxMouse = (event: MouseEvent) => {
		if (event.type !== "scroll" || !event.scroll) return;
		const scrollbox = scrollRef.current;
		if (!scrollbox) return;
		if (captureScroll) {
			const { direction, delta } = event.scroll;
			if (direction === "up") {
				scrollbox.scrollTop = Math.max(0, scrollbox.scrollTop - delta);
			} else if (direction === "down") {
				scrollbox.scrollTop = scrollbox.scrollTop + delta;
			}
			event.stopPropagation();
			event.preventDefault();
		} else {
			// Snapshot the position the ScrollBox is about to override, then
			// restore it on the next frame so the inner pane doesn't scroll.
			const before = scrollbox.scrollTop;
			queueMicrotask(() => {
				const current = scrollRef.current;
				if (current && current.scrollTop !== before) {
					current.scrollTop = before;
				}
			});
		}
	};

	// Build lines on every render so chunks appended to `live.stdout`/`live.stderr`
	// in place always show up. `useMemo` keyed on `live` would cache the first
	// snapshot because the runtime store mutates the same LiveToolOutput object
	// across chunks. We also use `updatedAt` to guarantee a fresh scroll-to-bottom
	// even if the dep array didn't notice a string mutation.
	const lines = useMemo(
		() => buildLiveOutputLines(live),
		[live, live?.stdout, live?.stderr, live?.updatedAt]
	);

	const max = maxHeight ?? DEFAULT_BASH_LIVE_HEIGHT;
	// Grow the pane to fit content up to the cap, then start scrolling.
	const height = Math.max(1, Math.min(max, lines.length));
	const overflow = Math.max(0, lines.length - max);

	useEffect(() => {
		const scrollbox = scrollRef.current;
		if (!scrollbox) return;
		const viewportHeight = scrollbox.viewport?.height ?? 0;
		if (viewportHeight <= 0) return;
		const maxScrollTop = Math.max(0, scrollbox.scrollHeight - viewportHeight);
		scrollbox.scrollTop = maxScrollTop;
	}, [height, lines, live?.updatedAt]);

	return (
		<box flexDirection="column" paddingLeft={2} marginTop={1} width="100%">
			<box flexDirection="row" alignItems="center">
				<text>
					<span fg={COLORS.REASONING_DIM}>{"--- OUTPUT"}</span>
					{overflow > 0 && (
						<span fg={COLORS.REASONING_DIM}>{` (${overflow} more line${overflow === 1 ? "" : "s"} ↑)`}</span>
					)}
				</text>
			</box>
			<scrollbox
				ref={scrollRef}
				height={height}
				width="100%"
				overflow="scroll"
				onMouse={handleScrollboxMouse}
			>
				{lines.length === 0 ? (
					<text>
						<span fg={COLORS.REASONING_DIM}>{"(no output yet)"}</span>
					</text>
				) : (
					lines.map((line, idx) => (
						<text key={idx}>
							<span fg={line.stream === "stderr" ? COLORS.STATUS_FAILED : COLORS.TOOL_INPUT_TEXT}>
								{line.text}
							</span>
						</text>
					))
				)}
			</scrollbox>
		</box>
	);
}

interface LiveOutputLine {
	stream: "stdout" | "stderr";
	text: string;
}

function buildLiveOutputLines(live: LiveToolOutput | null): LiveOutputLine[] {
	if (!live) return [];
	const result: LiveOutputLine[] = [];
	appendStreamLines(result, live.stdout, "stdout");
	appendStreamLines(result, live.stderr, "stderr");
	return result;
}

function appendStreamLines(target: LiveOutputLine[], text: string, stream: "stdout" | "stderr"): void {
	if (!text) return;
	const segments = text.split("\n");
	// Drop the trailing empty entry from a final newline so we don't render a blank row.
	if (segments.length > 0 && segments[segments.length - 1] === "") segments.pop();
	for (const segment of segments) {
		target.push({ stream, text: segment });
	}
}

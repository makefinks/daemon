import { memo, useEffect, useRef, useState } from "react";

import type { DaemonStats } from "../../types";
import { DaemonState } from "../../types";
import { STARTUP_AVATAR_SPAWN_DURATION_MS } from "../../ui/startup";

export interface AvatarHudProps {
	stats: DaemonStats | null;
	width: number;
	height: number;
	avatarWidth: number;
	avatarHeight: number;
	visible: boolean;
	staggeredReveal?: boolean;
	daemonState?: DaemonState;
	runningSessionCount?: number;
	approvalSessionCount?: number;
}

/** Label color — dim but legible */
const LABEL_COLOR = "#303055";
/** Label highlight — brighter pop-in color */
const LABEL_HIGHLIGHT = "#8888CC";
/** Value color — slightly brighter for contrast */
const VALUE_COLOR = "#454570";
/** Value highlight — brighter pop-in color */
const VALUE_HIGHLIGHT = "#AAAADD";
const HIDDEN_COLOR = "#050509";
const HUD_STAGGER_MS = 130;
const HUD_FADE_MS = 420;

/** Pulse animation — items bloom outward then return in sync */
const PULSE_OUTWARD_MS = 200;
const PULSE_RETURN_MS = 350;
const PULSE_BOUNCE = 1.06;
const PULSE_DURATION_MS = PULSE_OUTWARD_MS + PULSE_RETURN_MS;

/**
 * Format a token count with K/M suffix.
 * e.g. 1234 → "1.2K", 1234567 → "1.2M"
 */
function formatTokens(n: number): string {
	if (n >= 1_000_000) {
		return `${(n / 1_000_000).toFixed(1)}M`;
	}
	if (n >= 1_000) {
		return `${(n / 1_000).toFixed(1)}K`;
	}
	return String(n);
}

/**
 * Format a number with commas for thousands.
 * e.g. 1234 → "1,234"
 */
function formatNumber(n: number): string {
	return n.toLocaleString("en-US");
}

function hexToRgb(hex: string): [number, number, number] {
	const value = hex.replace("#", "");
	return [
		Number.parseInt(value.slice(0, 2), 16),
		Number.parseInt(value.slice(2, 4), 16),
		Number.parseInt(value.slice(4, 6), 16),
	];
}

function mixColor(from: string, to: string, progress: number): string {
	const [fr, fg, fb] = hexToRgb(from);
	const [tr, tg, tb] = hexToRgb(to);
	const t = Math.max(0, Math.min(1, progress));
	const r = Math.round(fr + (tr - fr) * t);
	const g = Math.round(fg + (tg - fg) * t);
	const b = Math.round(fb + (tb - fb) * t);
	return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b
		.toString(16)
		.padStart(2, "0")}`;
}

function easeOutCubic(progress: number): number {
	const t = Math.max(0, Math.min(1, progress));
	return 1 - Math.pow(1 - t, 3);
}

/**
 * Pulse radius scale — all items move in sync.
 * Phase 1: outward jump (radiusScale > 1).
 * Phase 2: return to normal position.
 */
function getPulseRadiusScale(elapsedMs: number): number {
	if (elapsedMs >= PULSE_DURATION_MS) {
		return 1;
	}

	const t = elapsedMs;

	// Phase 1: outward jump
	if (t < PULSE_OUTWARD_MS) {
		const p = t / PULSE_OUTWARD_MS;
		const eased = easeOutCubic(p);
		return 1 + (PULSE_BOUNCE - 1) * eased;
	}

	// Phase 2: return
	const returnT = (t - PULSE_OUTWARD_MS) / PULSE_RETURN_MS;
	const eased = easeOutCubic(returnT);
	return 1 + (PULSE_BOUNCE - 1) * (1 - eased);
}

function AvatarHudImpl(props: AvatarHudProps) {
	const {
		stats,
		width,
		height,
		avatarWidth,
		avatarHeight,
		visible,
		staggeredReveal = false,
		daemonState,
		runningSessionCount = 0,
		approvalSessionCount = 0,
	} = props;
	const [elapsedMs, setElapsedMs] = useState(() => (staggeredReveal ? 0 : Number.POSITIVE_INFINITY));

	// Pulse animation state
	const [pulseStart, setPulseStart] = useState(Number.NEGATIVE_INFINITY);
	const [pulseElapsed, setPulseElapsed] = useState(Number.POSITIVE_INFINITY);
	const prevDaemonStateRef = useRef(daemonState);

	// Pulse trigger: watch for transitions to/from TYPING or LISTENING states
	useEffect(() => {
		const prevDS = prevDaemonStateRef.current;
		prevDaemonStateRef.current = daemonState;

		if (!visible) return;

		if (
			(daemonState === DaemonState.TYPING) !== (prevDS === DaemonState.TYPING) ||
			(daemonState === DaemonState.LISTENING) !== (prevDS === DaemonState.LISTENING)
		) {
			startPulse();
		}
	}, [daemonState, visible]);

	function startPulse() {
		const start = performance.now();
		setPulseStart(start);
		setPulseElapsed(0);
	}

	// Pulse timer — drives pulseElapsed from pulseStart at ~60fps
	useEffect(() => {
		if (pulseStart === Number.NEGATIVE_INFINITY) return;
		const interval = setInterval(() => {
			const elapsed = performance.now() - pulseStart;
			if (elapsed >= PULSE_DURATION_MS) {
				setPulseElapsed(Number.POSITIVE_INFINITY);
				clearInterval(interval);
			} else {
				setPulseElapsed(elapsed);
			}
		}, 8);
		return () => clearInterval(interval);
	}, [pulseStart]);

	// Staggered reveal effect (startup animation)
	useEffect(() => {
		if (!visible) {
			setElapsedMs(0);
			return;
		}
		if (!staggeredReveal) {
			setElapsedMs(Number.POSITIVE_INFINITY);
			return;
		}

		const start = performance.now();
		setElapsedMs(0);
		const interval = setInterval(() => {
			setElapsedMs(performance.now() - start);
		}, 33);
		return () => clearInterval(interval);
	}, [visible, staggeredReveal]);

	if (!stats || !visible || width < 100 || height < 30) {
		return null;
	}

	// Pre-format all values
	const tokens = formatTokens(stats.totalTokens);
	const tools = formatNumber(stats.totalToolCalls);
	const skills = formatNumber(stats.totalSkills);
	const sessions =
		approvalSessionCount > 0
			? `${formatNumber(stats.totalSessions)} !${approvalSessionCount}`
			: runningSessionCount > 0
				? `${formatNumber(stats.totalSessions)} +${runningSessionCount}`
				: formatNumber(stats.totalSessions);
	const memories = formatNumber(stats.totalMemories);
	const artifacts = formatNumber(stats.totalArtifacts);
	const centerX = Math.floor(width / 2);
	const centerY = Math.floor(height / 2);
	const radiusX = Math.max(24, Math.floor(avatarWidth * 0.32));
	const radiusY = Math.max(8, Math.floor(avatarHeight * 0.24));
	// Left side: sessions, memories, tools
	// Right side: tokens, skills, artifacts
	const items = [
		{ label: "TOKENS", value: tokens, angle: -45 },
		{ label: "SESSIONS", value: sessions, angle: 0 },
		{ label: "ARTIFACTS", value: artifacts, angle: 45 },
		{ label: "SKILLS", value: skills, angle: 135 },
		{ label: "MEMORIES", value: memories, angle: 180 },
		{ label: "TOOLS", value: tools, angle: -135 },
	];

	return (
		<box position="absolute" top={0} left={0} width={width} height={height} zIndex={1}>
			{items.map((item, index) => {
				const revealStartMs = STARTUP_AVATAR_SPAWN_DURATION_MS + index * HUD_STAGGER_MS;
				const progress = staggeredReveal ? easeOutCubic((elapsedMs - revealStartMs) / HUD_FADE_MS) : 1;
				if (progress <= 0) return null;

				// Pulse: items bloom outward then settle back (no color fade)
				const pulseRadiusScale = getPulseRadiusScale(pulseElapsed);
				const labelColor = mixColor(LABEL_HIGHLIGHT, LABEL_COLOR, progress);
				const valueColor = mixColor(VALUE_HIGHLIGHT, VALUE_COLOR, progress);

				const radians = (item.angle * Math.PI) / 180;
				const cos = Math.cos(radians);
				const rX = radiusX * pulseRadiusScale;
				const rY = radiusY * pulseRadiusScale;
				const textWidth = item.label.length + 1 + item.value.length;
				const innerEdgeX = Math.round(centerX + cos * rX);
				const x = cos < 0 ? innerEdgeX - textWidth + 1 : innerEdgeX;
				const y = Math.round(centerY + Math.sin(radians) * rY);
				const left = Math.max(1, Math.min(width - textWidth - 1, x));
				const top = Math.max(1, Math.min(height - 2, y));
				const labelIsInner = cos >= 0;
				return (
					<box key={item.label} position="absolute" top={top} left={left} width={textWidth} height={1}>
						<text>
							{labelIsInner ? (
								<>
									<span fg={labelColor}>{item.label} </span>
									<span fg={valueColor}>{item.value}</span>
								</>
							) : (
								<>
									<span fg={valueColor}>{item.value} </span>
									<span fg={labelColor}>{item.label}</span>
								</>
							)}
						</text>
					</box>
				);
			})}
		</box>
	);
}

export const AvatarHud = memo(AvatarHudImpl);

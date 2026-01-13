import { COLORS } from "../ui/constants";
import { DaemonState } from "../types";

export interface InlineStatusProps {
	daemonState: DaemonState;
	isToolCalling: boolean;
	isReasoning: boolean;
	responseElapsedMs: number;
}

type InlineStatusConfig = {
	spinnerName: "line" | "dots3" | "dots2" | "dots" | "bouncingBall";
	label: string;
	color: string;
};

function buildElapsedSuffix(responseElapsedMs: number): string {
	if (!Number.isFinite(responseElapsedMs) || responseElapsedMs < 1000) {
		return "";
	}

	const seconds = Math.max(1, Math.floor(responseElapsedMs / 1000));
	return ` · ${seconds}s`;
}

function getInlineStatusConfig(args: {
	daemonState: DaemonState;
	isToolCalling: boolean;
	isReasoning: boolean;
	elapsedSuffix: string;
}): InlineStatusConfig | null {
	const { daemonState, isToolCalling, isReasoning, elapsedSuffix } = args;

	if (daemonState === DaemonState.IDLE) {
		return null;
	}

	if (isToolCalling) {
		return {
			spinnerName: "line",
			label: `CALLING TOOL${elapsedSuffix}`,
			color: COLORS.STATUS_RUNNING,
		};
	}

	if (isReasoning) {
		return {
			spinnerName: "dots3",
			label: `REASONING${elapsedSuffix}`,
			color: COLORS.REASONING,
		};
	}

	switch (daemonState) {
		case DaemonState.RESPONDING:
			return {
				spinnerName: "dots2",
				label: `RESPONDING${elapsedSuffix}`,
				color: COLORS.STATUS_BORDER,
			};
		case DaemonState.TRANSCRIBING:
			return {
				spinnerName: "dots",
				label: `TRANSCRIBING${elapsedSuffix}`,
				color: COLORS.STATUS_BORDER,
			};
		case DaemonState.SPEAKING:
			return {
				spinnerName: "bouncingBall",
				label: `SPEAKING${elapsedSuffix}`,
				color: COLORS.STATUS_BORDER,
			};
		default:
			return null;
	}
}

export function InlineStatusIndicator({
	daemonState,
	isToolCalling,
	isReasoning,
	responseElapsedMs,
}: InlineStatusProps) {
	const elapsedSuffix = buildElapsedSuffix(responseElapsedMs);
	const config = getInlineStatusConfig({
		daemonState,
		isToolCalling,
		isReasoning,
		elapsedSuffix,
	});

	if (!config) {
		return null;
	}

	const { spinnerName, label, color } = config;

	return (
		<box flexDirection="row" alignItems="center" marginTop={1} marginBottom={1} paddingLeft={2}>
			<spinner name={spinnerName} color={color} />
			<text marginLeft={1}>
				<span fg={color}>{label}</span>
			</text>
		</box>
	);
}

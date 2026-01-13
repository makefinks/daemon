import { useMemo } from "react";
import { DaemonState } from "../types";
import type { ContentBlock, SessionInfo } from "../types";
import type { ModelMetadata } from "../utils/model-metadata";
import { COLORS, STATE_COLOR_HEX, STATUS_TEXT } from "../ui/constants";
import { formatElapsedTime } from "../utils/formatters";

export interface UseAppDisplayStateParams {
	daemonState: DaemonState;
	currentContentBlocks: ContentBlock[];
	currentResponse: string;
	reasoningDisplay: string;
	reasoningQueue: string;
	responseElapsedMs: number;
	hasInteracted: boolean;

	currentModelId: string;
	modelMetadata: ModelMetadata | null;
	preferencesLoaded: boolean;

	currentSessionId: string | null;
	sessionMenuItems: Array<SessionInfo & { isNew: boolean }>;

	terminalWidth: number;
	terminalHeight: number;
}

export interface UseAppDisplayStateReturn {
	isToolCalling: boolean;
	isReasoning: boolean;
	statusText: string;
	statusColor: string;
	showWorkingSpinner: boolean;
	workingSpinnerLabel: string;
	modelName: string | undefined;
	sessionTitle: string | undefined;
	avatarWidth: number;
	avatarHeight: number;
	frostColor: string;
	isListening: boolean;
	isListeningDim: boolean;
}

const AVATAR_WIDTH_PERCENT = 0.8;
const AVATAR_HEIGHT_PERCENT = 0.8;
const AVATAR_MIN_WIDTH = 80;
const AVATAR_MAX_WIDTH = 500;
const AVATAR_MIN_HEIGHT = 40;
const AVATAR_MAX_HEIGHT = 300;

export function useAppDisplayState(params: UseAppDisplayStateParams): UseAppDisplayStateReturn {
	const {
		daemonState,
		currentContentBlocks,
		currentResponse,
		reasoningDisplay,
		reasoningQueue,
		responseElapsedMs,
		hasInteracted,
		currentModelId,
		modelMetadata,
		preferencesLoaded,
		currentSessionId,
		sessionMenuItems,
		terminalWidth,
		terminalHeight,
	} = params;

	const isToolCalling = useMemo(() => {
		if (daemonState !== DaemonState.RESPONDING) return false;
		return currentContentBlocks.some((b) => b.type === "tool" && b.call.status === "running");
	}, [daemonState, currentContentBlocks]);

	const isReasoning =
		daemonState === DaemonState.RESPONDING &&
		!isToolCalling &&
		(!currentResponse || !!reasoningDisplay || !!reasoningQueue);

	const statusText = useMemo(() => {
		if (daemonState === DaemonState.RESPONDING) {
			if (isToolCalling) {
				return "DAEMON INVOKES TOOL... · ESC cancel · T reasoning";
			}
			return isReasoning
				? "DAEMON REASONING... · ESC cancel · T reasoning"
				: "DAEMON SPEAKS... · ESC cancel · T reasoning";
		}
		let baseStatus = STATUS_TEXT[daemonState];
		if (daemonState === DaemonState.IDLE) {
			if (hasInteracted) {
				baseStatus = "SPACE speak · SHIFT+TAB type · N new · ? hotkeys";
			}
		}
		return baseStatus;
	}, [daemonState, isToolCalling, isReasoning, hasInteracted]);

	const statusColor = isToolCalling
		? COLORS.STATUS_RUNNING
		: isReasoning
			? COLORS.REASONING
			: STATE_COLOR_HEX[daemonState];

	const showWorkingSpinner = hasInteracted && daemonState === DaemonState.RESPONDING;
	const responseElapsedLabel = formatElapsedTime(responseElapsedMs);
	const workingSpinnerLabel = isToolCalling
		? `CALLING TOOL... · ${responseElapsedLabel}`
		: isReasoning
			? `REASONING... · ${responseElapsedLabel}`
			: `RESPONDING... · ${responseElapsedLabel}`;

	const modelName = useMemo(() => {
		if (!preferencesLoaded) return undefined;
		if (modelMetadata?.name && modelMetadata.id === currentModelId) {
			return modelMetadata.name;
		}
		return undefined;
	}, [modelMetadata, currentModelId, preferencesLoaded]);

	const sessionTitle = useMemo(() => {
		if (!currentSessionId) return undefined;
		const session = sessionMenuItems.find((s) => s.id === currentSessionId);
		return session?.title;
	}, [currentSessionId, sessionMenuItems]);

	const avatarWidth = useMemo(
		() =>
			Math.max(
				AVATAR_MIN_WIDTH,
				Math.min(AVATAR_MAX_WIDTH, Math.floor(terminalWidth * AVATAR_WIDTH_PERCENT))
			),
		[terminalWidth]
	);

	const avatarHeight = useMemo(
		() =>
			Math.max(
				AVATAR_MIN_HEIGHT,
				Math.min(AVATAR_MAX_HEIGHT, Math.floor(terminalHeight * AVATAR_HEIGHT_PERCENT))
			),
		[terminalHeight]
	);

	const frostColor = hasInteracted ? "#05050940" : COLORS.BACKGROUND;
	const isListening = daemonState === DaemonState.LISTENING || daemonState === DaemonState.TRANSCRIBING;
	const isListeningDim = isListening && hasInteracted;

	return {
		isToolCalling,
		isReasoning,
		statusText,
		statusColor,
		showWorkingSpinner,
		workingSpinnerLabel,
		modelName,
		sessionTitle,
		avatarWidth,
		avatarHeight,
		frostColor,
		isListening,
		isListeningDim,
	};
}

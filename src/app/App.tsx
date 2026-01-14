import { Toaster } from "@opentui-ui/toast/react";
import type { ScrollBoxRenderable, TextareaRenderable } from "@opentui/core";
import { extend, useRenderer } from "@opentui/react";
import "opentui-spinner/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { setOpenRouterProviderTag, setResponseModel } from "../ai/model-config";
import { DaemonAvatarRenderable } from "../avatar/DaemonAvatarRenderable";
import { useAppAudioDevicesLoader } from "../hooks/use-app-audio-devices-loader";
import { useAppCallbacks } from "../hooks/use-app-callbacks";
import { useAppContextBuilder } from "../hooks/use-app-context-builder";
import { useAppDisplayState } from "../hooks/use-app-display-state";
import { useAppMenus } from "../hooks/use-app-menus";
import { useAppModel } from "../hooks/use-app-model";
import { useAppPreferencesBootstrap } from "../hooks/use-app-preferences-bootstrap";
import { useAppSessions } from "../hooks/use-app-sessions";
import { useAppSettings } from "../hooks/use-app-settings";
import { useConversationManager } from "../hooks/use-conversation-manager";
import { useCopyOnSelect } from "../hooks/use-copy-on-select";
import { useDaemonEvents } from "../hooks/use-daemon-events";
import { useDaemonKeyboard } from "../hooks/use-daemon-keyboard";
import { useGrounding } from "../hooks/use-grounding";
import { useInputHistory } from "../hooks/use-input-history";
import { usePlaywrightNotification } from "../hooks/use-playwright-notification";
import { useReasoningAnimation } from "../hooks/use-reasoning-animation";
import { useResponseTimer } from "../hooks/use-response-timer";
import { ToolApprovalProvider } from "../hooks/use-tool-approval";
import { useTypingMode } from "../hooks/use-typing-mode";
import { useVoiceDependenciesNotification } from "../hooks/use-voice-dependencies-notification";
import { AppProvider } from "../state/app-context";
import { daemonEvents } from "../state/daemon-events";
import { getDaemonManager } from "../state/daemon-state";
import { deleteSession } from "../state/session-store";
import { DaemonState } from "../types";
import type { AppPreferences, AudioDevice, OnboardingStep } from "../types";
import { COLORS } from "../ui/constants";
import { openUrlInBrowser } from "../utils/preferences";
import { buildTextFragmentUrl } from "../utils/text-fragment";
import { getSoxInstallHint, isSoxAvailable, setAudioDevice } from "../voice/audio-recorder";
import { AppOverlays } from "./components/AppOverlays";
import { AvatarLayer } from "./components/AvatarLayer";
import {
	type ConversationDisplayState,
	ConversationPane,
	type ProgressDisplayState,
	type ReasoningDisplayState,
	type StatusDisplayState,
	type TypingInputState,
} from "./components/ConversationPane";

const INITIAL_STATUS_TOP = "70%";

const TOAST_OPTIONS = {
	style: {
		border: true,
		borderStyle: "single",
		borderColor: COLORS.REASONING,
		backgroundColor: "#0a0a0f",
		foregroundColor: "#e5e7eb",
		mutedColor: "#9ca3af",
		paddingX: 1,
		paddingY: 0,
		minHeight: 3,
	},
	success: { style: { borderColor: COLORS.DAEMON_TEXT } },
	error: { style: { borderColor: COLORS.ERROR } },
	warning: { style: { borderColor: "#fbbf24" } },
	info: { style: { borderColor: COLORS.REASONING } },
	loading: { style: { borderColor: COLORS.REASONING_DIM } },
} as const;

declare module "@opentui/react" {
	interface OpenTUIComponents {
		"daemon-avatar": typeof DaemonAvatarRenderable;
	}
}

extend({
	"daemon-avatar": DaemonAvatarRenderable,
});

export function App() {
	const renderer = useRenderer();

	const [onboardingActive, setOnboardingActive] = useState(false);
	usePlaywrightNotification({ enabled: !onboardingActive });
	useVoiceDependenciesNotification({ enabled: !onboardingActive });
	const { handleCopyOnSelectMouseUp } = useCopyOnSelect();

	const {
		reasoningQueue,
		reasoningDisplay,
		fullReasoning,
		setReasoningQueue,
		setFullReasoning,
		fullReasoningRef,
		clearReasoningState,
		clearReasoningTicker,
	} = useReasoningAnimation();

	const [preferencesLoaded, setPreferencesLoaded] = useState(false);

	const menus = useAppMenus();
	const {
		showDeviceMenu,
		setShowDeviceMenu,
		showSettingsMenu,
		setShowSettingsMenu,
		showModelMenu,
		setShowModelMenu,
		showProviderMenu,
		setShowProviderMenu,
		showSessionMenu,
		setShowSessionMenu,
		showHotkeysPane,
		setShowHotkeysPane,
		showGroundingMenu,
		setShowGroundingMenu,
	} = menus;

	const {
		currentSessionId,
		setCurrentSessionIdSafe,
		currentSessionIdRef,
		ensureSessionId,
		setSessions,
		sessionMenuItems,
		handleFirstMessage,
	} = useAppSessions({ showSessionMenu });

	const { latestGroundingMap, hasGrounding } = useGrounding(currentSessionId);
	const [groundingSelectedIndex, setGroundingSelectedIndex] = useState(0);

	const appSettings = useAppSettings();
	const {
		interactionMode,
		setInteractionMode,
		voiceInteractionType,
		setVoiceInteractionType,
		speechSpeed,
		setSpeechSpeed,
		reasoningEffort,
		setReasoningEffort,
		bashApprovalLevel,
		setBashApprovalLevel,
		showFullReasoning,
		setShowFullReasoning,
		showToolOutput,
		setShowToolOutput,
		canEnableVoiceOutput,
	} = appSettings;

	const appModel = useAppModel({
		preferencesLoaded,
		showProviderMenu,
	});
	const {
		currentModelId,
		setCurrentModelId,
		currentOpenRouterProviderTag,
		setCurrentOpenRouterProviderTag,
		modelsWithPricing,
		openRouterModels,
		openRouterModelsLoading,
		openRouterModelsUpdatedAt,
		providerMenuItems,
		refreshOpenRouterModels,
	} = appModel;

	const { addToHistory, navigateUp, navigateDown, resetNavigation } = useInputHistory();

	const {
		daemonState,
		conversationHistory,
		currentTranscription,
		currentResponse,
		currentContentBlocks,
		error,
		sessionUsage,
		modelMetadata,
		avatarRef,
		currentUserInputRef,
		hydrateConversationHistory,
		setCurrentTranscription,
		setCurrentResponse,
		clearCurrentContentBlocks,
		resetSessionUsage,
		setSessionUsage,
		applyAvatarForState,
	} = useDaemonEvents({
		currentModelId,
		preferencesLoaded,
		setReasoningQueue,
		setFullReasoning,
		clearReasoningState,
		clearReasoningTicker,
		fullReasoningRef,
		sessionId: currentSessionId,
		sessionIdRef: currentSessionIdRef,
		ensureSessionId,
		addToHistory,
		onFirstMessage: handleFirstMessage,
	});

	const {
		setTypingInput,
		typingTextareaRef,
		handleTypingContentChange,
		handleTypingSubmit,
		prefillTypingInput,
		handleHistoryUp,
		handleHistoryDown,
	} = useTypingMode({
		daemonState,
		currentUserInputRef,
		setCurrentTranscription,
		onTypingActivity: useCallback(() => {
			avatarRef.current?.triggerTypingPulse();
		}, [avatarRef]),
		navigateUp,
		navigateDown,
		resetNavigation,
	});

	const { responseElapsedMs } = useResponseTimer({ daemonState });

	const [loadedPreferences, setLoadedPreferences] = useState<AppPreferences | null>(null);
	const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>("intro");
	const [devices, setDevices] = useState<AudioDevice[]>([]);
	const [currentDevice, setCurrentDevice] = useState<string | undefined>(undefined);
	const [currentOutputDevice, setCurrentOutputDevice] = useState<string | undefined>(undefined);
	const [resetNotification, setResetNotification] = useState<string>("");
	const [apiKeyMissingError, setApiKeyMissingError] = useState<string>("");
	const [escPendingCancel, setEscPendingCancel] = useState(false);
	const [deviceLoadTimedOut, setDeviceLoadTimedOut] = useState(false);
	const soxAvailable = useMemo(() => isSoxAvailable(), []);
	const soxInstallHint = useMemo(() => getSoxInstallHint(), []);
	const apiKeyTextareaRef = useRef<TextareaRenderable | null>(null);
	const conversationScrollRef = useRef<ScrollBoxRenderable | null>(null);

	const manager = getDaemonManager();
	const supportsReasoning = modelMetadata?.supportsReasoning ?? false;

	useEffect(() => {
		const handleTranscriptionReady = (text: string) => {
			prefillTypingInput(text);
		};
		daemonEvents.on("transcriptionReady", handleTranscriptionReady);
		return () => {
			daemonEvents.off("transcriptionReady", handleTranscriptionReady);
		};
	}, [manager, prefillTypingInput]);

	useEffect(() => {
		manager.setEnsureSessionId(() => ensureSessionId());
		return () => manager.setEnsureSessionId(null);
	}, [manager, ensureSessionId]);

	const { persistPreferences } = useAppPreferencesBootstrap({
		manager,
		setCurrentModelId,
		setCurrentOpenRouterProviderTag,
		setCurrentDevice,
		setCurrentOutputDevice,
		setInteractionMode,
		setVoiceInteractionType,
		setSpeechSpeed,
		setReasoningEffort,
		setBashApprovalLevel,
		setShowFullReasoning,
		setShowToolOutput,
		setLoadedPreferences,
		setOnboardingActive,
		setOnboardingStep,
		setPreferencesLoaded,
	});

	useAppAudioDevicesLoader({
		preferencesLoaded,
		showDeviceMenu,
		onboardingStep,
		setDevices,
		setCurrentDevice,
		setDeviceLoadTimedOut,
	});

	const conversationManager = useConversationManager({
		conversationHistory,
		sessionUsage,
		currentSessionId,
		ensureSessionId,
		setCurrentSessionIdSafe,
		currentSessionIdRef,
		setSessions,
		hydrateConversationHistory,
		setCurrentTranscription,
		setCurrentResponse,
		clearCurrentContentBlocks,
		clearReasoningState,
		resetSessionUsage,
		setSessionUsage,
		currentUserInputRef,
	});
	const { clearConversationState, loadSessionById, startNewSession, undoLastTurn } = conversationManager;
	const startNewSessionAndReset = useCallback(() => {
		startNewSession();
		applyAvatarForState(DaemonState.IDLE);
	}, [startNewSession, applyAvatarForState]);

	const {
		handleDeviceSelect,
		handleOutputDeviceSelect,
		handleModelSelect,
		handleProviderSelect,
		toggleInteractionMode,
		completeOnboarding,
		handleApiKeySubmit,
	} = useAppCallbacks({
		currentModelId,
		setCurrentModelId,
		setCurrentDevice,
		setCurrentOutputDevice,
		setCurrentOpenRouterProviderTag,
		setInteractionMode,
		setVoiceInteractionType,
		setSpeechSpeed,
		setReasoningEffort,
		persistPreferences,
		loadedPreferences,
		onboardingStep,
		setOnboardingStep,
		apiKeyTextareaRef,
		setShowDeviceMenu,
		setShowModelMenu,
		setShowProviderMenu,
		setShowSettingsMenu,
		setShowSessionMenu,
		setOnboardingActive,
	});

	const handleSessionSelect = useCallback(
		(selectedIdx: number) => {
			const item = sessionMenuItems[selectedIdx];
			if (!item) return;
			void loadSessionById(item.id);
		},
		[sessionMenuItems, loadSessionById]
	);

	const handleSessionDelete = useCallback(
		(selectedIdx: number) => {
			const item = sessionMenuItems[selectedIdx];
			if (!item) return;

			void (async () => {
				await deleteSession(item.id);
				setSessions((prev) => prev.filter((s) => s.id !== item.id));

				if (currentSessionIdRef.current === item.id) {
					clearConversationState();
					setCurrentSessionIdSafe(null);
					setResetNotification("SESSION DELETED");
					setTimeout(() => setResetNotification(""), 2000);
				}
			})();
		},
		[sessionMenuItems, setSessions, currentSessionIdRef, clearConversationState, setCurrentSessionIdSafe]
	);

	useEffect(() => {
		setGroundingSelectedIndex(0);
	}, [currentSessionId]);

	const keyboardActions = useMemo(
		() => ({
			setShowDeviceMenu,
			setShowSettingsMenu,
			setShowModelMenu,
			setShowProviderMenu,
			setShowSessionMenu,
			setShowHotkeysPane,
			setShowGroundingMenu,
			setTypingInput,
			setCurrentTranscription,
			setCurrentResponse,
			setApiKeyMissingError,
			setEscPendingCancel,
			setShowFullReasoning,
			setShowToolOutput,
			persistPreferences,
			clearReasoningState,
			currentUserInputRef,
			conversationScrollRef,
			startNewSession: startNewSessionAndReset,
			undoLastTurn,
		}),
		[
			setShowDeviceMenu,
			setShowSettingsMenu,
			setShowModelMenu,
			setShowProviderMenu,
			setShowSessionMenu,
			setShowHotkeysPane,
			setShowGroundingMenu,
			setTypingInput,
			setCurrentTranscription,
			setCurrentResponse,
			setApiKeyMissingError,
			setEscPendingCancel,
			setShowFullReasoning,
			setShowToolOutput,
			persistPreferences,
			clearReasoningState,
			currentUserInputRef,
			conversationScrollRef,
			startNewSessionAndReset,
			undoLastTurn,
		]
	);

	const hasInteracted =
		conversationHistory.length > 0 || currentTranscription.length > 0 || currentContentBlocks.length > 0;

	useDaemonKeyboard(
		{
			isOverlayOpen:
				showDeviceMenu ||
				showSettingsMenu ||
				showModelMenu ||
				showProviderMenu ||
				showSessionMenu ||
				showHotkeysPane ||
				showGroundingMenu ||
				onboardingActive,
			escPendingCancel,
			hasInteracted,
			hasGrounding,
			showFullReasoning,
			showToolOutput,
		},
		keyboardActions
	);

	const displayState = useAppDisplayState({
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
		terminalWidth: renderer.terminalWidth,
		terminalHeight: renderer.terminalHeight,
	});

	const {
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
	} = displayState;

	const statusBarHeight = hasInteracted ? (apiKeyMissingError ? 5 : 3) : 0;

	useEffect(() => {
		if (daemonState === DaemonState.IDLE) {
			setEscPendingCancel(false);
		}
	}, [daemonState]);

	const openGroundingSource = useCallback(
		(idx: number) => {
			if (!latestGroundingMap) return;
			const item = latestGroundingMap.items[idx];
			if (!item) return;
			const { source } = item;
			const url = source.textFragment
				? buildTextFragmentUrl(source.url, { fragmentText: source.textFragment })
				: source.url;
			openUrlInBrowser(url);
		},
		[latestGroundingMap]
	);

	const groundingInitialIndex = latestGroundingMap
		? Math.min(groundingSelectedIndex, Math.max(0, latestGroundingMap.items.length - 1))
		: 0;

	const conversationDisplayState: ConversationDisplayState = {
		conversationHistory,
		currentTranscription,
		currentResponse,
		currentContentBlocks,
	};

	const statusDisplayState: StatusDisplayState = {
		daemonState,
		statusText,
		statusColor,
		apiKeyMissingError,
		error,
		resetNotification,
		escPendingCancel,
	};

	const reasoningDisplayState: ReasoningDisplayState = {
		showFullReasoning,
		showToolOutput,
		reasoningQueue,
		reasoningDisplay,
		fullReasoning,
	};

	const progressDisplayState: ProgressDisplayState = {
		showWorkingSpinner,
		workingSpinnerLabel,
		isToolCalling,
		responseElapsedMs,
	};

	const typingInputState: TypingInputState = {
		typingTextareaRef,
		conversationScrollRef,
		onTypingContentChange: handleTypingContentChange,
		onTypingSubmit: handleTypingSubmit,
		onHistoryUp: handleHistoryUp,
		onHistoryDown: handleHistoryDown,
	};

	const appContextValue = useAppContextBuilder({
		menus: {
			showDeviceMenu,
			setShowDeviceMenu,
			showSettingsMenu,
			setShowSettingsMenu,
			showModelMenu,
			setShowModelMenu,
			showProviderMenu,
			setShowProviderMenu,
			showSessionMenu,
			setShowSessionMenu,
			showHotkeysPane,
			setShowHotkeysPane,
			showGroundingMenu,
			setShowGroundingMenu,
		},
		device: {
			devices,
			currentDevice,
			setCurrentDevice,
			currentOutputDevice,
			setCurrentOutputDevice,
			deviceLoadTimedOut,
			soxAvailable,
			soxInstallHint,
		},
		settings: {
			interactionMode,
			voiceInteractionType,
			speechSpeed,
			reasoningEffort,
			bashApprovalLevel,
			supportsReasoning,
			canEnableVoiceOutput,
			showFullReasoning,
			setShowFullReasoning,
			showToolOutput,
			setShowToolOutput,
			setBashApprovalLevel,
			persistPreferences,
		},
		model: {
			curatedModels: modelsWithPricing,
			openRouterModels,
			openRouterModelsLoading,
			openRouterModelsUpdatedAt,
			currentModelId,
			setCurrentModelId,
			providerMenuItems,
			currentOpenRouterProviderTag,
		},
		session: {
			sessionMenuItems,
			currentSessionId,
		},
		grounding: {
			latestGroundingMap,
			groundingInitialIndex,
			groundingSelectedIndex,
			setGroundingSelectedIndex,
		},
		onboarding: {
			onboardingActive,
			onboardingStep,
			setOnboardingStep,
			onboardingPreferences: loadedPreferences,
			apiKeyTextareaRef,
		},
		deviceCallbacks: {
			onDeviceSelect: handleDeviceSelect,
			onOutputDeviceSelect: handleOutputDeviceSelect,
		},
		settingsCallbacks: {
			onToggleInteractionMode: toggleInteractionMode,
			onSetVoiceInteractionType: setVoiceInteractionType,
			onSetSpeechSpeed: setSpeechSpeed,
			onSetReasoningEffort: setReasoningEffort,
			onSetBashApprovalLevel: setBashApprovalLevel,
		},
		modelCallbacks: {
			onModelSelect: handleModelSelect,
			onModelRefresh: refreshOpenRouterModels,
			onProviderSelect: handleProviderSelect,
		},
		sessionCallbacks: {
			onSessionSelect: handleSessionSelect,
			onSessionDelete: handleSessionDelete,
		},
		groundingCallbacks: {
			onGroundingSelect: (index: number) => {
				setGroundingSelectedIndex(index);
				openGroundingSource(index);
			},
			onGroundingIndexChange: setGroundingSelectedIndex,
		},
		onboardingCallbacks: {
			onKeySubmit: handleApiKeySubmit,
			completeOnboarding,
		},
	});

	return (
		<ToolApprovalProvider>
			<box
				flexDirection="column"
				width="100%"
				height="100%"
				backgroundColor={COLORS.BACKGROUND}
				onMouseUp={handleCopyOnSelectMouseUp}
			>
				<>
					<Toaster
						position="top-right"
						stackingMode="stack"
						visibleToasts={2}
						maxWidth={60}
						toastOptions={TOAST_OPTIONS}
					/>

					<AvatarLayer
						avatarRef={avatarRef}
						daemonState={daemonState}
						applyAvatarForState={applyAvatarForState}
						width={avatarWidth}
						height={avatarHeight}
						zIndex={isListening && hasInteracted ? 2 : 0}
					/>

					{isListeningDim ? (
						<box
							position="absolute"
							top={statusBarHeight}
							left={0}
							width="100%"
							height="100%"
							backgroundColor={COLORS.LISTENING_DIM}
							zIndex={1}
						/>
					) : null}

					<box flexDirection="column" width="100%" height="100%" zIndex={isListening ? 0 : 1}>
						<ConversationPane
							conversation={conversationDisplayState}
							status={statusDisplayState}
							reasoning={reasoningDisplayState}
							progress={progressDisplayState}
							typing={typingInputState}
							sessionUsage={sessionUsage}
							modelMetadata={modelMetadata}
							hasInteracted={hasInteracted}
							frostColor={frostColor}
							initialStatusTop={INITIAL_STATUS_TOP}
							hasGrounding={hasGrounding}
							groundingCount={latestGroundingMap?.items.length}
							modelName={modelName}
							sessionTitle={sessionTitle}
							isVoiceOutputEnabled={interactionMode === "voice"}
						/>
					</box>

					<AppProvider value={appContextValue}>
						<AppOverlays />
					</AppProvider>
				</>
			</box>
		</ToolApprovalProvider>
	);
}

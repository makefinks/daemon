import { useOnResize, useRenderer } from "@opentui/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { ConversationPaneProps } from "../app/components/ConversationPane";

import { useAppCallbacks } from "./use-app-callbacks";
import { useAppContextBuilder } from "./use-app-context-builder";
import { useAppDisplayState } from "./use-app-display-state";
import { useAppMenus } from "./use-app-menus";
import { useAppModel } from "./use-app-model";
import { useAppPreferencesBootstrap } from "./use-app-preferences-bootstrap";
import { useAppSettings } from "./use-app-settings";
import { useBootstrapController } from "./use-bootstrap-controller";
import { useConversationManager } from "./use-conversation-manager";
import { useCopyOnSelect } from "./use-copy-on-select";
import { useDaemonKeyboard } from "./use-daemon-keyboard";
import { useDaemonRuntimeController } from "./use-daemon-runtime-controller";
import { useOverlayController } from "./use-overlay-controller";
import { useSessionController } from "./use-session-controller";

import { getDaemonManager } from "../state/daemon-state";
import { deleteSession } from "../state/session-store";
import { DaemonState } from "../types";
import { STARTUP_MENU_FADE_DELAY_MS, STARTUP_MENU_FADE_DURATION_MS } from "../ui/startup";

export interface AppControllerResult {
	handleCopyOnSelectMouseUp: () => void;
	avatarLayerProps: {
		avatarRef: ReturnType<typeof useDaemonRuntimeController>["avatarRef"];
		daemonState: ReturnType<typeof useDaemonRuntimeController>["daemonState"];
		applyAvatarForState: ReturnType<typeof useDaemonRuntimeController>["applyAvatarForState"];
		width: number;
		height: number;
		zIndex: number;
		showBanner: boolean;
		animateBanner: boolean;
		startupAnimationActive: boolean;
		renderAvatar: boolean;
	};
	isListeningDim: boolean;
	listeningDimTop: number;
	conversationContainerZIndex: number;
	conversationPaneProps: ConversationPaneProps;
	appContextValue: ReturnType<typeof useAppContextBuilder>;
	overlaysProps: {
		conversationHistory: ReturnType<typeof useDaemonRuntimeController>["conversationHistory"];
		currentContentBlocks: ReturnType<typeof useDaemonRuntimeController>["currentContentBlocks"];
	};
}

export function useAppController({
	initialStatusTop,
}: {
	initialStatusTop: ConversationPaneProps["initialStatusTop"];
}): AppControllerResult {
	const renderer = useRenderer();
	const manager = getDaemonManager();

	const { handleCopyOnSelectMouseUp } = useCopyOnSelect();

	const [preferencesLoaded, setPreferencesLoaded] = useState(false);
	const [terminalSize, setTerminalSize] = useState({
		width: renderer.terminalWidth,
		height: renderer.terminalHeight,
	});
	// Track if this is initial app load for startup animation
	const [isInitialLoad, setIsInitialLoad] = useState(true);
	const [startupIntroDone, setStartupIntroDone] = useState(false);
	const [startupMenuFadeProgress, setStartupMenuFadeProgress] = useState(0);

	// Update terminal size state on resize to trigger re-render
	useOnResize((width, height) => {
		setTerminalSize({ width, height });
	});

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
		showUrlMenu,
		setShowUrlMenu,
		showToolsMenu,
		setShowToolsMenu,
		showMemoryMenu,
		setShowMemoryMenu,
	} = menus;

	const session = useSessionController({ showSessionMenu });

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
		memoryEnabled,
		setMemoryEnabled,
		canEnableVoiceOutput,
	} = appSettings;

	const bootstrap = useBootstrapController({
		preferencesLoaded,
		showDeviceMenu,
	});

	const appModel = useAppModel({
		preferencesLoaded,
		showProviderMenu,
		openAiCodexAuthenticated: bootstrap.openAiCodexAuthenticated,
	});
	const {
		currentModelProvider,
		setCurrentModelProvider,
		currentModelId,
		currentModelSupportsReasoning,
		currentModelSupportsReasoningXHigh,
		setCurrentModelId,
		setCurrentModelForProvider,
		currentOpenRouterProviderTag,
		setCurrentOpenRouterProviderTag,
		modelsWithPricing,
		openRouterModels,
		openRouterModelsLoading,
		openRouterModelsUpdatedAt,
		providerMenuItems,
		refreshOpenRouterModels,
	} = appModel;
	const onboardingComplete = preferencesLoaded && !bootstrap.onboardingActive;

	useEffect(() => {
		setStartupIntroDone(onboardingComplete);
	}, [onboardingComplete]);

	const daemon = useDaemonRuntimeController({
		currentModelProvider,
		currentModelId,
		preferencesLoaded,
		openAiCodexAuthenticated: bootstrap.openAiCodexAuthenticated,
		sessionId: session.currentSessionId,
		sessionIdRef: session.currentSessionIdRef,
		ensureSessionId: session.ensureSessionId,
		onFirstMessage: session.handleFirstMessage,
	});

	const [resetNotification, setResetNotification] = useState<string>("");
	const [apiKeyMissingError, setApiKeyMissingError] = useState<string>("");
	const [escPendingCancel, setEscPendingCancel] = useState(false);

	const supportsReasoning =
		currentModelProvider === "openrouter"
			? (daemon.modelMetadata?.supportsReasoning ?? false)
			: currentModelSupportsReasoning;
	const supportsReasoningXHigh =
		currentModelProvider === "openrouter" ? false : currentModelSupportsReasoningXHigh;

	// Preferences bootstrap (hook): returns a stable persist callback.
	const { persistPreferences } = useAppPreferencesBootstrap({
		manager,
		setCurrentModelProvider,
		setCurrentModelForProvider,
		setCurrentOpenRouterProviderTag,
		setCurrentDevice: bootstrap.setCurrentDevice,
		setCurrentOutputDevice: bootstrap.setCurrentOutputDevice,
		setInteractionMode,
		setVoiceInteractionType,
		setSpeechSpeed,
		setReasoningEffort,
		setBashApprovalLevel,
		setShowFullReasoning,
		setShowToolOutput,
		setMemoryEnabled,
		setLoadedPreferences: bootstrap.setLoadedPreferences,
		setOnboardingActive: bootstrap.setOnboardingActive,
		setOnboardingStep: bootstrap.setOnboardingStep,
		setOpenAiCodexAuthenticated: bootstrap.setOpenAiCodexAuthenticated,
		setCopilotAuthenticated: bootstrap.setCopilotAuthenticated,
		setPreferencesLoaded,
	});

	const conversationManager = useConversationManager({
		conversationHistory: daemon.conversationHistory,
		sessionUsage: daemon.sessionUsage,
		currentSessionId: session.currentSessionId,
		ensureSessionId: session.ensureSessionId,
		setCurrentSessionIdSafe: session.setCurrentSessionIdSafe,
		currentSessionIdRef: session.currentSessionIdRef,
		setSessions: session.setSessions,
		hydrateConversationHistory: daemon.hydrateConversationHistory,
		setCurrentTranscription: daemon.setCurrentTranscription,
		setCurrentResponse: daemon.setCurrentResponse,
		clearCurrentContentBlocks: daemon.clearCurrentContentBlocks,
		clearReasoningState: daemon.reasoning.clearReasoningState,
		resetSessionUsage: daemon.resetSessionUsage,
		setSessionUsage: daemon.setSessionUsage,
		currentUserInputRef: daemon.currentUserInputRef,
	});

	const { clearConversationState, loadSessionById, startNewSession, undoLastTurn } = conversationManager;

	const startNewSessionAndReset = useCallback(() => {
		startNewSession();
		daemon.applyAvatarForState(DaemonState.IDLE);
	}, [startNewSession, daemon.applyAvatarForState]);

	const {
		handleDeviceSelect,
		handleOutputDeviceSelect,
		handleModelSelect,
		cycleModelProvider,
		manageOpenAiCodexAuth,
		manageCopilotAuth,
		handleProviderSelect,
		toggleInteractionMode,
		completeOnboarding,
		handleApiKeySubmit,
	} = useAppCallbacks({
		currentModelProvider,
		setCurrentModelProvider,
		currentModelId,
		setCurrentModelId,
		setCurrentModelForProvider,
		setCurrentDevice: bootstrap.setCurrentDevice,
		setCurrentOutputDevice: bootstrap.setCurrentOutputDevice,
		setCurrentOpenRouterProviderTag,
		setInteractionMode,
		setVoiceInteractionType,
		setSpeechSpeed,
		setReasoningEffort,
		persistPreferences,
		loadedPreferences: bootstrap.loadedPreferences,
		onboardingStep: bootstrap.onboardingStep,
		openAiCodexAuthenticated: bootstrap.openAiCodexAuthenticated,
		copilotAuthenticated: bootstrap.copilotAuthenticated,
		setOnboardingStep: bootstrap.setOnboardingStep,
		setOpenAiCodexAuthenticated: bootstrap.setOpenAiCodexAuthenticated,
		setCopilotAuthenticated: bootstrap.setCopilotAuthenticated,
		apiKeyTextareaRef: bootstrap.apiKeyTextareaRef,
		setShowDeviceMenu,
		setShowModelMenu,
		setShowProviderMenu,
		setShowSettingsMenu,
		setShowSessionMenu,
		setOnboardingActive: bootstrap.setOnboardingActive,
	});

	const handleSessionSelect = useCallback(
		(selectedIdx: number) => {
			const item = session.sessionMenuItems[selectedIdx];
			if (!item) return;
			void loadSessionById(item.id);
		},
		[session.sessionMenuItems, loadSessionById]
	);

	const handleSessionDelete = useCallback(
		(selectedIdx: number) => {
			const item = session.sessionMenuItems[selectedIdx];
			if (!item) return;

			void (async () => {
				await deleteSession(item.id);
				session.setSessions((prev) => prev.filter((s) => s.id !== item.id));

				if (session.currentSessionIdRef.current === item.id) {
					clearConversationState();
					session.setCurrentSessionIdSafe(null);
					setResetNotification("SESSION DELETED");
					setTimeout(() => setResetNotification(""), 2000);
				}
			})();
		},
		[
			session.sessionMenuItems,
			session.setSessions,
			session.currentSessionIdRef,
			clearConversationState,
			session.setCurrentSessionIdSafe,
		]
	);

	const keyboardActions = useMemo(
		() => ({
			setShowDeviceMenu,
			setShowSettingsMenu,
			setShowModelMenu,
			setShowProviderMenu,
			setShowSessionMenu,
			setShowHotkeysPane,
			setShowGroundingMenu,
			setShowUrlMenu,
			setShowToolsMenu,
			setShowMemoryMenu,
			setTypingInput: daemon.typing.setTypingInput,
			setCurrentTranscription: daemon.setCurrentTranscription,
			setCurrentResponse: daemon.setCurrentResponse,
			setApiKeyMissingError,
			setEscPendingCancel,
			setShowFullReasoning,
			setShowToolOutput,
			persistPreferences,
			clearReasoningState: daemon.reasoning.clearReasoningState,
			currentUserInputRef: daemon.currentUserInputRef,
			conversationScrollRef: daemon.conversationScrollRef,
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
			setShowUrlMenu,
			setShowToolsMenu,
			setShowMemoryMenu,
			daemon.typing.setTypingInput,
			daemon.setCurrentTranscription,
			daemon.setCurrentResponse,
			setShowFullReasoning,
			setShowToolOutput,
			persistPreferences,
			daemon.reasoning.clearReasoningState,
			daemon.currentUserInputRef,
			daemon.conversationScrollRef,
			startNewSessionAndReset,
			undoLastTurn,
		]
	);

	const { isOverlayOpen } = useOverlayController(
		{
			showDeviceMenu,
			showSettingsMenu,
			showModelMenu,
			showProviderMenu,
			showSessionMenu,
			showHotkeysPane,
			showGroundingMenu,
			showUrlMenu,
			showToolsMenu,
			showMemoryMenu,
			onboardingActive: bootstrap.onboardingActive,
		},
		{
			setShowDeviceMenu,
			setShowSettingsMenu,
			setShowModelMenu,
			setShowProviderMenu,
			setShowSessionMenu,
			setShowHotkeysPane,
			setShowGroundingMenu,
			setShowUrlMenu,
			setShowToolsMenu,
			setShowMemoryMenu,
		}
	);

	useDaemonKeyboard(
		{
			isOverlayOpen,
			escPendingCancel,
			hasInteracted: daemon.hasInteracted,
			hasGrounding: session.hasGrounding,
			showFullReasoning,
			showToolOutput,
			currentModelProvider,
			openAiCodexAuthenticated: bootstrap.openAiCodexAuthenticated,
		},
		keyboardActions
	);

	const displayState = useAppDisplayState({
		daemonState: daemon.daemonState,
		currentContentBlocks: daemon.currentContentBlocks,
		currentResponse: daemon.currentResponse,
		reasoningDisplay: daemon.reasoning.reasoningDisplay,
		reasoningQueue: daemon.reasoning.reasoningQueue,
		responseElapsedMs: daemon.responseElapsedMs,
		hasInteracted: daemon.hasInteracted,
		currentModelProvider,
		currentModelId,
		modelMetadata: daemon.modelMetadata,
		curatedModels: modelsWithPricing,
		availableModels: openRouterModels,
		preferencesLoaded,
		currentSessionId: session.currentSessionId,
		sessionMenuItems: session.sessionMenuItems,
		terminalWidth: renderer.terminalWidth,
		terminalHeight: renderer.terminalHeight,
	});

	const {
		isToolCalling,
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

	const statusBarHeight = daemon.hasInteracted ? (apiKeyMissingError ? 5 : 3) : 0;

	useEffect(() => {
		if (daemon.daemonState === DaemonState.IDLE) {
			setEscPendingCancel(false);
		}
	}, [daemon.daemonState]);

	// Turn off initial load state once user interacts (banner animation is one-time only)
	useEffect(() => {
		if (daemon.hasInteracted && isInitialLoad) {
			setIsInitialLoad(false);
		}
	}, [daemon.hasInteracted, isInitialLoad]);

	useEffect(() => {
		if (daemon.hasInteracted && !startupIntroDone) {
			setStartupIntroDone(true);
		}
	}, [daemon.hasInteracted, startupIntroDone]);

	const startupAnimationActive = onboardingComplete && isInitialLoad;

	useEffect(() => {
		if (!startupAnimationActive || daemon.hasInteracted) {
			setStartupMenuFadeProgress(1);
			return;
		}

		setStartupMenuFadeProgress(0);
		let interval: ReturnType<typeof setInterval> | null = null;
		const timeout = setTimeout(() => {
			const start = performance.now();
			interval = setInterval(() => {
				const progress = Math.min(1, (performance.now() - start) / STARTUP_MENU_FADE_DURATION_MS);
				setStartupMenuFadeProgress(progress);
				if (progress >= 1 && interval) {
					clearInterval(interval);
					interval = null;
				}
			}, 33);
		}, STARTUP_MENU_FADE_DELAY_MS);

		return () => {
			clearTimeout(timeout);
			if (interval) {
				clearInterval(interval);
			}
		};
	}, [daemon.hasInteracted, startupAnimationActive]);

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
			showUrlMenu,
			setShowUrlMenu,
			showToolsMenu,
			setShowToolsMenu,
			showMemoryMenu,
			setShowMemoryMenu,
		},
		device: {
			devices: bootstrap.devices,
			currentDevice: bootstrap.currentDevice,
			setCurrentDevice: bootstrap.setCurrentDevice,
			currentOutputDevice: bootstrap.currentOutputDevice,
			setCurrentOutputDevice: bootstrap.setCurrentOutputDevice,
			deviceLoadTimedOut: bootstrap.deviceLoadTimedOut,
			soxAvailable: bootstrap.soxAvailable,
			soxInstallHint: bootstrap.soxInstallHint,
		},
		settings: {
			interactionMode,
			voiceInteractionType,
			speechSpeed,
			reasoningEffort,
			bashApprovalLevel,
			supportsReasoning,
			supportsReasoningXHigh,
			canEnableVoiceOutput,
			showFullReasoning,
			setShowFullReasoning,
			showToolOutput,
			setShowToolOutput,
			memoryEnabled,
			setMemoryEnabled,
			setBashApprovalLevel,
			persistPreferences,
		},
		model: {
			curatedModels: modelsWithPricing,
			openRouterModels,
			openRouterModelsLoading,
			openRouterModelsUpdatedAt,
			currentModelProvider,
			setCurrentModelProvider,
			currentModelId,
			setCurrentModelId,
			providerMenuItems,
			currentOpenRouterProviderTag,
		},
		session: {
			sessionMenuItems: session.sessionMenuItems,
			currentSessionId: session.currentSessionId,
		},
		grounding: {
			latestGroundingMap: session.latestGroundingMap,
			groundingInitialIndex: session.groundingInitialIndex,
			groundingSelectedIndex: session.groundingSelectedIndex,
			setGroundingSelectedIndex: session.setGroundingSelectedIndex,
		},
		onboarding: {
			onboardingActive: bootstrap.onboardingActive,
			onboardingStep: bootstrap.onboardingStep,
			openAiCodexAuthenticated: bootstrap.openAiCodexAuthenticated,
			copilotAuthenticated: bootstrap.copilotAuthenticated,
			setOnboardingStep: bootstrap.setOnboardingStep,
			onboardingPreferences: bootstrap.loadedPreferences,
			apiKeyTextareaRef: bootstrap.apiKeyTextareaRef,
		},
		deviceCallbacks: {
			onDeviceSelect: handleDeviceSelect,
			onOutputDeviceSelect: handleOutputDeviceSelect,
		},
		settingsCallbacks: {
			onToggleInteractionMode: toggleInteractionMode,
			onCycleModelProvider: cycleModelProvider,
			onManageOpenAiCodexAuth: manageOpenAiCodexAuth,
			onManageCopilotAuth: manageCopilotAuth,
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
			onGroundingSelect: session.onGroundingSelect,
			onGroundingCopyHighlight: session.onGroundingCopyHighlight,
			onGroundingIndexChange: session.onGroundingIndexChange,
		},
		onboardingCallbacks: {
			onKeySubmit: handleApiKeySubmit,
			completeOnboarding,
		},
	});

	return {
		handleCopyOnSelectMouseUp,
		avatarLayerProps: {
			avatarRef: daemon.avatarRef,
			daemonState: daemon.daemonState,
			applyAvatarForState: daemon.applyAvatarForState,
			width: avatarWidth,
			height: avatarHeight,
			zIndex: isListening && daemon.hasInteracted ? 2 : 0,
			// Show banner only when idle, not interacted, and terminal is large enough
			showBanner:
				onboardingComplete && !daemon.hasInteracted && terminalSize.height >= 30 && terminalSize.width >= 100,
			animateBanner: startupAnimationActive,
			startupAnimationActive,
			renderAvatar: preferencesLoaded,
		},
		isListeningDim,
		listeningDimTop: statusBarHeight,
		conversationContainerZIndex: isListening ? 0 : 1,
		conversationPaneProps: {
			conversation: {
				conversationHistory: daemon.conversationHistory,
				currentTranscription: daemon.currentTranscription,
				currentResponse: daemon.currentResponse,
				currentContentBlocks: daemon.currentContentBlocks,
			},
			status: {
				daemonState: daemon.daemonState,
				statusText,
				statusColor,
				apiKeyMissingError,
				error: daemon.error,
				resetNotification,
				escPendingCancel,
			},
			reasoning: {
				showFullReasoning,
				showToolOutput,
				reasoningQueue: daemon.reasoning.reasoningQueue,
				reasoningDisplay: daemon.reasoning.reasoningDisplay,
				fullReasoning: daemon.reasoning.fullReasoning,
			},
			progress: {
				showWorkingSpinner,
				workingSpinnerLabel,
				isToolCalling,
				responseElapsedMs: daemon.responseElapsedMs,
			},
			typing: {
				typingTextareaRef: daemon.typing.typingTextareaRef,
				conversationScrollRef: daemon.conversationScrollRef,
				onTypingContentChange: daemon.typing.handleTypingContentChange,
				onTypingSubmit: daemon.typing.handleTypingSubmit,
				onHistoryUp: daemon.typing.handleHistoryUp,
				onHistoryDown: daemon.typing.handleHistoryDown,
			},
			sessionUsage: daemon.sessionUsage,
			modelMetadata: daemon.modelMetadata,
			currentModelProvider,
			hasInteracted: daemon.hasInteracted,
			frostColor,
			initialStatusTop,
			hasGrounding: session.hasGrounding,
			groundingCount: session.latestGroundingMap?.items.length,
			modelName: modelName ?? "",
			sessionTitle: sessionTitle ?? "",
			isVoiceOutputEnabled: interactionMode === "voice",
			startupIntroDone,
			startupMenuFadeProgress,
		},
		appContextValue,
		overlaysProps: {
			conversationHistory: daemon.conversationHistory,
			currentContentBlocks: daemon.currentContentBlocks,
		},
	};
}

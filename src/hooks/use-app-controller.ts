import { useRenderer } from "@opentui/react";
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

export interface AppControllerResult {
	handleCopyOnSelectMouseUp: () => void;
	avatarLayerProps: {
		avatarRef: ReturnType<typeof useDaemonRuntimeController>["avatarRef"];
		daemonState: ReturnType<typeof useDaemonRuntimeController>["daemonState"];
		applyAvatarForState: ReturnType<typeof useDaemonRuntimeController>["applyAvatarForState"];
		width: number;
		height: number;
		zIndex: number;
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

	const bootstrap = useBootstrapController({
		preferencesLoaded,
		showDeviceMenu,
	});

	const daemon = useDaemonRuntimeController({
		currentModelId,
		preferencesLoaded,
		sessionId: session.currentSessionId,
		sessionIdRef: session.currentSessionIdRef,
		ensureSessionId: session.ensureSessionId,
		onFirstMessage: session.handleFirstMessage,
	});

	const [resetNotification, setResetNotification] = useState<string>("");
	const [apiKeyMissingError, setApiKeyMissingError] = useState<string>("");
	const [escPendingCancel, setEscPendingCancel] = useState(false);

	const supportsReasoning = daemon.modelMetadata?.supportsReasoning ?? false;

	// Preferences bootstrap (hook): returns a stable persist callback.
	const { persistPreferences } = useAppPreferencesBootstrap({
		manager,
		setCurrentModelId,
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
		setLoadedPreferences: bootstrap.setLoadedPreferences,
		setOnboardingActive: bootstrap.setOnboardingActive,
		setOnboardingStep: bootstrap.setOnboardingStep,
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
		handleProviderSelect,
		toggleInteractionMode,
		completeOnboarding,
		handleApiKeySubmit,
	} = useAppCallbacks({
		currentModelId,
		setCurrentModelId,
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
		setOnboardingStep: bootstrap.setOnboardingStep,
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
		currentModelId,
		modelMetadata: daemon.modelMetadata,
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
			hasInteracted: daemon.hasInteracted,
			frostColor,
			initialStatusTop,
			hasGrounding: session.hasGrounding,
			groundingCount: session.latestGroundingMap?.items.length,
			modelName: modelName ?? "",
			sessionTitle: sessionTitle ?? "",
			isVoiceOutputEnabled: interactionMode === "voice",
		},
		appContextValue,
		overlaysProps: {
			conversationHistory: daemon.conversationHistory,
			currentContentBlocks: daemon.currentContentBlocks,
		},
	};
}

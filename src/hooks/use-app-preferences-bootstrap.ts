import { useCallback, useEffect, useRef } from "react";
import { startMcpManager } from "../ai/mcp/mcp-manager";
import { hasCopilotCliAuthSafe } from "../ai/copilot-client";
import {
	getModelProvider,
	getResponseModelForProvider,
	setModelProvider,
	setOpenRouterProviderTag,
	setResponseModelForProvider,
} from "../ai/model-config";
import { invalidateDaemonToolsCache } from "../ai/tools";
import { invalidateSubagentToolsCache } from "../ai/tools/subagents";
import type {
	AppPreferences,
	BashApprovalLevel,
	LlmProvider,
	OnboardingStep,
	ReasoningEffort,
	SpeechSpeed,
	ToolToggles,
	VoiceInteractionType,
} from "../types";
import { DEFAULT_TOOL_TOGGLES } from "../types";
import { loadPreferences, updatePreferences } from "../utils/preferences";
import { setAudioDevice } from "../voice/audio-recorder";

export interface UseAppPreferencesBootstrapParams {
	manager: {
		interactionMode: "text" | "voice";
		voiceInteractionType: VoiceInteractionType;
		speechSpeed: SpeechSpeed;
		reasoningEffort: ReasoningEffort;
		bashApprovalLevel: BashApprovalLevel;
		memoryEnabled: boolean;
		toolToggles?: ToolToggles;
		audioDeviceName?: string;
		outputDeviceName?: string;
	};
	setCurrentModelProvider: (provider: LlmProvider) => void;
	setCurrentModelForProvider: (provider: LlmProvider, modelId: string) => void;
	setCurrentOpenRouterProviderTag: (providerTag: string | undefined) => void;
	setCurrentDevice: (deviceName: string | undefined) => void;
	setCurrentOutputDevice: (deviceName: string | undefined) => void;
	setInteractionMode: (mode: "text" | "voice") => void;
	setVoiceInteractionType: (type: VoiceInteractionType) => void;
	setSpeechSpeed: (speed: SpeechSpeed) => void;
	setReasoningEffort: (effort: ReasoningEffort) => void;
	setBashApprovalLevel: (level: BashApprovalLevel) => void;
	setShowFullReasoning: (show: boolean) => void;
	setShowToolOutput: (show: boolean) => void;
	setMemoryEnabled: (enabled: boolean) => void;
	setLoadedPreferences: (prefs: AppPreferences | null) => void;
	setOnboardingActive: (active: boolean) => void;
	setOnboardingStep: (step: OnboardingStep) => void;
	setCopilotAuthenticated: (authenticated: boolean) => void;
	setPreferencesLoaded: (loaded: boolean) => void;
}

export interface UseAppPreferencesBootstrapReturn {
	persistPreferences: (updates: Partial<AppPreferences>) => void;
}

export function useAppPreferencesBootstrap(
	params: UseAppPreferencesBootstrapParams
): UseAppPreferencesBootstrapReturn {
	const {
		manager,
		setCurrentModelProvider,
		setCurrentModelForProvider,
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
		setMemoryEnabled,
		setLoadedPreferences,
		setOnboardingActive,
		setOnboardingStep,
		setCopilotAuthenticated,
		setPreferencesLoaded,
	} = params;

	const preferencesWriteRef = useRef<Promise<AppPreferences | null>>(Promise.resolve(null));

	const persistPreferences = useCallback((updates: Partial<AppPreferences>) => {
		preferencesWriteRef.current = preferencesWriteRef.current
			.catch(() => null)
			.then(() => updatePreferences(updates))
			.catch(() => null);
	}, []);

	useEffect(() => {
		let cancelled = false;
		let copilotAuthCheckTimer: ReturnType<typeof setTimeout> | null = null;

		(async () => {
			const prefs = await loadPreferences();
			if (cancelled) return;

			if (prefs?.openRouterApiKey && !process.env.OPENROUTER_API_KEY) {
				process.env.OPENROUTER_API_KEY = prefs.openRouterApiKey;
			}
			if (prefs?.openAiApiKey && !process.env.OPENAI_API_KEY) {
				process.env.OPENAI_API_KEY = prefs.openAiApiKey;
			}
			if (prefs?.exaApiKey && !process.env.EXA_API_KEY) {
				process.env.EXA_API_KEY = prefs.exaApiKey;
			}

			// Start MCP discovery in the background (non-blocking)
			startMcpManager();

			const modelProvider: LlmProvider = prefs?.modelProvider ?? "openrouter";
			setModelProvider(modelProvider);
			invalidateDaemonToolsCache();
			invalidateSubagentToolsCache();
			setCurrentModelProvider(modelProvider);

			if (prefs?.modelId) {
				setResponseModelForProvider(modelProvider, prefs.modelId);
				setCurrentModelForProvider(modelProvider, prefs.modelId);
			} else {
				const fallbackModelId = getResponseModelForProvider(modelProvider);
				setCurrentModelForProvider(modelProvider, fallbackModelId);
			}

			if (prefs?.openRouterProviderTag) {
				setOpenRouterProviderTag(prefs.openRouterProviderTag);
				setCurrentOpenRouterProviderTag(prefs.openRouterProviderTag);
			} else {
				setOpenRouterProviderTag(undefined);
				setCurrentOpenRouterProviderTag(undefined);
			}

			if (prefs?.audioDeviceName) {
				manager.audioDeviceName = prefs.audioDeviceName;
				setAudioDevice(prefs.audioDeviceName);
				setCurrentDevice(prefs.audioDeviceName);
			}

			if (prefs?.audioOutputDeviceName) {
				manager.outputDeviceName = prefs.audioOutputDeviceName;
				setCurrentOutputDevice(prefs.audioOutputDeviceName);
			}

			if (prefs?.interactionMode) {
				manager.interactionMode = prefs.interactionMode;
				setInteractionMode(prefs.interactionMode);
			}

			if (prefs?.voiceInteractionType) {
				manager.voiceInteractionType = prefs.voiceInteractionType;
				setVoiceInteractionType(prefs.voiceInteractionType);
			}

			if (prefs?.speechSpeed) {
				manager.speechSpeed = prefs.speechSpeed;
				setSpeechSpeed(prefs.speechSpeed);
			}

			if (prefs?.reasoningEffort) {
				manager.reasoningEffort = prefs.reasoningEffort;
				setReasoningEffort(prefs.reasoningEffort);
			}

			if (prefs?.bashApprovalLevel) {
				manager.bashApprovalLevel = prefs.bashApprovalLevel;
				setBashApprovalLevel(prefs.bashApprovalLevel);
			}

			if (prefs?.toolToggles) {
				manager.toolToggles = { ...DEFAULT_TOOL_TOGGLES, ...prefs.toolToggles };
			} else {
				manager.toolToggles = { ...DEFAULT_TOOL_TOGGLES };
			}

			if (prefs?.showFullReasoning !== undefined) {
				setShowFullReasoning(prefs.showFullReasoning);
			}
			if (prefs?.showToolOutput !== undefined) {
				setShowToolOutput(prefs.showToolOutput);
			}
			if (prefs?.memoryEnabled !== undefined) {
				manager.memoryEnabled = prefs.memoryEnabled;
				setMemoryEnabled(prefs.memoryEnabled);
			}

			const hasOpenRouterKey = Boolean(process.env.OPENROUTER_API_KEY);
			const hasOpenAiKey = Boolean(process.env.OPENAI_API_KEY);
			const hasExaKey = Boolean(process.env.EXA_API_KEY);
			const usingCopilotProvider = modelProvider === "copilot";
			const hasCopilotAuth = usingCopilotProvider;
			setCopilotAuthenticated(hasCopilotAuth);
			copilotAuthCheckTimer = setTimeout(() => {
				void (async () => {
					const authenticated = await hasCopilotCliAuthSafe();
					if (cancelled) return;
					setCopilotAuthenticated(authenticated);
					if (!authenticated && getModelProvider() === "copilot") {
						setOnboardingStep("copilot_auth");
						setOnboardingActive(true);
					}
				})();
			}, 0);
			const hasCoreSettings = Boolean(prefs?.audioDeviceName && prefs?.modelId);

			setLoadedPreferences(prefs);

			const isFreshLaunch = prefs === null;
			const hasProviderAuth = modelProvider === "openrouter" ? hasOpenRouterKey : hasCopilotAuth;
			const needsOnboarding = !hasProviderAuth || !hasOpenAiKey || !hasExaKey;

			if (isFreshLaunch) {
				setOnboardingStep("intro");
				setOnboardingActive(true);
			} else if (needsOnboarding) {
				let startStep: OnboardingStep = "provider";
				if (!hasProviderAuth) {
					startStep = modelProvider === "openrouter" ? "openrouter_key" : "copilot_auth";
				} else if (!hasOpenAiKey) {
					startStep = "openai_key";
				} else if (!hasExaKey) {
					startStep = "exa_key";
				}
				setOnboardingStep(startStep);
				setOnboardingActive(true);
			} else if (!prefs?.onboardingCompleted && !hasCoreSettings) {
				setOnboardingStep("device");
				setOnboardingActive(true);
			} else {
				setOnboardingActive(false);
				setOnboardingStep("complete");
			}

			setPreferencesLoaded(true);
		})();

		return () => {
			cancelled = true;
			if (copilotAuthCheckTimer) {
				clearTimeout(copilotAuthCheckTimer);
			}
		};
	}, [
		manager,
		setCurrentModelProvider,
		setCurrentModelForProvider,
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
		setCopilotAuthenticated,
		setPreferencesLoaded,
	]);

	return {
		persistPreferences,
	};
}

import { useCallback, useEffect, useRef } from "react";
import { AVAILABLE_MODELS, setOpenRouterProviderTag, setResponseModel } from "../ai/model-config";
import type {
	AppPreferences,
	BashApprovalLevel,
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
		toolToggles?: ToolToggles;
		audioDeviceName?: string;
		outputDeviceName?: string;
	};
	setCurrentModelId: (modelId: string) => void;
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
	setLoadedPreferences: (prefs: AppPreferences | null) => void;
	setOnboardingActive: (active: boolean) => void;
	setOnboardingStep: (step: OnboardingStep) => void;
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

			if (prefs?.modelId) {
				const modelIdx = AVAILABLE_MODELS.findIndex((m) => m.id === prefs.modelId);
				if (modelIdx >= 0) {
					setResponseModel(prefs.modelId);
					setCurrentModelId(prefs.modelId);
				}
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

			const hasOpenRouterKey = Boolean(process.env.OPENROUTER_API_KEY);
			const hasOpenAiKey = Boolean(process.env.OPENAI_API_KEY);
			const hasExaKey = Boolean(process.env.EXA_API_KEY);
			const hasCoreSettings = Boolean(prefs?.audioDeviceName && prefs?.modelId);

			setLoadedPreferences(prefs);

			const isFreshLaunch = prefs === null;
			const needsOnboarding = !hasOpenRouterKey || !hasOpenAiKey || !hasExaKey;

			if (isFreshLaunch) {
				setOnboardingStep("intro");
				setOnboardingActive(true);
			} else if (needsOnboarding) {
				let startStep: OnboardingStep = "intro";
				if (!hasOpenRouterKey) {
					startStep = "openrouter_key";
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
		};
	}, [
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
	]);

	return {
		persistPreferences,
	};
}

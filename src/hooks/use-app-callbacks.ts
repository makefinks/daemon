import { useCallback } from "react";
import { setOpenRouterProviderTag, setResponseModel } from "../ai/model-config";
import { setAudioDevice } from "../voice/audio-recorder";
import { getDaemonManager } from "../state/daemon-state";
import type {
	AppPreferences,
	AudioDevice,
	ModelOption,
	OnboardingStep,
	ReasoningEffort,
	SpeechSpeed,
	VoiceInteractionType,
} from "../types";
import { determineNextStep } from "./keyboard-handlers";

export interface UseAppCallbacksParams {
	currentModelId: string;
	setCurrentModelId: (modelId: string) => void;
	setCurrentDevice: (deviceName: string | undefined) => void;
	setCurrentOutputDevice: (deviceName: string | undefined) => void;
	setCurrentOpenRouterProviderTag: (tag: string | undefined) => void;
	setInteractionMode: (mode: "text" | "voice") => void;
	setVoiceInteractionType: (type: VoiceInteractionType) => void;
	setSpeechSpeed: (speed: SpeechSpeed) => void;
	setReasoningEffort: (effort: ReasoningEffort) => void;
	persistPreferences: (updates: Partial<AppPreferences>) => void;
	loadedPreferences: AppPreferences | null;
	onboardingStep: OnboardingStep;
	setOnboardingStep: (step: OnboardingStep) => void;
	apiKeyTextareaRef: React.RefObject<{ plainText?: string; setText: (v: string) => void } | null>;
	setShowDeviceMenu: (show: boolean) => void;
	setShowModelMenu: (show: boolean) => void;
	setShowProviderMenu: (show: boolean) => void;
	setShowSettingsMenu: (show: boolean) => void;
	setShowSessionMenu: (show: boolean) => void;
	setOnboardingActive: (active: boolean) => void;
}

export interface UseAppCallbacksReturn {
	handleDeviceSelect: (device: AudioDevice) => void;
	handleOutputDeviceSelect: (device: AudioDevice) => void;
	handleModelSelect: (model: ModelOption) => void;
	handleProviderSelect: (providerTag: string | undefined) => void;
	toggleInteractionMode: () => void;
	completeOnboarding: () => void;
	handleApiKeySubmit: () => void;
}

export function useAppCallbacks(params: UseAppCallbacksParams): UseAppCallbacksReturn {
	const {
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
	} = params;

	const handleDeviceSelect = useCallback(
		(device: AudioDevice) => {
			setAudioDevice(device.name);
			setCurrentDevice(device.name);
			persistPreferences({ audioDeviceName: device.name });
		},
		[setCurrentDevice, persistPreferences]
	);

	const handleOutputDeviceSelect = useCallback(
		(device: AudioDevice) => {
			const manager = getDaemonManager();
			manager.outputDeviceName = device.name;
			setCurrentOutputDevice(device.name);
			persistPreferences({ audioOutputDeviceName: device.name });
		},
		[setCurrentOutputDevice, persistPreferences]
	);

	const handleModelSelect = useCallback(
		(model: ModelOption) => {
			if (model.id !== currentModelId) {
				setResponseModel(model.id);
				setOpenRouterProviderTag(undefined);
				setCurrentModelId(model.id);
				setCurrentOpenRouterProviderTag(undefined);
				persistPreferences({
					modelId: model.id,
					openRouterProviderTag: undefined,
				});
			}
		},
		[currentModelId, setCurrentModelId, setCurrentOpenRouterProviderTag, persistPreferences]
	);

	const handleProviderSelect = useCallback(
		(providerTag: string | undefined) => {
			setOpenRouterProviderTag(providerTag);
			setCurrentOpenRouterProviderTag(providerTag);
			persistPreferences({ openRouterProviderTag: providerTag });
		},
		[setCurrentOpenRouterProviderTag, persistPreferences]
	);

	const toggleInteractionMode = useCallback(() => {
		const mgr = getDaemonManager();
		const newMode = mgr.interactionMode === "text" ? "voice" : "text";
		if (newMode === "voice" && !process.env.OPENAI_API_KEY) {
			return;
		}
		mgr.interactionMode = newMode;
		setInteractionMode(newMode);
	}, [setInteractionMode]);

	const completeOnboarding = useCallback(() => {
		persistPreferences({ onboardingCompleted: true });
		setShowDeviceMenu(false);
		setShowModelMenu(false);
		setShowProviderMenu(false);
		setShowSettingsMenu(false);
		setShowSessionMenu(false);
		setOnboardingActive(false);
		setOnboardingStep("complete");
	}, [
		persistPreferences,
		setShowDeviceMenu,
		setShowModelMenu,
		setShowProviderMenu,
		setShowSettingsMenu,
		setShowSessionMenu,
		setOnboardingActive,
		setOnboardingStep,
	]);

	const handleApiKeySubmit = useCallback(() => {
		const key = (apiKeyTextareaRef.current?.plainText ?? "").trim();
		if (!key) return;

		if (onboardingStep === "openrouter_key") {
			process.env.OPENROUTER_API_KEY = key;
			persistPreferences({ openRouterApiKey: key });
			const nextStep = determineNextStep("openrouter_key", loadedPreferences);
			if (nextStep === "complete") {
				persistPreferences({ onboardingCompleted: true });
				completeOnboarding();
			} else {
				setOnboardingStep(nextStep);
			}
		} else if (onboardingStep === "openai_key") {
			process.env.OPENAI_API_KEY = key;
			persistPreferences({ openAiApiKey: key });
			const nextStep = determineNextStep("openai_key", loadedPreferences);
			if (nextStep === "complete") {
				persistPreferences({ onboardingCompleted: true });
				completeOnboarding();
			} else {
				setOnboardingStep(nextStep);
			}
		} else if (onboardingStep === "exa_key") {
			process.env.EXA_API_KEY = key;
			persistPreferences({ exaApiKey: key });
			const nextStep = determineNextStep("exa_key", loadedPreferences);
			if (nextStep === "complete") {
				persistPreferences({ onboardingCompleted: true });
				completeOnboarding();
			} else {
				setOnboardingStep(nextStep);
			}
		}

		apiKeyTextareaRef.current?.setText("");
	}, [
		onboardingStep,
		persistPreferences,
		loadedPreferences,
		completeOnboarding,
		setOnboardingStep,
		apiKeyTextareaRef,
	]);

	return {
		handleDeviceSelect,
		handleOutputDeviceSelect,
		handleModelSelect,
		handleProviderSelect,
		toggleInteractionMode,
		completeOnboarding,
		handleApiKeySubmit,
	};
}

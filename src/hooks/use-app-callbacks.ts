import { useCallback } from "react";
import { toast } from "@opentui-ui/toast/react";
import {
	getResponseModelForProvider,
	setModelProvider,
	setOpenRouterProviderTag,
	setResponseModel,
	setResponseModelForProvider,
} from "../ai/model-config";
import { invalidateDaemonToolsCache } from "../ai/tools";
import { invalidateSubagentToolsCache } from "../ai/tools/subagents";
import { getCopilotAuthStatusSafe, resetCopilotClient } from "../ai/copilot-client";
import { setAudioDevice } from "../voice/audio-recorder";
import { getDaemonManager } from "../state/daemon-state";
import type {
	AppPreferences,
	AudioDevice,
	LlmProvider,
	ModelOption,
	OnboardingStep,
	ReasoningEffort,
	SpeechSpeed,
	VoiceInteractionType,
} from "../types";
import { determineNextStep } from "./keyboard-handlers";

export interface UseAppCallbacksParams {
	currentModelProvider: LlmProvider;
	setCurrentModelProvider: (provider: LlmProvider) => void;
	currentModelId: string;
	setCurrentModelId: (modelId: string) => void;
	setCurrentModelForProvider: (provider: LlmProvider, modelId: string) => void;
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
	copilotAuthenticated: boolean;
	setOnboardingStep: (step: OnboardingStep) => void;
	setCopilotAuthenticated: (authenticated: boolean) => void;
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
	cycleModelProvider: () => void;
	handleProviderSelect: (providerTag: string | undefined) => void;
	toggleInteractionMode: () => void;
	completeOnboarding: () => void;
	handleApiKeySubmit: () => void;
}

export function useAppCallbacks(params: UseAppCallbacksParams): UseAppCallbacksReturn {
	const {
		currentModelProvider,
		setCurrentModelProvider,
		currentModelId,
		setCurrentModelId,
		setCurrentModelForProvider,
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
		copilotAuthenticated,
		setOnboardingStep,
		setCopilotAuthenticated,
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
				setResponseModelForProvider(currentModelProvider, model.id);
				setCurrentModelId(model.id);
				if (currentModelProvider === "openrouter") {
					setOpenRouterProviderTag(undefined);
					setCurrentOpenRouterProviderTag(undefined);
					persistPreferences({
						modelProvider: currentModelProvider,
						modelId: model.id,
						openRouterProviderTag: undefined,
					});
				} else {
					persistPreferences({
						modelProvider: currentModelProvider,
						modelId: model.id,
					});
				}
			}
		},
		[
			currentModelProvider,
			currentModelId,
			setCurrentModelId,
			setCurrentOpenRouterProviderTag,
			persistPreferences,
		]
	);

	const cycleModelProvider = useCallback(() => {
		const nextProvider: LlmProvider = currentModelProvider === "openrouter" ? "copilot" : "openrouter";
		if (nextProvider === "copilot" && !copilotAuthenticated) {
			toast.error("COPILOT LOGIN REQUIRED", {
				description: "Run `gh auth login` and `copilot login` to enable the Copilot provider.",
			});
			return;
		}
		const nextModelId = getResponseModelForProvider(nextProvider);

		setModelProvider(nextProvider);
		invalidateDaemonToolsCache();
		invalidateSubagentToolsCache();
		setCurrentModelProvider(nextProvider);
		setCurrentModelForProvider(nextProvider, nextModelId);

		persistPreferences({
			modelProvider: nextProvider,
			modelId: nextModelId,
		});
	}, [
		currentModelProvider,
		copilotAuthenticated,
		setCurrentModelProvider,
		setCurrentModelForProvider,
		persistPreferences,
	]);

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
		void (async () => {
			const key = (apiKeyTextareaRef.current?.plainText ?? "").trim();

			if (onboardingStep !== "copilot_auth" && !key) return;

			if (onboardingStep === "openrouter_key") {
				process.env.OPENROUTER_API_KEY = key;
				persistPreferences({ openRouterApiKey: key });
				const nextStep = determineNextStep("openrouter_key", loadedPreferences, {
					currentProvider: currentModelProvider,
				});
				if (nextStep === "complete") {
					persistPreferences({ onboardingCompleted: true });
					completeOnboarding();
				} else {
					setOnboardingStep(nextStep);
				}
			} else if (onboardingStep === "copilot_auth") {
				await resetCopilotClient();
				const authStatus = await getCopilotAuthStatusSafe();
				setCopilotAuthenticated(authStatus.isAuthenticated);
				if (!authStatus.isAuthenticated) {
					toast.error("COPILOT AUTH REQUIRED", {
						description: "Run `gh auth login` and `copilot login`, then press ENTER to retry.",
					});
					return;
				}

				const nextStep = determineNextStep("copilot_auth", loadedPreferences, {
					currentProvider: currentModelProvider,
					copilotAuthenticated: true,
				});
				if (nextStep === "complete") {
					persistPreferences({ onboardingCompleted: true });
					completeOnboarding();
				} else {
					setOnboardingStep(nextStep);
				}
			} else if (onboardingStep === "openai_key") {
				process.env.OPENAI_API_KEY = key;
				persistPreferences({ openAiApiKey: key });
				const nextStep = determineNextStep("openai_key", loadedPreferences, {
					currentProvider: currentModelProvider,
				});
				if (nextStep === "complete") {
					persistPreferences({ onboardingCompleted: true });
					completeOnboarding();
				} else {
					setOnboardingStep(nextStep);
				}
			} else if (onboardingStep === "exa_key") {
				process.env.EXA_API_KEY = key;
				persistPreferences({ exaApiKey: key });
				const nextStep = determineNextStep("exa_key", loadedPreferences, {
					currentProvider: currentModelProvider,
				});
				if (nextStep === "complete") {
					persistPreferences({ onboardingCompleted: true });
					completeOnboarding();
				} else {
					setOnboardingStep(nextStep);
				}
			}

			apiKeyTextareaRef.current?.setText("");
		})();
	}, [
		onboardingStep,
		persistPreferences,
		loadedPreferences,
		currentModelProvider,
		copilotAuthenticated,
		completeOnboarding,
		setOnboardingStep,
		setCopilotAuthenticated,
		apiKeyTextareaRef,
	]);

	return {
		handleDeviceSelect,
		handleOutputDeviceSelect,
		handleModelSelect,
		cycleModelProvider,
		handleProviderSelect,
		toggleInteractionMode,
		completeOnboarding,
		handleApiKeySubmit,
	};
}

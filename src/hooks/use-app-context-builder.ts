import type { TextareaRenderable } from "@opentui/core";
import { type MutableRefObject, useMemo } from "react";
import type { ProviderMenuItem } from "../components/ProviderMenu";
import type {
	AppContextValue,
	DeviceCallbacks,
	GroundingCallbacks,
	ModelCallbacks,
	OnboardingCallbacks,
	SessionCallbacks,
	SettingsCallbacks,
} from "../state/app-context";
import type {
	AppPreferences,
	AudioDevice,
	BashApprovalLevel,
	GroundingMap,
	ModelOption,
	OnboardingStep,
	ReasoningEffort,
	SessionInfo,
	SpeechSpeed,
	VoiceInteractionType,
} from "../types";

export interface UseAppContextBuilderParams {
	menus: {
		showDeviceMenu: boolean;
		setShowDeviceMenu: React.Dispatch<React.SetStateAction<boolean>>;
		showSettingsMenu: boolean;
		setShowSettingsMenu: React.Dispatch<React.SetStateAction<boolean>>;
		showModelMenu: boolean;
		setShowModelMenu: React.Dispatch<React.SetStateAction<boolean>>;
		showProviderMenu: boolean;
		setShowProviderMenu: React.Dispatch<React.SetStateAction<boolean>>;
		showSessionMenu: boolean;
		setShowSessionMenu: React.Dispatch<React.SetStateAction<boolean>>;
		showHotkeysPane: boolean;
		setShowHotkeysPane: React.Dispatch<React.SetStateAction<boolean>>;
		showGroundingMenu: boolean;
		setShowGroundingMenu: React.Dispatch<React.SetStateAction<boolean>>;
		showUrlMenu: boolean;
		setShowUrlMenu: React.Dispatch<React.SetStateAction<boolean>>;
	};

	device: {
		devices: AudioDevice[];
		currentDevice: string | undefined;
		setCurrentDevice: (deviceName: string | undefined) => void;
		currentOutputDevice: string | undefined;
		setCurrentOutputDevice: (deviceName: string | undefined) => void;
		deviceLoadTimedOut: boolean;
		soxAvailable: boolean;
		soxInstallHint: string;
	};

	settings: {
		interactionMode: "text" | "voice";
		voiceInteractionType: VoiceInteractionType;
		speechSpeed: SpeechSpeed;
		reasoningEffort: ReasoningEffort;
		bashApprovalLevel: BashApprovalLevel;
		supportsReasoning: boolean;
		canEnableVoiceOutput: boolean;
		showFullReasoning: boolean;
		setShowFullReasoning: (show: boolean) => void;
		showToolOutput: boolean;
		setShowToolOutput: (show: boolean) => void;
		setBashApprovalLevel: (level: BashApprovalLevel) => void;
		persistPreferences: (updates: Partial<AppPreferences>) => void;
	};

	model: {
		curatedModels: ModelOption[];
		openRouterModels: ModelOption[];
		openRouterModelsLoading: boolean;
		openRouterModelsUpdatedAt: number | null;
		currentModelId: string;
		setCurrentModelId: (modelId: string) => void;
		providerMenuItems: ProviderMenuItem[];
		currentOpenRouterProviderTag: string | undefined;
	};

	session: {
		sessionMenuItems: Array<SessionInfo & { isNew: boolean }>;
		currentSessionId: string | null;
	};

	grounding: {
		latestGroundingMap: GroundingMap | null;
		groundingInitialIndex: number;
		groundingSelectedIndex: number;
		setGroundingSelectedIndex: (index: number) => void;
	};

	onboarding: {
		onboardingActive: boolean;
		onboardingStep: OnboardingStep;
		setOnboardingStep: (step: OnboardingStep) => void;
		onboardingPreferences: AppPreferences | null;
		apiKeyTextareaRef: MutableRefObject<TextareaRenderable | null>;
	};

	deviceCallbacks: DeviceCallbacks;
	settingsCallbacks: SettingsCallbacks;
	modelCallbacks: ModelCallbacks;
	sessionCallbacks: SessionCallbacks;
	groundingCallbacks: GroundingCallbacks;
	onboardingCallbacks: OnboardingCallbacks;
}

export function useAppContextBuilder(params: UseAppContextBuilderParams): AppContextValue {
	const {
		menus,
		device,
		settings,
		model,
		session,
		grounding,
		onboarding,
		deviceCallbacks,
		settingsCallbacks,
		modelCallbacks,
		sessionCallbacks,
		groundingCallbacks,
		onboardingCallbacks,
	} = params;

	return useMemo(
		(): AppContextValue => ({
			menus,
			device,
			settings,
			model,
			session,
			grounding,
			onboarding,
			deviceCallbacks,
			settingsCallbacks,
			modelCallbacks,
			sessionCallbacks,
			groundingCallbacks,
			onboardingCallbacks,
		}),
		[
			menus,
			device,
			settings,
			model,
			session,
			grounding,
			onboarding,
			deviceCallbacks,
			settingsCallbacks,
			modelCallbacks,
			sessionCallbacks,
			groundingCallbacks,
			onboardingCallbacks,
		]
	);
}

import type { TextareaRenderable } from "@opentui/core";
import { type MutableRefObject, type ReactNode, createContext, useContext } from "react";
import type { ProviderMenuItem } from "../components/ProviderMenu";
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

export interface MenuState {
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
	showToolsMenu: boolean;
	setShowToolsMenu: React.Dispatch<React.SetStateAction<boolean>>;
	showMemoryMenu: boolean;
	setShowMemoryMenu: React.Dispatch<React.SetStateAction<boolean>>;
}

export interface DeviceState {
	devices: AudioDevice[];
	currentDevice: string | undefined;
	setCurrentDevice: (deviceName: string | undefined) => void;
	currentOutputDevice: string | undefined;
	setCurrentOutputDevice: (deviceName: string | undefined) => void;
	deviceLoadTimedOut: boolean;
	soxAvailable: boolean;
	soxInstallHint: string;
}

export interface SettingsState {
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
	memoryEnabled: boolean;
	setMemoryEnabled: (enabled: boolean) => void;
	setBashApprovalLevel: (level: BashApprovalLevel) => void;
	persistPreferences: (updates: Partial<AppPreferences>) => void;
}

export interface ModelState {
	curatedModels: ModelOption[];
	openRouterModels: ModelOption[];
	openRouterModelsLoading: boolean;
	openRouterModelsUpdatedAt: number | null;
	currentModelId: string;
	setCurrentModelId: (modelId: string) => void;
	providerMenuItems: ProviderMenuItem[];
	currentOpenRouterProviderTag: string | undefined;
}

export interface SessionState {
	sessionMenuItems: Array<SessionInfo & { isNew: boolean }>;
	currentSessionId: string | null;
}

export interface GroundingState {
	latestGroundingMap: GroundingMap | null;
	groundingInitialIndex: number;
	groundingSelectedIndex: number;
	setGroundingSelectedIndex: (index: number) => void;
}

export interface OnboardingState {
	onboardingActive: boolean;
	onboardingStep: OnboardingStep;
	setOnboardingStep: (step: OnboardingStep) => void;
	onboardingPreferences: AppPreferences | null;
	apiKeyTextareaRef: MutableRefObject<TextareaRenderable | null>;
}

export interface DeviceCallbacks {
	onDeviceSelect: (device: AudioDevice) => void;
	onOutputDeviceSelect: (device: AudioDevice) => void;
}

export interface SettingsCallbacks {
	onToggleInteractionMode: () => void;
	onSetVoiceInteractionType: (type: VoiceInteractionType) => void;
	onSetSpeechSpeed: (speed: SpeechSpeed) => void;
	onSetReasoningEffort: (effort: ReasoningEffort) => void;
	onSetBashApprovalLevel: (level: BashApprovalLevel) => void;
}

export interface ModelCallbacks {
	onModelSelect: (model: ModelOption) => void;
	onModelRefresh: () => void;
	onProviderSelect: (tag: string | undefined) => void;
}

export interface SessionCallbacks {
	onSessionSelect: (index: number) => void;
	onSessionDelete: (index: number) => void;
}

export interface GroundingCallbacks {
	onGroundingSelect: (index: number) => void;
	onGroundingIndexChange: (index: number) => void;
}

export interface OnboardingCallbacks {
	onKeySubmit: () => void;
	completeOnboarding: () => void;
}

export interface AppContextValue {
	menus: MenuState;
	device: DeviceState;
	settings: SettingsState;
	model: ModelState;
	session: SessionState;
	grounding: GroundingState;
	onboarding: OnboardingState;

	deviceCallbacks: DeviceCallbacks;
	settingsCallbacks: SettingsCallbacks;
	modelCallbacks: ModelCallbacks;
	sessionCallbacks: SessionCallbacks;
	groundingCallbacks: GroundingCallbacks;
	onboardingCallbacks: OnboardingCallbacks;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useAppContext(): AppContextValue {
	const context = useContext(AppContext);
	if (!context) {
		throw new Error("useAppContext must be used within an AppProvider");
	}
	return context;
}

export interface AppProviderProps {
	value: AppContextValue;
	children: ReactNode;
}

export function AppProvider({ value, children }: AppProviderProps) {
	return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

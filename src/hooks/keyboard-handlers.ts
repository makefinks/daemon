import type { KeyEvent } from "@opentui/core";
import { setResponseModel } from "../ai/model-config";
import type {
	AppPreferences,
	AudioDevice,
	BashApprovalLevel,
	ModelOption,
	OnboardingStep,
	ReasoningEffort,
	SpeechSpeed,
	VoiceInteractionType,
} from "../types";
import { BASH_APPROVAL_LEVELS, REASONING_EFFORT_LEVELS } from "../types";
import { openUrlInBrowser } from "../utils/preferences";
import { setAudioDevice } from "../voice/audio-recorder";
import { isNavigateDownKey, isNavigateUpKey } from "./menu-navigation";

export type KeyHandler = (key: KeyEvent) => boolean;

const API_KEY_URLS: Record<string, string> = {
	openrouter_key: "https://openrouter.ai/keys",
	openai_key: "https://platform.openai.com/api-keys",
	exa_key: "https://dashboard.exa.ai/api-keys",
};

interface OnboardingContext {
	step: OnboardingStep;
	devices: AudioDevice[];
	models: ModelOption[];
	selectedDeviceIdx: number;
	selectedModelIdx: number;
	preferences: AppPreferences | null;
	setSelectedDeviceIdx: (fn: (prev: number) => number) => void;
	setSelectedModelIdx: (fn: (prev: number) => number) => void;
	setCurrentDevice: (device: string) => void;
	setCurrentOutputDevice: (device: string) => void;
	setCurrentModelId: (modelId: string) => void;
	setOnboardingStep: (step: OnboardingStep) => void;
	completeOnboarding: () => void;
	persistPreferences: (updates: Partial<AppPreferences>) => void;
	currentModelId: string;
	manager: {
		outputDeviceName?: string;
	};
}

export function getApiKeyUrl(step: OnboardingStep): string | null {
	return API_KEY_URLS[step] ?? null;
}

export function isApiKeyStep(step: OnboardingStep): boolean {
	return step === "openrouter_key" || step === "openai_key" || step === "exa_key";
}

type StepCondition = {
	step: OnboardingStep;
	check: (prefs: AppPreferences | null) => boolean;
	/** If true, this step is only shown during initial onboarding, not when re-prompting */
	onboardingOnly?: boolean;
};

const STEP_CONDITIONS: StepCondition[] = [
	{ step: "openrouter_key", check: () => !process.env.OPENROUTER_API_KEY },
	{ step: "openai_key", check: () => !process.env.OPENAI_API_KEY },
	{ step: "exa_key", check: () => !process.env.EXA_API_KEY },
	{ step: "device", check: (prefs) => !prefs?.audioDeviceName, onboardingOnly: true },
	{ step: "model", check: (prefs) => !prefs?.modelId, onboardingOnly: true },
	{ step: "settings", check: () => true, onboardingOnly: true },
];

const STEP_ORDER: OnboardingStep[] = [
	"intro",
	"openrouter_key",
	"openai_key",
	"exa_key",
	"device",
	"model",
	"settings",
	"complete",
];

export function determineNextStep(
	currentStep: OnboardingStep,
	preferences: AppPreferences | null
): OnboardingStep {
	const currentIndex = STEP_ORDER.indexOf(currentStep);
	if (currentIndex === -1 || currentStep === "complete") return "complete";

	const isReprompt = preferences?.onboardingCompleted === true;

	for (const condition of STEP_CONDITIONS) {
		if (isReprompt && condition.onboardingOnly) continue;

		const conditionIndex = STEP_ORDER.indexOf(condition.step);
		if (conditionIndex > currentIndex && condition.check(preferences)) {
			return condition.step;
		}
	}

	return "complete";
}

type EscapeHandler = (ctx: OnboardingContext) => void;

const ESCAPE_HANDLERS: Partial<Record<OnboardingStep, EscapeHandler>> = {
	intro: () => {},
	openrouter_key: () => {},
	openai_key: (ctx) => {
		const nextStep = determineNextStep("openai_key", ctx.preferences);
		if (nextStep === "complete") {
			ctx.persistPreferences({ onboardingCompleted: true });
			ctx.completeOnboarding();
		} else {
			ctx.setOnboardingStep(nextStep);
		}
	},
	exa_key: (ctx) => {
		const nextStep = determineNextStep("exa_key", ctx.preferences);
		if (nextStep === "complete") {
			ctx.persistPreferences({ onboardingCompleted: true });
			ctx.completeOnboarding();
		} else {
			ctx.setOnboardingStep(nextStep);
		}
	},
	device: (ctx) => ctx.setOnboardingStep("model"),
	model: (ctx) => ctx.setOnboardingStep("settings"),
	settings: (ctx) => {
		ctx.persistPreferences({ onboardingCompleted: true });
		ctx.completeOnboarding();
	},
};

function handleEscapeKey(step: OnboardingStep, ctx: OnboardingContext): boolean {
	const handler = ESCAPE_HANDLERS[step];
	handler?.(ctx);
	return true;
}

export function handleOnboardingKey(key: KeyEvent, ctx: OnboardingContext): boolean {
	if (key.eventType !== "press") return true;

	const { step, devices, models, selectedDeviceIdx, selectedModelIdx } = ctx;

	if (key.sequence === "O" && key.shift && isApiKeyStep(step)) {
		const url = getApiKeyUrl(step);
		if (url) {
			openUrlInBrowser(url);
		}
		return true;
	}

	if (key.name === "escape") {
		return handleEscapeKey(step, ctx);
	}

	if (step === "intro") {
		if (key.name === "return") {
			ctx.setOnboardingStep(determineNextStep(step, ctx.preferences));
		}
		return true;
	}

	if (isApiKeyStep(step)) {
		return false;
	}

	if (step === "device") {
		if (devices.length === 0) return true;

		const totalItems = devices.length * 2;

		if (isNavigateUpKey(key)) {
			ctx.setSelectedDeviceIdx((prev) => (prev > 0 ? prev - 1 : totalItems - 1));
			return true;
		}

		if (isNavigateDownKey(key)) {
			ctx.setSelectedDeviceIdx((prev) => (prev < totalItems - 1 ? prev + 1 : 0));
			return true;
		}

		if (key.name === "return") {
			const isOutputSection = selectedDeviceIdx >= devices.length;
			const deviceIdx = isOutputSection ? selectedDeviceIdx - devices.length : selectedDeviceIdx;
			const selectedDevice = devices[deviceIdx];
			if (selectedDevice) {
				if (isOutputSection) {
					ctx.manager.outputDeviceName = selectedDevice.name;
					ctx.setCurrentOutputDevice(selectedDevice.name);
					ctx.persistPreferences({ audioOutputDeviceName: selectedDevice.name });
				} else {
					setAudioDevice(selectedDevice.name);
					ctx.setCurrentDevice(selectedDevice.name);
					ctx.persistPreferences({ audioDeviceName: selectedDevice.name });
				}
			}
		}

		if (key.name === "tab") {
			ctx.setOnboardingStep("model");
			return true;
		}

		return true;
	}

	if (step === "model") {
		if (models.length === 0) return true;

		if (isNavigateUpKey(key)) {
			ctx.setSelectedModelIdx((prev) => (prev > 0 ? prev - 1 : models.length - 1));
			return true;
		}

		if (isNavigateDownKey(key)) {
			ctx.setSelectedModelIdx((prev) => (prev < models.length - 1 ? prev + 1 : 0));
			return true;
		}

		if (key.name === "return") {
			const selectedModel = models[selectedModelIdx];
			if (selectedModel && selectedModel.id !== ctx.currentModelId) {
				setResponseModel(selectedModel.id);
				ctx.setCurrentModelId(selectedModel.id);
				ctx.persistPreferences({
					modelId: selectedModel.id,
					openRouterProviderTag: undefined,
				});
			}
			ctx.setOnboardingStep("settings");
		}
		return true;
	}

	if (step === "settings") {
		if (key.name === "return") {
			ctx.persistPreferences({ onboardingCompleted: true });
			ctx.completeOnboarding();
		}
		return true;
	}

	return true;
}

interface SettingsMenuContext {
	selectedIdx: number;
	menuItemCount: number;
	interactionMode: "text" | "voice";
	voiceInteractionType: VoiceInteractionType;
	speechSpeed: SpeechSpeed;
	reasoningEffort: ReasoningEffort;
	bashApprovalLevel: BashApprovalLevel;
	supportsReasoning: boolean;
	canEnableVoiceOutput: boolean;
	showFullReasoning: boolean;
	showToolOutput: boolean;
	memoryEnabled: boolean;
	setSelectedIdx: (fn: (prev: number) => number) => void;
	toggleInteractionMode: () => void;
	setVoiceInteractionType: (type: VoiceInteractionType) => void;
	setSpeechSpeed: (speed: SpeechSpeed) => void;
	setReasoningEffort: (effort: ReasoningEffort) => void;
	setBashApprovalLevel: (level: BashApprovalLevel) => void;
	setShowFullReasoning: (show: boolean) => void;
	setShowToolOutput: (show: boolean) => void;
	setMemoryEnabled: (enabled: boolean) => void;
	persistPreferences: (updates: Partial<AppPreferences>) => void;
	onClose: () => void;
	manager: {
		interactionMode: string;
		voiceInteractionType: VoiceInteractionType;
		speechSpeed: SpeechSpeed;
		reasoningEffort: ReasoningEffort;
		bashApprovalLevel: BashApprovalLevel;
		memoryEnabled: boolean;
	};
}

export function handleSettingsMenuKey(key: KeyEvent, ctx: SettingsMenuContext): boolean {
	if (key.eventType !== "press") return true;

	if (key.name === "escape") {
		ctx.onClose();
		key.preventDefault();
		return true;
	}

	if (isNavigateUpKey(key)) {
		ctx.setSelectedIdx((prev) => (prev > 0 ? prev - 1 : ctx.menuItemCount - 1));
		key.preventDefault();
		return true;
	}

	if (isNavigateDownKey(key)) {
		ctx.setSelectedIdx((prev) => (prev < ctx.menuItemCount - 1 ? prev + 1 : 0));
		key.preventDefault();
		return true;
	}

	if (key.name === "return") {
		let settingIdx = 0;

		if (ctx.selectedIdx === settingIdx) {
			if (ctx.interactionMode === "text" && !ctx.canEnableVoiceOutput) {
				key.preventDefault();
				return true;
			}
			ctx.toggleInteractionMode();
			ctx.persistPreferences({
				interactionMode: ctx.manager.interactionMode as "text" | "voice",
			});
			key.preventDefault();
			return true;
		}
		settingIdx++;

		if (ctx.selectedIdx === settingIdx) {
			const current = ctx.manager.voiceInteractionType;
			const next = current === "direct" ? "review" : "direct";
			ctx.manager.voiceInteractionType = next;
			ctx.setVoiceInteractionType(next);
			ctx.persistPreferences({ voiceInteractionType: next });
			key.preventDefault();
			return true;
		}
		settingIdx++;

		if (ctx.selectedIdx === settingIdx) {
			if (ctx.supportsReasoning) {
				const currentEffort = ctx.manager.reasoningEffort;
				const currentIndex = REASONING_EFFORT_LEVELS.indexOf(currentEffort);
				const nextIndex = (currentIndex + 1) % REASONING_EFFORT_LEVELS.length;
				const nextEffort = REASONING_EFFORT_LEVELS[nextIndex] ?? "medium";
				ctx.manager.reasoningEffort = nextEffort;
				ctx.setReasoningEffort(nextEffort);
				ctx.persistPreferences({ reasoningEffort: nextEffort });
			}
			key.preventDefault();
			return true;
		}
		settingIdx++;

		if (ctx.selectedIdx === settingIdx) {
			const currentLevel = ctx.manager.bashApprovalLevel;
			const currentIndex = BASH_APPROVAL_LEVELS.indexOf(currentLevel);
			const nextIndex = (currentIndex + 1) % BASH_APPROVAL_LEVELS.length;
			const nextLevel = BASH_APPROVAL_LEVELS[nextIndex] ?? "dangerous";
			ctx.manager.bashApprovalLevel = nextLevel;
			ctx.setBashApprovalLevel(nextLevel);
			ctx.persistPreferences({ bashApprovalLevel: nextLevel });
			key.preventDefault();
			return true;
		}
		settingIdx++;

		if (ctx.interactionMode === "voice") {
			if (ctx.selectedIdx === settingIdx) {
				const next = !ctx.manager.memoryEnabled;
				ctx.manager.memoryEnabled = next;
				ctx.setMemoryEnabled(next);
				ctx.persistPreferences({ memoryEnabled: next });
				key.preventDefault();
				return true;
			}
			settingIdx++;

			if (ctx.selectedIdx === settingIdx) {
				const speeds: SpeechSpeed[] = [1.0, 1.25, 1.5, 1.75, 2.0];
				const currentSpeed = ctx.manager.speechSpeed;
				const currentIndex = speeds.indexOf(currentSpeed);
				const nextIndex = (currentIndex + 1) % speeds.length;
				const nextSpeed = speeds[nextIndex] ?? 1.0;
				ctx.manager.speechSpeed = nextSpeed;
				ctx.setSpeechSpeed(nextSpeed);
				ctx.persistPreferences({ speechSpeed: nextSpeed });
				key.preventDefault();
				return true;
			}
			settingIdx++;
		}
		if (ctx.interactionMode !== "voice") {
			if (ctx.selectedIdx === settingIdx) {
				const next = !ctx.manager.memoryEnabled;
				ctx.manager.memoryEnabled = next;
				ctx.setMemoryEnabled(next);
				ctx.persistPreferences({ memoryEnabled: next });
				key.preventDefault();
				return true;
			}
			settingIdx++;
		}

		if (ctx.selectedIdx === settingIdx) {
			const next = !ctx.showFullReasoning;
			ctx.setShowFullReasoning(next);
			ctx.persistPreferences({ showFullReasoning: next });
			key.preventDefault();
			return true;
		}
		settingIdx++;

		if (ctx.selectedIdx === settingIdx) {
			const next = !ctx.showToolOutput;
			ctx.setShowToolOutput(next);
			ctx.persistPreferences({ showToolOutput: next });
			key.preventDefault();
			return true;
		}
		settingIdx++;

		key.preventDefault();
		return true;
	}

	return true;
}

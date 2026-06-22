import type { KeyEvent } from "@opentui/core";
import { getResponseModelForProvider, setModelProvider, setResponseModel } from "../ai/model-config";
import { invalidateDaemonToolsCache } from "../ai/tools";
import { invalidateSubagentToolsCache } from "../ai/tools/subagents";
import type {
	AppPreferences,
	AudioDevice,
	BashApprovalLevel,
	LlmProvider,
	ModelOption,
	OnboardingStep,
	ReasoningEffort,
	SpeechSpeed,
	VoiceInteractionType,
} from "../types";
import { BASH_APPROVAL_LEVELS, getReasoningEffortLevels } from "../types";
import { openUrlInBrowser } from "../utils/preferences";
import { setAudioDevice } from "../voice/audio-recorder";
import { isNavigateDownKey, isNavigateUpKey } from "./menu-navigation";

export type KeyHandler = (key: KeyEvent) => boolean;

const API_KEY_URLS: Record<string, string> = {
	copilot_auth: "https://cli.github.com/manual/gh_auth_login",
	openrouter_key: "https://openrouter.ai/keys",
	openai_key: "https://platform.openai.com/api-keys",
	exa_key: "https://dashboard.exa.ai/api-keys",
};

interface OnboardingContext {
	step: OnboardingStep;
	selectedProviderIdx: number;
	devices: AudioDevice[];
	models: ModelOption[];
	selectedDeviceIdx: number;
	selectedModelIdx: number;
	currentModelProvider: LlmProvider;
	openAiCodexAuthenticated: boolean;
	copilotAuthenticated: boolean;
	preferences: AppPreferences | null;
	setSelectedProviderIdx: (fn: (prev: number) => number) => void;
	setSelectedDeviceIdx: (fn: (prev: number) => number) => void;
	setSelectedModelIdx: (fn: (prev: number) => number) => void;
	setCurrentModelProvider: (provider: LlmProvider) => void;
	setCurrentDevice: (device: string) => void;
	setCurrentOutputDevice: (device: string) => void;
	setCurrentModelId: (modelId: string) => void;
	setOnboardingStep: (step: OnboardingStep) => void;
	completeOnboarding: () => void;
	onSubmitAction: () => void;
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
	return step === "openrouter_key" || step === "copilot_auth" || step === "openai_key" || step === "exa_key";
}

export interface DetermineNextStepOptions {
	currentProvider?: LlmProvider;
	codexAuthenticated?: boolean;
	copilotAuthenticated?: boolean;
}

const STEP_ORDER: OnboardingStep[] = [
	"intro",
	"provider",
	"openrouter_key",
	"openai_codex_auth",
	"copilot_auth",
	"openai_key",
	"exa_key",
	"device",
	"model",
	"settings",
	"complete",
];

export function determineNextStep(
	currentStep: OnboardingStep,
	preferences: AppPreferences | null,
	options: DetermineNextStepOptions = {}
): OnboardingStep {
	const currentIndex = STEP_ORDER.indexOf(currentStep);
	if (currentIndex === -1 || currentStep === "complete") return "complete";

	const isReprompt = preferences?.onboardingCompleted === true;
	const provider: LlmProvider = options.currentProvider ?? preferences?.modelProvider ?? "openrouter";
	const hasCodexAuth = Boolean(options.codexAuthenticated);
	const hasCopilotAuth = Boolean(options.copilotAuthenticated);

	const conditions: Array<{
		step: OnboardingStep;
		enabled: boolean;
		onboardingOnly?: boolean;
	}> = [
		{ step: "provider", enabled: true, onboardingOnly: true },
		{ step: "openrouter_key", enabled: provider === "openrouter" && !process.env.OPENROUTER_API_KEY },
		{ step: "openai_codex_auth", enabled: provider === "openai-codex" && !hasCodexAuth },
		{ step: "copilot_auth", enabled: provider === "copilot" && !hasCopilotAuth },
		{ step: "openai_key", enabled: !process.env.OPENAI_API_KEY },
		{ step: "exa_key", enabled: !process.env.EXA_API_KEY },
		{ step: "device", enabled: !preferences?.audioDeviceName, onboardingOnly: true },
		{ step: "model", enabled: !preferences?.modelId, onboardingOnly: true },
		{ step: "settings", enabled: true, onboardingOnly: true },
	];

	for (const condition of conditions) {
		if (isReprompt && condition.onboardingOnly) continue;

		const conditionIndex = STEP_ORDER.indexOf(condition.step);
		if (conditionIndex > currentIndex && condition.enabled) {
			return condition.step;
		}
	}

	return "complete";
}

type EscapeHandler = (ctx: OnboardingContext) => void;

const ESCAPE_HANDLERS: Partial<Record<OnboardingStep, EscapeHandler>> = {
	intro: () => {},
	provider: () => {},
	openrouter_key: () => {},
	openai_codex_auth: () => {},
	copilot_auth: () => {},
	openai_key: (ctx) => {
		const nextStep = determineNextStep("openai_key", ctx.preferences, {
			currentProvider: ctx.currentModelProvider,
			codexAuthenticated: ctx.openAiCodexAuthenticated,
			copilotAuthenticated: ctx.copilotAuthenticated,
		});
		if (nextStep === "complete") {
			ctx.persistPreferences({ onboardingCompleted: true });
			ctx.completeOnboarding();
		} else {
			ctx.setOnboardingStep(nextStep);
		}
	},
	exa_key: (ctx) => {
		const nextStep = determineNextStep("exa_key", ctx.preferences, {
			currentProvider: ctx.currentModelProvider,
			codexAuthenticated: ctx.openAiCodexAuthenticated,
			copilotAuthenticated: ctx.copilotAuthenticated,
		});
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
			ctx.setOnboardingStep(
				determineNextStep(step, ctx.preferences, {
					currentProvider: ctx.currentModelProvider,
					codexAuthenticated: ctx.openAiCodexAuthenticated,
					copilotAuthenticated: ctx.copilotAuthenticated,
				})
			);
		}
		return true;
	}

	if (step === "provider") {
		const providers: LlmProvider[] = ["openrouter", "openai-codex", "copilot"];

		if (isNavigateUpKey(key) || isNavigateDownKey(key)) {
			ctx.setSelectedProviderIdx((prev) => {
				if (isNavigateUpKey(key)) {
					return prev > 0 ? prev - 1 : providers.length - 1;
				}
				return prev < providers.length - 1 ? prev + 1 : 0;
			});
			return true;
		}

		if (key.name === "return") {
			const selectedProvider = providers[ctx.selectedProviderIdx] ?? "openrouter";
			setModelProvider(selectedProvider);
			invalidateDaemonToolsCache();
			invalidateSubagentToolsCache();
			ctx.setCurrentModelProvider(selectedProvider);

			const defaultModelId = getResponseModelForProvider(selectedProvider);

			ctx.persistPreferences({
				modelProvider: selectedProvider,
				modelId: defaultModelId,
			});

			ctx.setOnboardingStep(
				determineNextStep("provider", ctx.preferences, {
					currentProvider: selectedProvider,
					codexAuthenticated: ctx.openAiCodexAuthenticated,
					copilotAuthenticated: ctx.copilotAuthenticated,
				})
			);
		}

		return true;
	}

	if (step === "openai_codex_auth" || step === "copilot_auth") {
		if (key.name === "return") {
			ctx.onSubmitAction();
			return true;
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
				invalidateDaemonToolsCache();
				ctx.setCurrentModelId(selectedModel.id);
				ctx.persistPreferences({
					modelProvider: ctx.currentModelProvider,
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
	tabItemIds: string[];
	interactionMode: "text" | "voice";
	modelProvider: LlmProvider;
	openAiCodexAuthenticated: boolean;
	copilotAuthenticated: boolean;
	voiceInteractionType: VoiceInteractionType;
	speechSpeed: SpeechSpeed;
	reasoningEffort: ReasoningEffort;
	bashApprovalLevel: BashApprovalLevel;
	supportsReasoning: boolean;
	supportsReasoningXHigh: boolean;
	canEnableVoiceOutput: boolean;
	showFullReasoning: boolean;
	showToolOutput: boolean;
	bashLivePreviewAlways: boolean;
	showStats: boolean;
	completionNotificationEnabled: boolean;
	completionSoundEnabled: boolean;
	memoryEnabled: boolean;
	memoryToggleDisabled: boolean;
	setSelectedIdx: (fn: (prev: number) => number) => void;
	toggleInteractionMode: () => void;
	cycleModelProvider: () => void;
	manageOpenAiCodexAuth: () => void;
	manageCopilotAuth: () => void;
	setVoiceInteractionType: (type: VoiceInteractionType) => void;
	setSpeechSpeed: (speed: SpeechSpeed) => void;
	setReasoningEffort: (effort: ReasoningEffort) => void;
	setBashApprovalLevel: (level: BashApprovalLevel) => void;
	setShowFullReasoning: (show: boolean) => void;
	setShowToolOutput: (show: boolean) => void;
	setBashLivePreviewAlways: (always: boolean) => void;
	setShowStats: (show: boolean) => void;
	setCompletionNotificationEnabled: (enabled: boolean) => void;
	setCompletionSoundEnabled: (enabled: boolean) => void;
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

function handleSettingsReturn(ctx: SettingsMenuContext, key: KeyEvent): boolean {
	const itemId = ctx.tabItemIds[ctx.selectedIdx];
	if (!itemId) {
		key.preventDefault();
		return true;
	}

	switch (itemId) {
		case "interaction-mode": {
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
		case "model-provider": {
			ctx.cycleModelProvider();
			key.preventDefault();
			return true;
		}
		case "reasoning-effort": {
			if (!ctx.supportsReasoning) {
				key.preventDefault();
				return true;
			}
			const effortLevels = getReasoningEffortLevels(ctx.supportsReasoningXHigh);
			const currentIndex = effortLevels.indexOf(ctx.reasoningEffort);
			const nextIndex = (currentIndex + 1) % effortLevels.length;
			const nextEffort = effortLevels[nextIndex] ?? "medium";
			ctx.manager.reasoningEffort = nextEffort;
			ctx.setReasoningEffort(nextEffort);
			ctx.persistPreferences({ reasoningEffort: nextEffort });
			key.preventDefault();
			return true;
		}
		case "openai-codex-auth": {
			ctx.manageOpenAiCodexAuth();
			key.preventDefault();
			return true;
		}
		case "copilot-auth": {
			ctx.manageCopilotAuth();
			key.preventDefault();
			return true;
		}
		case "voice-interaction-type": {
			const nextType: VoiceInteractionType = ctx.voiceInteractionType === "direct" ? "review" : "direct";
			ctx.manager.voiceInteractionType = nextType;
			ctx.setVoiceInteractionType(nextType);
			ctx.persistPreferences({ voiceInteractionType: nextType });
			key.preventDefault();
			return true;
		}
		case "bash-approvals": {
			const bashCurrentIndex = BASH_APPROVAL_LEVELS.indexOf(ctx.bashApprovalLevel);
			const bashNextIndex = (bashCurrentIndex + 1) % BASH_APPROVAL_LEVELS.length;
			const nextLevel = BASH_APPROVAL_LEVELS[bashNextIndex] ?? "dangerous";
			ctx.manager.bashApprovalLevel = nextLevel;
			ctx.setBashApprovalLevel(nextLevel);
			ctx.persistPreferences({ bashApprovalLevel: nextLevel });
			key.preventDefault();
			return true;
		}
		case "memory-enabled": {
			if (ctx.memoryToggleDisabled) {
				key.preventDefault();
				return true;
			}
			const next = !ctx.manager.memoryEnabled;
			ctx.manager.memoryEnabled = next;
			ctx.setMemoryEnabled(next);
			ctx.persistPreferences({ memoryEnabled: next });
			key.preventDefault();
			return true;
		}
		case "speech-speed": {
			if (ctx.interactionMode !== "voice") {
				key.preventDefault();
				return true;
			}
			const speeds: SpeechSpeed[] = [1.0, 1.25, 1.5, 1.75, 2.0];
			const currentSpeed = ctx.manager.speechSpeed;
			const currentIdx = speeds.indexOf(currentSpeed);
			const nextIdx = (currentIdx + 1) % speeds.length;
			const nextSpeed = speeds[nextIdx] ?? 1.0;
			ctx.manager.speechSpeed = nextSpeed;
			ctx.setSpeechSpeed(nextSpeed);
			ctx.persistPreferences({ speechSpeed: nextSpeed });
			key.preventDefault();
			return true;
		}
		case "show-full-reasoning": {
			const nextVal = !ctx.showFullReasoning;
			ctx.setShowFullReasoning(nextVal);
			ctx.persistPreferences({ showFullReasoning: nextVal });
			key.preventDefault();
			return true;
		}
		case "show-tool-output": {
			const nextVal = !ctx.showToolOutput;
			ctx.setShowToolOutput(nextVal);
			ctx.persistPreferences({ showToolOutput: nextVal });
			key.preventDefault();
			return true;
		}
		case "bash-live-preview-always": {
			const nextVal = !ctx.bashLivePreviewAlways;
			ctx.setBashLivePreviewAlways(nextVal);
			ctx.persistPreferences({ bashLivePreviewAlways: nextVal });
			key.preventDefault();
			return true;
		}
		case "show-stats": {
			const nextVal = !ctx.showStats;
			ctx.setShowStats(nextVal);
			ctx.persistPreferences({ showStats: nextVal });
			key.preventDefault();
			return true;
		}
		case "completion-notification": {
			const nextVal = !ctx.completionNotificationEnabled;
			ctx.setCompletionNotificationEnabled(nextVal);
			ctx.persistPreferences({ completionNotificationEnabled: nextVal });
			key.preventDefault();
			return true;
		}
		case "completion-sound": {
			const nextVal = !ctx.completionSoundEnabled;
			ctx.setCompletionSoundEnabled(nextVal);
			ctx.persistPreferences({ completionSoundEnabled: nextVal });
			key.preventDefault();
			return true;
		}
	}

	key.preventDefault();
	return true;
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
		return handleSettingsReturn(ctx, key);
	}

	return true;
}

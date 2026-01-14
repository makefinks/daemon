import type { KeyEvent, TextareaRenderable } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { RefObject } from "react";
import { handleOnboardingKey } from "../hooks/keyboard-handlers";
import type { AppPreferences, AudioDevice, ModelOption, OnboardingStep } from "../types";
import { COLORS } from "../ui/constants";
import { formatContextWindowK, formatPrice } from "../utils/formatters";
import { ApiKeyStep } from "./ApiKeyStep";

const MODEL_COL_WIDTH = {
	CTX: 6,
	IN: 10,
	OUT: 10,
	CACHE: 6,
} as const;

/** Configuration for each API key step */
const API_KEY_CONFIGS = {
	openrouter_key: {
		title: "OPENROUTER API KEY REQUIRED",
		description: "OpenRouter provides access to the AI models needed for DAEMON responses.",
		errorMessage: "OPENROUTER_API_KEY environment variable not found.",
		envVarName: "OPENROUTER_API_KEY",
		keyUrl: "https://openrouter.ai/keys",
		optional: false,
	},
	openai_key: {
		title: "OPENAI API KEY (OPTIONAL)",
		description: "OpenAI enables voice features (speech-to-text and text-to-speech).",
		envVarName: "OPENAI_API_KEY",
		keyUrl: "https://platform.openai.com/api-keys",
		optional: true,
		skipConsequence: "voice input and voice output capabilities are disabled",
	},
	exa_key: {
		title: "EXA API KEY (OPTIONAL)",
		description:
			"Exa provides web search capabilities for DAEMON. It is highly recommended to configure Exa for the best experience. Exa comes with generous free credits on sign-up.",
		envVarName: "EXA_API_KEY",
		keyUrl: "https://dashboard.exa.ai/api-keys",
		optional: true,
		skipConsequence: "Web search will be disabled",
	},
} as const;

interface OnboardingOverlayProps {
	step: OnboardingStep;
	preferences: AppPreferences | null;
	devices: AudioDevice[];
	currentDevice?: string;
	currentOutputDevice?: string;
	models: ModelOption[];
	currentModelId: string;
	deviceLoadTimedOut?: boolean;
	soxAvailable: boolean;
	soxInstallHint: string;
	setCurrentDevice: (deviceName: string | undefined) => void;
	setCurrentOutputDevice: (deviceName: string | undefined) => void;
	setCurrentModelId: (modelId: string) => void;
	setOnboardingStep: (step: OnboardingStep) => void;
	completeOnboarding: () => void;
	persistPreferences: (updates: Partial<AppPreferences>) => void;
	/** Callback when key is submitted */
	onKeySubmit: () => void;
	/** Ref to the textarea for focus management */
	apiKeyTextareaRef?: RefObject<TextareaRenderable | null>;
}

export function OnboardingOverlay({
	step,
	preferences,
	devices,
	currentDevice,
	currentOutputDevice,
	models,
	currentModelId,
	deviceLoadTimedOut,
	soxAvailable,
	soxInstallHint,
	setCurrentDevice,
	setCurrentOutputDevice,
	setCurrentModelId,
	setOnboardingStep,
	completeOnboarding,
	persistPreferences,
	onKeySubmit,
	apiKeyTextareaRef,
}: OnboardingOverlayProps) {
	const [selectedDeviceIdx, setSelectedDeviceIdx] = useState(0);
	const [selectedModelIdx, setSelectedModelIdx] = useState(0);

	const initialDeviceIdx = useMemo(() => {
		if (devices.length === 0) return 0;
		const idx = currentDevice ? devices.findIndex((device) => device.name === currentDevice) : -1;
		if (idx >= 0) return idx;
		return devices.length > 1 ? 1 : 0;
	}, [devices, currentDevice]);

	const initialModelIdx = useMemo(() => {
		if (models.length === 0) return 0;
		const idx = models.findIndex((model) => model.id === currentModelId);
		return idx >= 0 ? idx : 0;
	}, [models, currentModelId]);

	useEffect(() => {
		if (step !== "device") return;
		setSelectedDeviceIdx(initialDeviceIdx);
	}, [step, initialDeviceIdx]);

	useEffect(() => {
		if (step !== "model") return;
		setSelectedModelIdx(initialModelIdx);
	}, [step, initialModelIdx]);

	const handleKeyPress = useCallback(
		(key: KeyEvent) => {
			const handled = handleOnboardingKey(key, {
				step,
				devices,
				models,
				selectedDeviceIdx,
				selectedModelIdx,
				preferences,
				setSelectedDeviceIdx,
				setSelectedModelIdx,
				setCurrentDevice,
				setCurrentOutputDevice,
				setCurrentModelId,
				setOnboardingStep,
				completeOnboarding,
				persistPreferences,
				currentModelId,
				manager: { outputDeviceName: currentOutputDevice },
			});

			if (handled) {
				key.preventDefault();
			}
		},
		[
			step,
			devices,
			models,
			selectedDeviceIdx,
			selectedModelIdx,
			preferences,
			setCurrentDevice,
			setCurrentOutputDevice,
			setCurrentModelId,
			setOnboardingStep,
			completeOnboarding,
			persistPreferences,
			currentModelId,
			currentOutputDevice,
		]
	);

	useKeyboard(handleKeyPress);
	return (
		<box
			position="absolute"
			left={0}
			top={0}
			width="100%"
			height="100%"
			flexDirection="column"
			alignItems="center"
			justifyContent="center"
			zIndex={200}
		>
			<box
				flexDirection="column"
				backgroundColor={COLORS.MENU_BG}
				borderStyle="single"
				borderColor={COLORS.MENU_BORDER}
				paddingLeft={3}
				paddingRight={3}
				paddingTop={2}
				paddingBottom={2}
				width="75%"
				minWidth={72}
				maxWidth={160}
			>
				{step === "intro" && (
					<>
						<box marginBottom={1}>
							<text>
								<span fg={COLORS.DAEMON_LABEL}>[ FIRST LAUNCH DETECTED ]</span>
							</text>
						</box>
						<box marginBottom={1}>
							<text>
								<span fg={COLORS.MENU_TEXT}>
									DAEMON needs a few settings to ensure an optimal experience.
								</span>
							</text>
						</box>
						<box marginBottom={1}>
							<text>
								<span fg={COLORS.REASONING_DIM}>All settings can be changed later.</span>
							</text>
						</box>
						<box justifyContent="center">
							<text>
								<span fg={COLORS.DAEMON_LABEL}>Press ENTER to begin</span>
							</text>
						</box>
					</>
				)}

				{step === "openrouter_key" && (
					<ApiKeyStep
						{...API_KEY_CONFIGS.openrouter_key}
						onSubmit={onKeySubmit}
						textareaRef={apiKeyTextareaRef}
					/>
				)}

				{step === "openai_key" && (
					<ApiKeyStep
						{...API_KEY_CONFIGS.openai_key}
						onSubmit={onKeySubmit}
						textareaRef={apiKeyTextareaRef}
					/>
				)}

				{step === "exa_key" && (
					<ApiKeyStep {...API_KEY_CONFIGS.exa_key} onSubmit={onKeySubmit} textareaRef={apiKeyTextareaRef} />
				)}

				{step === "device" && (
					<>
						<box marginBottom={1}>
							<text>
								<span fg={COLORS.DAEMON_LABEL}>[ SELECT AUDIO DEVICES ]</span>
							</text>
						</box>
						<box marginBottom={1}>
							<text>
								<span fg={COLORS.REASONING_DIM}>
									Configure input device for voice commands and output device for TTS playback.
								</span>
							</text>
						</box>
						<box marginBottom={1}>
							<text>
								<span fg={COLORS.USER_LABEL}>
									{soxAvailable ? "↑/↓ navigate, ENTER select" : "ESC to skip"}
								</span>
								{soxAvailable && <span fg={COLORS.REASONING_DIM}> · TAB continue · ESC skip</span>}
							</text>
						</box>
						{!soxAvailable ? (
							<box flexDirection="column" paddingTop={1}>
								<text>
									<span fg={COLORS.ERROR}>sox is not installed</span>
								</text>
								<box marginTop={1}>
									<text>
										<span fg={COLORS.USER_LABEL}>Voice input requires sox for audio capture.</span>
									</text>
								</box>
								<box marginTop={1}>
									<text>
										<span fg={COLORS.MENU_TEXT}>{soxInstallHint}</span>
									</text>
								</box>
							</box>
						) : devices.length === 0 ? (
							<box flexDirection="column">
								<box>
									<text>
										<span fg={COLORS.USER_LABEL}>
											{deviceLoadTimedOut ? "No devices found. Press ESC to skip." : "Loading devices..."}
										</span>
									</text>
								</box>
							</box>
						) : (
							<>
								<box marginBottom={1} marginTop={1}>
									<text>
										<span fg={COLORS.DAEMON_LABEL}>[ INPUT ]</span>
									</text>
								</box>
								<box flexDirection="column">
									{devices.map((device, idx) => {
										const isInputSection = selectedDeviceIdx < devices.length;
										const inputSelectedIdx = isInputSection ? selectedDeviceIdx : -1;
										return (
											<box
												key={`input-${device.name}`}
												backgroundColor={idx === inputSelectedIdx ? COLORS.MENU_SELECTED_BG : COLORS.MENU_BG}
												paddingLeft={1}
												paddingRight={1}
											>
												<text>
													<span fg={idx === inputSelectedIdx ? COLORS.DAEMON_LABEL : COLORS.MENU_TEXT}>
														{idx === inputSelectedIdx ? "▶ " : "  "}
														{device.name}
														{device.name === currentDevice ? " ●" : ""}
													</span>
												</text>
											</box>
										);
									})}
								</box>
								<box marginBottom={1} marginTop={1}>
									<text>
										<span fg={COLORS.DAEMON_LABEL}>[ OUTPUT ]</span>
									</text>
								</box>
								<box flexDirection="column">
									{devices.map((device, idx) => {
										const isOutputSection = selectedDeviceIdx >= devices.length;
										const outputSelectedIdx = isOutputSection ? selectedDeviceIdx - devices.length : -1;
										return (
											<box
												key={`output-${device.name}`}
												backgroundColor={idx === outputSelectedIdx ? COLORS.MENU_SELECTED_BG : COLORS.MENU_BG}
												paddingLeft={1}
												paddingRight={1}
											>
												<text>
													<span fg={idx === outputSelectedIdx ? COLORS.DAEMON_LABEL : COLORS.MENU_TEXT}>
														{idx === outputSelectedIdx ? "▶ " : "  "}
														{device.name}
														{device.name === currentOutputDevice ? " ●" : ""}
													</span>
												</text>
											</box>
										);
									})}
								</box>
							</>
						)}
					</>
				)}

				{step === "model" && (
					<>
						<box marginBottom={1}>
							<text>
								<span fg={COLORS.DAEMON_LABEL}>[ SELECT RESPONSE MODEL ]</span>
							</text>
						</box>
						<box marginBottom={1}>
							<text>
								<span fg={COLORS.REASONING_DIM}>The model controls response quality, speed and cost.</span>
							</text>
						</box>
						<box marginBottom={1}>
							<text>
								<span fg={COLORS.REASONING_DIM}>
									Press Enter to use the default model or select another one from the list.
								</span>
							</text>
						</box>
						<box marginBottom={1}>
							<text>
								<span fg={COLORS.USER_LABEL}>↑/↓ navigate, ENTER confirm</span>
								<span fg={COLORS.REASONING_DIM}> · ESC skip</span>
							</text>
						</box>
						{models.length === 0 ? (
							<box>
								<text>
									<span fg={COLORS.USER_LABEL}>No models available</span>
								</text>
							</box>
						) : (
							<>
								<box marginBottom={1}>
									<box flexDirection="row" justifyContent="space-between">
										<text>
											<span fg={COLORS.REASONING_DIM}>MODEL</span>
										</text>
										<text>
											<span fg={COLORS.REASONING_DIM}>
												{"CTX".padStart(MODEL_COL_WIDTH.CTX)} {"IN".padStart(MODEL_COL_WIDTH.IN)}{" "}
												{"OUT".padStart(MODEL_COL_WIDTH.OUT)} {"CACHE".padStart(MODEL_COL_WIDTH.CACHE)}
											</span>
										</text>
									</box>
								</box>
								<box flexDirection="column">
									{models.map((model, idx) => {
										const isSelected = idx === selectedModelIdx;
										const isCurrent = model.id === currentModelId;
										const pricing = model.pricing;
										const ctxText =
											typeof model.contextLength === "number" && model.contextLength > 0
												? formatContextWindowK(model.contextLength)
												: "--";

										const inText = pricing ? formatPrice(pricing.prompt) : "--";
										const outText = pricing ? formatPrice(pricing.completion) : "--";

										const supportsCaching = Boolean(model.supportsCaching);
										const cacheText = supportsCaching ? "✓" : "x";

										return (
											<box
												key={model.id}
												backgroundColor={isSelected ? COLORS.MENU_SELECTED_BG : COLORS.MENU_BG}
												paddingLeft={1}
												paddingRight={1}
												flexDirection="row"
												justifyContent="space-between"
											>
												<text>
													<span fg={isSelected ? COLORS.DAEMON_LABEL : COLORS.MENU_TEXT}>
														{isSelected ? "▶ " : "  "}
														{model.name}
														{isCurrent ? " ●" : ""}
													</span>
												</text>
												<text>
													<span fg={COLORS.MENU_TEXT}>{ctxText.padStart(MODEL_COL_WIDTH.CTX)} </span>
													<span fg={COLORS.TYPING_PROMPT}>
														{inText.padStart(MODEL_COL_WIDTH.IN)} {outText.padStart(MODEL_COL_WIDTH.OUT)}{" "}
													</span>
													<span fg={supportsCaching ? COLORS.DAEMON_TEXT : COLORS.REASONING_DIM}>
														{cacheText.padStart(MODEL_COL_WIDTH.CACHE)}
													</span>
												</text>
											</box>
										);
									})}
								</box>
							</>
						)}
					</>
				)}

				{step === "settings" && (
					<>
						<box marginBottom={1}>
							<text>
								<span fg={COLORS.DAEMON_LABEL}>[ ONBOARDING COMPLETE ]</span>
							</text>
						</box>
						<box marginBottom={1}>
							<text>
								<span fg={COLORS.MENU_TEXT}>You can fine-tune behavior anytime in the Settings menu.</span>
							</text>
						</box>
						<box marginBottom={1}>
							<text>
								<span fg={COLORS.REASONING_DIM}>
									Press S to open Settings and ? to view hotkeys after closing this pane.
								</span>
							</text>
						</box>
						<box justifyContent="center">
							<text>
								<span fg={COLORS.DAEMON_LABEL}>Press ENTER to finish</span>
								<span fg={COLORS.REASONING_DIM}> · ESC also works</span>
							</text>
						</box>
					</>
				)}
			</box>
		</box>
	);
}

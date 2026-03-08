import type { KeyEvent } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useEffect, useState } from "react";
import { getMemoryManager, isMemoryAvailable } from "../ai/memory";
import type {
	AppPreferences,
	InteractionMode,
	LlmProvider,
	VoiceInteractionType,
	SpeechSpeed,
	ReasoningEffort,
	BashApprovalLevel,
} from "../types";
import { REASONING_EFFORT_LABELS, BASH_APPROVAL_LABELS } from "../types";
import { getDaemonManager } from "../state/daemon-state";
import { handleSettingsMenuKey } from "../hooks/keyboard-handlers";
import { COLORS } from "../ui/constants";

interface SettingsMenuItem {
	id: string;
	label: string;
	value?: string;
	description?: string;
	isToggle?: boolean;
	isCyclic?: boolean;
	isHeader?: boolean;
	disabled?: boolean;
}

interface SettingsMenuProps {
	interactionMode: InteractionMode;
	voiceInteractionType: VoiceInteractionType;
	speechSpeed: SpeechSpeed;
	reasoningEffort: ReasoningEffort;
	bashApprovalLevel: BashApprovalLevel;
	modelProvider: LlmProvider;
	supportsReasoning: boolean;
	supportsReasoningXHigh: boolean;
	copilotAvailable: boolean;
	canEnableVoiceOutput: boolean;
	showFullReasoning: boolean;
	showToolOutput: boolean;
	memoryEnabled: boolean;
	onClose: () => void;
	toggleInteractionMode: () => void;
	cycleModelProvider: () => void;
	setVoiceInteractionType: (type: VoiceInteractionType) => void;
	setSpeechSpeed: (speed: SpeechSpeed) => void;
	setReasoningEffort: (effort: ReasoningEffort) => void;
	setBashApprovalLevel: (level: BashApprovalLevel) => void;
	setShowFullReasoning: (show: boolean) => void;
	setShowToolOutput: (show: boolean) => void;
	setMemoryEnabled: (enabled: boolean) => void;
	persistPreferences: (updates: Partial<AppPreferences>) => void;
}

export function SettingsMenu({
	interactionMode,
	voiceInteractionType,
	speechSpeed,
	reasoningEffort,
	bashApprovalLevel,
	modelProvider,
	supportsReasoning,
	supportsReasoningXHigh,
	copilotAvailable,
	canEnableVoiceOutput,
	showFullReasoning,
	showToolOutput,
	memoryEnabled,
	onClose,
	toggleInteractionMode,
	cycleModelProvider,
	setVoiceInteractionType,
	setSpeechSpeed,
	setReasoningEffort,
	setBashApprovalLevel,
	setShowFullReasoning,
	setShowToolOutput,
	setMemoryEnabled,
	persistPreferences,
}: SettingsMenuProps) {
	const [selectedIdx, setSelectedIdx] = useState(0);
	const [storedMemoryCount, setStoredMemoryCount] = useState<number | null>(null);
	const manager = getDaemonManager();
	const openAiKeyMissing = !process.env.OPENAI_API_KEY;
	const openRouterKeyMissing = !process.env.OPENROUTER_API_KEY;
	const hasStoredMemories = (storedMemoryCount ?? 0) > 0;
	const memoryCountKnown = storedMemoryCount !== null;
	const memoryToggleDisabled =
		openAiKeyMissing || (openRouterKeyMissing && (!memoryCountKnown || storedMemoryCount === 0));

	useEffect(() => {
		if (!openAiKeyMissing || !memoryEnabled) {
			return;
		}

		manager.memoryEnabled = false;
		setMemoryEnabled(false);
		persistPreferences({ memoryEnabled: false });
	}, [manager, memoryEnabled, openAiKeyMissing, persistPreferences, setMemoryEnabled]);

	useEffect(() => {
		let cancelled = false;

		const loadStoredMemoryCount = async () => {
			if (!isMemoryAvailable()) {
				if (!cancelled) {
					setStoredMemoryCount(0);
				}
				return;
			}

			try {
				const memoryManager = getMemoryManager();
				await memoryManager.initialize();
				if (!memoryManager.isAvailable) {
					if (!cancelled) {
						setStoredMemoryCount(0);
					}
					return;
				}
				const storedMemories = await memoryManager.getAll();
				if (!cancelled) {
					setStoredMemoryCount(storedMemories.length);
				}
			} catch {
				if (!cancelled) {
					setStoredMemoryCount(0);
				}
			}
		};

		void loadStoredMemoryCount();
		return () => {
			cancelled = true;
		};
	}, []);

	const interactionModeLocked = !canEnableVoiceOutput && interactionMode === "text";
	const interactionModeDescription = interactionModeLocked
		? "[LOCKED] OpenAI key required for voice output"
		: interactionMode === "voice"
			? "Conversational responses and speech output"
			: "Markdown responses for terminal";
	const memoryDescription = openAiKeyMissing
		? "[LOCKED] OPENAI_API_KEY is required for memory"
		: openRouterKeyMissing && !memoryCountKnown
			? "[LOCKED] Checking stored memories... OPENROUTER_API_KEY missing: no new memories added"
			: memoryToggleDisabled
				? "[LOCKED] No stored memories and OPENROUTER_API_KEY is missing, so no new memories can be added"
				: openRouterKeyMissing && hasStoredMemories
					? "Inject stored memories only (OPENROUTER_API_KEY missing: no new memories added)"
					: "Auto-save messages + inject relevant memories";

	const items: SettingsMenuItem[] = [
		{
			id: "header-core",
			label: "CORE SYSTEMS",
			isHeader: true,
		},
		{
			id: "interaction-mode",
			label: "Interaction Mode",
			value: interactionMode === "voice" ? "VOICE" : "TEXT",
			description: interactionModeDescription,
			isToggle: true,
			disabled: interactionModeLocked,
		},
		{
			id: "model-provider",
			label: "Model Provider",
			value: modelProvider === "copilot" ? "COPILOT" : "OPENROUTER",
			description:
				!copilotAvailable && modelProvider === "openrouter"
					? "OpenRouter API with provider routing (Copilot: run `gh auth login` + `copilot login`)"
					: modelProvider === "copilot"
						? "GitHub Copilot session runtime"
						: "OpenRouter API with provider routing",
			isToggle: true,
		},
		{
			id: "voice-interaction-type",
			label: "Voice Flow",
			value: voiceInteractionType === "direct" ? "DIRECT" : "REVIEW",
			description:
				voiceInteractionType === "direct"
					? "Send transcript immediately"
					: "Review/Edit trasncript before sending",
			isToggle: true,
		},
		{
			id: "reasoning-effort",
			label: "Reasoning Effort",
			value: supportsReasoning ? REASONING_EFFORT_LABELS[reasoningEffort] : "N/A",
			description: supportsReasoning
				? supportsReasoningXHigh
					? "Depth of reasoning (LOW / MEDIUM / HIGH / XHIGH)"
					: "Depth of reasoning (LOW / MEDIUM / HIGH)"
				: "Not supported by current model",
			isCyclic: supportsReasoning,
		},
		{
			id: "bash-approvals",
			label: "Bash Approvals",
			value: BASH_APPROVAL_LABELS[bashApprovalLevel],
			description: "Require approval for bash commands (NONE / DANGEROUS / ALL)",
			isCyclic: true,
		},
		{
			id: "memory-enabled",
			label: "Memory",
			value: memoryEnabled ? "ON" : "OFF",
			description: memoryDescription,
			isToggle: true,
			disabled: memoryToggleDisabled,
		},
	];

	const audioSettingsDisabled = interactionMode !== "voice";
	items.push(
		{
			id: "header-audio",
			label: "AUDIO PARAMETERS",
			isHeader: true,
		},
		{
			id: "speech-speed",
			label: "Speech Speed",
			value: audioSettingsDisabled ? "N/A" : `${speechSpeed.toFixed(2)}x`,
			description: audioSettingsDisabled
				? "Enable voice mode to adjust speech rate"
				: "Adjust speech rate (1.0x - 2.0x)",
			isCyclic: !audioSettingsDisabled,
			disabled: audioSettingsDisabled,
		}
	);

	items.push(
		{
			id: "header-display",
			label: "DISPLAY",
			isHeader: true,
		},
		{
			id: "show-full-reasoning",
			label: "Full Reasoning",
			value: showFullReasoning ? "ON" : "OFF",
			description: "Show full reasoning blocks (hotkey: T)",
			isToggle: true,
		},
		{
			id: "show-tool-output",
			label: "Tool Output",
			value: showToolOutput ? "ON" : "OFF",
			description: "Show tool output previews (hotkey: O)",
			isToggle: true,
		}
	);

	// Filter out headers for selection logic
	const selectableItems = items.filter((item) => !item.isHeader);
	const selectableCount = selectableItems.length;
	const labelWidth = Math.max(0, ...selectableItems.map((item) => item.label.length)) + 4;

	useEffect(() => {
		if (selectableCount === 0) {
			setSelectedIdx(0);
			return;
		}
		setSelectedIdx((prev) => (prev >= selectableCount ? selectableCount - 1 : prev));
	}, [selectableCount]);

	useKeyboard((key: KeyEvent) => {
		handleSettingsMenuKey(key, {
			selectedIdx,
			menuItemCount: selectableCount,
			interactionMode,
			modelProvider,
			voiceInteractionType,
			speechSpeed,
			reasoningEffort,
			bashApprovalLevel,
			supportsReasoning,
			supportsReasoningXHigh,
			canEnableVoiceOutput,
			showFullReasoning,
			showToolOutput,
			memoryEnabled,
			memoryToggleDisabled,
			setSelectedIdx,
			toggleInteractionMode,
			cycleModelProvider,
			setVoiceInteractionType,
			setSpeechSpeed,
			setReasoningEffort,
			setBashApprovalLevel,
			setShowFullReasoning,
			setShowToolOutput,
			setMemoryEnabled,
			persistPreferences,
			onClose,
			manager,
		});
	});

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
			zIndex={100}
		>
			<box
				flexDirection="column"
				backgroundColor={COLORS.MENU_BG}
				borderStyle="single"
				borderColor={COLORS.MENU_BORDER}
				paddingLeft={2}
				paddingRight={2}
				paddingTop={1}
				paddingBottom={1}
				width="60%"
				minWidth={50}
				maxWidth={130}
			>
				<box marginBottom={1}>
					<text>
						<span fg={COLORS.DAEMON_LABEL}>[ SETTINGS ]</span>
					</text>
				</box>
				<box marginBottom={1}>
					<text>
						<span fg={COLORS.USER_LABEL}>↑/↓ or j/k to navigate, ENTER to cycle, ESC to close</span>
					</text>
				</box>
				<box flexDirection="column">
					{items.map((item) => {
						if (item.isHeader) {
							return (
								<box key={item.id} marginTop={1} marginBottom={0}>
									<text>
										<span fg={COLORS.USER_LABEL}>— {item.label} —</span>
									</text>
								</box>
							);
						}

						const selectableIdx = selectableItems.indexOf(item);
						const isSelected = selectableIdx === selectedIdx;
						const labelColor = item.disabled
							? COLORS.REASONING_DIM
							: isSelected
								? COLORS.DAEMON_LABEL
								: COLORS.MENU_TEXT;
						const valueColor = item.disabled
							? COLORS.REASONING_DIM
							: item.value === "VOICE"
								? COLORS.DAEMON_LABEL
								: COLORS.DAEMON_TEXT;

						return (
							<box
								key={item.id}
								backgroundColor={isSelected ? COLORS.MENU_SELECTED_BG : COLORS.MENU_BG}
								paddingLeft={1}
								paddingRight={1}
								flexDirection="column"
							>
								<box flexDirection="row">
									<box width={labelWidth}>
										<text>
											<span fg={labelColor}>
												{isSelected ? "▶ " : "  "}
												{item.label}:{" "}
											</span>
										</text>
									</box>
									<box>
										<text>
											<span fg={valueColor}>{item.value}</span>
											{item.isToggle && !item.disabled && <span fg={COLORS.USER_LABEL}></span>}
											{item.isCyclic && !item.disabled && <span fg={COLORS.USER_LABEL}></span>}
										</text>
									</box>
								</box>
								{item.description && (
									<box marginLeft={labelWidth}>
										<text>
											<span fg={COLORS.REASONING_DIM}>{item.description}</span>
										</text>
									</box>
								)}
							</box>
						);
					})}
				</box>
			</box>
		</box>
	);
}

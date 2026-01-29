import type { KeyEvent } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useEffect, useState } from "react";
import type {
	AppPreferences,
	InteractionMode,
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
	supportsReasoning: boolean;
	canEnableVoiceOutput: boolean;
	showFullReasoning: boolean;
	showToolOutput: boolean;
	memoryEnabled: boolean;
	onClose: () => void;
	toggleInteractionMode: () => void;
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
	supportsReasoning,
	canEnableVoiceOutput,
	showFullReasoning,
	showToolOutput,
	memoryEnabled,
	onClose,
	toggleInteractionMode,
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
	const manager = getDaemonManager();
	const interactionModeLocked = !canEnableVoiceOutput && interactionMode === "text";
	const interactionModeDescription = interactionModeLocked
		? "[LOCKED] OpenAI key required for voice output"
		: interactionMode === "voice"
			? "Conversational responses and speech output"
			: "Markdown responses for terminal";

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
				? "Depth of reasoning (LOW / MEDIUM / HIGH)"
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
			description: "Auto-save messages + inject relevant memories",
			isToggle: true,
		},
	];

	if (interactionMode === "voice") {
		items.push(
			{
				id: "header-audio",
				label: "AUDIO PARAMETERS",
				isHeader: true,
			},
			{
				id: "speech-speed",
				label: "Speech Speed",
				value: `${speechSpeed.toFixed(2)}x`,
				description: "Adjust speech rate (1.0x - 2.0x)",
				isCyclic: true,
			}
		);
	}

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
			voiceInteractionType,
			speechSpeed,
			reasoningEffort,
			bashApprovalLevel,
			supportsReasoning,
			canEnableVoiceOutput,
			showFullReasoning,
			showToolOutput,
			memoryEnabled,
			setSelectedIdx,
			toggleInteractionMode,
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
								<box>
									<text>
										<span fg={labelColor}>
											{isSelected ? "▶ " : "  "}
											{item.label}:{" "}
										</span>
										<span fg={valueColor}>{item.value}</span>
										{item.isToggle && !item.disabled && <span fg={COLORS.USER_LABEL}></span>}
										{item.isCyclic && !item.disabled && <span fg={COLORS.USER_LABEL}></span>}
									</text>
								</box>
								{item.description && (
									<box marginLeft={4}>
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

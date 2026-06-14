import { TextAttributes, type KeyEvent } from "@opentui/core";
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
	openAiCodexAuthenticated: boolean;
	copilotAuthenticated: boolean;
	canEnableVoiceOutput: boolean;
	showFullReasoning: boolean;
	showToolOutput: boolean;
	bashLivePreviewAlways: boolean;
	showStats: boolean;
	completionNotificationEnabled: boolean;
	completionSoundEnabled: boolean;
	memoryEnabled: boolean;
	onClose: () => void;
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
	openAiCodexAuthenticated,
	copilotAuthenticated,
	canEnableVoiceOutput,
	showFullReasoning,
	showToolOutput,
	bashLivePreviewAlways,
	showStats,
	completionNotificationEnabled,
	completionSoundEnabled,
	memoryEnabled,
	onClose,
	toggleInteractionMode,
	cycleModelProvider,
	manageOpenAiCodexAuth,
	manageCopilotAuth,
	setVoiceInteractionType,
	setSpeechSpeed,
	setReasoningEffort,
	setBashApprovalLevel,
	setShowFullReasoning,
	setShowToolOutput,
	setBashLivePreviewAlways,
	setShowStats,
	setCompletionNotificationEnabled,
	setCompletionSoundEnabled,
	setMemoryEnabled,
	persistPreferences,
}: SettingsMenuProps) {
	const [selectedIdx, setSelectedIdx] = useState(0);
	const [storedMemoryCount, setStoredMemoryCount] = useState<number | null>(null);
	const manager = getDaemonManager();
	const openAiKeyMissing = !process.env.OPENAI_API_KEY;
	const openRouterKeyMissing = !process.env.OPENROUTER_API_KEY;
	const memoryLockedByProvider = modelProvider === "copilot" || modelProvider === "openai-codex";
	const hasStoredMemories = (storedMemoryCount ?? 0) > 0;
	const memoryCountKnown = storedMemoryCount !== null;
	const memoryToggleDisabled =
		memoryLockedByProvider ||
		openAiKeyMissing ||
		(openRouterKeyMissing && (!memoryCountKnown || storedMemoryCount === 0));

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
	const memoryDescription = memoryLockedByProvider
		? modelProvider === "copilot"
			? "[LOCKED] Memory is disabled while using GitHub Copilot"
			: "[LOCKED] Memory is disabled while using OpenAI Codex"
		: openAiKeyMissing
			? "[LOCKED] OPENAI_API_KEY is required for memory"
			: openRouterKeyMissing && !memoryCountKnown
				? "[LOCKED] Checking stored memories... OPENROUTER_API_KEY missing: no new memories added"
				: memoryToggleDisabled
					? "[LOCKED] No stored memories and OPENROUTER_API_KEY is missing, so no new memories can be added"
					: openRouterKeyMissing && hasStoredMemories
						? "Inject stored memories only (OPENROUTER_API_KEY missing: no new memories added)"
						: "Auto-save messages + inject relevant memories";

	const audioSettingsDisabled = interactionMode !== "voice";

	// Tab definitions — each tab has a label and its items
	type TabDef = {
		label: string;
		items: SettingsMenuItem[];
	};
	const [currentTab, setCurrentTab] = useState(0);
	const tabs: TabDef[] = [
		{
			label: "CORE",
			items: [
				{
					id: "interaction-mode",
					label: "Response Mode",
					value: interactionMode === "voice" ? "VOICE" : "TEXT",
					description: interactionModeDescription,
					isToggle: true,
					disabled: interactionModeLocked,
				},
				{
					id: "model-provider",
					label: "Model Provider",
					value:
						modelProvider === "copilot"
							? "COPILOT"
							: modelProvider === "openai-codex"
								? "OPENAI CODEX"
								: "OPENROUTER",
					description:
						!copilotAuthenticated && modelProvider === "openrouter"
							? "OpenRouter API with provider routing"
							: modelProvider === "openai-codex"
								? "ChatGPT subscription auth via OpenAI Codex OAuth"
								: modelProvider === "copilot"
									? "GitHub Copilot session runtime"
									: "OpenRouter API with provider routing",
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
					id: "openai-codex-auth",
					label: "OpenAI Codex Auth",
					value: openAiCodexAuthenticated ? "CONNECTED" : "CONNECT",
					description: openAiCodexAuthenticated
						? "Browser OAuth active. Press ENTER to re-authenticate."
						: "Connect your ChatGPT/Codex subscription via browser OAuth.",
				},
				{
					id: "copilot-auth",
					label: "Copilot Auth",
					value: copilotAuthenticated ? "CONNECTED" : "CONNECT",
					description: copilotAuthenticated
						? "GitHub auth detected. Press ENTER to view auth guidance again."
						: "Exit DAEMON, run `gh auth login`, then relaunch to use Copilot.",
				},
			],
		},
		{
			label: "RUNTIME",
			items: [
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
					value: !memoryToggleDisabled && memoryEnabled ? "ON" : "OFF",
					description: memoryDescription,
					isToggle: true,
					disabled: memoryToggleDisabled,
				},
			],
		},
		{
			label: "AUDIO",
			items: [
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
					id: "speech-speed",
					label: "Speech Speed",
					value: audioSettingsDisabled ? "N/A" : `${speechSpeed.toFixed(2)}x`,
					description: audioSettingsDisabled
						? "Enable voice mode to adjust speech rate"
						: "Adjust speech rate (1.0x - 2.0x)",
					isCyclic: !audioSettingsDisabled,
					disabled: audioSettingsDisabled,
				},
			],
		},
		{
			label: "DISPLAY",
			items: [
				{
					id: "completion-notification",
					label: "Notify on Complete",
					value: completionNotificationEnabled ? "ON" : "OFF",
					description: "Show a notification when a response finishes",
					isToggle: true,
				},
				{
					id: "completion-sound",
					label: "Sound on Complete",
					value: completionSoundEnabled ? "ON" : "OFF",
					description: "Play a sound when a response finishes",
					isToggle: true,
				},
				{
					id: "show-full-reasoning",
					label: "Full Reasoning",
					value: showFullReasoning ? "ON" : "OFF",
					description: "Show full reasoning blocks (hotkey: R)",
					isToggle: true,
				},
				{
					id: "show-tool-output",
					label: "Tool Output",
					value: showToolOutput ? "ON" : "OFF",
					description: "Show tool output previews (hotkey: O)",
					isToggle: true,
				},
				{
					id: "bash-live-preview-always",
					label: "Bash Live Preview",
					value: bashLivePreviewAlways ? "ON" : "OFF",
					description: "Always show the bash live streaming preview, even when Tool Output is off",
					isToggle: true,
				},
				{
					id: "show-stats",
					label: "Show Stats",
					value: showStats ? "ON" : "OFF",
					description: "Show DAEMON stats HUD overlay",
					isToggle: true,
				},
			],
		},
	];

	// Reset selected index when tab changes
	const tabItems = tabs[currentTab]?.items ?? [];
	const selectableCount = tabItems.length;
	const tabItemIds = tabItems.map((i) => i.id);
	const labelWidth = Math.max(0, ...tabItems.map((item) => item.label.length)) + 4;

	useEffect(() => {
		setSelectedIdx(0);
	}, [currentTab]);

	useKeyboard((key: KeyEvent) => {
		if (key.name === "tab" && key.eventType === "press") {
			setCurrentTab((prev) => (prev + 1) % tabs.length);
			setSelectedIdx(0);
			key.preventDefault();
			return;
		}
		handleSettingsMenuKey(key, {
			selectedIdx,
			menuItemCount: selectableCount,
			tabItemIds,
			interactionMode,
			modelProvider,
			openAiCodexAuthenticated,
			copilotAuthenticated,
			voiceInteractionType,
			speechSpeed,
			reasoningEffort,
			bashApprovalLevel,
			supportsReasoning,
			supportsReasoningXHigh,
			canEnableVoiceOutput,
			showFullReasoning,
			showToolOutput,
			bashLivePreviewAlways,
			showStats,
			completionNotificationEnabled,
			completionSoundEnabled,
			memoryEnabled,
			memoryToggleDisabled,
			setSelectedIdx,
			toggleInteractionMode,
			cycleModelProvider,
			manageOpenAiCodexAuth,
			manageCopilotAuth,
			setVoiceInteractionType,
			setSpeechSpeed,
			setReasoningEffort,
			setBashApprovalLevel,
			setShowFullReasoning,
			setShowToolOutput,
			setBashLivePreviewAlways,
			setShowStats,
			setCompletionNotificationEnabled,
			setCompletionSoundEnabled,
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
				{/* Tab bar */}
				<box flexDirection="row" marginBottom={1} gap={1}>
					{tabs.map((tab, i) => {
						const isActive = i === currentTab;
						return (
							<box
								key={tab.label}
								paddingLeft={1}
								paddingRight={1}
								backgroundColor={isActive ? COLORS.STATUS_COMPLETED : undefined}
							>
								<text>
									<span
										fg={isActive ? COLORS.MENU_BG : COLORS.STATUS_COMPLETED}
										attributes={isActive ? TextAttributes.BOLD : TextAttributes.NONE}
									>
										[{tab.label}]
									</span>
								</text>
							</box>
						);
					})}
				</box>
				<box marginBottom={1}>
					<text>
						<span fg={COLORS.USER_LABEL}>
							Tab to cycle section, ↑/↓ or j/k for item, ENTER to change, ESC to close
						</span>
					</text>
				</box>
				<box flexDirection="column">
					{tabItems.map((item) => {
						const selectableIdx = tabItems.indexOf(item);
						const isSelected = selectableIdx === selectedIdx;
						const labelColor = item.disabled
							? COLORS.REASONING_DIM
							: isSelected
								? COLORS.DAEMON_LABEL
								: COLORS.MENU_TEXT;
						const isAuthRow = item.id === "openai-codex-auth" || item.id === "copilot-auth";
						const valueColor = item.disabled
							? COLORS.REASONING_DIM
							: isAuthRow && item.value === "CONNECT"
								? COLORS.TYPING_PROMPT
								: isAuthRow && item.value === "CONNECTED"
									? COLORS.DAEMON_TEXT
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

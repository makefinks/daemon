import { useState } from "react";
import { getDaemonManager } from "../state/daemon-state";
import type { BashApprovalLevel, ReasoningEffort, SpeechSpeed, VoiceInteractionType } from "../types";

export interface UseAppSettingsReturn {
	interactionMode: "text" | "voice";
	setInteractionMode: React.Dispatch<React.SetStateAction<"text" | "voice">>;

	voiceInteractionType: VoiceInteractionType;
	setVoiceInteractionType: React.Dispatch<React.SetStateAction<VoiceInteractionType>>;

	speechSpeed: SpeechSpeed;
	setSpeechSpeed: React.Dispatch<React.SetStateAction<SpeechSpeed>>;

	reasoningEffort: ReasoningEffort;
	setReasoningEffort: React.Dispatch<React.SetStateAction<ReasoningEffort>>;

	bashApprovalLevel: BashApprovalLevel;
	setBashApprovalLevel: React.Dispatch<React.SetStateAction<BashApprovalLevel>>;

	showFullReasoning: boolean;
	setShowFullReasoning: React.Dispatch<React.SetStateAction<boolean>>;

	showToolOutput: boolean;
	setShowToolOutput: React.Dispatch<React.SetStateAction<boolean>>;

	canEnableVoiceOutput: boolean;
}

export function useAppSettings(): UseAppSettingsReturn {
	const manager = getDaemonManager();

	const [interactionMode, setInteractionMode] = useState(manager.interactionMode);
	const [voiceInteractionType, setVoiceInteractionType] = useState(manager.voiceInteractionType);
	const [speechSpeed, setSpeechSpeed] = useState<SpeechSpeed>(manager.speechSpeed);
	const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(manager.reasoningEffort);
	const [bashApprovalLevel, setBashApprovalLevel] = useState<BashApprovalLevel>(
		manager.bashApprovalLevel ?? "dangerous"
	);
	const [showFullReasoning, setShowFullReasoning] = useState(true);
	const [showToolOutput, setShowToolOutput] = useState(false);

	const canEnableVoiceOutput = Boolean(process.env.OPENAI_API_KEY);

	return {
		interactionMode,
		setInteractionMode,
		voiceInteractionType,
		setVoiceInteractionType,
		speechSpeed,
		setSpeechSpeed,
		reasoningEffort,
		setReasoningEffort,
		bashApprovalLevel,
		setBashApprovalLevel,
		showFullReasoning,
		setShowFullReasoning,
		showToolOutput,
		setShowToolOutput,
		canEnableVoiceOutput,
	};
}

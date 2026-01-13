/**
 * Reusable API key input step for onboarding.
 * Reduces repetition across openrouter, openai, and exa key steps.
 */

import type { TextareaRenderable } from "@opentui/core";
import type { RefObject } from "react";
import { ApiKeyInput } from "./ApiKeyInput";
import { COLORS } from "../ui/constants";

interface ApiKeyStepProps {
	/** Title displayed in the header */
	title: string;
	/** Main description of what the service does */
	description: string;
	/** Optional error message (e.g., "env variable not found") */
	errorMessage?: string;
	/** Environment variable name for Option 2 */
	envVarName: string;
	/** URL where the user can get their API key */
	keyUrl: string;
	/** Whether this key is optional (shows ESC to skip option) */
	optional?: boolean;
	/** What happens if skipped (e.g., "text-only mode", "web search disabled") */
	skipConsequence?: string;
	/** Callback when key is submitted */
	onSubmit: () => void;
	/** Ref to the textarea for focus management */
	textareaRef?: RefObject<TextareaRenderable | null>;
}

export function ApiKeyStep({
	title,
	description,
	errorMessage,
	envVarName,
	keyUrl,
	optional = false,
	skipConsequence,
	onSubmit,
	textareaRef,
}: ApiKeyStepProps) {
	return (
		<>
			<box marginBottom={1}>
				<text>
					<span fg={COLORS.DAEMON_LABEL}>[ {title} ]</span>
				</text>
			</box>
			{errorMessage && (
				<box marginBottom={1}>
					<text>
						<span fg={COLORS.DAEMON_ERROR}>{errorMessage}</span>
					</text>
				</box>
			)}
			<box marginBottom={1}>
				<text>
					<span fg={COLORS.MENU_TEXT}>{description}</span>
				</text>
			</box>
			{optional && skipConsequence && (
				<box marginBottom={1}>
					<text>
						<span fg={COLORS.REASONING_DIM}>Without this key, {skipConsequence}.</span>
					</text>
				</box>
			)}
			<box marginBottom={1}>
				<text>
					<span fg={COLORS.REASONING_DIM}>Option 1: Paste your key (Ctrl+v) below and press ENTER</span>
				</text>
			</box>
			<box marginBottom={1}>
				<text>
					<span fg={COLORS.REASONING_DIM}>Option 2: Quit, set {envVarName} env variable and restart</span>
				</text>
			</box>
			{optional && (
				<box marginBottom={1}>
					<text>
						<span fg={COLORS.REASONING_DIM}>Option 3: Press ESC to skip ({skipConsequence})</span>
					</text>
				</box>
			)}
			<box marginBottom={1}>
				<text>
					<span fg={COLORS.REASONING_DIM}>Get your key: {keyUrl}</span>
					<span fg={COLORS.USER_LABEL}> · Shift+O to open</span>
				</text>
			</box>
			<ApiKeyInput onSubmit={onSubmit} textareaRef={textareaRef} />
		</>
	);
}

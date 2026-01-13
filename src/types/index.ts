/**
 * Shared type definitions for the DAEMON application.
 * Consolidates types used across multiple modules.
 */

import type { ModelMessage } from "ai";

// Re-export AI SDK types for convenience
export type { ModelMessage } from "ai";

/**
 * Tool result output format expected by the AI SDK.
 */
export type ToolResultOutput =
	| { type: "text"; value: string }
	| { type: "json"; value: Record<string, unknown> | unknown[] | string | number | boolean | null }
	| { type: "error-text"; value: string }
	| { type: "error-json"; value: Record<string, unknown> | unknown[] | string | number | boolean | null };

/**
 * DAEMON operational states
 */
export enum DaemonState {
	IDLE = "idle",
	LISTENING = "listening",
	TRANSCRIBING = "transcribing",
	RESPONDING = "responding",
	SPEAKING = "speaking",
	TYPING = "typing",
}

/**
 * Token usage information from API response
 */
export interface TokenUsage {
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
	reasoningTokens?: number;
	cachedInputTokens?: number;
	cost?: number;
	subagentTotalTokens?: number;
	subagentPromptTokens?: number;
	subagentCompletionTokens?: number;
}

/**
 * Status of a tool call or subagent step
 * - "streaming": Tool call detected, name known, but input still streaming
 * - "running": Tool call input complete, execution in progress
 * - "completed": Tool execution finished successfully
 * - "failed": Tool execution failed
 */
export type ToolCallStatus = "streaming" | "running" | "completed" | "failed" | "awaiting_approval";

/**
 * A step/action taken by a subagent, displayed in the UI
 */
export interface SubagentStep {
	toolName: string;
	status: ToolCallStatus;
	input?: unknown;
	summary?: string;
}

/**
 * Tool call representation for UI rendering
 */
export interface ToolCall {
	name: string;
	input: unknown;
	toolCallId?: string;
	/** For subagent tool calls - tracks nested tool invocations */
	subagentSteps?: SubagentStep[];
	/** Current status of the tool call */
	status?: ToolCallStatus;
	/** Snapshot of todos at the time of the tool call (for todoManager) */
	todoSnapshot?: Array<{ content: string; status: string }>;
	/** Error message when status is "failed" */
	error?: string;
	/** Result of user approval decision (only set for tools that required approval) */
	approvalResult?: "approved" | "denied";
}

/**
 * Content block types for interleaved UI display.
 * These are derived from ModelMessage content for rendering.
 */
export type ContentBlock =
	| { type: "reasoning"; content: string; durationMs?: number }
	| { type: "tool"; call: ToolCall; result?: unknown }
	| { type: "text"; content: string };

/**
 * UI-specific conversation message that wraps the core AI SDK messages.
 * The `messages` field contains the actual AI SDK messages for API calls.
 * The other fields are for UI display convenience.
 */
export interface ConversationMessage {
	id: number;
	type: "user" | "daemon";
	content: string;
	messages: ModelMessage[];
	contentBlocks?: ContentBlock[];
	pending?: boolean;
}

/**
 * Persisted session snapshot for reloading UI and model context.
 */
export interface SessionSnapshot {
	conversationHistory: ConversationMessage[];
	sessionUsage: TokenUsage;
}

/**
 * Session metadata for listing and selection.
 */
export interface SessionInfo {
	id: string;
	title: string;
	createdAt: string;
	updatedAt: string;
}

/**
 * Color theme for avatar states.
 * Used by both daemon-state.ts and daemon-avatar-rig.ts.
 */
export interface AvatarColorTheme {
	primary: number;
	glow: number;
	eye: number;
}

/**
 * Alias for avatar color theme used by the rig.
 * @deprecated Use AvatarColorTheme directly
 */
export type DaemonColorTheme = AvatarColorTheme;

/**
 * Transcription result from voice input
 */
export interface TranscriptionResult {
	text: string;
}

/**
 * Callbacks for streaming AI responses
 */
export interface StreamCallbacks {
	onToken?: (token: string) => void;
	onReasoningToken?: (token: string) => void;
	onToolCallStart?: (toolName: string, toolCallId: string) => void;
	onToolCall?: (toolName: string, args: unknown, toolCallId?: string) => void;
	onToolResult?: (toolName: string, result: unknown, toolCallId?: string) => void;
	onToolApprovalRequest?: (request: ToolApprovalRequest) => void;
	onAwaitingApprovals?: (
		pendingApprovals: ToolApprovalRequest[],
		respondToApprovals: (responses: ToolApprovalResponse[]) => void
	) => void;
	onSubagentToolCall?: (toolCallId: string, toolName: string, input?: unknown) => void;
	onSubagentUsage?: (usage: TokenUsage) => void;
	onSubagentToolResult?: (toolCallId: string, toolName: string, success: boolean) => void;
	onSubagentComplete?: (toolCallId: string, success: boolean) => void;
	onStepUsage?: (usage: TokenUsage) => void;
	onComplete?: (
		fullText: string,
		responseMessages: ModelMessage[],
		usage?: TokenUsage,
		/** The final assistant text only (for TTS - excludes intermediate text from tool-call steps) */
		finalText?: string
	) => void;
	onError?: (error: Error) => void;
}

/**
 * Audio device information
 */
export interface AudioDevice {
	name: string;
	isDefault?: boolean;
}

/**
 * Interaction mode for DAEMON responses.
 * - "text": Terminal output with markdown formatting
 * - "voice": Speech-to-speech, natural conversational responses
 */
export type InteractionMode = "text" | "voice";

/**
 * Speech speed settings (1.0x to 2.0x)
 */
export type SpeechSpeed = 1.0 | 1.25 | 1.5 | 1.75 | 2.0;

/**
 * Reasoning effort / cognitive depth settings.
 * Controls how deeply the model reasons about responses.
 * - "low": SURFACE - minimal reasoning
 * - "medium": DEEP - moderate reasoning (default)
 * - "high": ABYSSAL - maximum reasoning depth
 */
export type ReasoningEffort = "low" | "medium" | "high";

/** Display labels for reasoning effort levels */
export const REASONING_EFFORT_LABELS: Record<ReasoningEffort, string> = {
	low: "LOW",
	medium: "MEDIUM",
	high: "HIGH",
};

/** Ordered list of reasoning effort levels for cycling */
export const REASONING_EFFORT_LEVELS: ReasoningEffort[] = ["low", "medium", "high"];

/**
 * Bash tool approval level settings.
 * Controls when user approval is required for bash commands.
 * - "none": No approval required for any bash commands
 * - "dangerous": Approval required only for potentially dangerous commands
 * - "all": Approval required for all bash commands
 */
export type BashApprovalLevel = "none" | "dangerous" | "all";

/** Display labels for bash approval levels */
export const BASH_APPROVAL_LABELS: Record<BashApprovalLevel, string> = {
	none: "NONE",
	dangerous: "DANGEROUS",
	all: "ALL",
};

/** Ordered list of bash approval levels for cycling */
export const BASH_APPROVAL_LEVELS: BashApprovalLevel[] = ["none", "dangerous", "all"];

/**
 * Onboarding flow steps.
 * - intro: Welcome screen
 * - openrouter_key: OpenRouter API key input (for AI models)
 * - openai_key: OpenAI API key input (for transcription)
 * - exa_key: Exa API key input (for web search)
 * - device: Audio device selection
 * - model: AI model selection
 * - complete: Onboarding finished
 */
export type OnboardingStep =
	| "intro"
	| "openrouter_key"
	| "openai_key"
	| "exa_key"
	| "device"
	| "model"
	| "settings"
	| "complete";

export type VoiceInteractionType = "direct" | "review";

/**
 * Persisted user preferences.
 */
export interface AppPreferences {
	version: number;
	createdAt: string;
	updatedAt: string;
	onboardingCompleted: boolean;
	audioDeviceName?: string;
	audioOutputDeviceName?: string;
	modelId?: string;
	/**
	 * OpenRouter inference provider slug (aka `provider` routing tag), e.g. "openai".
	 * When unset, OpenRouter will automatically route to the best available provider.
	 */
	openRouterProviderTag?: string;
	interactionMode?: InteractionMode;
	voiceInteractionType?: VoiceInteractionType;
	speechSpeed?: SpeechSpeed;
	reasoningEffort?: ReasoningEffort;
	/** OpenRouter API key for AI model responses */
	openRouterApiKey?: string;
	/** OpenAI API key for voice transcription */
	openAiApiKey?: string;
	/** Exa API key for web search */
	exaApiKey?: string;
	/** Show full reasoning blocks instead of compact ticker */
	showFullReasoning?: boolean;
	/** Show tool output previews */
	showToolOutput?: boolean;
	/** Bash command approval level */
	bashApprovalLevel?: BashApprovalLevel;
	/** Recent user inputs for up/down history navigation (max 20) */
	inputHistory?: string[];
}

/**
 * Model pricing information (per 1M tokens)
 */
export interface ModelPricing {
	prompt: number;
	completion: number;
	/**
	 * Discounted price for cache reads (per 1M input tokens).
	 * Present only for some providers/models on OpenRouter.
	 */
	inputCacheRead?: number;
	/**
	 * Price for cache writes (per 1M input tokens).
	 * Present only for some providers/models on OpenRouter.
	 */
	inputCacheWrite?: number;
}

/**
 * Model option for selection menus
 */
export interface ModelOption {
	id: string;
	name: string;
	pricing?: ModelPricing;
	contextLength?: number;
	supportsCaching?: boolean;
}

/**
 * Todo item status
 */
export type TodoStatus = "pending" | "in_progress" | "completed" | "cancelled";

/**
 * Tool approval request from the AI SDK.
 * Emitted when a tool with needsApproval: true is called.
 */
export interface ToolApprovalRequest {
	approvalId: string;
	toolName: string;
	toolCallId: string;
	input: unknown;
}

/**
 * Tool approval response to send back to the agent.
 */
export interface ToolApprovalResponse {
	approvalId: string;
	approved: boolean;
	reason?: string;
}

/**
 * Todo item for task tracking
 */
export interface TodoItem {
	content: string;
	status: TodoStatus;
}

/**
 * Event emitter interface for subagent progress updates.
 * Used to connect subagent tool execution to the UI.
 */
export interface SubagentProgressEmitter {
	onSubagentToolCall: (toolCallId: string, toolName: string, input?: unknown) => void;
	onSubagentUsage: (usage: {
		promptTokens: number;
		completionTokens: number;
		totalTokens: number;
		reasoningTokens?: number;
		cachedInputTokens?: number;
		cost?: number;
	}) => void;
	onSubagentToolResult: (toolCallId: string, toolName: string, success: boolean) => void;
	onSubagentComplete: (toolCallId: string, success: boolean) => void;
}

/**
 * Grounding: Source information for a grounded statement.
 */
export interface GroundingSource {
	url: string;
	title?: string;
	/** Short excerpt copied from fetched content (human-readable). */
	quote: string;
	/** Text fragment for deep-linking (short verbatim phrase from source). */
	textFragment: string;
}

/**
 * Grounding: A single grounded statement with its source.
 */
export interface GroundedStatement {
	id: string;
	statement: string;
	source: GroundingSource;
}

/**
 * Grounding: A map of grounded statements for a single response.
 */
export interface GroundingMap {
	id: string;
	sessionId: string;
	/** The DAEMON response message this map belongs to (or turn id). */
	messageId: number;
	createdAt: string;
	items: GroundedStatement[];
}

import type { ModelMessage } from "ai";
import type { LlmProvider, ReasoningEffort, StreamCallbacks, TokenUsage } from "../../types";
import type { InteractionMode } from "../system-prompt";

export interface ProviderCapabilities {
	supportsSubagentTool: boolean;
}

export interface ProviderStreamRequest {
	userMessage: string;
	callbacks: StreamCallbacks;
	conversationHistory: ModelMessage[];
	interactionMode: InteractionMode;
	abortSignal?: AbortSignal;
	reasoningEffort?: ReasoningEffort;
	memoryInjection?: string;
}

export interface ProviderStreamResult {
	fullText: string;
	responseMessages: ModelMessage[];
	usage?: TokenUsage;
	finalText?: string;
}

export interface LlmProviderAdapter {
	id: LlmProvider;
	capabilities: ProviderCapabilities;
	streamResponse: (request: ProviderStreamRequest) => Promise<ProviderStreamResult | null>;
	generateSessionTitle: (firstMessage: string) => Promise<string>;
}

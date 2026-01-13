import { generateResponse } from "./daemon-ai";
import type {
	InteractionMode,
	ModelMessage,
	ReasoningEffort,
	StreamCallbacks,
	TokenUsage,
	ToolApprovalRequest,
	ToolApprovalResponse,
} from "../types";

export interface AgentTurnParams {
	userText: string;
	conversationHistory: ModelMessage[];
	interactionMode: InteractionMode;
	reasoningEffort: ReasoningEffort;
}

export interface AgentTurnResult {
	fullText: string;
	responseMessages: ModelMessage[];
	usage?: TokenUsage;
	finalText?: string;
}

export class AgentTurnRunner {
	private abortController: AbortController | null = null;
	private activeRunId = 0;

	cancel(): void {
		if (this.abortController) {
			this.abortController.abort();
			this.abortController = null;
		}
		this.activeRunId++;
	}

	async run(params: AgentTurnParams, callbacks: StreamCallbacks): Promise<AgentTurnResult | null> {
		const runId = ++this.activeRunId;
		this.abortController = new AbortController();

		const isActive = () => runId === this.activeRunId && this.abortController !== null;

		let result: AgentTurnResult | null = null;
		let error: Error | null = null;

		const wrapped: StreamCallbacks = {
			onReasoningToken: (token) => {
				if (!isActive()) return;
				callbacks.onReasoningToken?.(token);
			},
			onToolCallStart: (toolName, toolCallId) => {
				if (!isActive()) return;
				callbacks.onToolCallStart?.(toolName, toolCallId);
			},
			onToolCall: (toolName, args, toolCallId) => {
				if (!isActive()) return;
				callbacks.onToolCall?.(toolName, args, toolCallId);
			},
			onToolResult: (toolName, resultValue, toolCallId) => {
				if (!isActive()) return;
				callbacks.onToolResult?.(toolName, resultValue, toolCallId);
			},
			onToolApprovalRequest: (request) => {
				if (!isActive()) return;
				callbacks.onToolApprovalRequest?.(request);
			},
			onAwaitingApprovals: (pendingApprovals, respondToApprovals) => {
				if (!isActive()) return;
				callbacks.onAwaitingApprovals?.(pendingApprovals, respondToApprovals);
			},
			onSubagentToolCall: (toolCallId, toolName, input) => {
				if (!isActive()) return;
				callbacks.onSubagentToolCall?.(toolCallId, toolName, input);
			},
			onSubagentUsage: (usage) => {
				if (!isActive()) return;
				callbacks.onSubagentUsage?.(usage);
			},
			onSubagentToolResult: (toolCallId, toolName, success) => {
				if (!isActive()) return;
				callbacks.onSubagentToolResult?.(toolCallId, toolName, success);
			},
			onSubagentComplete: (toolCallId, success) => {
				if (!isActive()) return;
				callbacks.onSubagentComplete?.(toolCallId, success);
			},
			onToken: (token) => {
				if (!isActive()) return;
				callbacks.onToken?.(token);
			},
			onStepUsage: (usage) => {
				if (!isActive()) return;
				callbacks.onStepUsage?.(usage);
			},
			onComplete: (fullText, responseMessages, usage, finalText) => {
				if (!isActive()) return;
				result = { fullText, responseMessages, usage, finalText };
				callbacks.onComplete?.(fullText, responseMessages, usage, finalText);
			},
			onError: (err) => {
				if (!isActive()) return;
				error = err;
				callbacks.onError?.(err);
			},
		};

		try {
			await generateResponse(
				params.userText,
				wrapped,
				params.conversationHistory,
				params.interactionMode,
				this.abortController.signal,
				params.reasoningEffort
			);
		} catch (err) {
			const e = err instanceof Error ? err : new Error(String(err));
			error = e;
			wrapped.onError?.(e);
		} finally {
			if (isActive()) {
				this.abortController = null;
			}
		}

		if (error) throw error;
		return result;
	}
}

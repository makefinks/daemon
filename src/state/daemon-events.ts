import { EventEmitter } from "node:events";

import type {
	MemoryToastPreview,
	ModelMessage,
	TokenUsage,
	ToolCallStatus,
	ToolApprovalRequest,
	ToolApprovalResponse,
} from "../types";
import { DaemonState } from "../types";

export type DaemonStateEvents = {
	stateChange: (state: DaemonState) => void;
	transcriptionUpdate: (text: string) => void;
	transcriptionReady: (text: string) => void;
	micLevel: (level: number) => void;
	ttsLevel: (level: number) => void;
	reasoningToken: (token: string) => void;
	toolInputStart: (toolName: string, toolCallId: string) => void;
	toolInvocation: (toolName: string, input: unknown, toolCallId?: string) => void;
	toolResult: (toolName: string, result: unknown, toolCallId?: string) => void;
	toolComplete: (toolCallId: string, status: ToolCallStatus) => void;
	toolApprovalRequest: (request: ToolApprovalRequest) => void;
	toolApprovalResolved: (toolCallId: string, approved: boolean) => void;
	awaitingApprovals: (
		pendingApprovals: ToolApprovalRequest[],
		respondToApprovals: (responses: ToolApprovalResponse[]) => void
	) => void;
	subagentToolCall: (toolCallId: string, toolName: string, input?: unknown) => void;
	subagentUsage: (usage: TokenUsage) => void;
	subagentToolResult: (toolCallId: string, toolName: string, success: boolean) => void;
	subagentComplete: (toolCallId: string, success: boolean) => void;
	responseToken: (token: string) => void;
	stepUsage: (usage: TokenUsage) => void;
	memorySaved: (preview: MemoryToastPreview) => void;
	responseComplete: (fullText: string, responseMessages: ModelMessage[], usage?: TokenUsage) => void;
	userMessage: (text: string) => void;
	speakingStart: () => void;
	speakingComplete: () => void;
	groundingSaved: (sessionId: string, messageId: number, mapId: string) => void;
	cancelled: () => void;
	error: (error: Error) => void;
};

class DaemonEventBus extends EventEmitter {
	override emit(event: string | symbol, ...args: unknown[]): boolean;
	override emit<K extends keyof DaemonStateEvents>(
		event: K,
		...args: Parameters<DaemonStateEvents[K]>
	): boolean;
	override emit(event: string | symbol, ...args: unknown[]): boolean {
		return super.emit(event, ...args);
	}

	override on(event: string | symbol, listener: (...args: unknown[]) => void): this;
	override on<K extends keyof DaemonStateEvents>(event: K, listener: DaemonStateEvents[K]): this;
	override on(event: string | symbol, listener: (...args: unknown[]) => void): this {
		return super.on(event, listener);
	}

	override off(event: string | symbol, listener: (...args: unknown[]) => void): this;
	override off<K extends keyof DaemonStateEvents>(event: K, listener: DaemonStateEvents[K]): this;
	override off(event: string | symbol, listener: (...args: unknown[]) => void): this {
		return super.off(event, listener);
	}
}

export const daemonEvents = new DaemonEventBus();

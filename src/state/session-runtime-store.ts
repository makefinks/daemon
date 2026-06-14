import { EventEmitter } from "node:events";
import { toast } from "@opentui-ui/toast/react";
import { getCurrentTodos } from "../ai/tools/todo-manager";
import {
	buildInterruptedContentBlocks,
	buildInterruptedModelMessages,
} from "../hooks/daemon-event-handlers/interrupted-turn";
import type {
	ContentBlock,
	ConversationMessage,
	LiveToolOutput,
	ModelMessage,
	PromptImageAttachment,
	SubagentStep,
	TokenUsage,
	ToolApprovalRequest,
	ToolCall,
	ToolExecutionDelta,
} from "../types";
import { DaemonState } from "../types";
import { hasVisibleText } from "../utils/formatters";
import { backgroundJobManager } from "./background-job-manager";
import { buildModelHistoryFromConversation, saveSessionSnapshot } from "./session-store";

const DEFAULT_SESSION_USAGE: TokenUsage = {
	promptTokens: 0,
	completionTokens: 0,
	totalTokens: 0,
	subagentTotalTokens: 0,
	subagentPromptTokens: 0,
	subagentCompletionTokens: 0,
};

const LIVE_OUTPUT_MAX_CHARS = 50000;
const REASONING_NOTIFY_INTERVAL_MS = 40;
const STREAM_NOTIFY_INTERVAL_MS = 16;

function truncateLiveOutput(value: string): string {
	if (value.length <= LIVE_OUTPUT_MAX_CHARS) return value;
	return `${value.slice(-LIVE_OUTPUT_MAX_CHARS)}\n... [output truncated]`;
}

interface SessionRuntimeEvents {
	updated: (sessionId: string) => void;
	statusChanged: () => void;
}

class TypedRuntimeEvents extends EventEmitter {
	override emit(event: string | symbol, ...args: unknown[]): boolean;
	override emit<K extends keyof SessionRuntimeEvents>(
		event: K,
		...args: Parameters<SessionRuntimeEvents[K]>
	): boolean;
	override emit(event: string | symbol, ...args: unknown[]): boolean {
		return super.emit(event, ...args);
	}

	override on(event: string | symbol, listener: (...args: unknown[]) => void): this;
	override on<K extends keyof SessionRuntimeEvents>(event: K, listener: SessionRuntimeEvents[K]): this;
	override on(event: string | symbol, listener: (...args: unknown[]) => void): this {
		return super.on(event, listener);
	}

	override off(event: string | symbol, listener: (...args: unknown[]) => void): this;
	override off<K extends keyof SessionRuntimeEvents>(event: K, listener: SessionRuntimeEvents[K]): this;
	override off(event: string | symbol, listener: (...args: unknown[]) => void): this {
		return super.off(event, listener);
	}
}

export interface SessionRuntimeSnapshot {
	sessionId: string;
	state: DaemonState;
	conversationHistory: ConversationMessage[];
	currentTranscription: string;
	currentResponse: string;
	currentContentBlocks: ContentBlock[];
	sessionUsage: TokenUsage;
	error: string;
	modelHistory: ModelMessage[];
	messageId: number;
	currentUserInput: string;
	pendingApprovalCount: number;
	startedAt: number | null;
	updatedAt: number;
}

export interface SessionRuntimeStatus {
	sessionId: string;
	state: DaemonState;
	isRunning: boolean;
	isAwaitingApproval: boolean;
	hasRunningBackgroundJobs: boolean;
	pendingApprovalCount: number;
	startedAt: number | null;
	updatedAt: number;
	totalTokens: number;
	cost?: number;
}

interface SessionRuntimeInternal extends SessionRuntimeSnapshot {
	toolCalls: ToolCall[];
	toolCallsById: Map<string, ToolCall>;
	contentBlocks: ContentBlock[];
	reasoningStartAt: number | null;
	currentReasoningBlock: ContentBlock | null;
	liveOutput: Map<string, LiveToolOutput>;
}

function createRuntime(sessionId: string): SessionRuntimeInternal {
	return {
		sessionId,
		state: DaemonState.IDLE,
		conversationHistory: [],
		currentTranscription: "",
		currentResponse: "",
		currentContentBlocks: [],
		sessionUsage: { ...DEFAULT_SESSION_USAGE },
		error: "",
		modelHistory: [],
		messageId: 0,
		currentUserInput: "",
		pendingApprovalCount: 0,
		startedAt: null,
		updatedAt: Date.now(),
		toolCalls: [],
		toolCallsById: new Map(),
		contentBlocks: [],
		reasoningStartAt: null,
		currentReasoningBlock: null,
		liveOutput: new Map(),
	};
}

function cloneSnapshot(runtime: SessionRuntimeInternal): SessionRuntimeSnapshot {
	return {
		sessionId: runtime.sessionId,
		state: runtime.state,
		conversationHistory: runtime.conversationHistory,
		currentTranscription: runtime.currentTranscription,
		currentResponse: runtime.currentResponse,
		currentContentBlocks: runtime.currentContentBlocks,
		sessionUsage: runtime.sessionUsage,
		error: runtime.error,
		modelHistory: runtime.modelHistory,
		messageId: runtime.messageId,
		currentUserInput: runtime.currentUserInput,
		pendingApprovalCount: runtime.pendingApprovalCount,
		startedAt: runtime.startedAt,
		updatedAt: runtime.updatedAt,
	};
}

function normalizeToolCallId(toolCallId: string | undefined): string | undefined {
	if (typeof toolCallId !== "string") return undefined;
	const trimmed = toolCallId.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function isInProgressToolCall(toolCall: ToolCall | undefined): boolean {
	const status = toolCall?.status;
	return status === "streaming" || status === "running" || status === "awaiting_approval";
}

function findExistingToolCall(
	runtime: SessionRuntimeInternal,
	toolName: string,
	toolCallId: string | undefined
): ToolCall | undefined {
	if (toolCallId) return runtime.toolCallsById.get(toolCallId);
	return [...runtime.toolCalls]
		.reverse()
		.find((call) => call.name === toolName && isInProgressToolCall(call));
}

function findHistoricalToolCall(runtime: SessionRuntimeInternal, toolCallId: string): ToolCall | undefined {
	for (let i = runtime.conversationHistory.length - 1; i >= 0; i--) {
		const message = runtime.conversationHistory[i];
		const blocks = message?.contentBlocks;
		if (!blocks) continue;
		for (const block of blocks) {
			if (block.type === "tool" && block.call.toolCallId === toolCallId) {
				return block.call;
			}
		}
	}
	return undefined;
}

function findHistoricalToolBlock(
	runtime: SessionRuntimeInternal,
	toolCallId: string
): ContentBlock | undefined {
	for (let i = runtime.conversationHistory.length - 1; i >= 0; i--) {
		const message = runtime.conversationHistory[i];
		const blocks = message?.contentBlocks;
		if (!blocks) continue;
		for (const block of blocks) {
			if (block.type === "tool" && block.call.toolCallId === toolCallId) {
				return block;
			}
		}
	}
	return undefined;
}

function findSubagentToolCall(runtime: SessionRuntimeInternal, toolCallId: string): ToolCall | undefined {
	return runtime.toolCallsById.get(toolCallId) ?? findHistoricalToolCall(runtime, toolCallId);
}

function finalizePendingUserMessage(
	prev: ConversationMessage[],
	userText: string,
	daemonMessage: ConversationMessage | null,
	nextMessageId: () => number
): ConversationMessage[] {
	let pendingIndex = -1;
	for (let i = prev.length - 1; i >= 0; i--) {
		const msg = prev[i];
		if (msg?.type === "user" && msg.pending) {
			pendingIndex = i;
			break;
		}
	}

	const next = [...prev];
	if (pendingIndex >= 0) {
		const pendingMessage = next[pendingIndex];
		if (pendingMessage) {
			next[pendingIndex] = { ...pendingMessage, pending: false };
		} else {
			next.push({
				id: nextMessageId(),
				type: "user",
				content: userText,
				messages: [{ role: "user", content: userText }],
			});
		}
	} else {
		next.push({
			id: nextMessageId(),
			type: "user",
			content: userText,
			messages: [{ role: "user", content: userText }],
		});
	}

	if (daemonMessage) next.push(daemonMessage);
	return next;
}

function buildUserModelMessage(text: string, imageAttachments: PromptImageAttachment[] = []): ModelMessage {
	if (imageAttachments.length === 0) return { role: "user", content: text };

	const content: unknown[] = [];
	const trimmed = text.trim();
	if (trimmed) content.push({ type: "text", text: trimmed });
	for (const image of imageAttachments) {
		content.push({
			type: "file",
			mediaType: image.mediaType,
			data: image.data,
			filename: image.filename,
		});
	}

	return { role: "user", content } as ModelMessage;
}

function mergeTokenUsage(prev: TokenUsage, usage: TokenUsage, isSubagent: boolean): TokenUsage {
	const currentCost =
		prev.cost !== undefined || usage.cost !== undefined ? (prev.cost ?? 0) + (usage.cost ?? 0) : undefined;

	if (isSubagent) {
		return {
			...prev,
			cost: currentCost,
			subagentTotalTokens: (prev.subagentTotalTokens ?? 0) + usage.totalTokens,
			subagentPromptTokens: (prev.subagentPromptTokens ?? 0) + usage.promptTokens,
			subagentCompletionTokens: (prev.subagentCompletionTokens ?? 0) + usage.completionTokens,
		};
	}

	return {
		cost: currentCost,
		promptTokens: prev.promptTokens + usage.promptTokens,
		completionTokens: prev.completionTokens + usage.completionTokens,
		totalTokens: prev.totalTokens + usage.totalTokens,
		reasoningTokens: (prev.reasoningTokens ?? 0) + (usage.reasoningTokens ?? 0) || undefined,
		cachedInputTokens: (prev.cachedInputTokens ?? 0) + (usage.cachedInputTokens ?? 0) || undefined,
		subagentTotalTokens: prev.subagentTotalTokens,
		subagentPromptTokens: prev.subagentPromptTokens,
		subagentCompletionTokens: prev.subagentCompletionTokens,
		latestTurnPromptTokens: usage.promptTokens,
		latestTurnCompletionTokens: usage.completionTokens,
	};
}

export class SessionRuntimeStore {
	readonly events = new TypedRuntimeEvents();
	private runtimes = new Map<string, SessionRuntimeInternal>();
	private reasoningNotifyTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private streamNotifyTimers = new Map<string, ReturnType<typeof setTimeout>>();

	constructor() {
		backgroundJobManager.events.on("statusChanged", () => {
			this.events.emit("statusChanged");
		});
	}

	ensure(sessionId: string): SessionRuntimeInternal {
		let runtime = this.runtimes.get(sessionId);
		if (!runtime) {
			runtime = createRuntime(sessionId);
			this.runtimes.set(sessionId, runtime);
		}
		return runtime;
	}

	getSnapshot(sessionId: string | null): SessionRuntimeSnapshot | null {
		if (!sessionId) return null;
		const runtime = this.runtimes.get(sessionId);
		return runtime ? cloneSnapshot(runtime) : null;
	}

	getStatuses(): SessionRuntimeStatus[] {
		return [...this.runtimes.values()].map((runtime) => ({
			sessionId: runtime.sessionId,
			state: runtime.state,
			isRunning: runtime.state === DaemonState.RESPONDING,
			isAwaitingApproval: runtime.pendingApprovalCount > 0,
			hasRunningBackgroundJobs: backgroundJobManager
				.listJobs(runtime.sessionId)
				.some((j) => j.state === "running"),
			pendingApprovalCount: runtime.pendingApprovalCount,
			startedAt: runtime.startedAt,
			updatedAt: runtime.updatedAt,
			totalTokens: runtime.sessionUsage.totalTokens + (runtime.sessionUsage.subagentTotalTokens ?? 0),
			cost: runtime.sessionUsage.cost,
		}));
	}

	getStatusMap(): Map<string, SessionRuntimeStatus> {
		return new Map(this.getStatuses().map((status) => [status.sessionId, status]));
	}

	getLiveOutput(sessionId: string | null, toolCallId: string | undefined): LiveToolOutput | null {
		if (!sessionId || !toolCallId) return null;
		const runtime = this.runtimes.get(sessionId);
		if (!runtime) return null;
		return runtime.liveOutput.get(toolCallId) ?? null;
	}

	hydrate(sessionId: string, conversationHistory: ConversationMessage[], sessionUsage: TokenUsage): void {
		const runtime = this.ensure(sessionId);
		runtime.conversationHistory = conversationHistory.map((msg) => ({ ...msg, pending: false }));
		runtime.sessionUsage = sessionUsage;
		runtime.modelHistory = buildModelHistoryFromConversation(runtime.conversationHistory);
		runtime.messageId = runtime.conversationHistory.reduce((max, msg) => Math.max(max, msg.id), -1) + 1;
		runtime.currentTranscription = "";
		runtime.currentResponse = "";
		runtime.currentContentBlocks = [];
		runtime.contentBlocks = [];
		runtime.toolCalls = [];
		runtime.toolCallsById.clear();
		runtime.liveOutput.clear();
		runtime.currentUserInput = "";
		runtime.updatedAt = Date.now();
		this.notify(runtime.sessionId);
	}

	clear(sessionId: string): void {
		this.clearReasoningNotifyTimer(sessionId);
		this.clearStreamNotifyTimer(sessionId);
		this.runtimes.delete(sessionId);
		this.events.emit("updated", sessionId);
		this.events.emit("statusChanged");
	}

	clearConversation(sessionId: string): void {
		const runtime = this.ensure(sessionId);
		runtime.conversationHistory = [];
		runtime.modelHistory = [];
		runtime.currentTranscription = "";
		runtime.currentResponse = "";
		runtime.currentContentBlocks = [];
		runtime.contentBlocks = [];
		runtime.toolCalls = [];
		runtime.toolCallsById.clear();
		runtime.liveOutput.clear();
		runtime.sessionUsage = { ...DEFAULT_SESSION_USAGE };
		runtime.messageId = 0;
		runtime.currentUserInput = "";
		runtime.updatedAt = Date.now();
		this.notify(sessionId);
	}

	beginUserMessage(
		sessionId: string,
		text: string,
		imageAttachments: PromptImageAttachment[] = [],
		options: { hidden?: boolean; notificationBlock?: ContentBlock } = {}
	): boolean {
		const runtime = this.ensure(sessionId);
		if (!text.trim() && imageAttachments.length === 0) return false;
		if (runtime.state === DaemonState.RESPONDING) return false;
		const isFirstMessage = runtime.conversationHistory.length === 0;
		if (options.notificationBlock) {
			runtime.conversationHistory = [
				...runtime.conversationHistory,
				{
					id: runtime.messageId++,
					type: "daemon",
					content:
						options.notificationBlock.type === "backgroundNotification"
							? options.notificationBlock.content
							: "",
					messages: [],
					contentBlocks: [options.notificationBlock],
				},
			];
		}
		const userModelMessage = buildUserModelMessage(text, imageAttachments);

		const userMessage: ConversationMessage = {
			id: runtime.messageId++,
			type: "user",
			content: text,
			messages: [userModelMessage],
			pending: true,
			hidden: options.hidden,
		};

		runtime.currentUserInput = text;
		runtime.currentTranscription = "";
		runtime.conversationHistory = [...runtime.conversationHistory, userMessage];
		runtime.updatedAt = Date.now();
		void this.persist(runtime);
		this.notify(sessionId);
		return isFirstMessage;
	}

	addNotificationBlock(sessionId: string, block: ContentBlock): void {
		const runtime = this.ensure(sessionId);
		if (runtime.state !== DaemonState.RESPONDING) return;
		const blocks = runtime.contentBlocks;
		let insertAt = blocks.length;
		for (let i = blocks.length - 1; i >= 0; i--) {
			if (blocks[i]?.type === "tool") {
				insertAt = i + 1;
				break;
			}
		}
		blocks.splice(insertAt, 0, block);
		runtime.updatedAt = Date.now();
		this.scheduleReasoningNotify(sessionId);
	}

	beginResponse(sessionId: string): void {
		this.flushStreamNotify(sessionId);
		const runtime = this.ensure(sessionId);
		runtime.state = DaemonState.RESPONDING;
		runtime.startedAt = Date.now();
		runtime.currentResponse = "";
		runtime.currentContentBlocks = [];
		runtime.contentBlocks = [];
		runtime.toolCalls = [];
		runtime.toolCallsById.clear();
		runtime.liveOutput.clear();
		runtime.pendingApprovalCount = 0;
		runtime.reasoningStartAt = null;
		runtime.currentReasoningBlock = null;
		runtime.updatedAt = Date.now();
		this.notify(sessionId);
	}

	setTyping(sessionId: string): void {
		const runtime = this.ensure(sessionId);
		if (runtime.state === DaemonState.RESPONDING) return;
		runtime.state = DaemonState.TYPING;
		runtime.updatedAt = Date.now();
		this.notify(sessionId);
	}

	setIdle(sessionId: string): void {
		const runtime = this.ensure(sessionId);
		runtime.state = DaemonState.IDLE;
		runtime.startedAt = null;
		runtime.updatedAt = Date.now();
		this.notify(sessionId);
	}

	setCurrentTranscription(sessionId: string, text: string): void {
		const runtime = this.ensure(sessionId);
		runtime.currentTranscription = text;
		runtime.currentUserInput = text;
		runtime.updatedAt = Date.now();
		this.notify(sessionId);
	}

	setError(sessionId: string, error: string): void {
		this.flushStreamNotify(sessionId);
		const runtime = this.ensure(sessionId);
		runtime.error = error;
		runtime.updatedAt = Date.now();
		this.notify(sessionId);
	}

	clearError(sessionId: string): void {
		const runtime = this.ensure(sessionId);
		if (!runtime.error) return;
		runtime.error = "";
		runtime.updatedAt = Date.now();
		this.notify(sessionId);
	}

	appendReasoning(sessionId: string, token: string): void {
		const runtime = this.ensure(sessionId);
		if (runtime.reasoningStartAt === null) runtime.reasoningStartAt = Date.now();
		const blocks = runtime.contentBlocks;
		const lastBlock = blocks[blocks.length - 1];
		if (lastBlock && lastBlock.type === "reasoning") {
			lastBlock.content += token;
			runtime.currentReasoningBlock = lastBlock;
		} else {
			const block: ContentBlock = { type: "reasoning", content: token };
			blocks.push(block);
			runtime.currentReasoningBlock = block;
		}
		runtime.currentContentBlocks = [...blocks];
		runtime.updatedAt = Date.now();
		this.scheduleStreamNotify(sessionId);
	}

	appendToken(sessionId: string, token: string): void {
		if (!token) return;
		const runtime = this.ensure(sessionId);
		const isWhitespaceOnly = token.trim().length === 0;
		const blocks = runtime.contentBlocks;
		const lastBlock = blocks[blocks.length - 1];
		if (isWhitespaceOnly) {
			if (lastBlock?.type !== "text") return;
			if (!hasVisibleText(lastBlock.content)) return;
		} else {
			this.finalizeReasoningDuration(runtime);
		}

		runtime.currentResponse += token;
		if (lastBlock && lastBlock.type === "text") {
			lastBlock.content += token;
		} else {
			blocks.push({ type: "text", content: token });
		}
		runtime.currentContentBlocks = [...blocks];
		runtime.updatedAt = Date.now();
		this.scheduleStreamNotify(sessionId);
	}

	toolInputStart(sessionId: string, toolName: string, toolCallId: string): void {
		this.flushStreamNotify(sessionId);
		const runtime = this.ensure(sessionId);
		this.finalizeReasoningDuration(runtime);
		const blocks = runtime.contentBlocks;
		const lastBlock = blocks[blocks.length - 1];
		if (lastBlock?.type === "text" && !hasVisibleText(lastBlock.content)) blocks.pop();

		const normalizedToolCallId = normalizeToolCallId(toolCallId);
		const existing = findExistingToolCall(runtime, toolName, normalizedToolCallId);
		if (existing) {
			if (existing.status === undefined || existing.status === "streaming") existing.status = "streaming";
			runtime.currentContentBlocks = [...blocks];
			this.notify(sessionId);
			return;
		}

		const toolCall: ToolCall = {
			name: toolName,
			input: undefined,
			sessionId,
			toolCallId: normalizedToolCallId,
			status: "streaming",
			subagentSteps: toolName === "subagent" ? [] : undefined,
		};
		runtime.toolCalls.push(toolCall);
		if (normalizedToolCallId) runtime.toolCallsById.set(normalizedToolCallId, toolCall);
		blocks.push({ type: "tool", call: toolCall });
		runtime.currentContentBlocks = [...blocks];
		runtime.updatedAt = Date.now();
		this.notify(sessionId);
	}

	toolInputDelta(sessionId: string, toolCallId: string, delta: string): void {
		if (!delta) return;
		const runtime = this.ensure(sessionId);
		const normalizedToolCallId = normalizeToolCallId(toolCallId);
		if (!normalizedToolCallId) return;
		const toolCall = runtime.toolCallsById.get(normalizedToolCallId);
		if (!toolCall) return;
		toolCall.inputText = `${toolCall.inputText ?? ""}${delta}`;
		runtime.currentContentBlocks = [...runtime.contentBlocks];
		runtime.updatedAt = Date.now();
		this.notify(sessionId);
	}

	toolInvocation(sessionId: string, toolName: string, input: unknown, toolCallId?: string): void {
		this.flushStreamNotify(sessionId);
		const runtime = this.ensure(sessionId);
		this.finalizeReasoningDuration(runtime);
		const blocks = runtime.contentBlocks;
		const normalizedToolCallId = normalizeToolCallId(toolCallId);
		const existing = findExistingToolCall(runtime, toolName, normalizedToolCallId);
		if (existing) {
			const shouldActivate =
				existing.status === undefined ||
				existing.status === "streaming" ||
				existing.status === "awaiting_approval";
			existing.input = input;
			if (shouldActivate) existing.status = "running";
			runtime.currentContentBlocks = [...blocks];
			runtime.updatedAt = Date.now();
			this.notify(sessionId);
			return;
		}

		const lastBlock = blocks[blocks.length - 1];
		if (lastBlock?.type === "text" && !hasVisibleText(lastBlock.content)) blocks.pop();
		const toolCall: ToolCall = {
			name: toolName,
			input,
			sessionId,
			toolCallId: normalizedToolCallId,
			status: "running",
			subagentSteps: toolName === "subagent" ? [] : undefined,
		};
		runtime.toolCalls.push(toolCall);
		if (normalizedToolCallId) runtime.toolCallsById.set(normalizedToolCallId, toolCall);
		blocks.push({ type: "tool", call: toolCall });
		runtime.currentContentBlocks = [...blocks];
		runtime.updatedAt = Date.now();
		this.notify(sessionId);
	}

	toolApprovalRequest(sessionId: string, request: ToolApprovalRequest): void {
		const runtime = this.ensure(sessionId);
		const toolCall = runtime.toolCallsById.get(request.toolCallId);
		if (toolCall) toolCall.status = "awaiting_approval";
		runtime.pendingApprovalCount += 1;
		runtime.currentContentBlocks = [...runtime.contentBlocks];
		runtime.updatedAt = Date.now();
		this.notify(sessionId);
	}

	toolApprovalResolved(toolCallId: string, approved: boolean, sessionId?: string): void {
		const runtimes = sessionId ? [this.ensure(sessionId)] : [...this.runtimes.values()];
		for (const runtime of runtimes) {
			const toolCall = runtime.toolCallsById.get(toolCallId);
			if (!toolCall) continue;
			toolCall.approvalResult = approved ? "approved" : "denied";
			if (runtime.pendingApprovalCount > 0) runtime.pendingApprovalCount -= 1;
			runtime.currentContentBlocks = [...runtime.contentBlocks];
			runtime.updatedAt = Date.now();
			this.notify(runtime.sessionId);
		}
	}

	toolExecutionDelta(sessionId: string | null, delta: ToolExecutionDelta): void {
		if (!sessionId) return;
		const runtime = this.ensure(sessionId);
		const toolCallId = delta.toolCallId;
		if (!toolCallId) return;
		const existing = runtime.liveOutput.get(toolCallId) ?? {
			toolName: delta.toolName,
			stdout: "",
			stderr: "",
			updatedAt: Date.now(),
		};
		existing.toolName = delta.toolName;
		if (delta.stream === "stdout") {
			existing.stdout = truncateLiveOutput(`${existing.stdout}${delta.chunk}`);
		} else {
			existing.stderr = truncateLiveOutput(`${existing.stderr}${delta.chunk}`);
		}
		existing.updatedAt = Date.now();
		runtime.liveOutput.set(toolCallId, existing);
		runtime.currentContentBlocks = [...runtime.contentBlocks];
		runtime.updatedAt = Date.now();
		this.events.emit("toolExecutionDelta", delta);
		this.notify(sessionId);
	}

	clearToolLiveOutput(sessionId: string, toolCallId: string): void {
		const runtime = this.runtimes.get(sessionId);
		if (!runtime) return;
		if (!runtime.liveOutput.delete(toolCallId)) return;
		runtime.currentContentBlocks = [...runtime.contentBlocks];
		runtime.updatedAt = Date.now();
		this.notify(sessionId);
	}

	subagentToolCall(sessionId: string, toolCallId: string, toolName: string, input?: unknown): void {
		const runtime = this.ensure(sessionId);
		const toolCall = findSubagentToolCall(runtime, toolCallId);
		if (!toolCall?.subagentSteps) return;
		const step: SubagentStep = { toolName, status: "running", input };
		toolCall.subagentSteps = [...toolCall.subagentSteps, step];
		runtime.currentContentBlocks = [...runtime.contentBlocks];
		runtime.updatedAt = Date.now();
		this.notify(sessionId);
	}

	subagentToolResult(
		sessionId: string,
		toolCallId: string,
		toolName: string,
		success: boolean,
		result?: unknown
	): void {
		const runtime = this.ensure(sessionId);
		const toolCall = findSubagentToolCall(runtime, toolCallId);
		if (!toolCall?.subagentSteps) return;
		let updated = false;
		toolCall.subagentSteps = toolCall.subagentSteps.map((step) => {
			if (!updated && step.toolName === toolName && step.status === "running") {
				updated = true;
				return { ...step, result, status: success ? "completed" : "failed" };
			}
			return step;
		});
		runtime.currentContentBlocks = [...runtime.contentBlocks];
		runtime.updatedAt = Date.now();
		this.notify(sessionId);
	}

	subagentComplete(sessionId: string, toolCallId: string, success: boolean): void {
		const runtime = this.ensure(sessionId);
		const toolCall = findSubagentToolCall(runtime, toolCallId);
		if (!toolCall) return;
		toolCall.status = success ? "completed" : "failed";
		runtime.currentContentBlocks = [...runtime.contentBlocks];
		runtime.updatedAt = Date.now();
		this.notify(sessionId);
	}

	toolResult(sessionId: string, toolName: string, result: unknown, toolCallId?: string): void {
		this.flushStreamNotify(sessionId);
		const runtime = this.ensure(sessionId);
		const isBackgroundStartResult =
			typeof result === "object" &&
			result !== null &&
			"background" in result &&
			(result as { background?: unknown }).background === true;
		const errorMessage =
			typeof result === "object" &&
			result !== null &&
			"error" in result &&
			typeof (result as { error?: unknown }).error === "string"
				? ((result as { error?: string }).error ?? "").trim()
				: undefined;
		const isErrorResult = errorMessage !== undefined && errorMessage.length > 0;
		const toolCall =
			(toolCallId ? runtime.toolCallsById.get(toolCallId) : undefined) ??
			[...runtime.toolCalls].reverse().find((t) => t.name === toolName && t.status === "running");
		if (toolCall) {
			toolCall.status = isErrorResult ? "failed" : isBackgroundStartResult ? "running" : "completed";
			if (isErrorResult) toolCall.error = errorMessage;
			const toolBlock = [...runtime.contentBlocks]
				.reverse()
				.find((b) => b.type === "tool" && b.call === toolCall);
			if (toolBlock && toolBlock.type === "tool") toolBlock.result = result;
		}
		if (toolName === "todoManager" && toolCallId) {
			const todoToolCall = runtime.toolCallsById.get(toolCallId);
			if (todoToolCall) {
				const todos = getCurrentTodos(sessionId);
				todoToolCall.todoSnapshot = todos.map((todo) => ({ content: todo.content, status: todo.status }));
			}
		}
		runtime.currentContentBlocks = [...runtime.contentBlocks];
		runtime.updatedAt = Date.now();
		this.notify(sessionId);
	}

	backgroundToolComplete(sessionId: string, toolCallId: string, success: boolean, result?: unknown): void {
		const runtime = this.ensure(sessionId);
		const toolCall = runtime.toolCallsById.get(toolCallId) ?? findHistoricalToolCall(runtime, toolCallId);
		if (!toolCall) return;
		toolCall.status = success ? "completed" : "failed";
		if (!success && result && typeof result === "object" && "error" in result) {
			const error = (result as { error?: unknown }).error;
			if (typeof error === "string") toolCall.error = error;
		}
		const toolBlock =
			[...runtime.contentBlocks].reverse().find((b) => b.type === "tool" && b.call === toolCall) ??
			findHistoricalToolBlock(runtime, toolCallId);
		if (toolBlock && toolBlock.type === "tool") toolBlock.result = result;
		runtime.currentContentBlocks = [...runtime.contentBlocks];
		runtime.updatedAt = Date.now();
		void this.persist(runtime);
		this.notify(sessionId);
	}

	stepUsage(sessionId: string, usage: TokenUsage): void {
		const runtime = this.ensure(sessionId);
		runtime.sessionUsage = mergeTokenUsage(runtime.sessionUsage, usage, false);
		runtime.updatedAt = Date.now();
		this.notify(sessionId);
	}

	subagentUsage(sessionId: string, usage: TokenUsage): void {
		const runtime = this.ensure(sessionId);
		runtime.sessionUsage = mergeTokenUsage(runtime.sessionUsage, usage, true);
		runtime.updatedAt = Date.now();
		this.notify(sessionId);
	}

	completeResponse(
		sessionId: string,
		fullText: string,
		responseMessages: ModelMessage[],
		visibleSessionId: string | null,
		isSessionViewVisible: boolean,
		sessionTitle: string | null
	): void {
		this.flushStreamNotify(sessionId);
		const runtime = this.ensure(sessionId);
		this.finalizeReasoningDuration(runtime);
		const userText = runtime.currentUserInput;
		if (userText) {
			const contentBlocks = runtime.contentBlocks.length > 0 ? [...runtime.contentBlocks] : undefined;
			const daemonMessage: ConversationMessage = {
				id: runtime.messageId++,
				type: "daemon",
				content: fullText,
				messages: responseMessages,
				contentBlocks,
			};
			runtime.conversationHistory = finalizePendingUserMessage(
				runtime.conversationHistory,
				userText,
				daemonMessage,
				() => runtime.messageId++
			);
		}
		runtime.modelHistory = buildModelHistoryFromConversation(runtime.conversationHistory);
		runtime.currentTranscription = "";
		runtime.currentResponse = "";
		runtime.currentContentBlocks = [];
		runtime.contentBlocks = [];
		runtime.toolCalls = [];
		runtime.toolCallsById.clear();
		// Note: liveOutput is intentionally retained so the bash tool card can
		// continue to show its final streamed output after the assistant turn ends.
		runtime.currentUserInput = "";
		runtime.pendingApprovalCount = 0;
		runtime.state = DaemonState.IDLE;
		runtime.startedAt = null;
		runtime.updatedAt = Date.now();
		void this.persist(runtime);
		this.notify(sessionId);
		const hasBgJobs = backgroundJobManager.listJobs(sessionId).some((j) => j.state === "running");
		if (!hasBgJobs && (!isSessionViewVisible || visibleSessionId !== sessionId)) {
			const title = sessionTitle?.trim();
			toast.success("Session completed", {
				description: title ? title : sessionId,
			});
		}
	}

	cancelResponse(sessionId: string): void {
		this.flushStreamNotify(sessionId);
		const runtime = this.ensure(sessionId);
		this.finalizeReasoningDuration(runtime);
		const userText = runtime.currentUserInput;
		const hasBlocks = runtime.contentBlocks.length > 0;
		const contentBlocks = hasBlocks ? buildInterruptedContentBlocks(runtime.contentBlocks) : [];
		if (userText) {
			const responseMessages = hasBlocks ? buildInterruptedModelMessages(contentBlocks) : [];
			const daemonMessage: ConversationMessage | null = hasBlocks
				? {
						id: runtime.messageId++,
						type: "daemon",
						content: "",
						messages: responseMessages,
						contentBlocks,
					}
				: null;
			runtime.conversationHistory = finalizePendingUserMessage(
				runtime.conversationHistory,
				userText,
				daemonMessage,
				() => runtime.messageId++
			);
		}
		runtime.modelHistory = buildModelHistoryFromConversation(runtime.conversationHistory);
		runtime.currentTranscription = "";
		runtime.currentResponse = "";
		runtime.currentContentBlocks = [];
		runtime.contentBlocks = [];
		runtime.toolCalls = [];
		runtime.toolCallsById.clear();
		// Keep liveOutput so any in-flight tool's last streamed output is preserved.
		runtime.currentUserInput = "";
		runtime.pendingApprovalCount = 0;
		runtime.state = DaemonState.IDLE;
		runtime.startedAt = null;
		runtime.updatedAt = Date.now();
		void this.persist(runtime);
		this.notify(sessionId);
	}

	private finalizeReasoningDuration(runtime: SessionRuntimeInternal): void {
		const startAt = runtime.reasoningStartAt;
		if (startAt === null) return;
		const durationMs = Math.max(0, Date.now() - startAt);
		const blocks = runtime.contentBlocks;
		let target = runtime.currentReasoningBlock;
		if (!target) {
			target =
				[...blocks].reverse().find((block) => block.type === "reasoning" && block.durationMs === undefined) ??
				null;
		}
		if (target && target.type === "reasoning") {
			target.durationMs = durationMs;
			target.completedAt = Date.now();
		}
		runtime.reasoningStartAt = null;
		runtime.currentReasoningBlock = null;
	}

	private async persist(runtime: SessionRuntimeInternal): Promise<void> {
		await saveSessionSnapshot(
			{
				conversationHistory: runtime.conversationHistory,
				sessionUsage: runtime.sessionUsage,
			},
			runtime.sessionId
		);
	}

	private clearReasoningNotifyTimer(sessionId: string): void {
		const timer = this.reasoningNotifyTimers.get(sessionId);
		if (!timer) return;
		clearTimeout(timer);
		this.reasoningNotifyTimers.delete(sessionId);
	}

	private scheduleReasoningNotify(sessionId: string): void {
		if (this.reasoningNotifyTimers.has(sessionId)) return;
		const timer = setTimeout(() => {
			this.reasoningNotifyTimers.delete(sessionId);
			const runtime = this.runtimes.get(sessionId);
			if (!runtime) return;
			runtime.currentContentBlocks = [...runtime.contentBlocks];
			this.notify(sessionId);
		}, REASONING_NOTIFY_INTERVAL_MS);
		this.reasoningNotifyTimers.set(sessionId, timer);
	}

	private clearStreamNotifyTimer(sessionId: string): void {
		const timer = this.streamNotifyTimers.get(sessionId);
		if (!timer) return;
		clearTimeout(timer);
		this.streamNotifyTimers.delete(sessionId);
	}

	private scheduleStreamNotify(sessionId: string): void {
		if (this.streamNotifyTimers.has(sessionId)) return;
		const timer = setTimeout(() => {
			this.streamNotifyTimers.delete(sessionId);
			const runtime = this.runtimes.get(sessionId);
			if (!runtime) return;
			runtime.currentContentBlocks = [...runtime.contentBlocks];
			this.notify(sessionId);
		}, STREAM_NOTIFY_INTERVAL_MS);
		this.streamNotifyTimers.set(sessionId, timer);
	}

	flushStreamNotify(sessionId: string): void {
		this.clearStreamNotifyTimer(sessionId);
		const runtime = this.runtimes.get(sessionId);
		if (!runtime) return;
		runtime.currentContentBlocks = [...runtime.contentBlocks];
		this.notify(sessionId);
	}

	private notify(sessionId: string): void {
		this.clearReasoningNotifyTimer(sessionId);
		const runtime = this.runtimes.get(sessionId);
		if (runtime) runtime.updatedAt = Date.now();
		this.events.emit("updated", sessionId);
		this.events.emit("statusChanged");
	}

	/**
	 * Emit a synthetic `updated` event for the session so any subscribers (e.g.
	 * the conversation pane) re-render. Used by views that hold local UI state
	 * (such as the bash scroll-focus) that the conversation needs to reflect.
	 */
	requestRenderTick(sessionId: string): void {
		const runtime = this.runtimes.get(sessionId);
		if (!runtime) return;
		// Bump contentBlocks reference so React sees a change.
		runtime.currentContentBlocks = [...runtime.contentBlocks];
		runtime.updatedAt = Date.now();
		this.events.emit("updated", sessionId);
	}
}

export const sessionRuntimeStore = new SessionRuntimeStore();

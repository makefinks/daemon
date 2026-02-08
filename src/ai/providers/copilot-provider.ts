import type { ModelMessage } from "ai";
import { randomUUID } from "node:crypto";
import { getDaemonManager } from "../../state/daemon-state";
import { getRuntimeContext } from "../../state/runtime-context";
import type { ReasoningEffort, StreamCallbacks } from "../../types";
import { debug, toolDebug } from "../../utils/debug-logger";
import { getWorkspacePath } from "../../utils/workspace-manager";
import { convertToolSetToCopilotTools, getOrCreateCopilotSession } from "../copilot-client";
import { getResponseModel } from "../model-config";
import { buildDaemonSystemPrompt } from "../system-prompt";
import { getCachedToolAvailability, getDaemonTools } from "../tools/index";
import { createToolAvailabilitySnapshot, resolveToolAvailability } from "../tools/tool-registry";
import { getProviderCapabilities } from "./capabilities";
import type { LlmProviderAdapter, ProviderStreamRequest, ProviderStreamResult } from "./types";

const DEFAULT_COPILOT_SEND_TIMEOUT_MS = 20000;
const DEFAULT_COPILOT_IDLE_TIMEOUT_MS = 60000;

function buildCopilotModelsListErrorMessage(): string {
	return [
		"Copilot failed to list available models.",
		"DAEMON uses logged-in-user auth for Copilot.",
		"Verify `gh auth status` and run `copilot login`.",
		"If your network uses custom certs set `COPILOT_USE_SYSTEM_CA=1` or `NODE_EXTRA_CA_CERTS`.",
	].join(" ");
}

function buildCopilotModelsListErrorMessageWithCause(cause: string | undefined): string {
	const baseMessage = buildCopilotModelsListErrorMessage();
	if (!cause) return baseMessage;
	const compactCause = cause.replace(/\s+/g, " ").trim();
	if (!compactCause) return baseMessage;
	return `${baseMessage} Underlying Copilot error: ${compactCause}`;
}

function extractErrorDiagnostics(error: unknown): {
	message?: string;
	name?: string;
	code?: string | number;
} {
	if (!error || typeof error !== "object") {
		return {
			message: error === undefined ? undefined : String(error),
		};
	}

	const candidate = error as {
		message?: unknown;
		name?: unknown;
		code?: unknown;
	};

	const message = typeof candidate.message === "string" ? candidate.message : undefined;
	const name = typeof candidate.name === "string" ? candidate.name : undefined;
	const code =
		typeof candidate.code === "string" || typeof candidate.code === "number" ? candidate.code : undefined;

	return { message, name, code };
}

function parseTimeoutMs(value: string | undefined, fallback: number): number {
	if (!value) return fallback;
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
	return parsed;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
	let timeoutId: ReturnType<typeof setTimeout> | null = null;
	try {
		return await Promise.race([
			promise,
			new Promise<T>((_, reject) => {
				timeoutId = setTimeout(() => {
					reject(new Error(message));
				}, timeoutMs);
			}),
		]);
	} finally {
		if (timeoutId) {
			clearTimeout(timeoutId);
		}
	}
}

function modelMessageContentToText(message: ModelMessage): string {
	if (typeof message.content === "string") {
		return message.content;
	}

	if (!Array.isArray(message.content)) {
		return "";
	}

	const textParts: string[] = [];
	for (const part of message.content) {
		if (!part || typeof part !== "object") continue;
		if ("type" in part && part.type === "text" && "text" in part && typeof part.text === "string") {
			textParts.push(part.text);
		}
	}

	return textParts.join("").trim();
}

function buildHistoryPreamble(messages: ModelMessage[]): string {
	const lines: string[] = [];
	for (const message of messages) {
		if (message.role !== "user" && message.role !== "assistant") continue;
		const text = modelMessageContentToText(message).trim();
		if (!text) continue;
		const label = message.role === "user" ? "User" : "Assistant";
		lines.push(`${label}: ${text}`);
	}

	if (lines.length === 0) return "";

	const trimmed = lines.slice(-20).join("\n");
	return `Conversation context from earlier turns:\n${trimmed}\n\nContinue from this context.`;
}

function buildCopilotPrompt(
	userMessage: string,
	memoryInjection: string | undefined,
	conversationHistory: ModelMessage[],
	includeHistory: boolean
): string {
	const sections: string[] = [];

	if (memoryInjection) {
		sections.push(`Relevant memory:\n${memoryInjection}`);
	}

	if (includeHistory) {
		const history = buildHistoryPreamble(conversationHistory);
		if (history) {
			sections.push(history);
		}
	}

	sections.push(userMessage);
	return sections.join("\n\n");
}

async function streamCopilotSession(params: {
	userMessage: string;
	callbacks: StreamCallbacks;
	conversationHistory: ModelMessage[];
	interactionMode: ProviderStreamRequest["interactionMode"];
	abortSignal?: AbortSignal;
	reasoningEffort?: ReasoningEffort;
	memoryInjection?: string;
}): Promise<{ fullText: string; finalText: string } | null> {
	const {
		userMessage,
		callbacks,
		conversationHistory,
		interactionMode,
		abortSignal,
		reasoningEffort,
		memoryInjection,
	} = params;

	const { sessionId } = getRuntimeContext();
	const tools = await getDaemonTools();
	const copilotTools = convertToolSetToCopilotTools(tools, callbacks);
	const daemonToolNames = Object.keys(tools);
	const toolAvailability =
		getCachedToolAvailability() ?? (await resolveToolAvailability(getDaemonManager().toolToggles));
	const workspacePath = sessionId ? getWorkspacePath(sessionId) : undefined;

	const systemPrompt = buildDaemonSystemPrompt({
		mode: interactionMode,
		toolAvailability: createToolAvailabilitySnapshot(toolAvailability),
		workspacePath,
		memoryInjection,
	});

	const baseSessionConfig = {
		model: getResponseModel(),
		reasoningEffort,
		tools: copilotTools,
		availableTools: daemonToolNames,
		systemMessage: {
			mode: "replace" as const,
			content: systemPrompt,
		},
		streaming: true,
		workingDirectory: workspacePath ?? process.cwd(),
	};

	const requestId = randomUUID();
	const requestStartedAt = Date.now();
	const recentEvents: Array<Record<string, unknown>> = [];
	const rememberEvent = (event: Record<string, unknown>) => {
		recentEvents.push({
			at: new Date().toISOString(),
			...event,
		});
		if (recentEvents.length > 30) {
			recentEvents.shift();
		}
	};

	let sendStartedAt: number | null = null;
	let sendCompletedAt: number | null = null;
	let idleWaitStartedAt: number | null = null;
	let idleResolvedAt: number | null = null;
	let lastEventAt: number | null = null;
	let lastToolCompletionAt: number | null = null;
	let duplicateEventCount = 0;
	let assistantReasoningEvents = 0;
	let assistantDeltaEvents = 0;
	let assistantMessageEvents = 0;
	let toolExecutionStartEvents = 0;
	let toolExecutionCompleteEvents = 0;
	let toolExecutionFailureEvents = 0;

	debug.info("copilot-stream-start", {
		requestId,
		model: baseSessionConfig.model,
		interactionMode,
		conversationHistoryMessages: conversationHistory.length,
	});

	const { session, created } = await (async () => {
		try {
			return await getOrCreateCopilotSession(sessionId ?? randomUUID(), baseSessionConfig);
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			debug.error("copilot-session-create-failed", {
				sessionId: sessionId ?? null,
				model: baseSessionConfig.model,
				message: err.message,
			});
			if (err.message.includes("Failed to list models") || err.message.includes("models.list")) {
				try {
					debug.warn("copilot-session-create-retry-fresh-session", {
						previousSessionId: sessionId ?? null,
						model: baseSessionConfig.model,
					});
					return await getOrCreateCopilotSession(randomUUID(), baseSessionConfig);
				} catch (retryError) {
					const retryErr = retryError instanceof Error ? retryError : new Error(String(retryError));
					debug.error("copilot-session-create-retry-failed", {
						model: baseSessionConfig.model,
						message: retryErr.message,
					});
					throw new Error(buildCopilotModelsListErrorMessageWithCause(retryErr.message));
				}
			}
			if (err.message.includes("Timed out while")) {
				throw new Error(
					"Copilot provider timed out. Verify Copilot CLI access (run `copilot login`), then retry."
				);
			}
			throw err;
		}
	})();

	let fullText = "";
	let finalText = "";
	let streamError: Error | null = null;
	let settled = false;
	const toolInputByCallId = new Map<string, { toolName: string; input?: unknown }>();
	const seenSessionEventIds = new Set<string>();
	const assistantTextByMessageId = new Map<string, string>();
	const lastRawAssistantDeltaByMessageId = new Map<string, string>();
	const unsubscribers: Array<() => void> = [];

	const markAndCheckDuplicateEvent = (eventId: string): boolean => {
		if (!eventId) return false;
		if (seenSessionEventIds.has(eventId)) {
			duplicateEventCount += 1;
			return true;
		}
		seenSessionEventIds.add(eventId);
		return false;
	};

	const normalizeAssistantDelta = (messageId: string, rawDelta: string): string => {
		if (!rawDelta) return "";

		const previousText = assistantTextByMessageId.get(messageId) ?? "";
		const previousRawDelta = lastRawAssistantDeltaByMessageId.get(messageId);
		if (previousRawDelta === rawDelta) {
			return "";
		}
		lastRawAssistantDeltaByMessageId.set(messageId, rawDelta);

		if (rawDelta.startsWith(previousText)) {
			const normalized = rawDelta.slice(previousText.length);
			assistantTextByMessageId.set(messageId, rawDelta);
			return normalized;
		}

		if (previousText.endsWith(rawDelta)) {
			return "";
		}

		assistantTextByMessageId.set(messageId, `${previousText}${rawDelta}`);
		return rawDelta;
	};

	const idlePromise = new Promise<void>((resolve, reject) => {
		unsubscribers.push(
			session.on("session.idle", () => {
				if (settled) return;
				idleResolvedAt = Date.now();
				lastEventAt = idleResolvedAt;
				rememberEvent({ type: "session.idle" });
				settled = true;
				resolve();
			})
		);

		unsubscribers.push(
			session.on("session.error", (event) => {
				if (settled) return;
				lastEventAt = Date.now();
				rememberEvent({
					type: "session.error",
					message: event.data.message,
				});
				const err = new Error(event.data.message || "Copilot session error");
				streamError = err;
				settled = true;
				reject(err);
			})
		);
	});

	unsubscribers.push(
		session.on("assistant.reasoning_delta", (event) => {
			if (markAndCheckDuplicateEvent(event.id)) return;
			assistantReasoningEvents += 1;
			lastEventAt = Date.now();
			rememberEvent({ type: "assistant.reasoning_delta" });
			callbacks.onReasoningToken?.(event.data.deltaContent);
		})
	);

	unsubscribers.push(
		session.on("assistant.message_delta", (event) => {
			if (markAndCheckDuplicateEvent(event.id)) return;
			assistantDeltaEvents += 1;
			lastEventAt = Date.now();
			rememberEvent({
				type: "assistant.message_delta",
				messageId: event.data.messageId,
				deltaLength: event.data.deltaContent?.length ?? 0,
			});
			const messageId = event.data.messageId;
			const rawDelta = event.data.deltaContent;
			const normalizedDelta = normalizeAssistantDelta(messageId, rawDelta);
			if (!normalizedDelta) return;
			fullText += normalizedDelta;
			callbacks.onToken?.(normalizedDelta);
		})
	);

	unsubscribers.push(
		session.on("assistant.message", (event) => {
			if (markAndCheckDuplicateEvent(event.id)) return;
			assistantMessageEvents += 1;
			lastEventAt = Date.now();
			rememberEvent({
				type: "assistant.message",
				contentLength: event.data.content?.length ?? 0,
			});
			const content = event.data.content?.trim();
			if (!content) return;
			finalText = content;
			if (!fullText) {
				fullText = content;
			}
		})
	);

	unsubscribers.push(
		session.on("tool.execution_start", (event) => {
			if (markAndCheckDuplicateEvent(event.id)) return;
			toolExecutionStartEvents += 1;
			lastEventAt = Date.now();
			rememberEvent({
				type: "tool.execution_start",
				toolName: event.data.toolName,
				toolCallId: event.data.toolCallId,
			});
			toolInputByCallId.set(event.data.toolCallId, {
				toolName: event.data.toolName,
				input: event.data.arguments,
			});
			// Copilot exposes a single "execution_start" event with full arguments.
			// Emit only onToolCall so the UI creates one tool view per call.
			callbacks.onToolCall?.(event.data.toolName, event.data.arguments, event.data.toolCallId);
		})
	);

	unsubscribers.push(
		session.on("tool.execution_complete", (event) => {
			if (markAndCheckDuplicateEvent(event.id)) return;
			const tracked = toolInputByCallId.get(event.data.toolCallId);
			const toolName = tracked?.toolName ?? "unknown";
			toolExecutionCompleteEvents += 1;
			lastEventAt = Date.now();
			lastToolCompletionAt = Date.now();
			const errorDiagnostics = extractErrorDiagnostics(event.data.error);
			if (!event.data.success) {
				toolExecutionFailureEvents += 1;
				toolDebug.warn("copilot-tool-execution-failed", {
					requestId,
					model: baseSessionConfig.model,
					toolName,
					toolCallId: event.data.toolCallId,
					error: errorDiagnostics,
					toolTelemetry: event.data.toolTelemetry,
				});
			}
			rememberEvent({
				type: "tool.execution_complete",
				toolName,
				toolCallId: event.data.toolCallId,
				success: event.data.success,
				errorMessage: errorDiagnostics.message,
				errorCode: errorDiagnostics.code,
			});
			const toolResult = event.data.success
				? {
						success: true,
						output: event.data.result?.detailedContent ?? event.data.result?.content ?? "",
						toolTelemetry: event.data.toolTelemetry,
					}
				: {
						success: false,
						error: event.data.error?.message ?? "Tool execution failed.",
					};
			callbacks.onToolResult?.(toolName, toolResult, event.data.toolCallId);
		})
	);

	unsubscribers.push(
		session.on("assistant.usage", (event) => {
			lastEventAt = Date.now();
			rememberEvent({
				type: "assistant.usage",
				inputTokens: event.data.inputTokens ?? 0,
				outputTokens: event.data.outputTokens ?? 0,
			});
			if (!callbacks.onStepUsage) return;
			callbacks.onStepUsage({
				promptTokens: event.data.inputTokens ?? 0,
				completionTokens: event.data.outputTokens ?? 0,
				totalTokens: (event.data.inputTokens ?? 0) + (event.data.outputTokens ?? 0),
				cachedInputTokens: event.data.cacheReadTokens ?? 0,
				cost: event.data.cost,
			});
		})
	);

	let aborted = Boolean(abortSignal?.aborted);
	const abortHandler = () => {
		aborted = true;
		void session.abort().catch(() => {});
	};
	abortSignal?.addEventListener("abort", abortHandler, { once: true });

	try {
		if (aborted) return null;

		const sendTimeoutMs = parseTimeoutMs(
			process.env.COPILOT_SEND_TIMEOUT_MS,
			DEFAULT_COPILOT_SEND_TIMEOUT_MS
		);
		const idleTimeoutMs = parseTimeoutMs(
			process.env.COPILOT_IDLE_TIMEOUT_MS,
			DEFAULT_COPILOT_IDLE_TIMEOUT_MS
		);
		const sendTimeoutMessage = "Copilot request timed out while submitting prompt.";
		const idleTimeoutMessage = "Copilot request timed out while waiting for response completion.";

		sendStartedAt = Date.now();
		await withTimeout(
			session.send({
				prompt: buildCopilotPrompt(userMessage, memoryInjection, conversationHistory, created),
			}),
			sendTimeoutMs,
			sendTimeoutMessage
		);
		sendCompletedAt = Date.now();
		lastEventAt = sendCompletedAt;
		rememberEvent({ type: "session.send.complete" });

		idleWaitStartedAt = Date.now();
		await withTimeout(idlePromise, idleTimeoutMs, idleTimeoutMessage);

		if (aborted) {
			return null;
		}

		if (streamError) {
			throw streamError;
		}

		debug.info("copilot-stream-complete", {
			requestId,
			model: baseSessionConfig.model,
			elapsedMs: Date.now() - requestStartedAt,
			assistantDeltaEvents,
			assistantMessageEvents,
			toolExecutionStartEvents,
			toolExecutionCompleteEvents,
			toolExecutionFailureEvents,
		});

		return {
			fullText: fullText.trim(),
			finalText: finalText.trim(),
		};
	} catch (error) {
		if (!aborted) {
			void session.abort().catch(() => {});
		}
		const err = error instanceof Error ? error : new Error(String(error));
		const timeoutPhase = err.message.includes("while submitting prompt")
			? "send"
			: err.message.includes("while waiting for response completion")
				? "idle"
				: undefined;
		const now = Date.now();
		debug.error("copilot-stream-failed", {
			requestId,
			message: err.message,
			model: baseSessionConfig.model,
			timeoutPhase,
			elapsedMs: now - requestStartedAt,
			sendDurationMs:
				sendStartedAt !== null && sendCompletedAt !== null ? sendCompletedAt - sendStartedAt : undefined,
			idleWaitElapsedMs: idleWaitStartedAt !== null ? now - idleWaitStartedAt : undefined,
			sinceLastEventMs: lastEventAt !== null ? now - lastEventAt : undefined,
			sinceLastToolCompletionMs: lastToolCompletionAt !== null ? now - lastToolCompletionAt : undefined,
			idleResolved: idleResolvedAt !== null,
			eventCounts: {
				assistantReasoningEvents,
				assistantDeltaEvents,
				assistantMessageEvents,
				toolExecutionStartEvents,
				toolExecutionCompleteEvents,
				toolExecutionFailureEvents,
				duplicateEventCount,
			},
			recentEvents,
		});
		if (err.message.includes("Failed to list models") || err.message.includes("models.list")) {
			throw new Error(buildCopilotModelsListErrorMessageWithCause(err.message));
		}
		if (err.message.includes("Timed out while")) {
			throw new Error(
				"Copilot provider timed out. Verify Copilot CLI access (run `copilot login`), then retry."
			);
		}
		throw err;
	} finally {
		abortSignal?.removeEventListener("abort", abortHandler);
		for (const unsubscribe of unsubscribers) {
			try {
				unsubscribe();
			} catch {
				// Ignore unsubscription errors.
			}
		}
	}
}

async function streamCopilotResponse(request: ProviderStreamRequest): Promise<ProviderStreamResult | null> {
	const result = await streamCopilotSession({
		userMessage: request.userMessage,
		callbacks: request.callbacks,
		conversationHistory: request.conversationHistory,
		interactionMode: request.interactionMode,
		abortSignal: request.abortSignal,
		reasoningEffort: request.reasoningEffort,
		memoryInjection: request.memoryInjection,
	});

	if (!result) {
		return null;
	}

	const finalText = result.finalText || result.fullText;
	if (!finalText) {
		request.callbacks.onError?.(new Error("Model returned empty response. Check Copilot authentication."));
		return null;
	}

	const responseMessages: ModelMessage[] = [{ role: "assistant", content: finalText }];
	return {
		fullText: result.fullText || finalText,
		responseMessages,
		finalText,
	};
}

async function generateCopilotSessionTitle(firstMessage: string): Promise<string> {
	const titleSessionId = randomUUID();
	const copilotTitleModel = "gpt-4.1";
	const { session } = await getOrCreateCopilotSession(titleSessionId, {
		model: copilotTitleModel,
		streaming: false,
	});
	try {
		const response = await session.sendAndWait(
			{
				prompt: `Generate a very short, descriptive title (3-6 words) for this first message:\n\n${firstMessage}`,
			},
			20000
		);
		const title = response?.data.content?.trim();
		if (title) return title;
	} finally {
		void session.destroy().catch(() => {});
	}

	return "New Session";
}

export const copilotProviderAdapter: LlmProviderAdapter = {
	id: "copilot",
	capabilities: getProviderCapabilities("copilot"),
	streamResponse: streamCopilotResponse,
	generateSessionTitle: generateCopilotSessionTitle,
};

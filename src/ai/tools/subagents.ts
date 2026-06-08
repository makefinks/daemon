/**
 * Subagent tool for delegating tasks.
 * DAEMON can call this tool multiple times in parallel to spawn concurrent subagents.
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createOpenAI } from "@ai-sdk/openai";
import { randomUUID } from "node:crypto";
import { tool } from "ai";
import { ToolLoopAgent, stepCountIs } from "ai";
import type { ToolSet } from "ai";
import { z } from "zod";
import { backgroundJobManager } from "../../state/background-job-manager";
import { getDaemonManager } from "../../state/daemon-state";
import { getRuntimeContext } from "../../state/runtime-context";
import { sessionRuntimeStore } from "../../state/session-runtime-store";
import type { SubagentProgressEmitter } from "../../types";
import { debug } from "../../utils/debug-logger";
import { getOpenRouterReportedCost } from "../../utils/openrouter-reported-cost";
import { convertToolSetToCopilotTools, getOrCreateCopilotSession } from "../copilot-client";
import { getMcpManager } from "../mcp/mcp-manager";
import { extractFinalAssistantText } from "../message-utils";
import { buildOpenRouterChatSettings, getModelProvider, getSubagentModel } from "../model-config";
import { OPENAI_CODEX_BASE_URL, openAiCodexAuthenticatedFetch } from "../openai-codex-fetch";

// OpenRouter client for subagents
const openrouter = createOpenRouter();
const openAiCodex = createOpenAI({
	apiKey: "chatgpt-oauth",
	baseURL: OPENAI_CODEX_BASE_URL,
	name: "openai-codex",
	fetch: ((input, init) => openAiCodexAuthenticatedFetch(input, init)) as typeof fetch,
});

// Maximum steps for subagent loops
const MAX_SUBAGENT_STEPS = 30;

let cachedSubagentBaseTools: Promise<ToolSet> | null = null;

export function invalidateSubagentToolsCache(): void {
	cachedSubagentBaseTools = null;
}

// Subagent tools (all tools except subagent itself to prevent recursion)
// Background bash is disabled for subagents — they only get foreground runBash.
async function getSubagentTools(): Promise<ToolSet> {
	if (!cachedSubagentBaseTools) {
		cachedSubagentBaseTools = (async () => {
			const toggles = getDaemonManager().toolToggles;
			const { buildToolSet } = await import("./tool-registry");
			const { runBashForeground } = await import("./run-bash");
			const { tools } = await buildToolSet(toggles, {
				omit: ["groundingManager", "subagent", "backgroundJobs", "runBash"],
			});
			if (toggles.runBash !== false) {
				tools.runBash = runBashForeground;
			}
			return tools;
		})();
	}

	const baseTools = await cachedSubagentBaseTools;
	const mcpTools = getMcpManager().getToolsSnapshot();
	if (Object.keys(mcpTools).length === 0) return baseTools;
	return { ...baseTools, ...mcpTools };
}

// System prompt for subagents
function buildSubagentSystemPrompt(webSearchAvailable: boolean): string {
	const disabledNotice = !webSearchAvailable
		? "\nNOTICE: Web search and URL fetching are DISABLED because EXA_API_KEY is not configured.\n"
		: "";

	return `
You are a focused subagent. You have been spawned to complete a specific task by a main agent.${disabledNotice}

RULES:
- Complete the assigned task thoroughly.
- Use tools as needed to accomplish the task.
- Do not ask clarifying questions - make reasonable assumptions.
- Be direct and factual in your response.
- If you cannot complete the task, explain why clearly.
- Return a clear, detailed summary of what you found or accomplished.
- The final summary needs to be self contained and needs to provide enough information to the main agent so it is clear what you have done and what the results are.

Today's date: ${new Date().toISOString().split("T")[0]}
	`;
}

let currentProgressEmitter: SubagentProgressEmitter | null = null;

export function runWithSubagentProgressEmitter<T>(emitter: SubagentProgressEmitter | null, fn: () => T): T {
	const prev = currentProgressEmitter;
	currentProgressEmitter = emitter;
	const result = fn();
	if (result instanceof Promise) {
		return result.finally(() => {
			currentProgressEmitter = prev;
		}) as T;
	}
	currentProgressEmitter = prev;
	return result;
}

function getProgressEmitter(): SubagentProgressEmitter | null {
	return currentProgressEmitter;
}

function createSubagentAgent(params: { instructions: string; tools: ToolSet; sessionId?: string | null }) {
	if (getModelProvider() === "openai-codex") {
		return new ToolLoopAgent({
			model: openAiCodex.responses(getSubagentModel()),
			instructions: params.instructions,
			tools: params.tools,
			providerOptions: {
				openai: {
					store: false,
					include: ["reasoning.encrypted_content"],
					reasoningSummary: "auto",
					textVerbosity: "medium",
					promptCacheKey: params.sessionId ?? undefined,
				},
			},
			stopWhen: stepCountIs(MAX_SUBAGENT_STEPS),
		});
	}

	return new ToolLoopAgent({
		model: openrouter.chat(getSubagentModel(), buildOpenRouterChatSettings()),
		instructions: params.instructions,
		tools: params.tools,
		stopWhen: stepCountIs(MAX_SUBAGENT_STEPS),
	});
}

const DEFAULT_COPILOT_SUBAGENT_IDLE_TIMEOUT_MS = 300000;

async function runCopilotSubagentTask(params: {
	task: string;
	instructions: string;
	tools: ToolSet;
	toolCallId?: string;
	abortSignal?: AbortSignal;
	progressEmitter?: SubagentProgressEmitter | null;
}): Promise<{ response: string; success: boolean; error?: string }> {
	const progressEmitter = params.progressEmitter ?? getProgressEmitter();
	const sessionId = randomUUID();
	const toolInputByCallId = new Map<string, { toolName: string; input?: unknown }>();
	const unsubscribers: Array<() => void> = [];
	let finalText = "";
	let streamText = "";
	let lastEventAt: number | null = null;
	let pendingToolCalls = 0;

	const copilotTools = convertToolSetToCopilotTools(params.tools, {});
	debug.info("copilot-subagent-session-create-start", {
		sessionId,
		model: getSubagentModel(),
		toolCount: Object.keys(params.tools).length,
		taskLength: params.task.length,
	});
	const { session } = await getOrCreateCopilotSession(sessionId, {
		model: getSubagentModel(),
		tools: copilotTools,
		availableTools: Object.keys(params.tools),
		systemMessage: {
			mode: "replace",
			content: params.instructions,
		},
		streaming: true,
		workingDirectory: process.cwd(),
	});
	debug.info("copilot-subagent-session-created", { sessionId });

	let sessionError: Error | null = null;
	let sessionResolved = false;
	let resolveSession: (() => void) | null = null;

	const markActivity = () => {
		lastEventAt = Date.now();
	};

	const tryResolve = () => {
		if (sessionResolved) return;
		if (pendingToolCalls > 0) return;
		sessionResolved = true;
		resolveSession?.();
	};

	unsubscribers.push(
		session.on("session.idle", () => {
			markActivity();
			tryResolve();
		})
	);

	unsubscribers.push(
		session.on("session.error", (event) => {
			markActivity();
			sessionError = new Error(event.data.message || "Copilot subagent session error");
			if (!sessionResolved) {
				sessionResolved = true;
				resolveSession?.();
			}
		})
	);

	unsubscribers.push(
		session.on("assistant.reasoning_delta", () => {
			markActivity();
		})
	);
	unsubscribers.push(
		session.on("assistant.message_delta", (event) => {
			markActivity();
			streamText += event.data.deltaContent ?? "";
		})
	);
	unsubscribers.push(
		session.on("assistant.message", (event) => {
			markActivity();
			const content = event.data.content?.trim();
			if (content) finalText = content;
		})
	);
	unsubscribers.push(
		session.on("tool.execution_start", (event) => {
			markActivity();
			pendingToolCalls++;
			toolInputByCallId.set(event.data.toolCallId, {
				toolName: event.data.toolName,
				input: event.data.arguments,
			});
			if (params.toolCallId) {
				progressEmitter?.onSubagentToolCall(params.toolCallId, event.data.toolName, event.data.arguments);
			}
		})
	);
	unsubscribers.push(
		session.on("tool.execution_complete", (event) => {
			markActivity();
			pendingToolCalls = Math.max(0, pendingToolCalls - 1);
			const tracked = toolInputByCallId.get(event.data.toolCallId);
			const toolName = tracked?.toolName ?? "unknown";
			const result = event.data.success
				? {
						success: true,
						output: event.data.result?.detailedContent ?? event.data.result?.content ?? "",
						toolTelemetry: event.data.toolTelemetry,
					}
				: {
						success: false,
						error: event.data.error?.message ?? "Tool execution failed.",
					};
			if (params.toolCallId) {
				progressEmitter?.onSubagentToolResult(params.toolCallId, toolName, event.data.success, result);
			}
			tryResolve();
		})
	);
	unsubscribers.push(
		session.on("assistant.usage", (event) => {
			markActivity();
			progressEmitter?.onSubagentUsage({
				promptTokens: event.data.inputTokens ?? 0,
				completionTokens: event.data.outputTokens ?? 0,
				totalTokens: (event.data.inputTokens ?? 0) + (event.data.outputTokens ?? 0),
				cachedInputTokens: event.data.cacheReadTokens ?? 0,
				cost: event.data.cost,
			});
		})
	);

	let aborted = Boolean(params.abortSignal?.aborted);
	const abortHandler = () => {
		aborted = true;
		void session.abort().catch(() => {});
	};
	params.abortSignal?.addEventListener("abort", abortHandler, { once: true });

	try {
		if (aborted) return { response: "Cancelled.", success: false, error: "Cancelled" };

		await session.send({ prompt: params.task });
		lastEventAt = Date.now();
		debug.info("copilot-subagent-send-complete", { sessionId });

		const safetyTimeoutMs = DEFAULT_COPILOT_SUBAGENT_IDLE_TIMEOUT_MS;
		const pollIntervalMs = 1000;

		await new Promise<void>((resolve) => {
			resolveSession = resolve;

			const check = () => {
				if (aborted || sessionResolved || sessionError) return resolve();
				if (pendingToolCalls === 0 && lastEventAt !== null && Date.now() - lastEventAt >= safetyTimeoutMs) {
					return resolve();
				}
				setTimeout(check, pollIntervalMs);
			};

			setTimeout(check, pollIntervalMs);
		});

		if (aborted) return { response: "Cancelled.", success: false, error: "Cancelled" };
		if (sessionError) {
			debug.error("copilot-subagent-session-error", {
				sessionId,
				message: String(sessionError),
			});
			throw sessionError;
		}
		debug.info("copilot-subagent-complete", {
			sessionId,
			finalTextLength: finalText.length,
			streamTextLength: streamText.length,
		});
		return {
			response: finalText || streamText.trim() || "Task completed but no text response generated.",
			success: true,
		};
	} finally {
		debug.info("copilot-subagent-cleanup", { sessionId });
		params.abortSignal?.removeEventListener("abort", abortHandler);
		for (const unsubscribe of unsubscribers) unsubscribe();
		void session.disconnect().catch(() => {});
	}
}

async function runSubagentTask(params: {
	task: string;
	toolCallId?: string;
	abortSignal?: AbortSignal;
	progressEmitter?: SubagentProgressEmitter | null;
}): Promise<{ response: string; success: boolean; error?: string }> {
	const progressEmitter = params.progressEmitter ?? getProgressEmitter();
	const tools = await getSubagentTools();
	const { sessionId } = getRuntimeContext();

	const effectiveEmitter =
		progressEmitter ??
		(sessionId
			? ({
					onSubagentToolCall: (id, toolName, input) =>
						sessionRuntimeStore.subagentToolCall(sessionId, id, toolName, input),
					onSubagentUsage: (usage) => sessionRuntimeStore.subagentUsage(sessionId, usage),
					onSubagentToolResult: (id, toolName, success, result) =>
						sessionRuntimeStore.subagentToolResult(sessionId, id, toolName, success, result),
					onSubagentComplete: (id, success) => sessionRuntimeStore.subagentComplete(sessionId, id, success),
				} as SubagentProgressEmitter)
			: null);
	const webSearchAvailable = Boolean((tools as Record<string, unknown>).webSearch);
	const fetchUrlsAvailable = Boolean((tools as Record<string, unknown>).fetchUrls);

	if (params.abortSignal?.aborted) {
		return { response: "Cancelled.", success: false, error: "Cancelled" };
	}

	const instructions = buildSubagentSystemPrompt(webSearchAvailable || fetchUrlsAvailable);
	if (getModelProvider() === "copilot") {
		return runCopilotSubagentTask({
			task: params.task,
			instructions,
			tools,
			toolCallId: params.toolCallId,
			abortSignal: params.abortSignal,
			progressEmitter: effectiveEmitter,
		});
	}

	const subagent = createSubagentAgent({
		instructions,
		tools,
		sessionId,
	});

	let costTotal = 0;
	let hasCost = false;
	const stream = await subagent.stream({
		messages: [{ role: "user" as const, content: params.task }],
	});

	for await (const part of stream.fullStream) {
		if (params.abortSignal?.aborted) {
			return { response: "Cancelled.", success: false, error: "Cancelled" };
		}

		if (part.type === "finish-step") {
			const reportedCost = getOpenRouterReportedCost(part.providerMetadata);
			if (reportedCost !== undefined) {
				costTotal += reportedCost;
				hasCost = true;
			}
		} else if (part.type === "tool-call" && params.toolCallId) {
			setImmediate(() => {
				progressEmitter?.onSubagentToolCall(params.toolCallId ?? "", part.toolName, part.input);
			});
		} else if (part.type === "tool-result" && params.toolCallId) {
			const success =
				typeof part.output === "object" && part.output !== null && "success" in part.output
					? Boolean((part.output as { success?: unknown }).success)
					: true;
			setImmediate(() => {
				progressEmitter?.onSubagentToolResult(params.toolCallId ?? "", part.toolName, success, part.output);
			});
		}
	}

	const responseMessages = await stream.response.then((response) => response.messages);
	const finalResponse = extractFinalAssistantText(responseMessages);
	const streamUsage = await stream.usage;
	if (streamUsage) {
		progressEmitter?.onSubagentUsage({
			promptTokens: streamUsage.inputTokens ?? 0,
			completionTokens: streamUsage.outputTokens ?? 0,
			totalTokens: streamUsage.totalTokens ?? 0,
			reasoningTokens: streamUsage.outputTokenDetails?.reasoningTokens ?? 0,
			cachedInputTokens: streamUsage.inputTokenDetails?.cacheReadTokens ?? 0,
			cost: hasCost ? costTotal : undefined,
		});
	}

	return {
		response: finalResponse || "Task completed but no text response generated.",
		success: true,
	};
}

/**
 * The subagent tool - spawns a single subagent to complete a task.
 * DAEMON can call this multiple times in parallel for concurrent execution.
 */
export const subagent = tool({
	description: `Spawn a subagent to complete a specific task. The subagent has access to available tools (bash, system info, etc.) except spawning more subagents.

Call this tool multiple times in parallel to execute tasks concurrently.

Use this when you need to:
- Delegate a research or information-gathering task
- Run an independent operation while continuing other work
- Parallelize multiple lookups or checks

Provide a concise summary for display and a very specific task description (especially for complex work).`,
	inputSchema: z.object({
		summary: z
			.string()
			.describe("A concise summary with a bit of detail (not just a title). Shown in the UI."),
		task: z.string().describe("A specific, scoped description of what the subagent should accomplish."),
		background: z
			.boolean()
			.optional()
			.describe(
				"Run this subagent asynchronously and return immediately with a background job ID. If there is no other useful work, finish the turn and wait for the automatic completion notification."
			),
	}),
	execute: async ({ summary, task, background }, { toolCallId }) => {
		try {
			if (background) {
				const { sessionId } = getRuntimeContext();
				const backgroundProgressEmitter: SubagentProgressEmitter | null = sessionId
					? {
							onSubagentToolCall: (id, toolName, input) =>
								sessionRuntimeStore.subagentToolCall(sessionId, id, toolName, input),
							onSubagentUsage: (usage) => sessionRuntimeStore.subagentUsage(sessionId, usage),
							onSubagentToolResult: (id, toolName, success, result) =>
								sessionRuntimeStore.subagentToolResult(sessionId, id, toolName, success, result),
							onSubagentComplete: (id, success) =>
								sessionRuntimeStore.subagentComplete(sessionId, id, success),
						}
					: null;
				const job = backgroundJobManager.startSubagentJob({
					sessionId,
					description: summary,
					task,
					toolCallId,
					run: (abortSignal) =>
						runSubagentTask({ task, toolCallId, abortSignal, progressEmitter: backgroundProgressEmitter }),
				});

				return {
					success: true,
					background: true,
					jobId: job.id,
					summary,
					response:
						"Subagent started in the background. Continue only if you have other useful work; otherwise finish your response and wait for the automatic completion notification.",
				};
			}

			const result = await runSubagentTask({ task, toolCallId });

			// Emit completion
			getProgressEmitter()?.onSubagentComplete(toolCallId, result.success);

			return {
				success: result.success,
				summary,
				response: result.response,
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);

			// Emit failure
			getProgressEmitter()?.onSubagentComplete(toolCallId, false);

			return {
				success: false,
				summary,
				response: `Error: ${errorMessage}`,
			};
		}
	},
});

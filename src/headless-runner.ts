import type { ModelMessage } from "ai";
import { runWithRuntimeContext } from "./state/runtime-context";
import { backgroundJobManager } from "./state/background-job-manager";
import { createSession, loadLatestGroundingMap } from "./state/session-store";
import { applyApiKeysToEnv, loadPreferences } from "./utils/preferences";
import type {
	AppPreferences,
	BackgroundJobSnapshot,
	ReasoningEffort,
	TodoItem,
	ToolApprovalResponse,
} from "./types";

async function applyPreferences(prefs: AppPreferences | null): Promise<{ reasoningEffort: ReasoningEffort }> {
	if (prefs) applyApiKeysToEnv(prefs);
	const { getDaemonManager } = await import("./state/daemon-state");
	const { setModelProvider, setOpenRouterProviderTag, setResponseModelForProvider } = await import(
		"./ai/model-config"
	);
	const manager = getDaemonManager();
	if (!prefs) return { reasoningEffort: manager.reasoningEffort };
	if (prefs.modelProvider) setModelProvider(prefs.modelProvider);
	if (prefs.modelProvider && prefs.modelId) setResponseModelForProvider(prefs.modelProvider, prefs.modelId);
	if (prefs.openRouterProviderTag !== undefined) setOpenRouterProviderTag(prefs.openRouterProviderTag);
	if (prefs.reasoningEffort) manager.reasoningEffort = prefs.reasoningEffort;
	if (prefs.bashApprovalLevel) manager.bashApprovalLevel = prefs.bashApprovalLevel;
	if (prefs.toolToggles) manager.toolToggles = prefs.toolToggles;
	if (prefs.mcpServerToggles) manager.mcpServerToggles = prefs.mcpServerToggles;
	if (prefs.skillToggles) manager.skillToggles = prefs.skillToggles;
	if (prefs.memoryEnabled !== undefined) manager.memoryEnabled = prefs.memoryEnabled;
	return { reasoningEffort: manager.reasoningEffort };
}

function summarizeTodos(value: unknown): TodoItem[] {
	if (typeof value !== "object" || value === null || !("todos" in value)) return [];
	const todos = (value as { todos?: unknown }).todos;
	if (typeof todos !== "string") return [];
	return todos
		.split("\n")
		.map((line) => {
			const match = line.match(/^\d+\. \[(pending|in_progress|completed|cancelled)] (.+)$/);
			if (!match) return null;
			return { status: match[1] as TodoItem["status"], content: match[2] ?? "" };
		})
		.filter((todo): todo is TodoItem => todo !== null);
}

function printTodoTransitions(previous: TodoItem[], next: TodoItem[]): void {
	for (const [index, todo] of next.entries()) {
		const prev = previous[index];
		if (todo.status === "in_progress" && prev?.status !== "in_progress") {
			process.stderr.write(`starting: ${todo.content}\n`);
		}
		if (todo.status === "completed" && prev?.status !== "completed") {
			process.stderr.write(`finished: ${todo.content}\n`);
		}
	}
}

function extractFinalText(messages: ModelMessage[]): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i];
		if (message?.role !== "assistant") continue;
		const content = message.content;
		if (typeof content === "string") return content;
		if (!Array.isArray(content)) continue;
		const parts = content.filter(
			(part): part is { type: "text"; text: string } =>
				typeof part === "object" &&
				part !== null &&
				"type" in part &&
				part.type === "text" &&
				"text" in part &&
				typeof part.text === "string"
		);
		if (parts.length > 0) return parts.map((part) => part.text).join("\n");
	}
	return "";
}

export async function runHeadless(prompt: string): Promise<void> {
	const trimmedPrompt = prompt.trim();
	if (!trimmedPrompt) {
		process.stderr.write("No prompt provided.\n");
		process.exitCode = 1;
		return;
	}

	const prefs = await loadPreferences();
	const { reasoningEffort } = await applyPreferences(prefs);
	const { generateResponse } = await import("./ai/daemon-ai");
	const { getDaemonManager } = await import("./state/daemon-state");
	const manager = getDaemonManager();
	manager.bashApprovalLevel = "none";

	const session = await createSession(trimmedPrompt.slice(0, 80));
	let finalText = "";
	let responseMessages: ModelMessage[] = [];
	let previousTodos: TodoItem[] = [];
	let errorMessage: string | null = null;

	await runWithRuntimeContext({ sessionId: session.id, messageId: 0 }, async () => {
		await generateResponse(
			trimmedPrompt,
			{
				onToolResult: (toolName, result) => {
					if (toolName !== "todoManager") return;
					const nextTodos = summarizeTodos(result);
					printTodoTransitions(previousTodos, nextTodos);
					previousTodos = nextTodos;
				},
				onAwaitingApprovals: (pendingApprovals, respondToApprovals) => {
					const approvals: ToolApprovalResponse[] = pendingApprovals.map((request) => ({
						approvalId: request.approvalId,
						approved: true,
					}));
					respondToApprovals(approvals);
				},
				onComplete: (fullText, messages, _usage, finalAssistantText) => {
					responseMessages = messages;
					finalText = finalAssistantText || extractFinalText(messages) || fullText;
				},
				onError: (err) => {
					errorMessage = err.message;
				},
			},
			[],
			"text",
			undefined,
			reasoningEffort
		);
	});

	if (errorMessage) {
		process.stderr.write(`${errorMessage}\n`);
		process.exitCode = 1;
		return;
	}

	const groundingMap = await loadLatestGroundingMap(session.id);
	const output = [finalText.trim() || extractFinalText(responseMessages).trim()];

	const pendingJobs = backgroundJobManager.listJobs(session.id).filter((j) => j.state === "running");
	if (pendingJobs.length > 0) {
		process.stderr.write(`\nWaiting for ${pendingJobs.length} background job(s)...\n`);

		const results: { job: BackgroundJobSnapshot; output: string }[] = [];
		const maxWaitMs = 300000;
		const startTime = Date.now();

		while (Date.now() - startTime < maxWaitMs) {
			const running = backgroundJobManager.listJobs(session.id).filter((j) => j.state === "running");
			if (running.length === 0) break;
			await new Promise((r) => setTimeout(r, 1000));
		}

		const completed = backgroundJobManager.listJobs(session.id).filter((j) => j.state !== "running");
		for (const job of completed) {
			const preview =
				job.type === "bash" ? job.stdout?.trim() || job.stderr?.trim() || "" : job.response?.trim() || "";
			if (preview) {
				results.push({ job, output: `--- ${job.type} #${job.id} (${job.state}) ---\n${preview}` });
			}
		}

		if (results.length > 0) {
			output.push("\nBackground jobs:\n" + results.map((r) => r.output).join("\n\n"));
		}
	}
	if (groundingMap?.items.length) {
		output.push(
			"Sources:\n" +
				groundingMap.items
					.map((item, index) => `${index + 1}. ${item.statement}\n${item.source.url}`)
					.join("\n")
		);
	}

	process.stdout.write(`${output.filter(Boolean).join("\n\n")}\n`);
}

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import type { BackgroundJobSnapshot, BackgroundJobState, BackgroundJobType } from "../types";

const MAX_OUTPUT_LENGTH = 50000;
const MAX_NOTIFICATION_PREVIEW_LENGTH = 1200;
const NULL_SESSION_KEY = "__null__";

interface BackgroundJobEntry extends BackgroundJobSnapshot {
	abortController: AbortController;
	process?: ChildProcessWithoutNullStreams;
}

export interface BackgroundJobNotification {
	job: BackgroundJobSnapshot;
	notification: string;
}

interface BackgroundJobEvents {
	completed: (job: BackgroundJobSnapshot) => void;
	statusChanged: () => void;
}

class TypedBackgroundJobEvents extends EventEmitter {
	override emit(event: string | symbol, ...args: unknown[]): boolean;
	override emit<K extends keyof BackgroundJobEvents>(
		event: K,
		...args: Parameters<BackgroundJobEvents[K]>
	): boolean;
	override emit(event: string | symbol, ...args: unknown[]): boolean {
		return super.emit(event, ...args);
	}

	override on(event: string | symbol, listener: (...args: unknown[]) => void): this;
	override on<K extends keyof BackgroundJobEvents>(event: K, listener: BackgroundJobEvents[K]): this;
	override on(event: string | symbol, listener: (...args: unknown[]) => void): this {
		return super.on(event, listener);
	}
}

const nextJobIdBySession = new Map<string, number>();

function nextJobIdForSession(sessionId: string | null): string {
	const key = sessionId ?? NULL_SESSION_KEY;
	const current = nextJobIdBySession.get(key) ?? 0;
	const next = current + 1;
	nextJobIdBySession.set(key, next);
	return String(next);
}

function compositeKey(sessionId: string | null, jobId: string): string {
	return `${sessionId ?? NULL_SESSION_KEY}:${jobId}`;
}

function truncateOutput(value: string): string {
	if (value.length <= MAX_OUTPUT_LENGTH) return value;
	return `${value.slice(0, MAX_OUTPUT_LENGTH)}\n... [output truncated]`;
}

function cloneJob(job: BackgroundJobEntry): BackgroundJobSnapshot {
	const { abortController, process, ...snapshot } = job;
	void abortController;
	void process;
	return { ...snapshot };
}

function buildCompletionNotification(job: BackgroundJobSnapshot): string {
	const status = job.state === "completed" ? "completed" : job.state;
	const lines = [
		`<background-job id="${job.id}" type="${job.type}" state="${status}">`,
		`Description: ${job.description}`,
	];

	if (job.type === "bash") {
		lines.push(`Exit code: ${job.exitCode ?? "null"}`);
		const preview = job.stdout?.trim() || job.stderr?.trim();
		if (preview) lines.push(`Preview:\n${preview.slice(0, MAX_NOTIFICATION_PREVIEW_LENGTH)}`);
	} else if (job.response?.trim()) {
		lines.push(`Preview:\n${job.response.trim().slice(0, MAX_NOTIFICATION_PREVIEW_LENGTH)}`);
	}

	if (job.error) lines.push(`Error: ${job.error}`);
	lines.push("</background-job>");
	lines.push(
		"The background job has finished. Use backgroundJobs with action='output' if you need the full output."
	);
	return lines.join("\n");
}

export class BackgroundJobManager {
	readonly events = new TypedBackgroundJobEvents();
	private jobs = new Map<string, BackgroundJobEntry>();
	private queuedNotifications = new Map<string, BackgroundJobNotification[]>();
	private notificationHandler:
		| ((sessionId: string, job: BackgroundJobSnapshot, notification: string) => void)
		| null = null;

	setNotificationHandler(
		handler: ((sessionId: string, job: BackgroundJobSnapshot, notification: string) => void) | null
	): void {
		this.notificationHandler = handler;
	}

	startBashJob(params: {
		sessionId: string | null;
		description: string;
		command: string;
		workdir?: string;
		timeout?: number;
		toolCallId?: string;
	}): BackgroundJobSnapshot {
		const id = nextJobIdForSession(params.sessionId);
		const key = compositeKey(params.sessionId, id);
		const abortController = new AbortController();
		const cwd = params.workdir || process.cwd();
		const job: BackgroundJobEntry = {
			id,
			type: "bash",
			state: "running",
			sessionId: params.sessionId,
			description: params.description,
			command: params.command,
			workdir: cwd,
			toolCallId: params.toolCallId,
			startedAt: Date.now(),
			stdout: "",
			stderr: "",
			abortController,
		};
		this.jobs.set(key, job);
		this.events.emit("statusChanged");

		const proc = spawn("bash", ["-c", params.command], {
			cwd,
			env: process.env,
			shell: false,
		});
		job.process = proc;

		let killedByTimeout = false;
		const timeoutId = params.timeout
			? setTimeout(() => {
					killedByTimeout = true;
					proc.kill("SIGKILL");
				}, params.timeout)
			: null;

		abortController.signal.addEventListener("abort", () => {
			proc.kill("SIGTERM");
		});

		proc.stdout.on("data", (data: Buffer) => {
			job.stdout = truncateOutput(`${job.stdout ?? ""}${data.toString()}`);
		});

		proc.stderr.on("data", (data: Buffer) => {
			job.stderr = truncateOutput(`${job.stderr ?? ""}${data.toString()}`);
		});

		proc.on("close", (code) => {
			if (timeoutId) clearTimeout(timeoutId);
			const state: BackgroundJobState = abortController.signal.aborted
				? "cancelled"
				: killedByTimeout || code !== 0
					? "failed"
					: "completed";
			this.completeJob(key, state, {
				exitCode: code,
				error: killedByTimeout ? `Command timed out after ${params.timeout}ms` : undefined,
			});
		});

		proc.on("error", (error) => {
			if (timeoutId) clearTimeout(timeoutId);
			this.completeJob(key, "failed", {
				exitCode: null,
				error: error instanceof Error ? error.message : String(error),
			});
		});

		return cloneJob(job);
	}

	startSubagentJob(params: {
		sessionId: string | null;
		description: string;
		task: string;
		toolCallId?: string;
		run: (abortSignal: AbortSignal) => Promise<{ response: string; success: boolean; error?: string }>;
	}): BackgroundJobSnapshot {
		const id = nextJobIdForSession(params.sessionId);
		const key = compositeKey(params.sessionId, id);
		const abortController = new AbortController();
		const job: BackgroundJobEntry = {
			id,
			type: "subagent",
			state: "running",
			sessionId: params.sessionId,
			description: params.description,
			task: params.task,
			toolCallId: params.toolCallId,
			startedAt: Date.now(),
			abortController,
		};
		this.jobs.set(key, job);
		this.events.emit("statusChanged");

		void params
			.run(abortController.signal)
			.then((result) => {
				this.completeJob(key, result.success ? "completed" : "failed", {
					response: result.response,
					error: result.error,
				});
			})
			.catch((error) => {
				this.completeJob(key, abortController.signal.aborted ? "cancelled" : "failed", {
					error: error instanceof Error ? error.message : String(error),
				});
			});

		return cloneJob(job);
	}

	listJobs(sessionId?: string | null): BackgroundJobSnapshot[] {
		return [...this.jobs.values()]
			.filter((job) => !sessionId || job.sessionId === sessionId)
			.map((job) => cloneJob(job));
	}

	getJob(sessionId: string | null, id: string): BackgroundJobSnapshot | null {
		const job = this.jobs.get(compositeKey(sessionId, id));
		return job ? cloneJob(job) : null;
	}

	cancelJob(sessionId: string | null, id: string): BackgroundJobSnapshot | null {
		const key = compositeKey(sessionId, id);
		const job = this.jobs.get(key);
		if (!job) return null;
		if (job.state !== "running") return cloneJob(job);
		job.abortController.abort();
		this.completeJob(key, "cancelled");
		return cloneJob(job);
	}

	queueNotification(sessionId: string, job: BackgroundJobSnapshot, notification: string): void {
		const existing = this.queuedNotifications.get(sessionId) ?? [];
		existing.push({ job, notification });
		this.queuedNotifications.set(sessionId, existing);
	}

	takeQueuedNotifications(sessionId: string): BackgroundJobNotification[] {
		const notifications = this.queuedNotifications.get(sessionId) ?? [];
		this.queuedNotifications.delete(sessionId);
		return notifications;
	}

	destroy(): void {
		for (const job of this.jobs.values()) {
			if (job.state === "running") job.abortController.abort();
		}
		this.jobs.clear();
		this.queuedNotifications.clear();
		this.notificationHandler = null;
		this.events.emit("statusChanged");
	}

	private completeJob(
		key: string,
		state: BackgroundJobState,
		updates: Partial<Pick<BackgroundJobEntry, "exitCode" | "response" | "error">> = {}
	): void {
		const job = this.jobs.get(key);
		if (!job || job.state !== "running") return;
		job.state = state;
		job.completedAt = Date.now();
		Object.assign(job, updates);
		const snapshot = cloneJob(job);
		this.events.emit("completed", snapshot);
		this.events.emit("statusChanged");
		if (snapshot.sessionId && this.notificationHandler) {
			this.notificationHandler(snapshot.sessionId, snapshot, buildCompletionNotification(snapshot));
		}
	}
}

export const backgroundJobManager = new BackgroundJobManager();

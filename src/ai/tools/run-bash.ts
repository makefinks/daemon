import { spawn } from "node:child_process";
import { tool } from "ai";
import { z } from "zod";
import { isDangerousCommand, isSensitivePathAccess } from "../../security/bash-security-policy";
import { backgroundJobManager } from "../../state/background-job-manager";
import { getDaemonManager } from "../../state/daemon-state";
import { getRuntimeContext } from "../../state/runtime-context";
import { sessionRuntimeStore } from "../../state/session-runtime-store";
import type { ToolExecutionDelta, ToolExecutionStream } from "../../types";

const DEFAULT_TIMEOUT_MS = 30000;
const MAX_OUTPUT_LENGTH = 50000;

function emitBashDelta(
	toolName: string,
	toolCallId: string | undefined,
	stream: ToolExecutionStream,
	chunk: string
): void {
	if (!toolCallId || chunk.length === 0) return;
	const { sessionId } = getRuntimeContext();
	if (!sessionId) return;
	const delta: ToolExecutionDelta = { toolName, toolCallId, stream, chunk };
	sessionRuntimeStore.toolExecutionDelta(sessionId, delta);
}

const bashInputSchema = z.object({
	description: z
		.string()
		.describe(
			"A brief description (5-10 words) of what this command does, so the user understands the purpose."
		),
	command: z
		.string()
		.describe("The bash command to execute. Can include pipes, redirects, and chained commands."),
	workdir: z
		.string()
		.optional()
		.describe("Working directory to run the command in. Defaults to current working directory."),
	timeout: z
		.number()
		.optional()
		.describe("Timeout in milliseconds. Foreground commands default to 30 seconds when omitted."),
	run_in_background: z
		.boolean()
		.optional()
		.describe(
			"Run this command asynchronously and return immediately with a background job ID. Use this only when useful work can continue while the command runs."
		),
});

const bashForegroundInputSchema = z.object({
	description: z
		.string()
		.describe(
			"A brief description (5-10 words) of what this command does, so the user understands the purpose."
		),
	command: z
		.string()
		.describe("The bash command to execute. Can include pipes, redirects, and chained commands."),
	workdir: z
		.string()
		.optional()
		.describe("Working directory to run the command in. Defaults to current working directory."),
	timeout: z.number().optional().describe("Timeout in milliseconds. Defaults to 30 seconds when omitted."),
});

export const runBash = tool({
	description:
		"Execute a bash command on the user's system. Use this to run shell commands, scripts, install packages, manage files, or perform any terminal operation. Commands run in the current working directory by default.",
	inputSchema: bashInputSchema,
	needsApproval: async ({ command }) => {
		const manager = getDaemonManager();
		const approvalLevel = manager.bashApprovalLevel;

		if (approvalLevel === "none") {
			return false;
		}

		if (approvalLevel === "all") {
			return true;
		}

		return isDangerousCommand(command) || isSensitivePathAccess(command);
	},
	execute: async ({ command, description, workdir, timeout, run_in_background }, { toolCallId }) => {
		if (run_in_background) {
			const { sessionId } = getRuntimeContext();
			const job = backgroundJobManager.startBashJob({
				sessionId,
				description,
				command,
				workdir,
				timeout,
				toolCallId,
			});

			return {
				success: true,
				background: true,
				jobId: job.id,
				description,
				message:
					"Command started in the background. Continue only if you have other useful work; otherwise finish your response and wait for the automatic completion notification.",
			};
		}

		return new Promise((resolve) => {
			const cwd = workdir || process.cwd();
			let stdout = "";
			let stderr = "";
			let killed = false;

			const proc = spawn("bash", ["-c", command], {
				cwd,
				env: process.env,
				shell: false,
			});

			const timeoutId = setTimeout(() => {
				killed = true;
				proc.kill("SIGKILL");
			}, timeout || DEFAULT_TIMEOUT_MS);

			proc.stdout.on("data", (data: Buffer) => {
				const chunk = data.toString();
				stdout += chunk;
				emitBashDelta("runBash", toolCallId, "stdout", chunk);
			});

			proc.stderr.on("data", (data: Buffer) => {
				const chunk = data.toString();
				stderr += chunk;
				emitBashDelta("runBash", toolCallId, "stderr", chunk);
			});

			proc.on("close", (code) => {
				clearTimeout(timeoutId);

				// Truncate output if too long
				if (stdout.length > MAX_OUTPUT_LENGTH) {
					stdout = stdout.slice(0, MAX_OUTPUT_LENGTH) + "\n... [output truncated]";
				}
				if (stderr.length > MAX_OUTPUT_LENGTH) {
					stderr = stderr.slice(0, MAX_OUTPUT_LENGTH) + "\n... [output truncated]";
				}

				if (killed) {
					resolve({
						success: false,
						exitCode: null,
						stdout: stdout.trim(),
						stderr: stderr.trim(),
						error: `Command timed out after ${timeout || DEFAULT_TIMEOUT_MS}ms`,
					});
				} else {
					resolve({
						success: code === 0,
						exitCode: code,
						stdout: stdout.trim(),
						stderr: stderr.trim(),
					});
				}
			});

			proc.on("error", (error) => {
				clearTimeout(timeoutId);
				resolve({
					success: false,
					exitCode: null,
					stdout: stdout.trim(),
					stderr: stderr.trim(),
					error: error instanceof Error ? error.message : String(error),
				});
			});
		});
	},
});

/**
 * Foreground-only variant of `runBash` used by subagents.
 *
 * Subagents must not be able to dispatch background jobs — they lack the
 * context to manage long-lived processes and fire-and-forget background work
 * from a nested agent can orphan processes or race with the parent session.
 * This tool is identical to `runBash` except the `run_in_background` option
 * is removed entirely, forcing every command to complete before the subagent
 * continues.
 */
export const runBashForeground = tool({
	description:
		"Execute a bash command in the foreground (blocks until completion). Use this to run shell commands, scripts, install packages, manage files, or perform any terminal operation. Background execution is not available — the command must finish before you can continue.",
	inputSchema: bashForegroundInputSchema,
	needsApproval: async ({ command }) => {
		const manager = getDaemonManager();
		const approvalLevel = manager.bashApprovalLevel;

		if (approvalLevel === "none") {
			return false;
		}

		if (approvalLevel === "all") {
			return true;
		}

		return isDangerousCommand(command) || isSensitivePathAccess(command);
	},
	execute: async ({ command, workdir, timeout }, { toolCallId }) => {
		return new Promise((resolve) => {
			const cwd = workdir || process.cwd();
			let stdout = "";
			let stderr = "";
			let killed = false;

			const proc = spawn("bash", ["-c", command], {
				cwd,
				env: process.env,
				shell: false,
			});

			const timeoutId = setTimeout(() => {
				killed = true;
				proc.kill("SIGKILL");
			}, timeout || DEFAULT_TIMEOUT_MS);

			proc.stdout.on("data", (data: Buffer) => {
				const chunk = data.toString();
				stdout += chunk;
				emitBashDelta("runBash", toolCallId, "stdout", chunk);
			});

			proc.stderr.on("data", (data: Buffer) => {
				const chunk = data.toString();
				stderr += chunk;
				emitBashDelta("runBash", toolCallId, "stderr", chunk);
			});

			proc.on("close", (code) => {
				clearTimeout(timeoutId);

				if (stdout.length > MAX_OUTPUT_LENGTH) {
					stdout = stdout.slice(0, MAX_OUTPUT_LENGTH) + "\n... [output truncated]";
				}
				if (stderr.length > MAX_OUTPUT_LENGTH) {
					stderr = stderr.slice(0, MAX_OUTPUT_LENGTH) + "\n... [output truncated]";
				}

				if (killed) {
					resolve({
						success: false,
						exitCode: null,
						stdout: stdout.trim(),
						stderr: stderr.trim(),
						error: `Command timed out after ${timeout || DEFAULT_TIMEOUT_MS}ms`,
					});
				} else {
					resolve({
						success: code === 0,
						exitCode: code,
						stdout: stdout.trim(),
						stderr: stderr.trim(),
					});
				}
			});

			proc.on("error", (error) => {
				clearTimeout(timeoutId);
				resolve({
					success: false,
					exitCode: null,
					stdout: stdout.trim(),
					stderr: stderr.trim(),
					error: error instanceof Error ? error.message : String(error),
				});
			});
		});
	},
});

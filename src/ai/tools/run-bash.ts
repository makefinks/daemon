import { spawn } from "node:child_process";
import { tool } from "ai";
import { z } from "zod";
import { isDangerousCommand, isSensitivePathAccess } from "../../security/bash-security-policy";
import { getDaemonManager } from "../../state/daemon-state";

const DEFAULT_TIMEOUT_MS = 30000;
const MAX_OUTPUT_LENGTH = 50000;

export const runBash = tool({
	description:
		"Execute a bash command on the user's system. Use this to run shell commands, scripts, install packages, manage files, or perform any terminal operation. Commands run in the current working directory by default.",
	inputSchema: z.object({
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
			.default(DEFAULT_TIMEOUT_MS)
			.describe("Timeout in milliseconds. Defaults to 20 seconds."),
	}),
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
	execute: async ({ command, workdir, timeout }) => {
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
				stdout += data.toString();
			});

			proc.stderr.on("data", (data: Buffer) => {
				stderr += data.toString();
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

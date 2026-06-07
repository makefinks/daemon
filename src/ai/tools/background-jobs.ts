import { tool } from "ai";
import { z } from "zod";
import { backgroundJobManager } from "../../state/background-job-manager";
import { getRuntimeContext } from "../../state/runtime-context";

export const backgroundJobs = tool({
	description: `List, inspect, or cancel background jobs started by runBash or subagent.

Use this when you need to check whether a background command or subagent has finished before deciding what to do next, or when you have received a completion notification and need the full output.

If a job is still running and there is no other useful work to do, finish your response. You will be awakened automatically when the job completes. Do not call this repeatedly just to wait.`,
	inputSchema: z.object({
		action: z
			.enum(["list", "output", "cancel"])
			.describe("Action to perform: list background jobs, read a job's output, or cancel a job."),
		includeAllSessions: z
			.boolean()
			.optional()
			.describe("For action='list', include jobs from all sessions. Defaults to false."),
		jobId: z
			.string()
			.optional()
			.describe("Required for action='output' or action='cancel'. The background job ID."),
	}),
	execute: async (input) => {
		const { sessionId } = getRuntimeContext();

		if (input.action === "list") {
			const jobs = backgroundJobManager.listJobs(input.includeAllSessions ? undefined : sessionId);
			return {
				success: true,
				jobs: jobs.map((job) => ({
					id: job.id,
					type: job.type,
					state: job.state,
					description: job.description,
					startedAt: new Date(job.startedAt).toISOString(),
					completedAt: job.completedAt ? new Date(job.completedAt).toISOString() : undefined,
					exitCode: job.exitCode,
					error: job.error,
				})),
			};
		}

		if (input.action === "cancel") {
			if (!input.jobId) {
				return { success: false, error: "jobId is required for action='cancel'." };
			}
			const job = backgroundJobManager.cancelJob(sessionId, input.jobId);
			if (!job) {
				return { success: false, error: `Background job ${input.jobId} was not found.` };
			}

			return {
				success: true,
				job,
			};
		}

		if (!input.jobId) {
			return { success: false, error: "jobId is required for action='output'." };
		}

		const job = backgroundJobManager.getJob(sessionId, input.jobId);
		if (!job) {
			return { success: false, error: `Background job ${input.jobId} was not found.` };
		}

		if (job.state === "running") {
			return {
				success: true,
				job: {
					id: job.id,
					type: job.type,
					state: job.state,
					description: job.description,
					startedAt: new Date(job.startedAt).toISOString(),
				},
				message:
					"This background job is still running. If you have no other useful work to do, finish your response now; DAEMON will wake you when the job completes.",
			};
		}

		return {
			success: true,
			job,
			output:
				job.type === "bash"
					? {
							stdout: job.stdout ?? "",
							stderr: job.stderr ?? "",
							exitCode: job.exitCode,
						}
					: {
							response: job.response ?? "",
						},
		};
	},
});

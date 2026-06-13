import type { ToolBody, ToolHeader, ToolLayoutConfig, ToolResultFormatOptions } from "../types";
import { registerToolLayout } from "../registry";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getAction(input: unknown): string | null {
	return isRecord(input) && typeof input.action === "string" ? input.action : null;
}

function formatJobLine(job: unknown): string | null {
	if (!isRecord(job)) return null;
	const id = typeof job.id === "string" ? job.id : "?";
	const type = typeof job.type === "string" ? job.type : "job";
	const state = typeof job.state === "string" ? job.state : "unknown";
	const description = typeof job.description === "string" ? job.description : "";
	return `#${id} ${type} ${state}${description ? ` · ${description}` : ""}`;
}

function formatBackgroundJobsResult(
	result: unknown,
	_input?: unknown,
	options?: ToolResultFormatOptions
): string[] | null {
	if (!isRecord(result)) return null;
	if (typeof result.error === "string") return [result.error];
	if (Array.isArray(result.jobs)) {
		const lines = result.jobs.map(formatJobLine).filter((line): line is string => line !== null);
		return lines.length > 0 ? (options?.expanded ? lines : lines.slice(0, 6)) : ["no background jobs"];
	}
	if (isRecord(result.job)) {
		const line = formatJobLine(result.job);
		return line ? [line] : null;
	}
	return null;
}

export const backgroundJobsLayout: ToolLayoutConfig = {
	abbreviation: "bg",

	getHeader: (input): ToolHeader | null => {
		const action = getAction(input);
		return action ? { primary: action } : null;
	},

	getBody: (input): ToolBody | null => {
		if (!isRecord(input)) return null;
		const jobId = typeof input.jobId === "string" ? input.jobId : null;
		return {
			lines: [{ text: jobId ? `job #${jobId}` : "current session" }],
		};
	},

	formatResult: formatBackgroundJobsResult,
};

registerToolLayout("backgroundJobs", backgroundJobsLayout);

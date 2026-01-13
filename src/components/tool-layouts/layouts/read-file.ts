import type { ToolLayoutConfig, ToolHeader } from "../types";
import { registerToolLayout } from "../registry";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractPath(input: unknown): string | null {
	if (!isRecord(input)) return null;
	if ("path" in input && typeof input.path === "string") {
		return input.path;
	}
	return null;
}

function formatReadFileResult(result: unknown): string[] | null {
	if (!isRecord(result)) return null;
	if (result.success === false && typeof result.error === "string") {
		return [`error: ${result.error}`];
	}
	if (result.success !== true) return null;
	const path = typeof result.path === "string" ? result.path : "";
	const startLine = typeof result.startLine === "number" ? result.startLine : undefined;
	const endLine = typeof result.endLine === "number" ? result.endLine : undefined;
	const hasMore = typeof result.hasMore === "boolean" ? result.hasMore : undefined;
	const content = typeof result.content === "string" ? result.content : "";

	const range =
		startLine !== undefined && endLine !== undefined && startLine > 0 && endLine > 0
			? ` (${startLine}-${endLine}${hasMore ? "+" : ""})`
			: "";

	if (!content.trim()) return path ? [`${path}${range}`] : null;

	const MAX_LINES = 4;
	const MAX_CHARS = 160;
	const lines = content
		.split("\n")
		.slice(0, MAX_LINES)
		.map((l) => (l.length > MAX_CHARS ? `${l.slice(0, MAX_CHARS - 1)}…` : l));

	return [`${path}${range}:`, ...lines];
}

export const readFileLayout: ToolLayoutConfig = {
	abbreviation: "read",

	getHeader: (input): ToolHeader | null => {
		const path = extractPath(input);
		if (!path) return null;
		return { primary: path };
	},

	formatResult: formatReadFileResult,
};

registerToolLayout("readFile", readFileLayout);

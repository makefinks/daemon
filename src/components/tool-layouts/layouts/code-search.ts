import type { ToolHeader, ToolLayoutConfig, ToolResultFormatOptions } from "../types";
import { registerToolLayout } from "../registry";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractQuery(input: unknown): string | null {
	if (!isRecord(input)) return null;
	if (!("query" in input) || typeof input.query !== "string") return null;
	return input.query;
}

function extractResponse(data: unknown): string | null {
	if (!isRecord(data)) return null;
	const container = "data" in data ? data.data : data;
	if (!isRecord(container)) return null;
	if (typeof container.response === "string") return container.response;
	return null;
}

const MAX_INLINE_CHARS = 60;
const MAX_RESULT_LINES = 6;
const MAX_LINE_CHARS = 120;

function formatCodeSearchResult(
	result: unknown,
	_input?: unknown,
	options?: ToolResultFormatOptions
): string[] | null {
	if (!isRecord(result)) return null;
	if (result.success === false && typeof result.error === "string") {
		return [`error: ${result.error}`];
	}
	if (result.success !== true) return null;

	const response = extractResponse(result);
	if (!response) return null;
	if (options?.expanded)
		return response
			.replace(/\n{3,}/g, "\n\n")
			.trim()
			.split("\n");

	const lines = response
		.replace(/\n{3,}/g, "\n\n")
		.trim()
		.split("\n")
		.slice(0, MAX_RESULT_LINES)
		.map((l) => (l.length > MAX_LINE_CHARS ? `${l.slice(0, MAX_LINE_CHARS - 1)}…` : l));

	if (lines.length === 0) return null;

	if (response.split("\n").length > MAX_RESULT_LINES) {
		lines.push("  ...");
	}

	return lines;
}

export const codeSearchLayout: ToolLayoutConfig = {
	abbreviation: "CODE-SEARCH",

	getHeader: (input): ToolHeader | null => {
		const query = extractQuery(input);
		if (!query) return null;
		const truncated = query.length > MAX_INLINE_CHARS ? `${query.slice(0, MAX_INLINE_CHARS - 1)}…` : query;
		return {
			primary: `"${truncated}"`,
		};
	},

	formatResult: formatCodeSearchResult,
};

registerToolLayout("codeSearch", codeSearchLayout);

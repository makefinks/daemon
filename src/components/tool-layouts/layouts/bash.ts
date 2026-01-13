import type { ToolLayoutConfig, ToolHeader, ToolBody } from "../types";
import { registerToolLayout } from "../registry";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface BashInput {
	command: string;
	description: string;
}

function extractBashInput(input: unknown): BashInput | null {
	if (!isRecord(input)) return null;
	if (!("command" in input) || typeof input.command !== "string") return null;
	const description =
		"description" in input && typeof input.description === "string" ? input.description : "";
	return { command: input.command, description };
}

function pickFirstNonEmpty(...parts: Array<string | undefined | null>): string {
	for (const part of parts) {
		if (typeof part === "string" && part.trim().length > 0) return part;
	}
	return "";
}

function formatBashResult(result: unknown): string[] | null {
	if (!isRecord(result)) return null;
	const success = "success" in result ? result.success : undefined;
	const exitCode =
		typeof result.exitCode === "number" || result.exitCode === null ? result.exitCode : undefined;

	const stdout = typeof result.stdout === "string" ? result.stdout : "";
	const stderr = typeof result.stderr === "string" ? result.stderr : "";
	const error = typeof result.error === "string" ? result.error : "";

	const body = pickFirstNonEmpty(stdout, stderr, error);
	if (!body) {
		if (typeof success === "boolean") {
			const line = `success=${success}${exitCode !== undefined ? ` exit=${String(exitCode)}` : ""}`;
			return [line];
		}
		return null;
	}

	const label = stdout.trim().length > 0 ? "stdout" : stderr.trim().length > 0 ? "stderr" : "error";
	const meta =
		typeof success === "boolean" || exitCode !== undefined
			? ` (${typeof success === "boolean" ? `success=${success}` : ""}${exitCode !== undefined ? `${typeof success === "boolean" ? " " : ""}exit=${String(exitCode)}` : ""})`
			: "";

	const MAX_LINES = 4;
	const MAX_CHARS_PER_LINE = 160;
	const lines = body
		.split("\n")
		.map((l) => l.trimEnd())
		.filter((l) => l.length > 0)
		.slice(0, MAX_LINES)
		.map((l) => (l.length > MAX_CHARS_PER_LINE ? `${l.slice(0, MAX_CHARS_PER_LINE - 1)}…` : l));

	if (lines.length === 0) return [`${label}${meta}: (empty)`];
	lines[0] = `${label}${meta}: ${lines[0]}`;
	return lines;
}

export const bashLayout: ToolLayoutConfig = {
	abbreviation: "bash",

	getHeader: (input): ToolHeader | null => {
		const bashInput = extractBashInput(input);
		if (!bashInput) return null;
		return {
			secondary: bashInput.description,
			secondaryStyle: "italic",
		};
	},

	getBody: (input): ToolBody | null => {
		const bashInput = extractBashInput(input);
		if (!bashInput) return null;

		const command = bashInput.command;
		const lines = command.split("\n");
		const isMultiLine = lines.length > 1;
		const MAX_DISPLAY_LENGTH = 120;

		let displayText: string;
		if (isMultiLine) {
			const firstLine = lines[0]?.trimEnd() ?? "";
			const truncatedFirst =
				firstLine.length > MAX_DISPLAY_LENGTH ? `${firstLine.slice(0, MAX_DISPLAY_LENGTH - 1)}…` : firstLine;
			displayText = `${truncatedFirst} (+${lines.length - 1} more lines)`;
		} else if (command.length > MAX_DISPLAY_LENGTH) {
			displayText = `${command.slice(0, MAX_DISPLAY_LENGTH - 1)}…`;
		} else {
			displayText = command;
		}

		return {
			lines: [{ text: displayText }],
		};
	},

	formatResult: formatBashResult,
};

registerToolLayout("runBash", bashLayout);

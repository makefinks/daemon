import type { ToolCallStatus } from "../../../types";
import { COLORS, REASONING_MARKDOWN_STYLE } from "../../../ui/constants";
import { formatMarkdownTables } from "../../../utils/markdown-tables";
import { registerToolLayout } from "../registry";
import type { ToolHeader, ToolLayoutConfig, ToolLayoutRenderProps } from "../types";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractSubagentSummary(input: unknown): string | null {
	if (!isRecord(input)) return null;
	if ("summary" in input && typeof input.summary === "string") {
		return input.summary;
	}
	if ("topic" in input && typeof input.topic === "string") {
		return input.topic;
	}
	return null;
}

function extractSearchQuery(input: unknown): string | null {
	if (!isRecord(input)) return null;
	if ("query" in input && typeof input.query === "string") {
		return input.query;
	}
	return null;
}

function extractUrl(input: unknown): string | null {
	if (!isRecord(input)) return null;
	if ("url" in input && typeof input.url === "string") {
		return input.url;
	}
	return null;
}

function extractPath(input: unknown): string | null {
	if (!isRecord(input)) return null;
	if ("path" in input && typeof input.path === "string") {
		return input.path;
	}
	return null;
}

function extractCommand(input: unknown): string | null {
	if (!isRecord(input)) return null;
	if ("command" in input && typeof input.command === "string") {
		return input.command;
	}
	return null;
}

function truncateLabel(text: string, maxLength: number): string {
	if (text.length <= maxLength) return text;
	if (maxLength <= 3) return text.slice(0, maxLength);
	return `${text.slice(0, maxLength - 3)}...`;
}

function abbreviateToolName(name: string): string {
	const abbreviations: Record<string, string> = {
		webSearch: "search",
		fetchUrls: "fetch",
		renderUrl: "render",
		runBash: "bash",
		todoManager: "todo",
		readFile: "read",
	};
	return abbreviations[name] ?? name.slice(0, 8);
}

function formatStepLabel(step: { toolName: string; input?: unknown }): string {
	const toolLabel = abbreviateToolName(step.toolName);
	const MAX_URL_LENGTH = 56;
	const MAX_PATH_LENGTH = 56;
	const MAX_COMMAND_LENGTH = 72;
	const MAX_QUERY_LENGTH = 56;

	if (step.toolName === "webSearch") {
		const query = extractSearchQuery(step.input);
		if (query) {
			return `${toolLabel}: "${truncateLabel(query, MAX_QUERY_LENGTH)}"`;
		}
		return toolLabel;
	}

	if (step.toolName === "fetchUrls" || step.toolName === "renderUrl") {
		const url = extractUrl(step.input);
		if (url) {
			return `${toolLabel}: ${truncateLabel(url, MAX_URL_LENGTH)}`;
		}
		return toolLabel;
	}

	if (step.toolName === "readFile") {
		const path = extractPath(step.input);
		if (path) {
			return `${toolLabel}: ${truncateLabel(path, MAX_PATH_LENGTH)}`;
		}
		return toolLabel;
	}

	if (step.toolName === "runBash") {
		const command = extractCommand(step.input);
		if (command) {
			const cleanCommand = command.replace(/\s+/g, " ").trim();
			return `${toolLabel}: ${truncateLabel(cleanCommand, MAX_COMMAND_LENGTH)}`;
		}
		return toolLabel;
	}

	return toolLabel;
}

function getStepStatusIcon(status: ToolCallStatus): string {
	switch (status) {
		case "running":
			return "~";
		case "completed":
			return "✓";
		case "failed":
			return "x";
		default:
			return " ";
	}
}

function getStepStatusColor(status: ToolCallStatus): string {
	switch (status) {
		case "running":
			return COLORS.STATUS_RUNNING;
		case "completed":
			return COLORS.STATUS_COMPLETED;
		case "failed":
			return COLORS.STATUS_FAILED;
		default:
			return COLORS.STATUS_PENDING;
	}
}

function formatSubagentResponse(result: unknown): string | null {
	if (!isRecord(result)) return null;
	if (typeof result.response !== "string") return null;
	const raw = result.response.trim();
	if (!raw) return null;

	const MAX_LINES = 6;
	const MAX_CHARS = 160;
	const lines = raw
		.replace(/\r\n/g, "\n")
		.split("\n")
		.map((line) => line.trimEnd())
		.filter((line) => line.length > 0);
	if (lines.length === 0) return null;

	const trimmed = lines.slice(0, MAX_LINES).map((line) => truncateLabel(line, MAX_CHARS));
	if (lines.length > MAX_LINES && trimmed.length > 0) {
		const lastIndex = trimmed.length - 1;
		const lastLine = trimmed[lastIndex] ?? "";
		trimmed[lastIndex] = lastLine.endsWith("...") ? lastLine : `${lastLine}...`;
	}

	return trimmed.join("\n");
}

function SubagentBody({ call, result }: ToolLayoutRenderProps) {
	const steps = call.subagentSteps ?? [];
	const responseText = formatSubagentResponse(result);
	if (steps.length === 0 && !responseText) {
		return null;
	}

	const maxWidth =
		typeof process !== "undefined" && process.stdout?.columns ? process.stdout.columns : undefined;
	const renderedResponse = responseText ? formatMarkdownTables(responseText, { maxWidth }) : "";

	return (
		<box flexDirection="column" paddingLeft={2} marginTop={0}>
			{steps.map((step, idx) => {
				const stepLabel = formatStepLabel(step);
				const inputLabel = stepLabel.slice(stepLabel.indexOf(":") + 1).trim();
				const toolLabel = stepLabel.includes(":")
					? stepLabel.slice(0, stepLabel.indexOf(":") + 1)
					: stepLabel;

				return (
					<box key={`${step.toolName}-${idx}`} flexDirection="row" alignItems="center">
						{step.status === "running" ? (
							<spinner name="dots" color={getStepStatusColor(step.status)} />
						) : (
							<text>
								<span fg={getStepStatusColor(step.status)}>{getStepStatusIcon(step.status)}</span>
							</text>
						)}
						<text marginLeft={1}>
							<span fg={COLORS.TOOL_INPUT_TEXT}>{toolLabel}</span>
							{stepLabel.includes(":") && <span fg={COLORS.REASONING_DIM}>{` ${inputLabel}`}</span>}
						</text>
					</box>
				);
			})}
			{responseText && (
				<box flexDirection="column" marginTop={steps.length > 0 ? 1 : 0}>
					<text>
						<span fg={COLORS.REASONING_DIM}>{"response"}</span>
					</text>
					<box
						borderStyle="single"
						borderColor={COLORS.TOOL_INPUT_BORDER}
						paddingLeft={1}
						paddingRight={1}
						paddingTop={0}
						paddingBottom={0}
					>
						<code
							content={renderedResponse}
							filetype="markdown"
							syntaxStyle={REASONING_MARKDOWN_STYLE}
							conceal={true}
							drawUnstyledText={false}
						/>
					</box>
				</box>
			)}
		</box>
	);
}

export const subagentLayout: ToolLayoutConfig = {
	abbreviation: "agent",

	getHeader: (input): ToolHeader | null => {
		const summary = extractSubagentSummary(input);
		return summary ? { primary: summary } : null;
	},

	renderBody: SubagentBody,
};

registerToolLayout("subagent", subagentLayout);

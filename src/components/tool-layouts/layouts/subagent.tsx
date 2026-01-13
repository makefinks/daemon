import type { ToolLayoutConfig, ToolHeader, ToolLayoutRenderProps } from "../types";
import type { ToolCallStatus } from "../../../types";
import { registerToolLayout } from "../registry";
import { COLORS } from "../../../ui/constants";

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

function abbreviateToolName(name: string): string {
	const abbreviations: Record<string, string> = {
		webSearch: "search",
		fetchUrls: "fetch",
		renderUrl: "render",
		getSystemInfo: "sys",
		runBash: "bash",
		todoManager: "todo",
		readFile: "read",
		groundingManager: "grounding",
	};
	return abbreviations[name] ?? name.slice(0, 8);
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

function SubagentBody({ call }: ToolLayoutRenderProps) {
	if (!call.subagentSteps || call.subagentSteps.length === 0) {
		return null;
	}

	return (
		<box flexDirection="column" paddingLeft={2} marginTop={0}>
			{call.subagentSteps.map((step, idx) => {
				const toolLabel = abbreviateToolName(step.toolName);
				let stepLabel = toolLabel;
				if (step.toolName === "webSearch") {
					const query = extractSearchQuery(step.input);
					if (query) {
						stepLabel = `${toolLabel}: "${query}"`;
					}
				}

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
							<span fg={COLORS.TOOL_INPUT_TEXT}>{stepLabel}</span>
						</text>
					</box>
				);
			})}
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

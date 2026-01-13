import { TextAttributes } from "@opentui/core";
import { COLORS } from "../../ui/constants";
import type { ToolHeader, ToolBody, ToolBodyLine } from "./types";
import type { ToolCallStatus } from "../../types";

interface ToolHeaderViewProps {
	toolName: string;
	header: ToolHeader | null;
	isRunning: boolean;
	toolColor: string;
}

export function ToolHeaderView({ toolName, header, isRunning, toolColor }: ToolHeaderViewProps) {
	return (
		<box flexDirection="row" alignItems="center" justifyContent="space-between" width="100%">
			<text>
				<span fg={toolColor}>{"↯ "}</span>
				<span fg={toolColor}>{toolName}</span>
				{header?.primary && <span fg={COLORS.TOOL_INPUT_TEXT}>{` ${header.primary}`}</span>}
				{header?.secondary && (
					<span
						fg={COLORS.REASONING_DIM}
						attributes={header.secondaryStyle === "italic" ? TextAttributes.ITALIC : TextAttributes.NONE}
					>
						{` ${header.secondary}`}
					</span>
				)}
			</text>
			{isRunning && <spinner name="dots" color={COLORS.STATUS_RUNNING} />}
		</box>
	);
}

interface ToolBodyViewProps {
	body: ToolBody;
}

function getLineColor(line: ToolBodyLine): string {
	if (line.color) return line.color;
	if (line.status) {
		switch (line.status) {
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
	return COLORS.TOOL_INPUT_TEXT;
}

export function ToolBodyView({ body }: ToolBodyViewProps) {
	return (
		<box flexDirection="column" paddingLeft={2} marginTop={0}>
			{body.lines.map((line, idx) => (
				<box key={idx} flexDirection="row" alignItems="center">
					{line.status === "running" ? (
						<spinner name="dots" color={getLineColor(line)} />
					) : line.icon ? (
						<text>
							<span fg={getLineColor(line)}>{line.icon}</span>
						</text>
					) : null}
					<text marginLeft={line.icon || line.status === "running" ? 1 : 0}>
						<span fg={getLineColor(line)} attributes={line.attributes ?? TextAttributes.NONE}>
							{line.text}
						</span>
					</text>
				</box>
			))}
		</box>
	);
}

interface ResultPreviewViewProps {
	lines: string[];
}

export function ResultPreviewView({ lines }: ResultPreviewViewProps) {
	return (
		<box flexDirection="column" paddingLeft={2}>
			{lines.map((line, idx) => (
				<text key={idx}>
					<span fg={COLORS.REASONING_DIM}>{`› ${line}`}</span>
				</text>
			))}
		</box>
	);
}

interface ErrorPreviewViewProps {
	error: string;
	maxLength?: number;
}

export function ErrorPreviewView({ error, maxLength = 120 }: ErrorPreviewViewProps) {
	const displayError = error.length > maxLength ? `${error.slice(0, maxLength)}…` : error;

	return (
		<box flexDirection="column" paddingLeft={2}>
			<text>
				<span fg={COLORS.STATUS_FAILED}>{`⚠ ${displayError}`}</span>
			</text>
		</box>
	);
}

export function getStatusBorderColor(status: ToolCallStatus | undefined): string {
	switch (status) {
		case "completed":
			return COLORS.TOOL_INPUT_BORDER;
		case "failed":
			return COLORS.STATUS_FAILED;
		default:
			return COLORS.TOOL_INPUT_BORDER;
	}
}

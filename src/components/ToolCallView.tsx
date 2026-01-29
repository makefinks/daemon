import { useMemo } from "react";
import { getMcpManager } from "../ai/mcp/mcp-manager";
import { useToolApprovalForCall } from "../hooks/use-tool-approval";
import type { ToolCall } from "../types";
import { COLORS } from "../ui/constants";
import { formatToolInputLines } from "../utils/formatters";
import { formatGenericToolOutputPreview } from "../utils/tool-output-preview";
import { ApprovalPicker } from "./ApprovalPicker";
import {
	ErrorPreviewView,
	ResultPreviewView,
	ToolBodyView,
	ToolHeaderView,
	defaultToolLayout,
	getDefaultAbbreviation,
	getStatusBorderColor,
	getToolLayout,
} from "./tool-layouts";

interface ToolCallViewProps {
	call: ToolCall;
	result?: unknown;
	showOutput?: boolean;
}

function ApprovalResultBadge({ result }: { result: "approved" | "denied" }) {
	const isApproved = result === "approved";
	const color = isApproved ? COLORS.STATUS_COMPLETED : COLORS.STATUS_FAILED;
	const label = isApproved ? "APPROVED" : "DENIED";

	return (
		<box marginTop={1}>
			<text>
				<span fg={color}>
					{">> "}
					{label}
				</span>
			</text>
		</box>
	);
}

function ToolSectionDivider({ label }: { label: string }) {
	return (
		<box flexDirection="column" paddingLeft={2} marginTop={1}>
			<text>
				<span fg={COLORS.REASONING_DIM}>{`--- ${label} ---`}</span>
			</text>
		</box>
	);
}

export function ToolCallView({ call, result, showOutput = true }: ToolCallViewProps) {
	const layout = getToolLayout(call.name) ?? defaultToolLayout;
	const mcpMeta = useMemo(() => getMcpManager().getToolMeta(call.name), [call.name]);
	const isAwaitingApproval = call.status === "awaiting_approval";
	const isRunning = call.status === "running" || call.status === "streaming";
	const isFailed = call.status === "failed";

	const { needsApproval, isActive, approve, deny, approveAll, denyAll } = useToolApprovalForCall(
		call.toolCallId
	);

	const header = useMemo(() => {
		const base = layout.getHeader?.(call.input, result) ?? null;
		if (base) return base;
		if (mcpMeta) {
			return {
				primary: mcpMeta.serverId,
				secondary: mcpMeta.originalToolName,
				secondaryStyle: "dim" as const,
			};
		}
		return null;
	}, [call.input, result, layout, mcpMeta]);

	const body = useMemo(() => {
		const base = layout.getBody?.(call.input, result, call) ?? null;
		if (base) return base;
		if (!mcpMeta) return null;
		const lines = formatToolInputLines(call.input);
		const normalized = lines.length > 0 ? lines : ["(no input)"];
		return {
			lines: normalized.map((text) => ({
				text,
				color: COLORS.REASONING_DIM,
			})),
		};
	}, [call.input, result, call, layout, mcpMeta]);

	const resultPreviewLines = useMemo(() => {
		if (!showOutput) return null;
		const formatted = layout.formatResult?.(result) ?? null;
		if (formatted) return formatted;
		if (mcpMeta) return formatGenericToolOutputPreview(result);
		return null;
	}, [result, showOutput, layout, mcpMeta]);

	const hasResultPreview = Boolean(showOutput && resultPreviewLines && resultPreviewLines.length > 0);

	const toolColor =
		call.status === "completed"
			? COLORS.STATUS_COMPLETED
			: isAwaitingApproval
				? COLORS.STATUS_APPROVAL
				: COLORS.TOOLS;
	const toolName = mcpMeta ? "mcp" : (layout.abbreviation ?? getDefaultAbbreviation(call.name));
	const borderColor = getStatusBorderColor(call.status);

	const customBody = layout.renderBody ? layout.renderBody({ call, result, showOutput }) : null;

	return (
		<box
			flexDirection="column"
			backgroundColor={COLORS.TOOL_INPUT_BG}
			borderStyle="single"
			borderColor={borderColor}
			paddingLeft={1}
			paddingRight={1}
			paddingTop={0}
			paddingBottom={0}
			width="100%"
		>
			<ToolHeaderView toolName={toolName} header={header} isRunning={isRunning} toolColor={toolColor} />

			{customBody}

			{!customBody && body && <ToolBodyView body={body} />}

			{needsApproval && (
				<ApprovalPicker
					onApprove={approve}
					onDeny={deny}
					onApproveAll={approveAll}
					onDenyAll={denyAll}
					focused={isActive}
				/>
			)}

			{hasResultPreview && <ToolSectionDivider label="OUTPUT" />}
			{hasResultPreview && <ResultPreviewView lines={resultPreviewLines ?? []} />}

			{isFailed && call.error && <ToolSectionDivider label="ERROR" />}
			{isFailed && call.error && <ErrorPreviewView error={call.error} />}

			{call.approvalResult && <ApprovalResultBadge result={call.approvalResult} />}
		</box>
	);
}

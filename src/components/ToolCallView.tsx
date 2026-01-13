import { useMemo } from "react";
import { COLORS } from "../ui/constants";
import type { ToolCall } from "../types";
import {
	getToolLayout,
	defaultToolLayout,
	getDefaultAbbreviation,
	ToolHeaderView,
	ToolBodyView,
	ResultPreviewView,
	ErrorPreviewView,
	getStatusBorderColor,
} from "./tool-layouts";
import { ApprovalPicker } from "./ApprovalPicker";
import { useToolApprovalForCall } from "../hooks/use-tool-approval";

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

export function ToolCallView({ call, result, showOutput = true }: ToolCallViewProps) {
	const layout = getToolLayout(call.name) ?? defaultToolLayout;
	const isAwaitingApproval = call.status === "awaiting_approval";
	const isRunning = call.status === "running" || call.status === "streaming";
	const isFailed = call.status === "failed";

	const { needsApproval, isActive, approve, deny, approveAll, denyAll } = useToolApprovalForCall(
		call.toolCallId
	);

	const header = useMemo(() => layout.getHeader?.(call.input, result) ?? null, [call.input, result, layout]);

	const body = useMemo(
		() => layout.getBody?.(call.input, result, call) ?? null,
		[call.input, result, call, layout]
	);

	const resultPreviewLines = useMemo(() => {
		if (!showOutput) return null;
		return layout.formatResult?.(result) ?? null;
	}, [result, showOutput, layout]);

	const toolColor =
		call.status === "completed"
			? COLORS.STATUS_COMPLETED
			: isAwaitingApproval
				? COLORS.STATUS_APPROVAL
				: COLORS.TOOLS;
	const toolName = layout.abbreviation ?? getDefaultAbbreviation(call.name);
	const borderColor = getStatusBorderColor(call.status);

	const customBody = useMemo(() => {
		if (!layout.renderBody) return null;
		return layout.renderBody({ call, result, showOutput });
	}, [layout, call, result, showOutput]);

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

			{showOutput && resultPreviewLines && resultPreviewLines.length > 0 && (
				<ResultPreviewView lines={resultPreviewLines} />
			)}

			{isFailed && call.error && <ErrorPreviewView error={call.error} />}

			{call.approvalResult && <ApprovalResultBadge result={call.approvalResult} />}
		</box>
	);
}

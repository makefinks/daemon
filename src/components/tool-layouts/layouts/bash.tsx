import type { ReactNode } from "react";
import { sessionRuntimeStore } from "../../../state/session-runtime-store";
import { COLORS } from "../../../ui/constants";
import type { ToolCall } from "../../../types";
import { BashLiveOutputView } from "../components";
import type { ToolLayoutConfig, ToolHeader, ToolBody } from "../types";
import { registerToolLayout } from "../registry";
import { isToolScrollFocused, setToolScrollFocus, useToolScrollFocus } from "../scroll-focus";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface BashInput {
	command: string;
	description: string;
	runInBackground?: boolean;
}

function extractBashInput(input: unknown): BashInput | null {
	if (!isRecord(input)) return null;
	if (!("command" in input) || typeof input.command !== "string") return null;
	const description =
		"description" in input && typeof input.description === "string" ? input.description : "";
	const runInBackground = input.run_in_background === true;
	return { command: input.command, description, runInBackground };
}

function isBackgroundResult(result: unknown): boolean {
	return isRecord(result) && result.background === true && typeof result.jobId === "string";
}

function extractResultOutput(result: unknown): { stdout: string; stderr: string; error: string } {
	if (!isRecord(result)) return { stdout: "", stderr: "", error: "" };
	return {
		stdout: typeof result.stdout === "string" ? result.stdout : "",
		stderr: typeof result.stderr === "string" ? result.stderr : "",
		error: typeof result.error === "string" ? result.error : "",
	};
}

function BashCardBody({
	call,
	result,
	showOutput = true,
	previewFocused = false,
}: {
	call: ToolCall;
	result: unknown;
	showOutput?: boolean;
	previewFocused?: boolean;
}): ReactNode {
	const focused = useToolScrollFocus(call.toolCallId);

	const body = bashLayout.getBody?.(call.input, result, call, { expanded: previewFocused });
	const live = call.toolCallId
		? sessionRuntimeStore.getLiveOutput(call.sessionId ?? null, call.toolCallId)
		: null;
	const commandLines = body?.lines ?? [];

	const resultOutput =
		!live || (live.stdout.length === 0 && live.stderr.length === 0)
			? extractResultOutput(result)
			: { stdout: "", stderr: "", error: "" };

	const toggleFocus = (event: { stopPropagation: () => void }) => {
		if (call.toolCallId) setToolScrollFocus(call.toolCallId, !focused, call.sessionId ?? null);
		// Claim the click so an outer "clear on outside click" handler doesn't
		// immediately undo the focus we just set.
		event.stopPropagation();
	};

	return (
		<box flexDirection="column" width="100%" onMouseDown={toggleFocus}>
			{commandLines.length > 0 && (
				<box flexDirection="column" paddingLeft={2} marginTop={0}>
					<box
						borderStyle="single"
						borderColor={COLORS.TOOL_INPUT_BORDER}
						paddingLeft={1}
						paddingRight={1}
						paddingTop={0}
						paddingBottom={0}
					>
						{commandLines.map((line, idx) => (
							<text key={idx}>
								<span fg={COLORS.TOOL_INPUT_TEXT}>{line.text}</span>
							</text>
						))}
					</box>
				</box>
			)}
			{showOutput &&
				(live ? (
					<BashLiveOutputView live={live} captureScroll={focused} />
				) : (
					<BashLiveOutputView
						live={
							resultOutput.stdout || resultOutput.stderr
								? {
										toolName: "runBash",
										stdout: resultOutput.stdout,
										stderr: resultOutput.stderr,
										updatedAt: 0,
									}
								: null
						}
						captureScroll={focused}
					/>
				))}
		</box>
	);
}

export const bashLayout: ToolLayoutConfig = {
	abbreviation: "bash",

	getHeader: (input, result): ToolHeader | null => {
		const bashInput = extractBashInput(input);
		if (!bashInput) return null;
		return {
			secondary:
				bashInput.runInBackground || isBackgroundResult(result)
					? `${bashInput.description} · background task`
					: bashInput.description,
			secondaryStyle: "italic",
		};
	},

	getBody: (input, _result, _call, options): ToolBody | null => {
		const bashInput = extractBashInput(input);
		if (!bashInput) return null;

		const command = bashInput.command;
		const lines = command.split("\n");
		const isMultiLine = lines.length > 1;
		const MAX_DISPLAY_LENGTH = 120;
		const MAX_PREVIEW_LINES = 3;
		const expanded = options?.expanded === true;

		const formatLine = (line: string): string => {
			const trimmed = line.trimEnd();
			return trimmed.length > MAX_DISPLAY_LENGTH ? `${trimmed.slice(0, MAX_DISPLAY_LENGTH - 1)}…` : trimmed;
		};

		if (isMultiLine) {
			const limit = expanded ? lines.length : MAX_PREVIEW_LINES;
			const previewLines = lines.slice(0, limit).map(formatLine);
			const remaining = lines.length - previewLines.length;
			const lines_ = previewLines.map((text) => ({ text }));
			if (remaining > 0 && !expanded) {
				lines_.push({ text: `(+${remaining} more lines)` });
			}
			return { lines: lines_ };
		}

		if (command.length > MAX_DISPLAY_LENGTH) {
			return { lines: [{ text: `${command.slice(0, MAX_DISPLAY_LENGTH - 1)}…` }] };
		}

		return { lines: [{ text: command }] };
	},

	formatResult: () => null,

	getBorderColor: (call): string | undefined => {
		if (call.toolCallId && isToolScrollFocused(call.toolCallId)) {
			return "#3b82f6";
		}
		return undefined;
	},

	renderBody: ({ call, result, showOutput = true, previewFocused = false }): ReactNode => {
		return (
			<BashCardBody call={call} result={result} showOutput={showOutput} previewFocused={previewFocused} />
		);
	},
};

registerToolLayout("runBash", bashLayout);

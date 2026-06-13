import { useEffect, useState, type ReactNode } from "react";
import { sessionRuntimeStore } from "../../../state/session-runtime-store";
import { COLORS } from "../../../ui/constants";
import type { ToolCall } from "../../../types";
import { BashLiveOutputView } from "../components";
import type { ToolLayoutConfig, ToolHeader, ToolBody } from "../types";
import { registerToolLayout } from "../registry";

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

// Module-level map of toolCallId -> sessionId for tool cards whose inner
// scrollbox should capture scroll events instead of letting them bubble to
// the conversation scrollbox. Clicking a card toggles its membership;
// clicking outside clears all.
const focusedScrollboxes = new Map<string, string>();
const focusListeners = new Set<() => void>();

function notifyFocusListeners(): void {
	for (const listener of focusListeners) listener();
}

function setFocused(toolCallId: string, focused: boolean, sessionId: string | null): void {
	const had = focusedScrollboxes.has(toolCallId);
	if (focused && !had) {
		// Single-focus: clear any other focused card so only one is active.
		if (focusedScrollboxes.size > 0) {
			for (const prevSession of focusedScrollboxes.values()) {
				if (prevSession) sessionRuntimeStore.requestRenderTick(prevSession);
			}
			focusedScrollboxes.clear();
		}
		focusedScrollboxes.set(toolCallId, sessionId ?? "");
		notifyFocusListeners();
	} else if (!focused && had) {
		focusedScrollboxes.delete(toolCallId);
		notifyFocusListeners();
	}
	// Trigger a re-render of the conversation so the bash card's border color
	// (computed by ToolCallView) reflects the new focus state.
	if (sessionId) sessionRuntimeStore.requestRenderTick(sessionId);
}

function clearAllFocused(): void {
	if (focusedScrollboxes.size === 0) return;
	const sessions = new Set(focusedScrollboxes.values());
	focusedScrollboxes.clear();
	notifyFocusListeners();
	for (const sessionId of sessions) {
		if (sessionId) sessionRuntimeStore.requestRenderTick(sessionId);
	}
}

export function clearBashScrollFocus(): void {
	clearAllFocused();
}

function useFocusedScrollbox(toolCallId: string | undefined): boolean {
	const [, setTick] = useState(0);
	useEffect(() => {
		const listener = () => setTick((tick) => tick + 1);
		focusListeners.add(listener);
		return () => {
			focusListeners.delete(listener);
		};
	}, []);
	return toolCallId ? focusedScrollboxes.has(toolCallId) : false;
}

function BashCardBody({
	call,
	result,
	showOutput = true,
}: {
	call: ToolCall;
	result: unknown;
	showOutput?: boolean;
}): ReactNode {
	const focused = useFocusedScrollbox(call.toolCallId);

	const body = bashLayout.getBody?.(call.input, result, call);
	const live = call.toolCallId
		? sessionRuntimeStore.getLiveOutput(call.sessionId ?? null, call.toolCallId)
		: null;
	const commandLine = body?.lines[0]?.text;

	const resultOutput =
		!live || (live.stdout.length === 0 && live.stderr.length === 0)
			? extractResultOutput(result)
			: { stdout: "", stderr: "", error: "" };

	const toggleFocus = (event: { stopPropagation: () => void }) => {
		if (call.toolCallId) setFocused(call.toolCallId, !focused, call.sessionId ?? null);
		// Claim the click so an outer "clear on outside click" handler doesn't
		// immediately undo the focus we just set.
		event.stopPropagation();
	};

	return (
		<box flexDirection="column" width="100%" onMouseDown={toggleFocus}>
			{commandLine && (
				<box flexDirection="row" paddingLeft={2} marginTop={0}>
					<text>
						<span fg={COLORS.TOOL_INPUT_TEXT}>{commandLine}</span>
					</text>
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

	formatResult: () => null,

	getBorderColor: (call): string | undefined => {
		if (call.toolCallId && focusedScrollboxes.has(call.toolCallId)) {
			return "#3b82f6";
		}
		return undefined;
	},

	renderBody: ({ call, result, showOutput = true }): ReactNode => {
		return <BashCardBody call={call} result={result} showOutput={showOutput} />;
	},
};

registerToolLayout("runBash", bashLayout);

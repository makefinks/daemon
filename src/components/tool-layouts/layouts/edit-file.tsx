import { pathToFiletype } from "@opentui/core";
import React from "react";
import { COLORS } from "../../../ui/constants";
import { registerToolLayout } from "../registry";
import type { ToolHeader, ToolLayoutConfig, ToolLayoutRenderProps } from "../types";

type UnknownRecord = Record<string, unknown>;
interface ResultDiffLine {
	type: "context" | "remove" | "add";
	text: string;
}

const MAX_LINE_CHARS = 200;

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

function extractEditCount(input: unknown): number {
	if (!isRecord(input)) return 0;
	if ("edits" in input && Array.isArray(input.edits)) {
		return input.edits.length;
	}
	return 0;
}

function extractDiffs(result: unknown): ResultDiffLine[][] {
	if (!isRecord(result)) return [];
	const raw = result.diffs;
	if (!Array.isArray(raw)) return [];
	return raw.filter(
		(block: unknown): block is ResultDiffLine[] =>
			Array.isArray(block) &&
			block.every(
				(d: unknown) =>
					isRecord(d) &&
					(d.type === "context" || d.type === "remove" || d.type === "add") &&
					typeof d.text === "string"
			)
	);
}

function diffColor(type: ResultDiffLine["type"]): string {
	switch (type) {
		case "remove":
			return COLORS.STATUS_FAILED;
		case "add":
			return COLORS.STATUS_COMPLETED;
		default:
			return COLORS.TOOL_INPUT_TEXT;
	}
}

function diffPrefix(type: ResultDiffLine["type"]): string {
	switch (type) {
		case "remove":
			return "- ";
		case "add":
			return "+ ";
		default:
			return "  ";
	}
}

function truncate(text: string): string {
	return text.length > MAX_LINE_CHARS ? `${text.slice(0, MAX_LINE_CHARS - 1)}…` : text;
}

function EditFileBody({ call, result }: ToolLayoutRenderProps) {
	if (!isRecord(result)) return null;
	if (result.success === false && typeof result.error === "string") {
		return (
			<box paddingLeft={2}>
				<text>{`error: ${result.error}`}</text>
			</box>
		);
	}
	if (result.success !== true) return null;

	const diffs = extractDiffs(result);
	if (diffs.length === 0) return null;

	return (
		<box flexDirection="column" paddingLeft={2} marginTop={0}>
			<box
				borderStyle="single"
				borderColor={COLORS.TOOL_INPUT_BORDER}
				paddingLeft={1}
				paddingRight={1}
				paddingTop={0}
				paddingBottom={0}
			>
				<box flexDirection="column">
					{diffs.map((block, blockIdx) => (
						<box key={blockIdx} flexDirection="column">
							{block.map((line, lineIdx) => (
								<box key={lineIdx} flexDirection="row" alignItems="center">
									<text>
										<span fg={diffColor(line.type)}>{`${diffPrefix(line.type)}${truncate(line.text)}`}</span>
									</text>
								</box>
							))}
							{blockIdx < diffs.length - 1 && block.length > 0 && (
								<box flexDirection="row" alignItems="center">
									<text>
										<span fg={COLORS.REASONING_DIM}>───</span>
									</text>
								</box>
							)}
						</box>
					))}
				</box>
			</box>
		</box>
	);
}

export const editFileLayout: ToolLayoutConfig = {
	abbreviation: "edit",

	getHeader: (input): ToolHeader | null => {
		const path = extractPath(input);
		if (!path) return null;
		const editCount = extractEditCount(input);
		const filetype = pathToFiletype(path);

		const parts: string[] = [];
		if (filetype) parts.push(filetype);
		if (editCount > 0) parts.push(`${editCount} edit${editCount === 1 ? "" : "s"}`);

		const secondary = parts.length > 0 ? parts.join(" · ") : undefined;
		return { primary: path, secondary, secondaryStyle: "dim" };
	},

	renderBody: EditFileBody,
};

registerToolLayout("editFile", editFileLayout);

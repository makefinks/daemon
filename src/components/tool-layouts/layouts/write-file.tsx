import { pathToFiletype } from "@opentui/core";
import React from "react";
import { COLORS, REASONING_MARKDOWN_STYLE } from "../../../ui/constants";
import { registerToolLayout } from "../registry";
import type { ToolHeader, ToolLayoutConfig, ToolLayoutRenderProps } from "../types";

type UnknownRecord = Record<string, unknown>;

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

function extractContent(input: unknown): string | null {
	if (!isRecord(input)) return null;
	if ("content" in input && typeof input.content === "string") {
		return input.content;
	}
	return null;
}

function extractAppend(input: unknown): boolean {
	if (!isRecord(input)) return false;
	if ("append" in input && typeof input.append === "boolean") {
		return input.append;
	}
	return false;
}

function WriteFileBody({ call, result }: ToolLayoutRenderProps) {
	if (!isRecord(result)) return null;
	if (result.success === false && typeof result.error === "string") {
		return (
			<box paddingLeft={2}>
				<text>
					<span fg={COLORS.STATUS_FAILED}>{`error: ${result.error}`}</span>
				</text>
			</box>
		);
	}
	if (result.success !== true) return null;

	const content = extractContent(call.input) ?? "";
	const path = extractPath(call.input) ?? "";

	// Detect filetype from path for syntax highlighting
	const filetype = pathToFiletype(path);

	// Format content preview
	let previewContent = "";
	if (content.trim()) {
		const MAX_LINES = 4;
		const MAX_CHARS = 160;
		const contentLines = content
			.split("\n")
			.slice(0, MAX_LINES)
			.map((line) => (line.length > MAX_CHARS ? `${line.slice(0, MAX_CHARS - 1)}…` : line));

		const totalLines = content.split("\n").length;
		if (totalLines > MAX_LINES) {
			contentLines.push(`... (${totalLines - MAX_LINES} more lines)`);
		}
		previewContent = contentLines.join("\n");
	} else {
		previewContent = "(empty file)";
	}

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
				<code
					content={previewContent}
					filetype={filetype}
					syntaxStyle={REASONING_MARKDOWN_STYLE}
					conceal={true}
					drawUnstyledText={false}
				/>
			</box>
		</box>
	);
}

export const writeFileLayout: ToolLayoutConfig = {
	abbreviation: "write",

	getHeader: (input): ToolHeader | null => {
		const path = extractPath(input);
		if (!path) return null;
		const append = extractAppend(input);
		const filetype = pathToFiletype(path);

		const parts: string[] = [];
		if (filetype) parts.push(filetype);
		if (append) parts.push("append");

		const secondary = parts.length > 0 ? parts.join(" · ") : undefined;
		return { primary: path, secondary, secondaryStyle: "dim" };
	},

	renderBody: WriteFileBody,
};

registerToolLayout("writeFile", writeFileLayout);

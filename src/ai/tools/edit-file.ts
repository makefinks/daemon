import fs from "node:fs";
import path from "node:path";
import { tool } from "ai";
import { z } from "zod";

const CONTEXT_LINES = 3;

interface DiffLine {
	type: "context" | "remove" | "add";
	text: string;
}

function buildContextDiff(content: string, oldText: string, newText: string, matchStart: number): DiffLine[] {
	const oldLines = oldText.split("\n");
	const newLines = newText.split("\n");
	const allLines = content.split("\n");

	const beforeText = content.slice(0, matchStart);
	const matchLineIdx = beforeText.split("\n").length - 1;

	const result: DiffLine[] = [];

	const ctxStart = Math.max(0, matchLineIdx - CONTEXT_LINES);
	for (let i = ctxStart; i < matchLineIdx; i++) {
		result.push({ type: "context", text: allLines[i] ?? "" });
	}

	for (const line of oldLines) {
		result.push({ type: "remove", text: line });
	}

	for (const line of newLines) {
		result.push({ type: "add", text: line });
	}

	const matchEndLineIdx = matchLineIdx + oldLines.length - 1;
	const ctxEnd = Math.min(allLines.length - 1, matchEndLineIdx + CONTEXT_LINES);
	for (let i = matchEndLineIdx + 1; i <= ctxEnd; i++) {
		result.push({ type: "context", text: allLines[i] ?? "" });
	}

	return result;
}

export const editFile = tool({
	description:
		"Edit a file by applying precise search/replace edits. Each edit finds the exact `oldText` in the file and replaces it with `newText`. Edits are applied sequentially — later edits operate on the file state after earlier edits. All edits must succeed for the file to be written; if any edit fails (0 matches or multiple matches), no changes are written to disk. Use this tool for granular changes instead of rewriting the entire file. For each edit, `oldText` must match exactly once in the (current) file content — copy the exact text including indentation and surrounding context to guarantee uniqueness.",
	inputSchema: z.object({
		path: z.string().describe("Path to the file to edit."),
		edits: z
			.array(
				z.object({
					oldText: z
						.string()
						.describe(
							"The exact text to search for. Must appear exactly once in the current file content. Include surrounding context (e.g. adjacent lines) to ensure uniqueness and avoid ambiguity."
						),
					newText: z.string().describe("The replacement text."),
				})
			)
			.describe("Array of search/replace edits applied sequentially."),
	}),
	execute: async ({ path: filePath, edits }) => {
		const resolvedPath = path.resolve(filePath);

		let content: string;
		try {
			content = fs.readFileSync(resolvedPath, "utf8");
		} catch (error: unknown) {
			const err = error instanceof Error ? error : new Error(String(error));
			return {
				success: false,
				path: resolvedPath,
				error: `Failed to read file: ${err.message}`,
			};
		}

		const appliedEdits: Array<{ oldText: string; newText: string }> = [];
		const diffs: DiffLine[][] = [];

		for (let i = 0; i < edits.length; i++) {
			const edit = edits[i];
			if (!edit) continue;

			const { oldText, newText } = edit;

			const firstIndex = content.indexOf(oldText);
			const lastIndex = content.lastIndexOf(oldText);

			if (firstIndex === -1) {
				return {
					success: false,
					path: resolvedPath,
					editIndex: i,
					editsAttempted: i + 1,
					appliedEdits,
					diffs,
					error: `Edit ${i + 1} failed: text not found in file. Provide the exact text to match, including whitespace and surrounding context.`,
				};
			}

			if (firstIndex !== lastIndex) {
				return {
					success: false,
					path: resolvedPath,
					editIndex: i,
					editsAttempted: i + 1,
					appliedEdits,
					diffs,
					error: `Edit ${i + 1} failed: text matches multiple times (${content.split(oldText).length - 1} occurrences). Include more surrounding context in oldText to make the match unique.`,
				};
			}

			diffs.push(buildContextDiff(content, oldText, newText, firstIndex));

			content = content.slice(0, firstIndex) + newText + content.slice(firstIndex + oldText.length);

			appliedEdits.push({ oldText, newText });
		}

		try {
			fs.writeFileSync(resolvedPath, content, "utf8");
		} catch (error: unknown) {
			const err = error instanceof Error ? error : new Error(String(error));
			return {
				success: false,
				path: resolvedPath,
				editsAttempted: edits.length,
				appliedEdits,
				diffs,
				error: `Failed to write file after applying ${appliedEdits.length} edit(s): ${err.message}`,
			};
		}

		return {
			success: true,
			path: resolvedPath,
			editsApplied: appliedEdits.length,
			diffs,
		};
	},
});

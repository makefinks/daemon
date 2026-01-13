import { tool } from "ai";
import { z } from "zod";
import fs from "node:fs";
import readline from "node:readline";

const DEFAULT_LINE_LIMIT = 2000;
const MAX_LINE_LIMIT = 2000;

export const readFile = tool({
	description:
		"Read a local text file. By default, reads up to 2000 lines from the start when no offset/limit are provided. Use offset+limit together only for partial reads when needed.",
	inputSchema: z.object({
		path: z.string().describe("Path to the file to read."),
		lineOffset: z
			.number()
			.int()
			.min(0)
			.optional()
			.describe("0-based line offset to start reading from (for partial reads)."),
		lineLimit: z
			.number()
			.int()
			.min(1)
			.max(MAX_LINE_LIMIT)
			.optional()
			.describe(`Maximum number of lines to read (max ${MAX_LINE_LIMIT}).`),
	}),
	execute: async ({ path, lineOffset, lineLimit }) => {
		try {
			const hasOffset = typeof lineOffset === "number";
			const hasLimit = typeof lineLimit === "number";
			if ((hasOffset && !hasLimit) || (!hasOffset && hasLimit)) {
				return {
					success: false,
					path,
					lineOffset,
					lineLimit,
					error:
						"Provide both lineOffset and lineLimit for partial reads, or omit both to read from the start.",
				};
			}

			const effectiveOffset = hasOffset ? lineOffset : 0;
			const effectiveLimit = hasLimit ? lineLimit : DEFAULT_LINE_LIMIT;
			const usedDefault = !hasOffset && !hasLimit;

			const lines: string[] = [];
			let lineNumber = 0;
			let hasMore = false;
			const targetEnd = effectiveOffset + effectiveLimit;

			const stream = fs.createReadStream(path, { encoding: "utf8" });
			const rl = readline.createInterface({
				input: stream,
				crlfDelay: Infinity,
			});

			for await (const line of rl) {
				if (lineNumber >= effectiveOffset && lineNumber < targetEnd) {
					lines.push(line);
				}
				lineNumber += 1;
				if (lineNumber > targetEnd) {
					hasMore = true;
					break;
				}
			}

			if (hasMore) {
				rl.close();
				stream.destroy();
			}

			const startLine = lines.length > 0 ? effectiveOffset + 1 : 0;
			const endLine = lines.length > 0 ? effectiveOffset + lines.length : 0;

			return {
				success: true,
				path,
				lineOffset: effectiveOffset,
				lineLimit: effectiveLimit,
				usedDefault,
				startLine,
				endLine,
				hasMore,
				lines,
				content: lines.join("\n"),
			};
		} catch (error: unknown) {
			const err = error instanceof Error ? error : new Error(String(error));
			return {
				success: false,
				path,
				lineOffset,
				lineLimit,
				error: err.message,
			};
		}
	},
});

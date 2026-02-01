import fs from "node:fs";
import path from "node:path";
import { tool } from "ai";
import { z } from "zod";

export const writeFile = tool({
	description:
		"Write content to a file. Creates the file if it doesn't exist, or overwrites it if it does. Supports append mode to add content to existing files. Use this to create scripts, save outputs, write configuration files, or generate any text-based file.",
	inputSchema: z.object({
		path: z
			.string()
			.describe("Path to the file to write. Can be absolute or relative to the current working directory."),
		content: z.string().describe("The content to write to the file."),
		append: z
			.boolean()
			.optional()
			.default(false)
			.describe("If true, append to the file instead of overwriting. Creates the file if it doesn't exist."),
	}),
	execute: async ({ path: filePath, content, append }) => {
		try {
			const resolvedPath = path.resolve(filePath);
			const dir = path.dirname(resolvedPath);

			// Create parent directories if they don't exist
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}

			// Write or append to the file
			if (append) {
				fs.appendFileSync(resolvedPath, content, "utf8");
			} else {
				fs.writeFileSync(resolvedPath, content, "utf8");
			}

			return {
				success: true,
				path: resolvedPath,
				bytesWritten: Buffer.byteLength(content, "utf8"),
			};
		} catch (error: unknown) {
			const err = error instanceof Error ? error : new Error(String(error));
			return {
				success: false,
				path: filePath,
				error: err.message,
			};
		}
	},
});

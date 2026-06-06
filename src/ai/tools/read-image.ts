import fs from "node:fs/promises";
import path from "node:path";

import { tool } from "ai";
import { z } from "zod";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const IMAGE_MEDIA_TYPES: Record<string, string> = {
	".gif": "image/gif",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".png": "image/png",
	".webp": "image/webp",
};

interface ReadImageSuccess {
	success: true;
	path: string;
	mediaType: string;
	sizeBytes: number;
	filename: string;
}

interface ReadImageFailure {
	success: false;
	path: string;
	error: string;
}

type ReadImageResult = ReadImageSuccess | ReadImageFailure;

function getImageMediaType(filePath: string): string | null {
	return IMAGE_MEDIA_TYPES[path.extname(filePath).toLowerCase()] ?? null;
}

export const readImage = tool({
	description:
		"Read a local image file and provide its visual content to the model. Supports PNG, JPEG, WebP, and GIF images up to 10 MB.",
	inputSchema: z.object({
		path: z.string().describe("Path to the local image file to read."),
	}),
	execute: async ({ path: imagePath }): Promise<ReadImageResult> => {
		const resolvedPath = path.resolve(imagePath);
		try {
			const mediaType = getImageMediaType(resolvedPath);
			if (!mediaType) {
				return {
					success: false,
					path: resolvedPath,
					error: "Unsupported image type. Supported extensions: .png, .jpg, .jpeg, .webp, .gif.",
				};
			}

			const stat = await fs.stat(resolvedPath);
			if (!stat.isFile()) {
				return { success: false, path: resolvedPath, error: "Path is not a file." };
			}
			if (stat.size > MAX_IMAGE_BYTES) {
				return {
					success: false,
					path: resolvedPath,
					error: `Image is too large (${stat.size} bytes). Maximum size is ${MAX_IMAGE_BYTES} bytes.`,
				};
			}

			return {
				success: true,
				path: resolvedPath,
				mediaType,
				sizeBytes: stat.size,
				filename: path.basename(resolvedPath),
			};
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			return { success: false, path: resolvedPath, error: err.message };
		}
	},
	toModelOutput: async ({ output }) => {
		const result = output as ReadImageResult;
		if (!result.success) {
			return { type: "error-text", value: result.error };
		}

		const data = await fs.readFile(result.path, "base64");
		return {
			type: "content",
			value: [
				{
					type: "text",
					text: `Loaded image ${result.filename} (${result.mediaType}, ${result.sizeBytes} bytes).`,
				},
				{
					type: "image-data",
					data,
					mediaType: result.mediaType,
				},
			],
		};
	},
});

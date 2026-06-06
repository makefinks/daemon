import type { ToolLayoutConfig, ToolHeader } from "../types";
import { registerToolLayout } from "../registry";

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

function formatReadImageResult(result: unknown): string[] | null {
	if (!isRecord(result)) return null;
	if (result.success === false && typeof result.error === "string") {
		return [`error: ${result.error}`];
	}
	if (result.success !== true) return null;
	const filePath = typeof result.path === "string" ? result.path : "image";
	const mediaType = typeof result.mediaType === "string" ? result.mediaType : "image";
	const sizeBytes = typeof result.sizeBytes === "number" ? result.sizeBytes : 0;
	const filename = typeof result.filename === "string" ? result.filename : "";

	const sizeStr = sizeBytes > 0 ? ` (${formatBytes(sizeBytes)})` : "";
	return [`${filename}${sizeStr} · ${mediaType}`, filePath];
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const readImageLayout: ToolLayoutConfig = {
	abbreviation: "img",

	getHeader: (input): ToolHeader | null => {
		const path = extractPath(input);
		if (!path) return null;
		return { primary: path };
	},

	formatResult: formatReadImageResult,
};

registerToolLayout("readImage", readImageLayout);

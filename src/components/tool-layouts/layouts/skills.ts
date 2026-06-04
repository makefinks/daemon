import { registerToolLayout } from "../registry";
import type { ToolHeader, ToolLayoutConfig } from "../types";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: UnknownRecord, key: string): string | null {
	const value = record[key];
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function getLoadSkillHeader(input: unknown, result?: unknown): ToolHeader | null {
	if (isRecord(input)) {
		const name = readString(input, "name");
		if (name) return { primary: name };
	}
	if (isRecord(result)) {
		const name = readString(result, "name");
		if (name) return { primary: name };
	}
	return null;
}

function getLoadSkillResourceHeader(input: unknown, result?: unknown): ToolHeader | null {
	const source = isRecord(input) ? input : isRecord(result) ? result : null;
	if (!source) return null;

	const skillName = readString(source, "skillName");
	const resourcePath = readString(source, "path");
	if (!skillName && !resourcePath) return null;
	return {
		primary: resourcePath ?? undefined,
		secondary: skillName ? `from ${skillName}` : undefined,
	};
}

function formatLoadSkillResult(result: unknown): string[] | null {
	if (!isRecord(result)) return null;
	if (result.success === false && typeof result.error === "string") {
		return [`error: ${result.error}`];
	}
	if (result.success !== true) return null;

	const name = readString(result, "name") ?? "skill";
	const description = readString(result, "description");
	const resources = isRecord(result.resources) ? result.resources : {};
	const references = Array.isArray(resources.references) ? resources.references.length : 0;
	const scripts = Array.isArray(resources.scripts) ? resources.scripts.length : 0;
	const assets = Array.isArray(resources.assets) ? resources.assets.length : 0;

	const lines = [`loaded ${name}`];
	if (description) lines.push(description);
	const resourceSummary = [`${references} references`, `${scripts} scripts`, `${assets} assets`].join(", ");
	lines.push(resourceSummary);
	return lines;
}

function formatLoadSkillResourceResult(result: unknown): string[] | null {
	if (!isRecord(result)) return null;
	if (result.success === false && typeof result.error === "string") {
		return [`error: ${result.error}`];
	}
	if (result.success !== true) return null;

	const path = readString(result, "path") ?? readString(result, "resolvedPath") ?? "resource";
	const content = readString(result, "content");
	if (!content) return [path];

	const MAX_LINES = 3;
	const MAX_CHARS = 140;
	const lines = content
		.split("\n")
		.map((line) => line.trimEnd())
		.filter((line) => line.length > 0)
		.slice(0, MAX_LINES)
		.map((line) => (line.length > MAX_CHARS ? `${line.slice(0, MAX_CHARS - 1)}…` : line));

	return [`${path}:`, ...lines];
}

export const loadSkillLayout: ToolLayoutConfig = {
	abbreviation: "skill",
	getHeader: getLoadSkillHeader,
	formatResult: formatLoadSkillResult,
};

export const loadSkillResourceLayout: ToolLayoutConfig = {
	abbreviation: "skillres",
	getHeader: getLoadSkillResourceHeader,
	formatResult: formatLoadSkillResourceResult,
};

registerToolLayout("loadSkill", loadSkillLayout);
registerToolLayout("loadSkillResource", loadSkillResourceLayout);

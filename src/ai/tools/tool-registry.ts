import type { ToolSet } from "ai";

import { backgroundJobs } from "./background-jobs";
import { codeSearch } from "./code-search";
import { fetchUrls } from "./fetch-urls";
import { groundingManager } from "./grounding-manager";
import { loadSkill } from "./load-skill";
import { loadSkillResource } from "./load-skill-resource";
import { readFile } from "./read-file";
import { readImage } from "./read-image";
import { runBash } from "./run-bash";
import { subagent } from "./subagents";
import { todoManager } from "./todo-manager";
import { webSearch } from "./web-search";
import { editFile } from "./edit-file";
import { writeFile } from "./write-file";

import { getModelProvider, getResponseModel } from "../model-config";
import { getProviderCapabilities } from "../providers/capabilities";
import { getModelMetadataForProvider } from "../../utils/model-metadata";
import type { ToolToggleId, ToolToggles } from "../../types";

export type ToolId = ToolToggleId;

export interface ToolAvailabilityStatus {
	enabled: boolean;
	envAvailable: boolean;
	disabledReason?: string;
}

export type ToolAvailabilityMap = Record<ToolId, ToolAvailabilityStatus>;

type ToolEntry = {
	id: ToolId;
	tool: ToolSet[keyof ToolSet];
	toggleKey: ToolToggleId;
	gate?: (context: ToolGateContext) => Promise<ToolGateResult>;
};

type ToolGateContext = {
	toggles: ToolToggles;
};

type ToolGateResult = {
	envAvailable: boolean;
	disabledReason?: string;
};

export const TOOL_REGISTRY: ToolEntry[] = [
	{ id: "readFile", toggleKey: "readFile", tool: readFile },
	{ id: "readImage", toggleKey: "readImage", tool: readImage, gate: gateImageToolOutput },
	{ id: "writeFile", toggleKey: "writeFile", tool: writeFile },
	{ id: "editFile", toggleKey: "editFile", tool: editFile },
	{ id: "runBash", toggleKey: "runBash", tool: runBash },
	{ id: "backgroundJobs", toggleKey: "backgroundJobs", tool: backgroundJobs },
	{ id: "loadSkill", toggleKey: "loadSkill", tool: loadSkill },
	{ id: "loadSkillResource", toggleKey: "loadSkillResource", tool: loadSkillResource },
	{ id: "webSearch", toggleKey: "webSearch", tool: webSearch, gate: gateExa },
	{ id: "fetchUrls", toggleKey: "fetchUrls", tool: fetchUrls, gate: gateExa },
	{ id: "codeSearch", toggleKey: "codeSearch", tool: codeSearch, gate: gateExa },
	{ id: "todoManager", toggleKey: "todoManager", tool: todoManager },
	{ id: "groundingManager", toggleKey: "groundingManager", tool: groundingManager },
	{ id: "subagent", toggleKey: "subagent", tool: subagent, gate: gateSubagent },
];

function gateExa(): Promise<ToolGateResult> {
	const hasKey = Boolean(process.env.EXA_API_KEY);
	return Promise.resolve({
		envAvailable: hasKey,
		disabledReason: hasKey ? undefined : "EXA_API_KEY not configured",
	});
}

function gateSubagent(): Promise<ToolGateResult> {
	const capabilities = getProviderCapabilities();
	if (!capabilities.supportsSubagentTool) {
		return Promise.resolve({
			envAvailable: false,
			disabledReason: "Subagent tool is unavailable for the current model provider.",
		});
	}

	return Promise.resolve({
		envAvailable: true,
	});
}

async function gateImageToolOutput(): Promise<ToolGateResult> {
	const capabilities = getProviderCapabilities();
	if (!capabilities.supportsImageToolOutput) {
		return {
			envAvailable: false,
			disabledReason: "Image reading is unavailable for the current model provider.",
		};
	}

	const provider = getModelProvider();
	if (provider === "openrouter") {
		const metadata = await getModelMetadataForProvider(getResponseModel(), provider);
		if (metadata?.supportsVision !== true) {
			return {
				envAvailable: false,
				disabledReason: "Image reading is unavailable for the current OpenRouter model.",
			};
		}
	}

	return {
		envAvailable: true,
	};
}

function normalizeToggles(toggles?: ToolToggles): ToolToggles {
	return {
		readFile: toggles?.readFile ?? true,
		readImage: toggles?.readImage ?? true,
		writeFile: toggles?.writeFile ?? true,
		editFile: toggles?.editFile ?? true,
		runBash: toggles?.runBash ?? true,
		backgroundJobs: toggles?.backgroundJobs ?? true,
		loadSkill: toggles?.loadSkill ?? true,
		loadSkillResource: toggles?.loadSkillResource ?? true,
		webSearch: toggles?.webSearch ?? true,
		fetchUrls: toggles?.fetchUrls ?? true,
		codeSearch: toggles?.codeSearch ?? true,
		todoManager: toggles?.todoManager ?? true,
		groundingManager: toggles?.groundingManager ?? true,
		subagent: toggles?.subagent ?? true,
	};
}

function selectRegistryTools(only: ToolId[] | null): ToolEntry[] {
	if (!only) return TOOL_REGISTRY;
	return TOOL_REGISTRY.filter((entry) => only.includes(entry.id));
}

function omitRegistryTools(omit: ToolId[] | null): ToolEntry[] {
	if (!omit) return TOOL_REGISTRY;
	return TOOL_REGISTRY.filter((entry) => !omit.includes(entry.id));
}

export interface BuildToolsOptions {
	only?: ToolId[];
	omit?: ToolId[];
}

export async function resolveToolAvailability(
	toggles: ToolToggles,
	options: BuildToolsOptions = {}
): Promise<ToolAvailabilityMap> {
	const normalizedToggles = normalizeToggles(toggles);
	const entries = options.only ? selectRegistryTools(options.only) : omitRegistryTools(options.omit ?? null);
	const results: ToolAvailabilityMap = {} as ToolAvailabilityMap;

	for (const entry of entries) {
		const toggleEnabled = Boolean(normalizedToggles[entry.toggleKey]);
		const gateResult = entry.gate ? await entry.gate({ toggles: normalizedToggles }) : { envAvailable: true };
		results[entry.id] = {
			enabled: toggleEnabled && gateResult.envAvailable,
			envAvailable: gateResult.envAvailable,
			disabledReason: gateResult.disabledReason,
		};
	}

	return results;
}

export function buildMenuItems(availability: ToolAvailabilityMap): Record<
	ToolId,
	{
		id: ToolId;
		label: string;
		envAvailable: boolean;
		disabledReason?: string;
	}
> {
	const labels = getToolLabels();
	const ordered = getDefaultToolOrder();
	const entries = ordered.map((id) => {
		const status = availability[id];
		return {
			id,
			label: labels[id],
			envAvailable: status?.envAvailable ?? true,
			disabledReason: status?.disabledReason,
		};
	});

	return Object.fromEntries(entries.map((entry) => [entry.id, entry])) as Record<
		ToolId,
		{
			id: ToolId;
			label: string;
			envAvailable: boolean;
			disabledReason?: string;
		}
	>;
}

export async function buildToolSet(
	toggles: ToolToggles,
	options: BuildToolsOptions = {}
): Promise<{ tools: ToolSet; availability: ToolAvailabilityMap }> {
	const availability = await resolveToolAvailability(toggles, options);
	const entries = options.only ? selectRegistryTools(options.only) : omitRegistryTools(options.omit ?? null);
	const tools: ToolSet = {};

	for (const entry of entries) {
		const status = availability[entry.id];
		if (!status?.enabled) continue;
		(tools as ToolSet & Record<ToolId, ToolSet[keyof ToolSet]>)[entry.id] = entry.tool;
	}

	return { tools, availability };
}

export function getToolLabels(): Record<ToolId, string> {
	return {
		readFile: "readFile",
		readImage: "readImage",
		writeFile: "writeFile",
		editFile: "editFile",
		runBash: "runBash",
		backgroundJobs: "backgroundJobs",
		loadSkill: "loadSkill",
		loadSkillResource: "loadSkillResource",
		webSearch: "webSearch",
		fetchUrls: "fetchUrls",
		codeSearch: "codeSearch",
		todoManager: "todoManager",
		groundingManager: "groundingManager",
		subagent: "subagent",
	};
}

export function getDefaultToolOrder(): ToolId[] {
	return [
		"readFile",
		"readImage",
		"writeFile",
		"editFile",
		"runBash",
		"backgroundJobs",
		"loadSkill",
		"loadSkillResource",
		"webSearch",
		"fetchUrls",
		"codeSearch",
		"todoManager",
		"groundingManager",
		"subagent",
	];
}

export function createToolAvailabilitySnapshot(availability: ToolAvailabilityMap): Record<ToolId, boolean> {
	return {
		readFile: availability.readFile?.enabled ?? false,
		readImage: availability.readImage?.enabled ?? false,
		writeFile: availability.writeFile?.enabled ?? false,
		editFile: availability.editFile?.enabled ?? false,
		runBash: availability.runBash?.enabled ?? false,
		backgroundJobs: availability.backgroundJobs?.enabled ?? false,
		loadSkill: availability.loadSkill?.enabled ?? false,
		loadSkillResource: availability.loadSkillResource?.enabled ?? false,
		webSearch: availability.webSearch?.enabled ?? false,
		fetchUrls: availability.fetchUrls?.enabled ?? false,
		codeSearch: availability.codeSearch?.enabled ?? false,
		todoManager: availability.todoManager?.enabled ?? false,
		groundingManager: availability.groundingManager?.enabled ?? false,
		subagent: availability.subagent?.enabled ?? false,
	};
}

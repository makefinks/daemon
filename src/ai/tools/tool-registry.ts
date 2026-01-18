import type { ToolSet } from "ai";

import { fetchUrls } from "./fetch-urls";
import { groundingManager } from "./grounding-manager";
import { readFile } from "./read-file";
import { renderUrl } from "./render-url";
import { runBash } from "./run-bash";
import { subagent } from "./subagents";
import { todoManager } from "./todo-manager";
import { webSearch } from "./web-search";

import type { ToolToggleId, ToolToggles } from "../../types";
import { detectLocalPlaywrightChromium } from "../../utils/js-rendering";

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

const TOOL_REGISTRY: ToolEntry[] = [
	{ id: "readFile", toggleKey: "readFile", tool: readFile },
	{ id: "runBash", toggleKey: "runBash", tool: runBash },
	{ id: "webSearch", toggleKey: "webSearch", tool: webSearch, gate: gateExa },
	{ id: "fetchUrls", toggleKey: "fetchUrls", tool: fetchUrls, gate: gateExa },
	{ id: "renderUrl", toggleKey: "renderUrl", tool: renderUrl, gate: gateRenderUrl },
	{ id: "todoManager", toggleKey: "todoManager", tool: todoManager },
	{ id: "groundingManager", toggleKey: "groundingManager", tool: groundingManager },
	{ id: "subagent", toggleKey: "subagent", tool: subagent },
];

function gateExa(): Promise<ToolGateResult> {
	const hasKey = Boolean(process.env.EXA_API_KEY);
	return Promise.resolve({
		envAvailable: hasKey,
		disabledReason: hasKey ? undefined : "EXA_API_KEY not configured",
	});
}

async function gateRenderUrl(): Promise<ToolGateResult> {
	const capability = await detectLocalPlaywrightChromium();
	return {
		envAvailable: capability.available,
		disabledReason: capability.available ? undefined : capability.reason,
	};
}

function normalizeToggles(toggles?: ToolToggles): ToolToggles {
	return {
		readFile: toggles?.readFile ?? true,
		runBash: toggles?.runBash ?? true,
		webSearch: toggles?.webSearch ?? true,
		fetchUrls: toggles?.fetchUrls ?? true,
		renderUrl: toggles?.renderUrl ?? true,
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
		runBash: "runBash",
		webSearch: "webSearch",
		fetchUrls: "fetchUrls",
		renderUrl: "renderUrl",
		todoManager: "todoManager",
		groundingManager: "groundingManager",
		subagent: "subagent",
	};
}

export function getDefaultToolOrder(): ToolId[] {
	return [
		"readFile",
		"runBash",
		"webSearch",
		"fetchUrls",
		"renderUrl",
		"todoManager",
		"groundingManager",
		"subagent",
	];
}

export function createToolAvailabilitySnapshot(availability: ToolAvailabilityMap): Record<ToolId, boolean> {
	return {
		readFile: availability.readFile?.enabled ?? false,
		runBash: availability.runBash?.enabled ?? false,
		webSearch: availability.webSearch?.enabled ?? false,
		fetchUrls: availability.fetchUrls?.enabled ?? false,
		renderUrl: availability.renderUrl?.enabled ?? false,
		todoManager: availability.todoManager?.enabled ?? false,
		groundingManager: availability.groundingManager?.enabled ?? false,
		subagent: availability.subagent?.enabled ?? false,
	};
}

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { getAppConfigDir } from "./preferences";

const CONFIG_FILE = "config.json";

export type McpTransportType = "http" | "sse";

export interface McpServerConfig {
	/** Optional stable id. If omitted, derived from URL. */
	id?: string;
	/** Transport type for the MCP server. */
	type: McpTransportType;
	/** MCP endpoint URL. */
	url: string;
}

export interface ManualConfig {
	memoryModel?: string;
	mcpServers?: McpServerConfig[];
}

let cachedConfig: ManualConfig | null = null;
let configLoadedAt: number | null = null;

const CACHE_TTL_MS = 5000;

function getConfigPath(): string {
	return path.join(getAppConfigDir(), CONFIG_FILE);
}

export function getManualConfigPath(): string {
	return getConfigPath();
}

export function loadManualConfig(): ManualConfig {
	const now = Date.now();

	if (cachedConfig !== null && configLoadedAt !== null && now - configLoadedAt < CACHE_TTL_MS) {
		return cachedConfig;
	}

	const configPath = getConfigPath();

	if (!existsSync(configPath)) {
		cachedConfig = {};
		configLoadedAt = now;
		return cachedConfig;
	}

	try {
		const contents = readFileSync(configPath, "utf8");
		const parsed = JSON.parse(contents) as unknown;

		if (typeof parsed !== "object" || parsed === null) {
			cachedConfig = {};
		} else {
			cachedConfig = parseManualConfig(parsed as Record<string, unknown>);
		}
	} catch {
		cachedConfig = {};
	}

	configLoadedAt = now;
	return cachedConfig;
}

function parseManualConfig(raw: Record<string, unknown>): ManualConfig {
	const config: ManualConfig = {};

	if (typeof raw.memoryModel === "string" && raw.memoryModel.trim().length > 0) {
		config.memoryModel = raw.memoryModel.trim();
	}

	if (Array.isArray(raw.mcpServers)) {
		const servers: McpServerConfig[] = [];
		for (const entry of raw.mcpServers) {
			if (typeof entry !== "object" || entry === null) continue;
			const obj = entry as Record<string, unknown>;
			const type = obj.type;
			const url = obj.url;
			if (type !== "http" && type !== "sse") continue;
			if (typeof url !== "string" || url.trim().length === 0) continue;
			const id = typeof obj.id === "string" && obj.id.trim().length > 0 ? obj.id.trim() : undefined;
			servers.push({ id, type, url: url.trim() });
		}
		if (servers.length > 0) {
			config.mcpServers = servers;
		}
	}

	return config;
}

export function clearConfigCache(): void {
	cachedConfig = null;
	configLoadedAt = null;
}

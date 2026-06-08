import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { getAppConfigDir } from "./preferences";

const CONFIG_FILE = "config.json";

export type McpTransportType = "http" | "sse" | "stdio";

export interface McpServerConfig {
	/** Optional stable id. If omitted, derived from URL. */
	id?: string;
	/** Transport type for the MCP server. */
	type: McpTransportType;
	/** MCP endpoint URL. */
	url?: string;
	/** Command to spawn for stdio MCP servers. */
	command?: string;
	/** Arguments passed to the stdio command. */
	args?: string[];
	/** Working directory for stdio MCP servers. */
	cwd?: string;
	/** Extra environment variables for stdio MCP servers. */
	env?: Record<string, string>;
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
			if (type !== "http" && type !== "sse" && type !== "stdio") continue;
			const id = typeof obj.id === "string" && obj.id.trim().length > 0 ? obj.id.trim() : undefined;

			if (type === "stdio") {
				const command =
					typeof obj.command === "string" && obj.command.trim().length > 0 ? obj.command.trim() : null;
				if (!command) continue;
				const args = Array.isArray(obj.args)
					? obj.args.filter((arg): arg is string => typeof arg === "string")
					: undefined;
				const cwd = typeof obj.cwd === "string" && obj.cwd.trim().length > 0 ? obj.cwd.trim() : undefined;
				const env = parseStringRecord(obj.env);
				servers.push({ id, type, command, args, cwd, env });
				continue;
			}

			const url = obj.url;
			if (typeof url !== "string" || url.trim().length === 0) continue;
			servers.push({ id, type, url: url.trim() });
		}
		if (servers.length > 0) {
			config.mcpServers = servers;
		}
	}

	return config;
}

function parseStringRecord(raw: unknown): Record<string, string> | undefined {
	if (typeof raw !== "object" || raw === null) return undefined;
	const out: Record<string, string> = {};
	for (const [key, value] of Object.entries(raw)) {
		if (typeof value === "string") out[key] = value;
	}
	return out;
}

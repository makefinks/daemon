import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { getAppConfigDir } from "./preferences";

const CONFIG_FILE = "config.json";

export interface ManualConfig {
	memoryModel?: string;
}

let cachedConfig: ManualConfig | null = null;
let configLoadedAt: number | null = null;

const CACHE_TTL_MS = 5000;

function getConfigPath(): string {
	return path.join(getAppConfigDir(), CONFIG_FILE);
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

	return config;
}

export function clearConfigCache(): void {
	cachedConfig = null;
	configLoadedAt = null;
}

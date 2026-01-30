/**
 * Preferences persistence for DAEMON.
 * Stores user configuration in OS-appropriate config directories.
 */

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AppPreferences } from "../types";

const PREFERENCES_VERSION = 1;
const APP_DIR_NAME = "daemon";
const PREFERENCES_FILE = "preferences.json";
const CREDENTIALS_FILE = "credentials.json";
const CONFIG_DIR_ENV = "DAEMON_CONFIG_DIR";

/** Keys that belong in credentials.json (secrets) vs preferences.json (settings) */
const CREDENTIAL_KEYS = ["openRouterApiKey", "openAiApiKey", "exaApiKey"] as const;
type CredentialKey = (typeof CREDENTIAL_KEYS)[number];

function isCredentialKey(key: string): key is CredentialKey {
	return CREDENTIAL_KEYS.includes(key as CredentialKey);
}

function getBaseConfigDir(): string {
	if (process.platform === "win32") {
		return process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
	}
	if (process.platform === "darwin") {
		return path.join(os.homedir(), ".config");
	}
	return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
}

export function getAppConfigDir(): string {
	const override = process.env[CONFIG_DIR_ENV]?.trim();
	if (override) return override;
	return path.join(getBaseConfigDir(), APP_DIR_NAME);
}

export function getPreferencesPath(): string {
	return path.join(getAppConfigDir(), PREFERENCES_FILE);
}

export function getCredentialsPath(): string {
	return path.join(getAppConfigDir(), CREDENTIALS_FILE);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

export function parsePreferences(raw: unknown): AppPreferences | null {
	if (!isRecord(raw)) return null;

	const version = typeof raw.version === "number" ? raw.version : PREFERENCES_VERSION;
	const createdAt = typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString();
	const updatedAt = typeof raw.updatedAt === "string" ? raw.updatedAt : createdAt;
	const onboardingCompleted = typeof raw.onboardingCompleted === "boolean" ? raw.onboardingCompleted : false;

	const prefs: AppPreferences = {
		version,
		createdAt,
		updatedAt,
		onboardingCompleted,
	};

	if (typeof raw.audioDeviceName === "string") {
		prefs.audioDeviceName = raw.audioDeviceName;
	}
	if (typeof raw.audioOutputDeviceName === "string") {
		prefs.audioOutputDeviceName = raw.audioOutputDeviceName;
	}
	if (typeof raw.modelId === "string") {
		prefs.modelId = raw.modelId;
	}
	if (typeof raw.openRouterProviderTag === "string") {
		prefs.openRouterProviderTag = raw.openRouterProviderTag;
	}
	if (raw.interactionMode === "text" || raw.interactionMode === "voice") {
		prefs.interactionMode = raw.interactionMode;
	}
	if (raw.voiceInteractionType === "direct" || raw.voiceInteractionType === "review") {
		prefs.voiceInteractionType = raw.voiceInteractionType;
	} else {
		prefs.voiceInteractionType = "direct";
	}
	if (
		raw.speechSpeed === 1.0 ||
		raw.speechSpeed === 1.25 ||
		raw.speechSpeed === 1.5 ||
		raw.speechSpeed === 1.75 ||
		raw.speechSpeed === 2.0
	) {
		prefs.speechSpeed = raw.speechSpeed;
	}
	if (raw.reasoningEffort === "low" || raw.reasoningEffort === "medium" || raw.reasoningEffort === "high") {
		prefs.reasoningEffort = raw.reasoningEffort;
	}
	if (typeof raw.openRouterApiKey === "string") {
		prefs.openRouterApiKey = raw.openRouterApiKey;
	}
	if (typeof raw.openAiApiKey === "string") {
		prefs.openAiApiKey = raw.openAiApiKey;
	}
	if (typeof raw.exaApiKey === "string") {
		prefs.exaApiKey = raw.exaApiKey;
	}
	if (typeof raw.showFullReasoning === "boolean") {
		prefs.showFullReasoning = raw.showFullReasoning;
	}
	if (typeof raw.showToolOutput === "boolean") {
		prefs.showToolOutput = raw.showToolOutput;
	}
	if (typeof raw.memoryEnabled === "boolean") {
		prefs.memoryEnabled = raw.memoryEnabled;
	}
	if (isRecord(raw.toolToggles)) {
		const record = raw.toolToggles;
		const next: Record<string, boolean> = {};
		for (const [k, v] of Object.entries(record)) {
			if (typeof v === "boolean") {
				next[k] = v;
			}
		}
		prefs.toolToggles = next as AppPreferences["toolToggles"];
	}
	if (
		raw.bashApprovalLevel === "none" ||
		raw.bashApprovalLevel === "dangerous" ||
		raw.bashApprovalLevel === "all"
	) {
		prefs.bashApprovalLevel = raw.bashApprovalLevel;
	}
	if (Array.isArray(raw.inputHistory)) {
		const validHistory = raw.inputHistory.filter((item): item is string => typeof item === "string");
		prefs.inputHistory = validHistory.slice(0, 20);
	}

	return prefs;
}

export async function loadPreferences(): Promise<AppPreferences | null> {
	try {
		const prefsPath = getPreferencesPath();
		const credsPath = getCredentialsPath();

		let prefsRaw: unknown = {};
		let credsRaw: unknown = {};

		try {
			const prefsContents = await fs.readFile(prefsPath, "utf8");
			prefsRaw = JSON.parse(prefsContents) as unknown;
		} catch {}

		try {
			const credsContents = await fs.readFile(credsPath, "utf8");
			credsRaw = JSON.parse(credsContents) as unknown;
		} catch {}

		const merged = {
			...(isRecord(prefsRaw) ? prefsRaw : {}),
			...(isRecord(credsRaw) ? credsRaw : {}),
		};

		if (Object.keys(merged).length === 0) {
			return null;
		}

		return parsePreferences(merged);
	} catch {
		return null;
	}
}

async function writeJsonFile(filePath: string, data: Record<string, unknown>, mode?: number): Promise<void> {
	const dir = path.dirname(filePath);
	await fs.mkdir(dir, { recursive: true });

	const tempPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
	const payload = JSON.stringify(data, null, 2);

	await fs.writeFile(tempPath, payload, { encoding: "utf8", mode: mode ?? 0o644 });
	await fs.rename(tempPath, filePath);

	if (mode !== undefined) {
		await fs.chmod(filePath, mode);
	}
}

export async function savePreferences(preferences: AppPreferences): Promise<void> {
	const prefsPath = getPreferencesPath();
	const credsPath = getCredentialsPath();

	const prefsData: Record<string, unknown> = {};
	const credsData: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(preferences)) {
		if (value === undefined) continue;
		if (isCredentialKey(key)) {
			credsData[key] = value;
		} else {
			prefsData[key] = value;
		}
	}

	await writeJsonFile(prefsPath, prefsData);

	if (Object.keys(credsData).length > 0) {
		await writeJsonFile(credsPath, credsData, 0o600);
	}
}

export async function updatePreferences(updates: Partial<AppPreferences>): Promise<AppPreferences> {
	const existing = await loadPreferences();
	const now = new Date().toISOString();
	const base: AppPreferences = existing ?? {
		version: PREFERENCES_VERSION,
		createdAt: now,
		updatedAt: now,
		onboardingCompleted: false,
	};

	const next: AppPreferences = {
		...base,
		...updates,
		version: PREFERENCES_VERSION,
		updatedAt: now,
	};

	await savePreferences(next);
	return next;
}

/**
 * Check if OpenRouter API key is available (from env or stored preferences).
 */
export function hasOpenRouterApiKey(): boolean {
	return Boolean(process.env.OPENROUTER_API_KEY);
}

/**
 * Check if OpenAI API key is available (from env or stored preferences).
 */
export function hasOpenAiApiKey(): boolean {
	return Boolean(process.env.OPENAI_API_KEY);
}

/**
 * Check if Exa API key is available (from env or stored preferences).
 */
export function hasExaApiKey(): boolean {
	return Boolean(process.env.EXA_API_KEY);
}

/**
 * Get the effective OpenRouter API key (env takes precedence over stored).
 */
export function getOpenRouterApiKey(storedKey?: string): string | undefined {
	return process.env.OPENROUTER_API_KEY || storedKey;
}

/**
 * Get the effective OpenAI API key (env takes precedence over stored).
 */
export function getOpenAiApiKey(storedKey?: string): string | undefined {
	return process.env.OPENAI_API_KEY || storedKey;
}

/**
 * Get the effective Exa API key (env takes precedence over stored).
 */
export function getExaApiKey(storedKey?: string): string | undefined {
	return process.env.EXA_API_KEY || storedKey;
}

/**
 * Set API keys in process.env for the current session.
 * Called after loading preferences to make stored keys available to SDK clients.
 */
export function applyApiKeysToEnv(prefs: AppPreferences): void {
	if (prefs.openRouterApiKey && !process.env.OPENROUTER_API_KEY) {
		process.env.OPENROUTER_API_KEY = prefs.openRouterApiKey;
	}
	if (prefs.openAiApiKey && !process.env.OPENAI_API_KEY) {
		process.env.OPENAI_API_KEY = prefs.openAiApiKey;
	}
	if (prefs.exaApiKey && !process.env.EXA_API_KEY) {
		process.env.EXA_API_KEY = prefs.exaApiKey;
	}
}

/**
 * Open a URL in the default browser.
 */
export function openUrlInBrowser(url: string): void {
	const { spawn } = require("node:child_process");
	if (process.platform === "darwin") {
		spawn("open", [url], { detached: true, stdio: "ignore" });
	} else if (process.platform === "win32") {
		spawn("cmd", ["/c", "start", url], { detached: true, stdio: "ignore" });
	} else {
		spawn("xdg-open", [url], { detached: true, stdio: "ignore" });
	}
}

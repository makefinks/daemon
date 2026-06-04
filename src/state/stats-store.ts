/**
 * Event-driven stats store for HUD stats.
 *
 * Tokens, artifacts, sessions, and memories are persisted in SQLite
 * (survive restarts). Tools and skills are in-memory only — tools seeded from
 * MCP snapshot at startup and kept in sync via the MCP manager's "update"
 * event; skills computed from toggle state.
 *
 * No polling — every stat updates via callbacks when something changes.
 */

import { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";
import type { DaemonStats } from "../types";
import { debug } from "../utils/debug-logger";
import { getAppConfigDir } from "../utils/preferences";
import { getMcpManager } from "../ai/mcp/mcp-manager";
import { TOOL_REGISTRY } from "../ai/tools/tool-registry";
import { getDaemonManager } from "./daemon-state";

const SESSION_DB_FILE = "sessions.sqlite";
const SESSION_DB_PATH_ENV = "DAEMON_SESSIONS_DB_PATH";
const FLUSH_DEBOUNCE_MS = 2_000;

// ── Persisted aggregates (cached in memory + debounce-flushed to SQLite) ──

let cachedPersisted: {
	totalTokens: number;
	totalArtifacts: number;
	totalSessions: number;
	totalMemories: number;
} | null = null;
let dirty = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let db: Database | null = null;

// ── In-memory-only counters (not persisted) ──

// ── Internals ──

function getDbPath(): string {
	const override = process.env[SESSION_DB_PATH_ENV]?.trim();
	if (override) return override;
	return path.join(getAppConfigDir(), SESSION_DB_FILE);
}

function ensureDb(): Database {
	if (db) return db;
	const dbPath = getDbPath();
	if (dbPath !== ":memory:") {
		fs.mkdirSync(path.dirname(dbPath), { recursive: true });
	}
	db = new Database(dbPath);
	db.exec("PRAGMA journal_mode=WAL;");
	db.exec(`
		CREATE TABLE IF NOT EXISTS daemon_stats (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);
	`);
	return db;
}

function readStat(database: Database, key: string): number {
	const row = database.prepare("SELECT value FROM daemon_stats WHERE key = ?").get(key) as
		| { value: string }
		| undefined;
	if (!row) return 0;
	const n = Number(row.value);
	return Number.isFinite(n) ? n : 0;
}

function writeStat(database: Database, key: string, value: number): void {
	const now = new Date().toISOString();
	database
		.prepare(
			"INSERT INTO daemon_stats (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
		)
		.run(key, String(value), now);
}

function loadFromDb(): {
	totalTokens: number;
	totalArtifacts: number;
	totalSessions: number;
	totalMemories: number;
} {
	try {
		const database = ensureDb();
		return {
			totalTokens: readStat(database, "total_tokens"),
			totalArtifacts: readStat(database, "total_artifacts"),
			totalSessions: readStat(database, "total_sessions"),
			totalMemories: readStat(database, "total_memories"),
		};
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		debug.error("stats-load-failed", { message: err.message });
		return { totalTokens: 0, totalArtifacts: 0, totalSessions: 0, totalMemories: 0 };
	}
}

function ensureLoaded(): {
	totalTokens: number;
	totalArtifacts: number;
	totalSessions: number;
	totalMemories: number;
} {
	if (!cachedPersisted) {
		cachedPersisted = loadFromDb();
	}
	return cachedPersisted;
}

function scheduleFlush(): void {
	if (flushTimer) return;
	flushTimer = setTimeout(() => {
		flushTimer = null;
		flushToDb();
	}, FLUSH_DEBOUNCE_MS);
}

function flushToDb(): void {
	if (!dirty || !cachedPersisted) return;
	try {
		const database = ensureDb();
		const p = cachedPersisted;
		writeStat(database, "total_tokens", p.totalTokens);
		writeStat(database, "total_artifacts", p.totalArtifacts);
		writeStat(database, "total_sessions", p.totalSessions);
		writeStat(database, "total_memories", p.totalMemories);
		dirty = false;
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		debug.error("stats-flush-failed", { message: err.message });
	}
}

// ── Public API ──

/**
 * Load all persisted values from DB.
 * Call once at startup. Synchronous — no async calls.
 */
export function initStatsStore(): void {
	ensureLoaded();
}

/** Get current stats — pure memory read, no I/O. */
export function getStats(): DaemonStats {
	const p = ensureLoaded();
	return {
		totalTokens: p.totalTokens,
		totalArtifacts: p.totalArtifacts,
		totalSessions: p.totalSessions,
		totalToolCalls: computeToolCount(),
		totalMemories: p.totalMemories,
		totalSkills: cachedEnabledSkillCount,
	};
}

function computeToolCount(): number {
	try {
		const toggles = getDaemonManager().toolToggles ?? {};
		let builtinCount = 0;
		for (const entry of TOOL_REGISTRY) {
			if (toggles[entry.toggleKey] !== false) {
				builtinCount++;
			}
		}
		const mcpTools = Object.keys(getMcpManager().getToolsSnapshot()).length;
		return builtinCount + mcpTools;
	} catch {
		return TOOL_REGISTRY.length;
	}
}

// ── In-memory-only skills count (not persisted) ──

let cachedEnabledSkillCount = 0;

export function setEnabledSkillCount(count: number): void {
	cachedEnabledSkillCount = count;
}

// ── Increment / decrement functions ──

export function incrementTokens(n: number): void {
	if (n <= 0) return;
	ensureLoaded().totalTokens += n;
	dirty = true;
	scheduleFlush();
}

export function incrementSessions(): void {
	ensureLoaded().totalSessions++;
	dirty = true;
	scheduleFlush();
}

export function decrementSessions(): void {
	const p = ensureLoaded();
	if (p.totalSessions > 0) {
		p.totalSessions--;
		dirty = true;
		scheduleFlush();
	}
}

export function incrementMemories(n: number): void {
	if (n <= 0) return;
	ensureLoaded().totalMemories += n;
	dirty = true;
	scheduleFlush();
}

export function decrementMemories(): void {
	const p = ensureLoaded();
	if (p.totalMemories > 0) {
		p.totalMemories--;
		dirty = true;
		scheduleFlush();
	}
}

export function setMemoryCount(count: number): void {
	ensureLoaded().totalMemories = count;
	dirty = true;
	scheduleFlush();
}

export function incrementArtifacts(n: number): void {
	if (n <= 0) return;
	ensureLoaded().totalArtifacts += n;
	dirty = true;
	scheduleFlush();
}

export function decrementArtifacts(n: number): void {
	if (n <= 0) return;
	const p = ensureLoaded();
	p.totalArtifacts = Math.max(0, p.totalArtifacts - n);
	dirty = true;
	scheduleFlush();
}

// ── Shutdown ──

export function flushStats(): void {
	if (flushTimer) {
		clearTimeout(flushTimer);
		flushTimer = null;
	}
	flushToDb();
}

export function closeStatsStore(): void {
	flushStats();
	if (db) {
		try {
			db.close();
		} catch {
			// ignore
		} finally {
			db = null;
		}
	}
	cachedPersisted = null;
	dirty = false;
}

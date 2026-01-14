/**
 * Session persistence using SQLite for conversation history and UI state.
 */

import { Database } from "bun:sqlite";
import { promises as fs } from "node:fs";
import path from "node:path";
import type {
	ConversationMessage,
	GroundedStatement,
	GroundingMap,
	ModelMessage,
	SessionInfo,
	SessionSnapshot,
	TodoItem,
	TokenUsage,
} from "../types";
import { debug } from "../utils/debug-logger";
import { getAppConfigDir } from "../utils/preferences";
import { deleteWorkspace, ensureWorkspaceExists } from "../utils/workspace-manager";
import { getSessionMigrations } from "./migrations";

const SESSION_DB_FILE = "sessions.sqlite";
const SESSION_DB_PATH_ENV = "DAEMON_SESSIONS_DB_PATH";

const DEFAULT_SESSION_USAGE: TokenUsage = {
	promptTokens: 0,
	completionTokens: 0,
	totalTokens: 0,
	subagentTotalTokens: 0,
	subagentPromptTokens: 0,
	subagentCompletionTokens: 0,
};

const SCHEMA_VERSION = 1;

let db: Database | null = null;

function getSessionDbPath(): string {
	const override = process.env[SESSION_DB_PATH_ENV]?.trim();
	if (override) return override;
	const dir = getAppConfigDir();
	return path.join(dir, SESSION_DB_FILE);
}

function getUserVersion(database: Database): number {
	const row = database.prepare("PRAGMA user_version").get() as { user_version?: number } | undefined;
	return typeof row?.user_version === "number" ? row.user_version : 0;
}

function setUserVersion(database: Database, version: number): void {
	database.exec(`PRAGMA user_version = ${version}`);
}

function runMigrations(database: Database): void {
	const migrations = getSessionMigrations(JSON.stringify(DEFAULT_SESSION_USAGE));

	let currentVersion = getUserVersion(database);
	if (currentVersion > SCHEMA_VERSION) {
		debug.error("session-schema-version-mismatch", {
			message: `Database schema version ${currentVersion} is newer than supported ${SCHEMA_VERSION}`,
		});
		return;
	}

	if (currentVersion === SCHEMA_VERSION) return;

	const run = database.transaction(() => {
		for (let version = currentVersion; version < SCHEMA_VERSION; version += 1) {
			const migration = migrations[version];
			if (!migration) {
				throw new Error(`Missing migration for version ${version + 1}`);
			}
			migration(database);
		}
		setUserVersion(database, SCHEMA_VERSION);
	});
	run();
}

async function getDb(): Promise<Database> {
	if (db) return db;
	const dbPath = getSessionDbPath();
	if (dbPath !== ":memory:") {
		await fs.mkdir(path.dirname(dbPath), { recursive: true });
	}
	db = new Database(dbPath);
	db.exec("PRAGMA journal_mode=WAL;");
	db.exec("PRAGMA foreign_keys=ON;");
	runMigrations(db);
	return db;
}

export function closeSessionStore(): void {
	if (!db) return;
	try {
		db.close();
	} catch {
	} finally {
		db = null;
	}
}

function formatSessionTitle(timestamp: string): string {
	const base = timestamp.replace("T", " ").slice(0, 16);
	return `Session ${base}`;
}

function parseConversationHistory(raw: string): ConversationMessage[] {
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) return [];
		return parsed as ConversationMessage[];
	} catch {
		return [];
	}
}

function parseSessionUsage(raw: string): TokenUsage {
	try {
		const parsed = JSON.parse(raw) as Partial<TokenUsage>;
		if (!parsed || typeof parsed !== "object") return { ...DEFAULT_SESSION_USAGE };
		return {
			promptTokens: typeof parsed.promptTokens === "number" ? parsed.promptTokens : 0,
			completionTokens: typeof parsed.completionTokens === "number" ? parsed.completionTokens : 0,
			totalTokens: typeof parsed.totalTokens === "number" ? parsed.totalTokens : 0,
			reasoningTokens: typeof parsed.reasoningTokens === "number" ? parsed.reasoningTokens : undefined,
			cachedInputTokens: typeof parsed.cachedInputTokens === "number" ? parsed.cachedInputTokens : undefined,
			cost: typeof parsed.cost === "number" ? parsed.cost : undefined,
			subagentTotalTokens: typeof parsed.subagentTotalTokens === "number" ? parsed.subagentTotalTokens : 0,
			subagentPromptTokens: typeof parsed.subagentPromptTokens === "number" ? parsed.subagentPromptTokens : 0,
			subagentCompletionTokens:
				typeof parsed.subagentCompletionTokens === "number" ? parsed.subagentCompletionTokens : 0,
		};
	} catch {
		return { ...DEFAULT_SESSION_USAGE };
	}
}

export function buildModelHistoryFromConversation(
	conversationHistory: ConversationMessage[]
): ModelMessage[] {
	const modelHistory: ModelMessage[] = [];
	for (const message of conversationHistory) {
		if (Array.isArray(message.messages)) {
			modelHistory.push(...message.messages);
		}
	}
	return modelHistory;
}

export async function listSessions(): Promise<SessionInfo[]> {
	try {
		const database = await getDb();
		const rows = database
			.prepare("SELECT id, title, created_at, updated_at FROM sessions ORDER BY updated_at DESC")
			.all() as Array<{
			id: string;
			title: string | null;
			created_at: string;
			updated_at: string;
		}>;
		return rows.map((row) => ({
			id: row.id,
			title: row.title && row.title.trim() ? row.title : formatSessionTitle(row.created_at),
			createdAt: row.created_at,
			updatedAt: row.updated_at,
		}));
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		debug.error("session-list-failed", { message: err.message });
		return [];
	}
}

export async function createSession(title?: string): Promise<SessionInfo> {
	const database = await getDb();
	const now = new Date().toISOString();
	const sessionId = crypto.randomUUID();
	const sessionTitle = title?.trim() || formatSessionTitle(now);
	database
		.prepare(
			"INSERT INTO sessions (id, title, created_at, updated_at, history_json, usage_json) VALUES (?, ?, ?, ?, ?, ?)"
		)
		.run(sessionId, sessionTitle, now, now, JSON.stringify([]), JSON.stringify(DEFAULT_SESSION_USAGE));

	await ensureWorkspaceExists(sessionId);

	return {
		id: sessionId,
		title: sessionTitle,
		createdAt: now,
		updatedAt: now,
	};
}

export async function loadSessionSnapshot(sessionId: string): Promise<SessionSnapshot | null> {
	try {
		const database = await getDb();
		const row = database
			.prepare("SELECT history_json, usage_json FROM sessions WHERE id = ?")
			.get(sessionId) as { history_json: string; usage_json: string } | undefined;
		if (!row) return null;
		const conversationHistory = parseConversationHistory(row.history_json);
		const sessionUsage = parseSessionUsage(row.usage_json);
		return { conversationHistory, sessionUsage };
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		debug.error("session-load-failed", { message: err.message });
		return null;
	}
}

export async function saveSessionSnapshot(snapshot: SessionSnapshot, sessionId: string): Promise<void> {
	try {
		const database = await getDb();
		const now = new Date().toISOString();
		const existing = database.prepare("SELECT created_at, title FROM sessions WHERE id = ?").get(sessionId) as
			| { created_at?: string }
			| undefined;
		const createdAt = existing?.created_at ?? now;
		const title =
			(existing as { title?: string } | undefined)?.title?.trim() || formatSessionTitle(createdAt);
		const historyJson = JSON.stringify(snapshot.conversationHistory);
		const usageJson = JSON.stringify(snapshot.sessionUsage);
		database
			.prepare(
				"INSERT INTO sessions (id, title, created_at, updated_at, history_json, usage_json) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title = excluded.title, updated_at = excluded.updated_at, history_json = excluded.history_json, usage_json = excluded.usage_json"
			)
			.run(sessionId, title, createdAt, now, historyJson, usageJson);
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		debug.error("session-save-failed", { message: err.message });
	}
}

export async function clearSessionSnapshot(sessionId: string): Promise<void> {
	try {
		const database = await getDb();
		database.prepare("DELETE FROM grounding_maps WHERE session_id = ?").run(sessionId);
		database.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
		await deleteWorkspace(sessionId);
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		debug.error("session-clear-failed", { message: err.message });
	}
}

export async function deleteSession(sessionId: string): Promise<void> {
	// Alias for clarity at call sites (e.g. UI actions).
	return await clearSessionSnapshot(sessionId);
}

export async function updateSessionTitle(sessionId: string, title: string): Promise<void> {
	try {
		const database = await getDb();
		const now = new Date().toISOString();
		database.prepare("UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?").run(title, now, sessionId);
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		debug.error("session-title-update-failed", { message: err.message });
	}
}

function parseGroundedStatements(raw: string): GroundedStatement[] {
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) return [];
		return parsed as GroundedStatement[];
	} catch {
		return [];
	}
}

export async function saveGroundingMap(
	sessionId: string,
	messageId: number,
	items: GroundedStatement[]
): Promise<GroundingMap> {
	const database = await getDb();
	const now = new Date().toISOString();
	const mapId = crypto.randomUUID();
	const itemsJson = JSON.stringify(items);

	database
		.prepare(
			"INSERT INTO grounding_maps (id, session_id, message_id, created_at, items_json) VALUES (?, ?, ?, ?, ?)"
		)
		.run(mapId, sessionId, messageId, now, itemsJson);

	return {
		id: mapId,
		sessionId,
		messageId,
		createdAt: now,
		items,
	};
}

export async function listGroundingMaps(sessionId: string): Promise<GroundingMap[]> {
	try {
		const database = await getDb();
		const rows = database
			.prepare(
				"SELECT id, session_id, message_id, created_at, items_json FROM grounding_maps WHERE session_id = ? ORDER BY created_at DESC"
			)
			.all(sessionId) as Array<{
			id: string;
			session_id: string;
			message_id: number;
			created_at: string;
			items_json: string;
		}>;

		return rows.map((row) => ({
			id: row.id,
			sessionId: row.session_id,
			messageId: row.message_id,
			createdAt: row.created_at,
			items: parseGroundedStatements(row.items_json),
		}));
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		debug.error("grounding-list-failed", { message: err.message });
		return [];
	}
}

export async function loadLatestGroundingMap(sessionId: string): Promise<GroundingMap | null> {
	try {
		const database = await getDb();
		const row = database
			.prepare(
				"SELECT id, session_id, message_id, created_at, items_json FROM grounding_maps WHERE session_id = ? ORDER BY created_at DESC LIMIT 1"
			)
			.get(sessionId) as
			| {
					id: string;
					session_id: string;
					message_id: number;
					created_at: string;
					items_json: string;
			  }
			| undefined;

		if (!row) return null;

		return {
			id: row.id,
			sessionId: row.session_id,
			messageId: row.message_id,
			createdAt: row.created_at,
			items: parseGroundedStatements(row.items_json),
		};
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		debug.error("grounding-load-failed", { message: err.message });
		return null;
	}
}

function parseTodoItems(raw: string): TodoItem[] {
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) return [];
		return parsed as TodoItem[];
	} catch {
		return [];
	}
}

export async function saveTodoList(sessionId: string, items: TodoItem[]): Promise<void> {
	try {
		const database = await getDb();
		const now = new Date().toISOString();
		const id = crypto.randomUUID();
		const itemsJson = JSON.stringify(items);

		database
			.prepare("INSERT INTO todo_lists (id, session_id, created_at, items_json) VALUES (?, ?, ?, ?)")
			.run(id, sessionId, now, itemsJson);
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		debug.error("todo-save-failed", { message: err.message });
	}
}

export async function loadLatestTodoList(sessionId: string): Promise<TodoItem[]> {
	try {
		const database = await getDb();
		const row = database
			.prepare("SELECT items_json FROM todo_lists WHERE session_id = ? ORDER BY created_at DESC LIMIT 1")
			.get(sessionId) as { items_json: string } | undefined;

		if (!row) return [];

		return parseTodoItems(row.items_json);
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		debug.error("todo-load-failed", { message: err.message });
		return [];
	}
}

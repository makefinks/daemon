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
import { countWorkspaceFiles, deleteWorkspace, ensureWorkspaceExists } from "../utils/workspace-manager";
import { getSessionMigrations } from "./migrations";
import { daemonEvents } from "./daemon-events";

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

const SCHEMA_VERSION = 2;

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

function openDb(): Database {
	const dbPath = getSessionDbPath();
	const database = new Database(dbPath);
	database.exec("PRAGMA journal_mode=WAL;");
	database.exec("PRAGMA foreign_keys=ON;");
	runMigrations(database);
	return database;
}

async function getDb(): Promise<Database> {
	if (db) return db;
	const dbPath = getSessionDbPath();
	if (dbPath !== ":memory:") {
		await fs.mkdir(path.dirname(dbPath), { recursive: true });
	}
	db = openDb();
	return db;
}

/**
 * Synchronous session title lookup. Opens the DB on first call so it can be
 * used from sync UI render paths (e.g. tool card headers) before any async
 * session-store call has warmed the connection. Returns undefined if the
 * session is not found.
 */
export function getSessionTitleSync(sessionId: string): string | undefined {
	if (!db) {
		try {
			db = openDb();
		} catch (error: unknown) {
			debug.error("session-title-sync-open-failed", {
				message: error instanceof Error ? error.message : String(error),
			});
			return undefined;
		}
	}
	const row = db.prepare("SELECT title, created_at FROM sessions WHERE id = ?").get(sessionId) as
		| { title: string | null; created_at: string }
		| undefined;
	if (!row) return undefined;
	return row.title?.trim() || formatSessionTitle(row.created_at);
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
			latestTurnPromptTokens:
				typeof parsed.latestTurnPromptTokens === "number" ? parsed.latestTurnPromptTokens : undefined,
			latestTurnCompletionTokens:
				typeof parsed.latestTurnCompletionTokens === "number" ? parsed.latestTurnCompletionTokens : undefined,
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
			.prepare("SELECT id, title, created_at, updated_at, usage_json FROM sessions ORDER BY updated_at DESC")
			.all() as Array<{
			id: string;
			title: string | null;
			created_at: string;
			updated_at: string;
			usage_json: string;
		}>;
		return rows.map((row) => {
			const usage = parseSessionUsage(row.usage_json);
			return {
				id: row.id,
				title: row.title && row.title.trim() ? row.title : formatSessionTitle(row.created_at),
				createdAt: row.created_at,
				updatedAt: row.updated_at,
				totalTokens: usage.totalTokens,
				subagentTotalTokens: usage.subagentTotalTokens,
				cost: usage.cost,
			};
		});
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

	daemonEvents.emit("sessionCreated");

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

function reindexSessionFts(database: Database, sessionId: string, history: ConversationMessage[]): void {
	const insert = database.prepare(
		"INSERT INTO messages_fts (session_id, message_id, role, content) VALUES (?, ?, ?, ?)"
	);
	const run = database.transaction(() => {
		database.prepare("DELETE FROM messages_fts WHERE session_id = ?").run(sessionId);
		for (const message of history) {
			const content = typeof message.content === "string" ? message.content.trim() : "";
			if (!content) continue;
			insert.run(sessionId, message.id, message.type, content);
		}
	});
	run();
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
		reindexSessionFts(database, sessionId, snapshot.conversationHistory);
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		debug.error("session-save-failed", { message: err.message });
	}
}

export async function clearSessionSnapshot(sessionId: string): Promise<void> {
	try {
		const database = await getDb();
		const fileCount = countWorkspaceFiles(sessionId);
		database.prepare("DELETE FROM messages_fts WHERE session_id = ?").run(sessionId);
		database.prepare("DELETE FROM grounding_maps WHERE session_id = ?").run(sessionId);
		database.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
		await deleteWorkspace(sessionId);
		daemonEvents.emit("sessionDeleted", fileCount);
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

export async function loadGroundingMapsBySession(sessionId: string): Promise<Map<number, GroundingMap>> {
	const maps = await listGroundingMaps(sessionId);
	const byMessage = new Map<number, GroundingMap>();
	for (const map of maps) {
		// listGroundingMaps returns DESC by created_at, so first entry per messageId is the latest
		if (!byMessage.has(map.messageId)) {
			byMessage.set(map.messageId, map);
		}
	}
	return byMessage;
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

// ── Recall: conversation search ──────────────────────────────────────────────

export interface SessionSearchHit {
	sessionId: string;
	sessionTitle: string;
	messageId: number;
	messageRole: "user" | "daemon";
	snippet: string;
	matchIndex: number;
	messageDate: string;
}

export interface SessionSearchOptions {
	sessionId?: string;
	messageIds?: number[];
	maxResults?: number;
}

const SNIPPET_CONTEXT = 150;

function buildSnippet(content: string, matchStart: number): string {
	const start = Math.max(0, matchStart - SNIPPET_CONTEXT);
	const end = Math.min(content.length, matchStart + SNIPPET_CONTEXT);

	let snippet = content.slice(start, end);
	if (start > 0) snippet = `...${snippet}`;
	if (end < content.length) snippet = `${snippet}...`;

	return snippet;
}

function buildFtsMatchExpression(query: string): string | null {
	const tokens = query
		.toLowerCase()
		.split(/[^\p{L}\p{N}_]+/u)
		.filter((token) => token.length > 0)
		.map((token) => `${token.replace(/"/g, '""')}*`);
	if (tokens.length === 0) return null;
	return tokens.join(" ");
}

export async function searchSessions(
	query: string,
	options: SessionSearchOptions = {}
): Promise<SessionSearchHit[]> {
	const maxResults = options.maxResults ?? 15;
	const matchExpr = buildFtsMatchExpression(query);
	if (!matchExpr) return [];

	const hits: SessionSearchHit[] = [];
	try {
		const database = await getDb();

		const rows = options.sessionId
			? (database
					.prepare(
						"SELECT session_id, message_id, role, content FROM messages_fts WHERE messages_fts MATCH ? AND session_id = ? ORDER BY rank LIMIT ?"
					)
					.all(matchExpr, options.sessionId, maxResults) as Array<{
					session_id: string;
					message_id: number;
					role: "user" | "daemon";
					content: string;
				}>)
			: (database
					.prepare(
						"SELECT session_id, message_id, role, content FROM messages_fts WHERE messages_fts MATCH ? ORDER BY rank LIMIT ?"
					)
					.all(matchExpr, maxResults) as Array<{
					session_id: string;
					message_id: number;
					role: "user" | "daemon";
					content: string;
				}>);

		if (rows.length === 0) return hits;

		const uniqueSessionIds = Array.from(new Set(rows.map((r) => r.session_id)));
		const placeholders = uniqueSessionIds.map(() => "?").join(",");
		const sessionRows = database
			.prepare(`SELECT id, title, created_at FROM sessions WHERE id IN (${placeholders})`)
			.all(...uniqueSessionIds) as Array<{ id: string; title: string | null; created_at: string }>;
		const sessionById = new Map(
			sessionRows.map((row) => [
				row.id,
				{
					title: row.title?.trim() || formatSessionTitle(row.created_at),
					created_at: row.created_at,
				},
			])
		);

		const lowerQuery = query.toLowerCase().trim();
		const messageIdSet = options.messageIds ? new Set(options.messageIds) : null;

		for (const row of rows) {
			if (hits.length >= maxResults) break;
			if (messageIdSet && !messageIdSet.has(row.message_id)) continue;
			const session = sessionById.get(row.session_id);
			if (!session) continue;

			const matchIdx = lowerQuery ? row.content.toLowerCase().indexOf(lowerQuery) : 0;
			const snippet =
				matchIdx >= 0
					? buildSnippet(row.content, matchIdx)
					: row.content.length > SNIPPET_CONTEXT * 2
						? `${row.content.slice(0, SNIPPET_CONTEXT * 2)}…`
						: row.content;

			hits.push({
				sessionId: row.session_id,
				sessionTitle: session.title,
				messageId: row.message_id,
				messageRole: row.role,
				snippet,
				matchIndex: matchIdx >= 0 ? matchIdx : 0,
				messageDate: session.created_at,
			});
		}
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		debug.error("session-search-failed", { message: err.message });
	}

	return hits;
}

export interface LoadedMessage {
	sessionId: string;
	sessionTitle: string;
	messageId: number;
	messageRole: "user" | "daemon";
	content: string;
	messageDate: string;
}

export async function loadSessionMessages(sessionId: string, messageIds: number[]): Promise<LoadedMessage[]> {
	try {
		const database = await getDb();
		const row = database
			.prepare("SELECT title, created_at, history_json FROM sessions WHERE id = ?")
			.get(sessionId) as { title: string | null; created_at: string; history_json: string } | undefined;

		if (!row) return [];

		const title = row.title?.trim() || formatSessionTitle(row.created_at);
		const history = parseConversationHistory(row.history_json);
		const idSet = new Set(messageIds);
		const results: LoadedMessage[] = [];

		for (const message of history) {
			if (!idSet.has(message.id)) continue;
			results.push({
				sessionId,
				sessionTitle: title,
				messageId: message.id,
				messageRole: message.type,
				content: message.content ?? "",
				messageDate: row.created_at,
			});
		}

		return results;
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		debug.error("session-messages-load-failed", { message: err.message });
		return [];
	}
}

// ── Todo list persistence ────────────────────────────────────────────────────

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

import type { Database } from "bun:sqlite";

/**
 * Conversation search index. One row per `ConversationMessage` (assistant
 * text only — `content` field). Created idempotently; safe to run on an
 * already-initialized database.
 */
export function createMigration002MessagesFts(): (db: Database) => void {
	return (db) => {
		db.exec(`
			CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
				session_id UNINDEXED,
				message_id UNINDEXED,
				role UNINDEXED,
				content,
				tokenize = 'unicode61 remove_diacritics 2'
			);
		`);
	};
}

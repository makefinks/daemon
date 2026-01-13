import type { Database } from "bun:sqlite";

export function createMigration001Init(defaultUsageJson: string): (db: Database) => void {
	return (db) => {
		db.exec(`
			CREATE TABLE IF NOT EXISTS sessions (
				id TEXT PRIMARY KEY,
				title TEXT NOT NULL,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL,
				history_json TEXT NOT NULL DEFAULT '[]',
				usage_json TEXT NOT NULL DEFAULT '${defaultUsageJson}'
			);
		`);
		db.exec(`
			CREATE TABLE IF NOT EXISTS grounding_maps (
				id TEXT PRIMARY KEY,
				session_id TEXT NOT NULL,
				message_id INTEGER NOT NULL,
				created_at TEXT NOT NULL,
				items_json TEXT NOT NULL
			);
		`);
		db.exec(`
			CREATE INDEX IF NOT EXISTS idx_grounding_maps_session_created
			ON grounding_maps(session_id, created_at DESC);
		`);
		db.exec(`
			CREATE INDEX IF NOT EXISTS idx_grounding_maps_session_message
			ON grounding_maps(session_id, message_id);
		`);
	};
}

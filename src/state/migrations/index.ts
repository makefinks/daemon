import type { Database } from "bun:sqlite";
import { createMigration001Init } from "./001-init";
import { createMigration002MessagesFts } from "./002-messages-fts";

export type SessionMigration = (db: Database) => void;

export function getSessionMigrations(defaultUsageJson: string): SessionMigration[] {
	return [createMigration001Init(defaultUsageJson), createMigration002MessagesFts()];
}

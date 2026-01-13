import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const SESSION_DB_PATH_ENV = "DAEMON_SESSIONS_DB_PATH";

async function createTempDir(): Promise<string> {
	return await fs.mkdtemp(path.join(os.tmpdir(), "daemon-session-store-"));
}

async function loadSessionStore(dbPath: string) {
	process.env[SESSION_DB_PATH_ENV] = dbPath;
	const mod = await import(`../src/state/session-store?test=${crypto.randomUUID()}`);
	return mod;
}

async function cleanupTempDir(dir: string): Promise<void> {
	await fs.rm(dir, { recursive: true, force: true });
}

describe("session-store", () => {
	it("creates a session with a trimmed title and can list it", async () => {
		const previousDbPath = process.env[SESSION_DB_PATH_ENV];
		const tmpDir = await createTempDir();
		const dbPath = path.join(tmpDir, "sessions.sqlite");
		const store = await loadSessionStore(dbPath);

		try {
			const created = await store.createSession("  My Title  ");
			expect(created.id).toBeTruthy();
			expect(created.title).toBe("My Title");

			const sessions = await store.listSessions();
			expect(sessions.length).toBe(1);
			expect(sessions[0]?.id).toBe(created.id);
			expect(sessions[0]?.title).toBe("My Title");
			expect(sessions[0]?.createdAt).toBe(created.createdAt);
			expect(sessions[0]?.updatedAt).toBe(created.updatedAt);
		} finally {
			store.closeSessionStore();
			if (typeof previousDbPath === "string") {
				process.env[SESSION_DB_PATH_ENV] = previousDbPath;
			} else {
				delete process.env[SESSION_DB_PATH_ENV];
			}
			await cleanupTempDir(tmpDir);
		}
	});

	it("sorts sessions by updatedAt descending", async () => {
		const previousDbPath = process.env[SESSION_DB_PATH_ENV];
		const tmpDir = await createTempDir();
		const dbPath = path.join(tmpDir, "sessions.sqlite");
		const store = await loadSessionStore(dbPath);

		try {
			const a = await store.createSession("A");
			await new Promise((resolve) => setTimeout(resolve, 10));
			const b = await store.createSession("B");

			const sessions = await store.listSessions();
			expect(sessions.map((s: { id: string }) => s.id)).toEqual([b.id, a.id]);
		} finally {
			store.closeSessionStore();
			if (typeof previousDbPath === "string") {
				process.env[SESSION_DB_PATH_ENV] = previousDbPath;
			} else {
				delete process.env[SESSION_DB_PATH_ENV];
			}
			await cleanupTempDir(tmpDir);
		}
	});

	it("saves and loads snapshots, preserving createdAt across updates", async () => {
		const previousDbPath = process.env[SESSION_DB_PATH_ENV];
		const tmpDir = await createTempDir();
		const dbPath = path.join(tmpDir, "sessions.sqlite");
		const store = await loadSessionStore(dbPath);

		try {
			const session = await store.createSession("Snapshot Session");
			const snapshot = {
				conversationHistory: [
					{
						id: 1,
						type: "user",
						content: "Hello",
						messages: [{ role: "user", content: "Hello" }],
					},
					{
						id: 2,
						type: "daemon",
						content: "World",
						messages: [{ role: "assistant", content: "World" }],
					},
				],
				sessionUsage: {
					promptTokens: 5,
					completionTokens: 7,
					totalTokens: 12,
					subagentTotalTokens: 0,
				},
			};

			await new Promise((resolve) => setTimeout(resolve, 10));
			await store.saveSessionSnapshot(snapshot, session.id);

			const loaded = await store.loadSessionSnapshot(session.id);
			expect(loaded).not.toBeNull();
			expect(loaded?.conversationHistory.length).toBe(2);
			expect(loaded?.sessionUsage.totalTokens).toBe(12);

			const sessions = await store.listSessions();
			const row = sessions.find((s: { id: string }) => s.id === session.id);
			expect(row).toBeTruthy();
			expect(row?.createdAt).toBe(session.createdAt);
			expect(new Date(row?.updatedAt ?? 0).getTime()).toBeGreaterThan(new Date(session.updatedAt).getTime());
		} finally {
			store.closeSessionStore();
			if (typeof previousDbPath === "string") {
				process.env[SESSION_DB_PATH_ENV] = previousDbPath;
			} else {
				delete process.env[SESSION_DB_PATH_ENV];
			}
			await cleanupTempDir(tmpDir);
		}
	});

	it("updates titles and bumps updatedAt", async () => {
		const previousDbPath = process.env[SESSION_DB_PATH_ENV];
		const tmpDir = await createTempDir();
		const dbPath = path.join(tmpDir, "sessions.sqlite");
		const store = await loadSessionStore(dbPath);

		try {
			const session = await store.createSession("Initial");
			await new Promise((resolve) => setTimeout(resolve, 10));
			await store.updateSessionTitle(session.id, "Renamed");

			const sessions = await store.listSessions();
			const row = sessions.find((s: { id: string }) => s.id === session.id);
			expect(row?.title).toBe("Renamed");
			expect(new Date(row?.updatedAt ?? 0).getTime()).toBeGreaterThan(new Date(session.updatedAt).getTime());
		} finally {
			store.closeSessionStore();
			if (typeof previousDbPath === "string") {
				process.env[SESSION_DB_PATH_ENV] = previousDbPath;
			} else {
				delete process.env[SESSION_DB_PATH_ENV];
			}
			await cleanupTempDir(tmpDir);
		}
	});

	it("falls back to a formatted title when the stored title is blank", async () => {
		const previousDbPath = process.env[SESSION_DB_PATH_ENV];
		const tmpDir = await createTempDir();
		const dbPath = path.join(tmpDir, "sessions.sqlite");
		const store = await loadSessionStore(dbPath);

		try {
			const session = await store.createSession("Will Clear");
			await store.updateSessionTitle(session.id, "");

			const sessions = await store.listSessions();
			const row = sessions.find((s: { id: string }) => s.id === session.id);
			expect(row?.title.startsWith("Session ")).toBe(true);
		} finally {
			store.closeSessionStore();
			if (typeof previousDbPath === "string") {
				process.env[SESSION_DB_PATH_ENV] = previousDbPath;
			} else {
				delete process.env[SESSION_DB_PATH_ENV];
			}
			await cleanupTempDir(tmpDir);
		}
	});

	it("returns null for missing sessions and deletes sessions on clear", async () => {
		const previousDbPath = process.env[SESSION_DB_PATH_ENV];
		const tmpDir = await createTempDir();
		const dbPath = path.join(tmpDir, "sessions.sqlite");
		const store = await loadSessionStore(dbPath);

		try {
			expect(await store.loadSessionSnapshot("missing")).toBeNull();

			const session = await store.createSession("To Delete");
			await store.saveGroundingMap(session.id, 1, [
				{ statement: "Test", source: { url: "https://example.com", title: "Example" } },
			]);
			await store.clearSessionSnapshot(session.id);

			expect(await store.loadSessionSnapshot(session.id)).toBeNull();
			expect(await store.listSessions()).toEqual([]);
			expect(await store.listGroundingMaps(session.id)).toEqual([]);
		} finally {
			store.closeSessionStore();
			if (typeof previousDbPath === "string") {
				process.env[SESSION_DB_PATH_ENV] = previousDbPath;
			} else {
				delete process.env[SESSION_DB_PATH_ENV];
			}
			await cleanupTempDir(tmpDir);
		}
	});

	it("tolerates corrupted history_json and usage_json values", async () => {
		const previousDbPath = process.env[SESSION_DB_PATH_ENV];
		const tmpDir = await createTempDir();
		const dbPath = path.join(tmpDir, "sessions.sqlite");
		const store = await loadSessionStore(dbPath);

		try {
			const session = await store.createSession("Corrupt");

			const database = new Database(dbPath);
			database
				.prepare("UPDATE sessions SET history_json = ?, usage_json = ? WHERE id = ?")
				.run("not json", '{"promptTokens":"oops"}', session.id);
			database.close();

			store.closeSessionStore();
			const reopened = await loadSessionStore(dbPath);
			const snapshot = await reopened.loadSessionSnapshot(session.id);
			expect(snapshot).not.toBeNull();
			expect(snapshot?.conversationHistory).toEqual([]);
			expect(snapshot?.sessionUsage.promptTokens).toBe(0);
			reopened.closeSessionStore();
		} finally {
			store.closeSessionStore();
			if (typeof previousDbPath === "string") {
				process.env[SESSION_DB_PATH_ENV] = previousDbPath;
			} else {
				delete process.env[SESSION_DB_PATH_ENV];
			}
			await cleanupTempDir(tmpDir);
		}
	});

	it("flattens model messages from the conversation history", async () => {
		const previousDbPath = process.env[SESSION_DB_PATH_ENV];
		const tmpDir = await createTempDir();
		const dbPath = path.join(tmpDir, "sessions.sqlite");
		const store = await loadSessionStore(dbPath);

		try {
			const result = store.buildModelHistoryFromConversation([
				{
					id: 1,
					type: "user",
					content: "One",
					messages: [{ role: "user", content: "One" }],
				},
				{
					id: 2,
					type: "daemon",
					content: "Two",
					messages: [{ role: "assistant", content: "Two" }],
				},
			]);
			expect(result).toEqual([
				{ role: "user", content: "One" },
				{ role: "assistant", content: "Two" },
			]);
		} finally {
			store.closeSessionStore();
			if (typeof previousDbPath === "string") {
				process.env[SESSION_DB_PATH_ENV] = previousDbPath;
			} else {
				delete process.env[SESSION_DB_PATH_ENV];
			}
			await cleanupTempDir(tmpDir);
		}
	});

	it("saves and retrieves grounding maps", async () => {
		const previousDbPath = process.env[SESSION_DB_PATH_ENV];
		const tmpDir = await createTempDir();
		const dbPath = path.join(tmpDir, "sessions.sqlite");
		const store = await loadSessionStore(dbPath);

		try {
			const session = await store.createSession("Grounding Test");
			const items = [
				{
					statement: "The sky is blue",
					source: {
						url: "https://example.com/sky",
						title: "Sky Facts",
						startText: "The sky is blue",
					},
				},
				{
					statement: "Water is wet",
					source: {
						url: "https://example.com/water",
						title: "Water Facts",
						startText: "Water is",
						endText: "wet",
					},
				},
			];

			const saved = await store.saveGroundingMap(session.id, 1, items);
			expect(saved.id).toBeTruthy();
			expect(saved.sessionId).toBe(session.id);
			expect(saved.messageId).toBe(1);
			expect(saved.items).toEqual(items);
			expect(saved.createdAt).toBeTruthy();
		} finally {
			store.closeSessionStore();
			if (typeof previousDbPath === "string") {
				process.env[SESSION_DB_PATH_ENV] = previousDbPath;
			} else {
				delete process.env[SESSION_DB_PATH_ENV];
			}
			await cleanupTempDir(tmpDir);
		}
	});

	it("lists grounding maps for a session in descending order", async () => {
		const previousDbPath = process.env[SESSION_DB_PATH_ENV];
		const tmpDir = await createTempDir();
		const dbPath = path.join(tmpDir, "sessions.sqlite");
		const store = await loadSessionStore(dbPath);

		try {
			const session = await store.createSession("Grounding List Test");
			const items1 = [{ statement: "First", source: { url: "https://a.com", title: "A" } }];
			const items2 = [{ statement: "Second", source: { url: "https://b.com", title: "B" } }];

			const map1 = await store.saveGroundingMap(session.id, 1, items1);
			await new Promise((resolve) => setTimeout(resolve, 10));
			const map2 = await store.saveGroundingMap(session.id, 2, items2);

			const maps = await store.listGroundingMaps(session.id);
			expect(maps.length).toBe(2);
			expect(maps[0]?.id).toBe(map2.id);
			expect(maps[1]?.id).toBe(map1.id);
		} finally {
			store.closeSessionStore();
			if (typeof previousDbPath === "string") {
				process.env[SESSION_DB_PATH_ENV] = previousDbPath;
			} else {
				delete process.env[SESSION_DB_PATH_ENV];
			}
			await cleanupTempDir(tmpDir);
		}
	});

	it("loads the latest grounding map for a session", async () => {
		const previousDbPath = process.env[SESSION_DB_PATH_ENV];
		const tmpDir = await createTempDir();
		const dbPath = path.join(tmpDir, "sessions.sqlite");
		const store = await loadSessionStore(dbPath);

		try {
			const session = await store.createSession("Latest Grounding Test");
			const items1 = [{ statement: "Old", source: { url: "https://old.com", title: "Old" } }];
			const items2 = [{ statement: "New", source: { url: "https://new.com", title: "New" } }];

			await store.saveGroundingMap(session.id, 1, items1);
			await new Promise((resolve) => setTimeout(resolve, 10));
			const map2 = await store.saveGroundingMap(session.id, 2, items2);

			const latest = await store.loadLatestGroundingMap(session.id);
			expect(latest).not.toBeNull();
			expect(latest?.id).toBe(map2.id);
			expect(latest?.items[0]?.statement).toBe("New");
		} finally {
			store.closeSessionStore();
			if (typeof previousDbPath === "string") {
				process.env[SESSION_DB_PATH_ENV] = previousDbPath;
			} else {
				delete process.env[SESSION_DB_PATH_ENV];
			}
			await cleanupTempDir(tmpDir);
		}
	});

	it("returns null when no grounding maps exist for session", async () => {
		const previousDbPath = process.env[SESSION_DB_PATH_ENV];
		const tmpDir = await createTempDir();
		const dbPath = path.join(tmpDir, "sessions.sqlite");
		const store = await loadSessionStore(dbPath);

		try {
			const session = await store.createSession("Empty Grounding Test");
			const latest = await store.loadLatestGroundingMap(session.id);
			expect(latest).toBeNull();

			const maps = await store.listGroundingMaps(session.id);
			expect(maps).toEqual([]);
		} finally {
			store.closeSessionStore();
			if (typeof previousDbPath === "string") {
				process.env[SESSION_DB_PATH_ENV] = previousDbPath;
			} else {
				delete process.env[SESSION_DB_PATH_ENV];
			}
			await cleanupTempDir(tmpDir);
		}
	});

	it("tolerates corrupted items_json in grounding maps", async () => {
		const previousDbPath = process.env[SESSION_DB_PATH_ENV];
		const tmpDir = await createTempDir();
		const dbPath = path.join(tmpDir, "sessions.sqlite");
		const store = await loadSessionStore(dbPath);

		try {
			const session = await store.createSession("Corrupt Grounding");
			await store.saveGroundingMap(session.id, 1, [
				{ statement: "Valid", source: { url: "https://valid.com", title: "Valid" } },
			]);

			const database = new Database(dbPath);
			database
				.prepare("UPDATE grounding_maps SET items_json = ? WHERE session_id = ?")
				.run("not valid json", session.id);
			database.close();

			store.closeSessionStore();
			const reopened = await loadSessionStore(dbPath);
			const latest = await reopened.loadLatestGroundingMap(session.id);
			expect(latest).not.toBeNull();
			expect(latest?.items).toEqual([]);
			reopened.closeSessionStore();
		} finally {
			store.closeSessionStore();
			if (typeof previousDbPath === "string") {
				process.env[SESSION_DB_PATH_ENV] = previousDbPath;
			} else {
				delete process.env[SESSION_DB_PATH_ENV];
			}
			await cleanupTempDir(tmpDir);
		}
	});
});

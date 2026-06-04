// Shim for better-sqlite3 — uses bun:sqlite in Bun, real module in Node.js.
const isBun = typeof process !== "undefined" && process.versions && process.versions.bun;

let Database;

if (isBun) {
	const { Database: BunDB } = await import("bun:sqlite");

	const wrapStmt = (stmt) => ({
		all: (...params) => stmt.all(...params),
		get: (...params) => stmt.get(...params) ?? null,
		run: (...params) => stmt.run(...params),
	});

	Database = class {
		constructor(path) {
			this.db = new BunDB(path);
			this.db.run("PRAGMA journal_mode=WAL");
		}
		prepare(sql) {
			return wrapStmt(this.db.prepare(sql));
		}
		exec(sql) {
			this.db.run(sql);
		}
		transaction(fn) {
			return this.db.transaction(fn);
		}
		close() {
			this.db.close();
		}
	};
} else {
	Database = (await import("better-sqlite3")).default;
}

export { Database };
export default Database;

import { afterEach, describe, expect, it } from "bun:test";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { backgroundJobManager } from "../src/state/background-job-manager";
import {
	createProcessTreeTerminator,
	processTreeSpawnOptions,
	spawnBashProcessTree,
} from "../src/utils/process-tree";

const isPosix = process.platform !== "win32";

const tempDirs: string[] = [];

function makeTempDir(): string {
	const dir = mkdtempSync(path.join(tmpdir(), "daemon-proc-tree-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(() => {
	while (tempDirs.length > 0) {
		const dir = tempDirs.pop();
		if (dir) rmSync(dir, { recursive: true, force: true });
	}
});

function pidIsAlive(pid: number): boolean {
	if (!Number.isFinite(pid) || pid <= 0) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

describe("process-tree terminator", () => {
	it("exposes detached: true on POSIX and skips it on Windows", () => {
		const opts = processTreeSpawnOptions({ cwd: process.cwd(), env: process.env });
		if (isPosix) {
			expect(opts.detached).toBe(true);
		} else {
			expect(opts.detached).toBeUndefined();
		}
	});

	it("dispose() is safe to call multiple times and does not throw", () => {
		const proc = spawnBashProcessTree("exit 0", { cwd: process.cwd(), env: process.env });
		const terminator = createProcessTreeTerminator(proc, { graceMs: 5 });
		terminator.dispose();
		expect(() => terminator.dispose()).not.toThrow();
	});

	it("terminate() does not throw when the process is already gone", () => {
		const proc = spawnBashProcessTree("exit 0", { cwd: process.cwd(), env: process.env });
		const terminator = createProcessTreeTerminator(proc, { graceMs: 5 });
		// Wait for close, then terminate — must be a no-op.
		return new Promise<void>((resolve) => {
			proc.on("close", () => {
				expect(() => terminator.terminate("SIGKILL")).not.toThrow();
				terminator.dispose();
				resolve();
			});
		});
	});

	it("kills a long-running child process and its descendants", async () => {
		if (!isPosix) return;

		const dir = makeTempDir();
		const marker = path.join(dir, "child-marker");
		// Spawn a shell that backgrounds `sleep` and waits. Killing the direct
		// `bash` pid would leave `sleep` orphaned; the process-group terminator
		// must reap it.
		const command = `sleep 30 & echo $! > ${marker}; wait`;

		const proc = spawnBashProcessTree(command, { cwd: dir, env: process.env });
		const terminator = createProcessTreeTerminator(proc, { graceMs: 100 });

		// Wait for the child pid to be recorded.
		const childPid = await new Promise<number>((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error("timed out waiting for marker")), 5000);
			const interval = setInterval(() => {
				try {
					const fs = require("node:fs") as typeof import("node:fs");
					const contents = fs.readFileSync(marker, "utf8").trim();
					if (contents) {
						clearInterval(interval);
						clearTimeout(timer);
						resolve(Number.parseInt(contents, 10));
					}
				} catch {
					// Marker not written yet.
				}
			}, 25);
		});

		expect(pidIsAlive(childPid)).toBe(true);

		terminator.terminate("SIGTERM");

		await new Promise<void>((resolve) => {
			proc.on("close", () => {
				terminator.dispose();
				resolve();
			});
		});

		// Give the OS a brief moment to reap the killed child.
		await new Promise((r) => setTimeout(r, 50));
		expect(pidIsAlive(childPid)).toBe(false);
	});
});

describe("backgroundJobManager.startBashJob cancellation", () => {
	it("transitions a running bash job to 'cancelled' on cancel and terminates the process tree", async () => {
		if (!isPosix) return;

		const dir = makeTempDir();
		const marker = path.join(dir, "child-marker");
		const command = `sleep 30 & echo $! > ${marker}; wait`;

		const job = backgroundJobManager.startBashJob({
			sessionId: null,
			description: "long-running",
			command,
			workdir: dir,
		});
		expect(job.state).toBe("running");

		const childPid = await new Promise<number>((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error("timed out waiting for marker")), 5000);
			const interval = setInterval(() => {
				try {
					const fs = require("node:fs") as typeof import("node:fs");
					const contents = fs.readFileSync(marker, "utf8").trim();
					if (contents) {
						clearInterval(interval);
						clearTimeout(timer);
						resolve(Number.parseInt(contents, 10));
					}
				} catch {
					// Marker not written yet.
				}
			}, 25);
		});

		expect(pidIsAlive(childPid)).toBe(true);

		const cancelled = backgroundJobManager.cancelJob(null, job.id);
		expect(cancelled?.state).toBe("cancelled");

		// Wait for the close event to fire and re-check child liveness.
		await new Promise((r) => setTimeout(r, 200));
		expect(pidIsAlive(childPid)).toBe(false);
	});
});

// Reference `spawn` to satisfy lint when the helper-only tests are skipped on
// Windows. Without this, removing the import on Windows would itself need to
// be conditional. This keeps the module surface stable.
void spawn;

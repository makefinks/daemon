#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const args = process.argv.slice(2);
const bunCmd = process.platform === "win32" ? "bun.exe" : "bun";
const bunCheck = spawnSync(bunCmd, ["--version"], { stdio: "ignore" });

if (bunCheck.error || bunCheck.status !== 0) {
	console.error("DAEMON requires Bun. Install it from https://bun.sh and try again.");
	process.exit(1);
}

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.join(packageRoot, "src", "index.tsx");
const result = spawnSync(bunCmd, [entry, ...args], { stdio: "inherit" });

if (result.error) {
	const error = result.error instanceof Error ? result.error : new Error(String(result.error));
	console.error(error.message);
	process.exit(1);
}

process.exit(result.status ?? 0);

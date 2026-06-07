#!/usr/bin/env node

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const args = process.argv.slice(2);
const bunCmd = process.platform === "win32" ? "bun.exe" : "bun";
const headlessPrompt = args.length > 0 && !args[0]?.startsWith("-") ? args.join(" ") : null;

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.join(packageRoot, "src", "index.tsx");
const child = spawn(bunCmd, headlessPrompt ? [entry] : [entry, ...args], {
	stdio: "inherit",
	env: headlessPrompt
		? {
				...process.env,
				DAEMON_HEADLESS: "1",
				DAEMON_PROMPT: headlessPrompt,
			}
		: process.env,
});

child.once("error", (error) => {
	if ((error as NodeJS.ErrnoException).code === "ENOENT") {
		console.error("DAEMON requires Bun. Install it from https://bun.sh and try again.");
	} else {
		console.error(error.message);
	}
	process.exit(1);
});

child.once("exit", (code, signal) => {
	if (signal) {
		process.kill(process.pid, signal);
		return;
	}
	process.exit(code ?? 0);
});

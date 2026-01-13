/**
 * Debug logger for TUI development.
 * Writes to a file instead of stdout to avoid UI glitches.
 *
 * Usage:
 *   import { debug } from "../utils/debug-logger";
 *   debug.log("message", someObject);
 *
 * Then run `tail -f debug.log` in a separate terminal.
 */

import fs from "node:fs";
import path from "node:path";
import { getAppConfigDir } from "./preferences";

const LOG_FILE = path.join(getAppConfigDir(), "debug.log");
const ENABLED = process.env.DEBUG_LOG === "1" || process.env.DEBUG_LOG === "true";

function ensureLogDir(): void {
	try {
		fs.mkdirSync(getAppConfigDir(), { recursive: true });
	} catch {
		// Silently fail if we can't create the directory
	}
}

function formatValue(value: unknown): string {
	if (value === undefined) return "undefined";
	if (value === null) return "null";
	if (typeof value === "string") return value;
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

function writeLog(level: string, args: unknown[]): void {
	if (!ENABLED) return;

	const timestamp = new Date().toISOString();
	const formatted = args.map(formatValue).join(" ");
	const line = `[${timestamp}] [${level}] ${formatted}\n`;

	try {
		ensureLogDir();
		fs.appendFileSync(LOG_FILE, line);
	} catch {
		// Silently fail if we can't write
	}
}

export const debug = {
	log: (...args: unknown[]) => writeLog("LOG", args),
	info: (...args: unknown[]) => writeLog("INFO", args),
	warn: (...args: unknown[]) => writeLog("WARN", args),
	error: (...args: unknown[]) => writeLog("ERROR", args),

	/** Clear the log file */
	clear: () => {
		if (!ENABLED) return;
		try {
			ensureLogDir();
			fs.writeFileSync(LOG_FILE, "");
		} catch {
			// Silently fail
		}
	},
};

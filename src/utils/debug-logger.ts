/**
 * Debug logger for TUI development.
 * Writes to a file instead of stdout to avoid UI glitches.
 *
 * Usage:
 *   import { debug } from "../utils/debug-logger";
 *   debug.log("message", someObject);
 *
 * Then run `tail -f ~/.config/daemon/logs/debug.log` in a separate terminal.
 * Tool-specific logging uses `~/.config/daemon/logs/tools.log`.
 * Message logging uses `~/.config/daemon/logs/messages.log`.
 */

import fs from "node:fs";
import path from "node:path";
import { getAppConfigDir } from "./preferences";

const LOG_DIR = path.join(getAppConfigDir(), "logs");
const LOG_FILE = path.join(LOG_DIR, "debug.log");
const TOOLS_LOG_FILE = path.join(LOG_DIR, "tools.log");
const MESSAGES_LOG_FILE = path.join(LOG_DIR, "messages.log");
const ENABLED = process.env.DEBUG_LOG === "1" || process.env.DEBUG_LOG === "true";

function ensureLogDir(logDir: string): void {
	try {
		fs.mkdirSync(logDir, { recursive: true });
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

function writeLog(logFile: string, level: string, args: unknown[]): void {
	if (!ENABLED) return;

	const timestamp = new Date().toISOString();
	const formatted = args.map(formatValue).join(" ");
	const line = `[${timestamp}] [${level}] ${formatted}\n`;

	try {
		ensureLogDir(LOG_DIR);
		fs.appendFileSync(logFile, line);
	} catch {
		// Silently fail if we can't write
	}
}

function createDebugLogger(logFile: string) {
	return {
		log: (...args: unknown[]) => writeLog(logFile, "LOG", args),
		info: (...args: unknown[]) => writeLog(logFile, "INFO", args),
		warn: (...args: unknown[]) => writeLog(logFile, "WARN", args),
		error: (...args: unknown[]) => writeLog(logFile, "ERROR", args),

		/** Clear the log file */
		clear: () => {
			if (!ENABLED) return;
			try {
				ensureLogDir(LOG_DIR);
				fs.writeFileSync(logFile, "");
			} catch {
				// Silently fail
			}
		},
	};
}

export const debug = createDebugLogger(LOG_FILE);
export const toolDebug = createDebugLogger(TOOLS_LOG_FILE);
export const messageDebug = createDebugLogger(MESSAGES_LOG_FILE);

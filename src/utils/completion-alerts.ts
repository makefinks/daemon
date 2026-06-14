import { spawn } from "node:child_process";

function sanitizeOscText(text: string): string {
	const re = new RegExp("[\\x00-\\x1f\\x7f]", "g");
	return text.replace(re, " ").trim().slice(0, 120);
}

export interface CompletionAlertOptions {
	notificationEnabled: boolean;
	soundEnabled: boolean;
	message?: string;
}

function getTerminalControlStream(): NodeJS.WriteStream | null {
	if (process.stderr.isTTY) return process.stderr;
	if (process.stdout.isTTY) return process.stdout;
	return null;
}

function spawnDetached(command: string, args: string[]): void {
	try {
		const child = spawn(command, args, {
			detached: true,
			stdio: "ignore",
		});
		child.on("error", () => {});
		child.unref();
	} catch {
		// Completion alerts should never interrupt the active session.
	}
}

function playCompletionSound(): void {
	spawnDetached("play", [
		"-n",
		"synth",
		"0.28",
		"triangle",
		"220-140",
		"lowpass",
		"900",
		"gain",
		"-18",
		"fade",
		"q",
		"0.006",
		"0.28",
		"0.22",
		"pad",
		"0",
		"0.08",
	]);
}

export function sendCompletionAlert(options: CompletionAlertOptions): void {
	const stream = getTerminalControlStream();

	const chunks: string[] = [];
	if (stream && options.notificationEnabled) {
		const message = sanitizeOscText(options.message || "DAEMON session complete");
		if (message) chunks.push(`\x1b]9;${message}\x07`);
	}
	if (options.soundEnabled) {
		playCompletionSound();
	}
	if (stream && chunks.length > 0) stream.write(chunks.join(""));
}

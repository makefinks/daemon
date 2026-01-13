import { fileURLToPath } from "node:url";

function normalizeError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

function logError(message: string): void {
	console.error(message);
}

async function main(): Promise<void> {
	let playwrightEntryUrl: string;
	try {
		playwrightEntryUrl = import.meta.resolve("playwright");
	} catch (error) {
		logError("Playwright is not installed.");
		logError("Install it first, then retry:");
		logError("");
		logError("  bun add -d playwright");
		logError("  bun run setup:browsers");
		process.exit(1);
		return;
	}

	const cliPath = fileURLToPath(new URL("./cli.js", playwrightEntryUrl));
	const proc = Bun.spawn([process.execPath, cliPath, "install", "chromium"], {
		stdout: "inherit",
		stderr: "inherit",
	});
	const code = await proc.exited;
	if (code !== 0) {
		process.exit(code);
	}
}

try {
	await main();
} catch (error) {
	const err = normalizeError(error);
	logError(`setup:browsers failed: ${err.message}`);
	process.exit(1);
}

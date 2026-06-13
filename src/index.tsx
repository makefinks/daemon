/**
 * DAEMON - Terminal-based AI with alien/cultic aesthetics.
 * Main application entry point.
 */

import { ConsolePosition, createCliRenderer, decodePasteBytes } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { App } from "./app/App";
import { ensureSkillsDir } from "./ai/skills/skill-manager";
import { runHeadless } from "./headless-runner";
import { COLORS } from "./ui/constants";
import { cleanupAppRuntime, registerAppRuntime, shutdownApp } from "./utils/app-shutdown";
import { debug } from "./utils/debug-logger";

await ensureSkillsDir().catch((error) => {
	const err = error instanceof Error ? error : new Error(String(error));
	debug.warn("skills-dir-create-failed", { message: err.message });
});

if (process.env.DAEMON_HEADLESS === "1") {
	await runHeadless(process.env.DAEMON_PROMPT ?? "");
	process.exit(process.exitCode ?? 0);
}

// Main entry point
const renderer = await createCliRenderer({
	exitOnCtrlC: true,
	targetFps: 60,
	maxFps: 60,
	useMouse: true,
	enableMouseMovement: false,
	useKittyKeyboard: {},
	openConsoleOnError: true,
	backgroundColor: COLORS.BACKGROUND,
	consoleOptions: {
		position: ConsolePosition.BOTTOM,
		sizePercent: 30,
		startInDebugMode: false,
	},
});

// Debug: Log all paste events at the renderer level
renderer.keyInput.on("paste", (event) => {
	const pasteText = decodePasteBytes(event.bytes);
	debug.log("[Renderer] Paste event received", {
		textLength: pasteText.length,
		textPreview: pasteText.slice(0, 50),
	});
});

const root = createRoot(renderer);
registerAppRuntime({ renderer, root });

process.on("SIGINT", () => {
	shutdownApp(0);
});

process.on("exit", () => {
	// Best-effort cleanup for non-interactive exits as well.
	cleanupAppRuntime();
});

root.render(<App />);

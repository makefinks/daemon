/**
 * DAEMON - Terminal-based AI with alien/cultic aesthetics.
 * Main application entry point.
 */

import { ConsolePosition, createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { destroyMcpManager } from "./ai/mcp/mcp-manager";
import { App } from "./app/App";
import { destroyDaemonManager } from "./state/daemon-state";
import { COLORS } from "./ui/constants";
import { debug } from "./utils/debug-logger";

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
	debug.log("[Renderer] Paste event received", {
		textLength: event.text.length,
		textPreview: event.text.slice(0, 50),
	});
});

// Cleanup on exit
process.on("exit", () => {
	destroyDaemonManager();
	destroyMcpManager();
});

process.on("SIGINT", () => {
	destroyDaemonManager();
	destroyMcpManager();
	process.exit(0);
});

createRoot(renderer).render(<App />);

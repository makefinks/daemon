import type { CliRenderer } from "@opentui/core";
import { destroyMcpManager } from "../ai/mcp/mcp-manager";
import { destroyDaemonManager } from "../state/daemon-state";

interface AppRootHandle {
	unmount: () => void;
}

interface AppRuntimeHandles {
	renderer: CliRenderer;
	root: AppRootHandle;
}

let runtimeHandles: AppRuntimeHandles | null = null;
let shutdownStarted = false;

/** Register the active renderer/root so shutdown can restore terminal state cleanly. */
export function registerAppRuntime(handles: AppRuntimeHandles): void {
	runtimeHandles = handles;
}

/** Unmount the UI, destroy the renderer, and release singleton runtime state. */
export function cleanupAppRuntime(): void {
	if (runtimeHandles) {
		try {
			runtimeHandles.root.unmount();
		} catch {}
		try {
			runtimeHandles.renderer.destroy();
		} catch {}
		runtimeHandles = null;
	}

	try {
		destroyDaemonManager();
	} catch {}
	try {
		destroyMcpManager();
	} catch {}
}

/** Perform cleanup once and terminate the process with the requested exit code. */
export function shutdownApp(exitCode = 0): never {
	if (!shutdownStarted) {
		shutdownStarted = true;
		cleanupAppRuntime();
	}
	process.exit(exitCode);
}

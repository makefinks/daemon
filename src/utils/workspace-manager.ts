/**
 * Workspace manager for DAEMON sessions.
 * Each session gets a persistent workspace directory for file operations,
 * cloning repositories, and other agent tasks that shouldn't pollute
 * the user's current working directory.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { getAppConfigDir } from "./preferences";
import { debug } from "./debug-logger";

const WORKSPACES_DIR = "workspaces";

/**
 * Get the root directory for all session workspaces.
 * @returns Path to ~/.config/daemon/workspaces/
 */
export function getWorkspacesRoot(): string {
	return path.join(getAppConfigDir(), WORKSPACES_DIR);
}

/**
 * Get the workspace path for a specific session.
 * Does not create the directory - use ensureWorkspaceExists for that.
 * @param sessionId - The session UUID
 * @returns Path to ~/.config/daemon/workspaces/{sessionId}/
 */
export function getWorkspacePath(sessionId: string): string {
	return path.join(getWorkspacesRoot(), sessionId);
}

/**
 * Ensure the workspace directory exists for a session.
 * Creates the directory if it doesn't exist.
 * @param sessionId - The session UUID
 * @returns The absolute path to the workspace directory
 */
export async function ensureWorkspaceExists(sessionId: string): Promise<string> {
	const workspacePath = getWorkspacePath(sessionId);
	try {
		await fs.mkdir(workspacePath, { recursive: true });
		debug.info("workspace-created", { sessionId, path: workspacePath });
	} catch (error) {
		// If directory already exists, that's fine
		const err = error instanceof Error ? error : new Error(String(error));
		if (!err.message.includes("EEXIST")) {
			debug.error("workspace-create-failed", { sessionId, message: err.message });
			throw err;
		}
	}
	return workspacePath;
}

/**
 * Delete the workspace directory for a session.
 * Called when a session is deleted.
 * @param sessionId - The session UUID
 */
export async function deleteWorkspace(sessionId: string): Promise<void> {
	const workspacePath = getWorkspacePath(sessionId);
	try {
		await fs.rm(workspacePath, { recursive: true, force: true });
		debug.info("workspace-deleted", { sessionId, path: workspacePath });
	} catch (error) {
		// Log but don't throw - cleanup failures shouldn't break session deletion
		const err = error instanceof Error ? error : new Error(String(error));
		debug.error("workspace-delete-failed", { sessionId, message: err.message });
	}
}

/**
 * Check if a workspace exists for a session.
 * @param sessionId - The session UUID
 * @returns true if the workspace directory exists
 */
export async function workspaceExists(sessionId: string): Promise<boolean> {
	const workspacePath = getWorkspacePath(sessionId);
	try {
		const stat = await fs.stat(workspacePath);
		return stat.isDirectory();
	} catch {
		return false;
	}
}

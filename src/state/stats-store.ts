/**
 * Stats store for HUD stats.
 *
 * Tokens, sessions, artifacts, and memories are all derived from current
 * state at call time:
 *   - sessions/tokens: from the sessions SQLite table (sum of usage)
 *   - artifacts:       from on-disk files in each session's workspace
 *   - memories:        from the mem0 vector store via MemoryManager
 *
 * Tools and skills remain in-memory counters driven by the MCP manager and
 * skill toggles — they have no persistent on-disk source of their own.
 *
 * No polling — the controller re-fetches stats when relevant events fire.
 */

import { getMemoryManager } from "../ai/memory/memory-manager";
import { getMcpManager } from "../ai/mcp/mcp-manager";
import { TOOL_REGISTRY } from "../ai/tools/tool-registry";
import { getDaemonManager } from "./daemon-state";
import { listSessions } from "./session-store";
import type { DaemonStats } from "../types";
import { debug } from "../utils/debug-logger";
import { countWorkspaceFiles } from "../utils/workspace-manager";

let cachedEnabledSkillCount = 0;

export function setEnabledSkillCount(count: number): void {
	cachedEnabledSkillCount = count;
}

function computeToolCount(): number {
	try {
		const toggles = getDaemonManager().toolToggles ?? {};
		let builtinCount = 0;
		for (const entry of TOOL_REGISTRY) {
			if (toggles[entry.toggleKey] !== false) {
				builtinCount++;
			}
		}
		const mcpTools = Object.keys(getMcpManager().getToolsSnapshot()).length;
		return builtinCount + mcpTools;
	} catch {
		return TOOL_REGISTRY.length;
	}
}

/** Compute all current-state stats. Async because sessions and memory are I/O. */
export async function getStats(): Promise<DaemonStats> {
	let totalTokens = 0;
	let totalSessions = 0;
	let totalArtifacts = 0;
	try {
		const sessions = await listSessions();
		totalSessions = sessions.length;
		for (const s of sessions) {
			const sessionTokens = s.totalTokens ?? 0;
			const subagentTokens = s.subagentTotalTokens ?? 0;
			totalTokens += sessionTokens + subagentTokens;
			try {
				totalArtifacts += countWorkspaceFiles(s.id);
			} catch {
				// Missing workspace dir is fine — count as 0.
			}
		}
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		debug.error("stats-sessions-failed", { message: err.message });
	}

	let totalMemories = 0;
	try {
		const memory = getMemoryManager();
		if (memory.isAvailable) {
			const all = await memory.getAll();
			totalMemories = all.length;
		}
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		debug.error("stats-memories-failed", { message: err.message });
	}

	return {
		totalTokens,
		totalSessions,
		totalToolCalls: computeToolCount(),
		totalMemories,
		totalSkills: cachedEnabledSkillCount,
		totalArtifacts,
	};
}

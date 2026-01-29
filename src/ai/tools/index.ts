import type { ToolSet } from "ai";

import { getDaemonManager } from "../../state/daemon-state";
import { getMcpManager } from "../mcp/mcp-manager";
import type { ToolAvailabilityMap } from "./tool-registry";
import { buildToolSet } from "./tool-registry";

let cachedDaemonBaseTools: Promise<ToolSet> | null = null;
let cachedAvailability: ToolAvailabilityMap | null = null;

export function invalidateDaemonToolsCache(): void {
	cachedDaemonBaseTools = null;
	cachedAvailability = null;
}

export function getCachedToolAvailability(): ToolAvailabilityMap | null {
	return cachedAvailability;
}

export async function getDaemonTools(): Promise<ToolSet> {
	if (!cachedDaemonBaseTools) {
		cachedDaemonBaseTools = (async () => {
			const toggles = getDaemonManager().toolToggles;
			const { tools, availability } = await buildToolSet(toggles);
			cachedAvailability = availability;
			return tools;
		})();
	}

	const baseTools = await cachedDaemonBaseTools;
	const mcpTools = getMcpManager().getToolsSnapshot();
	if (Object.keys(mcpTools).length === 0) return baseTools;
	return { ...baseTools, ...mcpTools };
}

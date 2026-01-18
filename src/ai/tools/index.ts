import type { ToolSet } from "ai";

import { getDaemonManager } from "../../state/daemon-state";
import type { ToolAvailabilityMap } from "./tool-registry";
import { buildToolSet } from "./tool-registry";

let cachedDaemonTools: Promise<ToolSet> | null = null;
let cachedAvailability: ToolAvailabilityMap | null = null;

export function invalidateDaemonToolsCache(): void {
	cachedDaemonTools = null;
	cachedAvailability = null;
}

export function getCachedToolAvailability(): ToolAvailabilityMap | null {
	return cachedAvailability;
}

export async function getDaemonTools(): Promise<ToolSet> {
	if (cachedDaemonTools) {
		return cachedDaemonTools;
	}

	cachedDaemonTools = (async () => {
		const toggles = getDaemonManager().toolToggles;
		const { tools, availability } = await buildToolSet(toggles);
		cachedAvailability = availability;
		return tools;
	})();

	return cachedDaemonTools;
}

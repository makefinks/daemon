import { RigEngine } from "./rig/core/rig-engine";
import type { RigEngineOptions } from "./rig/core/rig-types";

export { RigEngine } from "./rig/core/rig-engine";
export type { RigEngineOptions } from "./rig/core/rig-types";
export type { ToolCategory } from "./rig/tools/rig-tools";
export { TOOL_CATEGORY_COLORS } from "./rig/tools/rig-tools";

// Re-export for consumers that expect DaemonColorTheme
export type { AvatarColorTheme as DaemonColorTheme } from "src/types";

export type DaemonRig = RigEngine;

export function createDaemonRig(options: RigEngineOptions): DaemonRig {
	return new RigEngine(options);
}

import type { AvatarColorTheme } from "src/types";
import type { ToolCategory } from "../tools/rig-tools";

export interface RigEngineOptions {
	aspectRatio: number;
}

export type RigEvent =
	| { type: "theme"; theme: AvatarColorTheme }
	| { type: "intensity"; intensity: number; immediate?: boolean }
	| { type: "audio"; level: number; immediate?: boolean }
	| { type: "tool-active"; active: boolean; category?: ToolCategory }
	| { type: "tool-flash"; category?: ToolCategory }
	| { type: "tool-complete" }
	| { type: "reasoning"; active: boolean }
	| { type: "typing"; active: boolean }
	| { type: "typing-pulse" };

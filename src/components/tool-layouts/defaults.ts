import type { ToolLayoutConfig } from "./types";

export const defaultToolLayout: ToolLayoutConfig = {
	abbreviation: "tool",
};

export function getDefaultAbbreviation(toolName: string): string {
	return toolName.length > 8 ? toolName.slice(0, 8) : toolName;
}

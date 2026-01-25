export type ToolCategory = "web" | "file" | "bash" | "subagent";

export const TOOL_CATEGORY_COLORS: Record<ToolCategory, number> = {
	web: 0x22d3ee,
	file: 0x4ade80,
	bash: 0xfbbf24,
	subagent: 0xa78bfa,
};

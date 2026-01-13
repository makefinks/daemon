import type { ToolLayoutConfig, ToolLayoutRegistry } from "./types";

const registry: ToolLayoutRegistry = new Map();

export function registerToolLayout(toolName: string, config: ToolLayoutConfig): void {
	registry.set(toolName, config);
}

export function getToolLayout(toolName: string): ToolLayoutConfig | undefined {
	return registry.get(toolName);
}

export function hasToolLayout(toolName: string): boolean {
	return registry.has(toolName);
}

export { registry };

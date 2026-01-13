import type { ToolLayoutConfig } from "../types";
import { registerToolLayout } from "../registry";

export const systemInfoLayout: ToolLayoutConfig = {
	abbreviation: "sys",
};

registerToolLayout("getSystemInfo", systemInfoLayout);

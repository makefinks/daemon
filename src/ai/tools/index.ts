import type { ToolSet } from "ai";
import { fetchUrls } from "./fetch-urls";

import { readFile } from "./read-file";
import { groundingManager } from "./grounding-manager";
import { renderUrl } from "./render-url";
import { runBash } from "./run-bash";
import { todoManager } from "./todo-manager";
import { subagent } from "./subagents";
import { webSearch } from "./web-search";

import { detectLocalPlaywrightChromium } from "../../utils/js-rendering";

let cachedDaemonTools: Promise<ToolSet> | null = null;

export function isWebSearchAvailable(): boolean {
	return Boolean(process.env.EXA_API_KEY);
}

export function invalidateDaemonToolsCache(): void {
	cachedDaemonTools = null;
}

export async function getDaemonTools(): Promise<ToolSet> {
	if (cachedDaemonTools) {
		return cachedDaemonTools;
	}

	cachedDaemonTools = (async () => {
		const tools: ToolSet = {
			readFile,
			groundingManager,
			runBash,
			todoManager,
			subagent,
		};

		if (isWebSearchAvailable()) {
			(tools as ToolSet & { webSearch: typeof webSearch }).webSearch = webSearch;
			(tools as ToolSet & { fetchUrls: typeof fetchUrls }).fetchUrls = fetchUrls;
		}

		const jsRendering = await detectLocalPlaywrightChromium();
		if (jsRendering.available) {
			return { ...tools, renderUrl };
		}

		return tools;
	})();

	return cachedDaemonTools;
}

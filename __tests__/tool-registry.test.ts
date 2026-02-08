import { afterEach, describe, expect, it } from "bun:test";

import {
	buildMenuItems,
	buildToolSet,
	getDefaultToolOrder,
	resolveToolAvailability,
} from "../src/ai/tools/tool-registry";
import { setModelProvider } from "../src/ai/model-config";
import { DEFAULT_TOOL_TOGGLES } from "../src/types";

const ORIGINAL_ENV = { ...process.env };

describe("tool registry", () => {
	afterEach(() => {
		process.env = { ...ORIGINAL_ENV };
		setModelProvider("openrouter");
	});

	it("orders menu items consistently", async () => {
		process.env = { ...process.env, EXA_API_KEY: undefined };
		const availability = await resolveToolAvailability({ ...DEFAULT_TOOL_TOGGLES });
		const menuItems = buildMenuItems(availability);
		const order = getDefaultToolOrder();

		expect(Object.keys(menuItems)).toEqual(order);
	});

	it("disables webSearch and fetchUrls without EXA key", async () => {
		process.env = { ...process.env, EXA_API_KEY: undefined };
		const availability = await resolveToolAvailability({ ...DEFAULT_TOOL_TOGGLES });

		expect(availability.webSearch.envAvailable).toBe(false);
		expect(availability.fetchUrls.envAvailable).toBe(false);
		expect(availability.webSearch.disabledReason).toBeDefined();
		expect(availability.fetchUrls.disabledReason).toBeDefined();
	});

	it("omits subagent and groundingManager from subagent toolset", async () => {
		const { tools } = await buildToolSet(
			{ ...DEFAULT_TOOL_TOGGLES },
			{ omit: ["groundingManager", "subagent"] }
		);

		expect("subagent" in tools).toBe(false);
		expect("groundingManager" in tools).toBe(false);
	});

	it("disables subagent when provider capabilities do not support it", async () => {
		setModelProvider("copilot");
		const availability = await resolveToolAvailability({ ...DEFAULT_TOOL_TOGGLES });

		expect(availability.subagent.envAvailable).toBe(false);
		expect(availability.subagent.disabledReason).toBeDefined();
	});
});

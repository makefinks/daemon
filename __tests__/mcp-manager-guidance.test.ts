import { afterEach, describe, expect, it } from "bun:test";

import { destroyMcpManager, getMcpManager } from "../src/ai/mcp/mcp-manager";

type MutableMcpManager = ReturnType<typeof getMcpManager> & {
	servers: Array<{
		id: string;
		isDefault: boolean;
		enabled: boolean;
		status: string;
	}>;
};

describe("MCP prompt guidance gating", () => {
	afterEach(() => {
		destroyMcpManager();
	});

	it("only includes guidance for enabled ready default servers", () => {
		const manager = getMcpManager() as MutableMcpManager;
		manager.servers = [
			{
				id: "puppeteer",
				isDefault: true,
				enabled: true,
				status: "ready",
			},
		];

		const guidance = manager.getPromptGuidanceSnapshot({ supportsVision: true });

		expect(guidance).toHaveLength(1);
		expect(guidance[0]).toContain("Puppeteer MCP");
		expect(guidance[0]).toContain("Do not use Puppeteer MCP as the default way to gather information");
		expect(guidance[0]).toContain("Prefer fetchUrls for reading page contents");
		expect(guidance[0]).toContain("puppeteer_evaluate");
		expect(guidance[0]).toContain("starts headless by default");
		expect(guidance[0]).toContain("headless=false");
		expect(guidance[0]).toContain("headless=true");
		expect(guidance[0]).toContain('data-daemon-highlight="true"');
		expect(guidance[0]).toContain("rgba(255, 204, 0, 0.7)");
		expect(guidance[0]).toContain("avoid emoji, decorative icons");
		expect(guidance[0]).toContain("cookie banners");
		expect(guidance[0]).toContain("temporarily hide blocking noise");
		expect(guidance[0]).toContain('do not add a "DAEMON SOURCE" label or any other label');
		expect(guidance[0]).toContain("take a screenshot to visually verify placement");
		expect(guidance[0]).toContain("internal visual verification");
	});

	it("omits guidance for disabled default servers", () => {
		const manager = getMcpManager() as MutableMcpManager;
		manager.servers = [
			{
				id: "puppeteer",
				isDefault: true,
				enabled: false,
				status: "disabled",
			},
		];

		expect(manager.getPromptGuidanceSnapshot({ supportsVision: true })).toEqual([]);
	});

	it("omits guidance until default servers are ready", () => {
		const manager = getMcpManager() as MutableMcpManager;
		manager.servers = [
			{
				id: "puppeteer",
				isDefault: true,
				enabled: true,
				status: "loading",
			},
		];

		expect(manager.getPromptGuidanceSnapshot({ supportsVision: true })).toEqual([]);
	});

	it("emits non-vision guidance when the active model cannot inspect images", () => {
		const manager = getMcpManager() as MutableMcpManager;
		manager.servers = [
			{
				id: "puppeteer",
				isDefault: true,
				enabled: true,
				status: "ready",
			},
		];

		const guidance = manager.getPromptGuidanceSnapshot({ supportsVision: false });

		expect(guidance).toHaveLength(1);
		expect(guidance[0]).toContain("Do not use screenshots for your own visual verification");
		expect(guidance[0]).toContain("do not take screenshots for internal verification");
	});
});

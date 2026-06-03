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
				id: "chrome-devtools",
				isDefault: true,
				enabled: true,
				status: "ready",
			},
		];

		const guidance = manager.getPromptGuidanceSnapshot();

		expect(guidance).toHaveLength(1);
		expect(guidance[0]).toContain("Chrome DevTools MCP");
		expect(guidance[0]).toContain("Do not use Chrome DevTools MCP as the default way to gather information");
		expect(guidance[0]).toContain("Prefer fetchUrls for reading page contents");
		expect(guidance[0]).toContain("evaluate_script");
		expect(guidance[0]).toContain('data-daemon-highlight="true"');
		expect(guidance[0]).toContain("#f59e0b");
		expect(guidance[0]).toContain("no emoji");
		expect(guidance[0]).toContain("DAEMON SOURCE");
		expect(guidance[0]).toContain(
			'every highlight must include a visible label using exactly "DAEMON SOURCE"'
		);
		expect(guidance[0]).toContain("avoid emoji, decorative icons");
		expect(guidance[0]).toContain("cookie banners");
		expect(guidance[0]).toContain("temporarily hide blocking noise");
		expect(guidance[0]).toContain("do not obstruct the exact highlighted text");
		expect(guidance[0]).toContain('pointer-events="none"');
		expect(guidance[0]).toContain("take a screenshot to visually verify placement");
		expect(guidance[0]).toContain("internal visual verification");
	});

	it("omits guidance for disabled default servers", () => {
		const manager = getMcpManager() as MutableMcpManager;
		manager.servers = [
			{
				id: "chrome-devtools",
				isDefault: true,
				enabled: false,
				status: "disabled",
			},
		];

		expect(manager.getPromptGuidanceSnapshot()).toEqual([]);
	});

	it("omits guidance until default servers are ready", () => {
		const manager = getMcpManager() as MutableMcpManager;
		manager.servers = [
			{
				id: "chrome-devtools",
				isDefault: true,
				enabled: true,
				status: "loading",
			},
		];

		expect(manager.getPromptGuidanceSnapshot()).toEqual([]);
	});
});

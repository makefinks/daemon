import { describe, expect, it } from "bun:test";

import { DEFAULT_MCP_SERVERS } from "../src/ai/mcp/default-servers";

describe("default MCP servers", () => {
	it("configures Puppeteer as a headless default browser server", () => {
		const puppeteer = DEFAULT_MCP_SERVERS.find((server) => server.id === "puppeteer");
		const launchOptions = JSON.parse(puppeteer?.env?.PUPPETEER_LAUNCH_OPTIONS ?? "{}");

		expect(puppeteer?.args).toEqual(["-y", "@modelcontextprotocol/server-puppeteer"]);
		expect(launchOptions.headless).toBe(true);
		expect(launchOptions.defaultViewport).toEqual({ width: 1280, height: 800 });
		expect(launchOptions.args).toContain("--lang=en-US");
		expect(launchOptions.userDataDir).toContain("puppeteer-profile");
	});
});

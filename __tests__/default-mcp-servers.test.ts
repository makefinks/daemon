import { describe, expect, it } from "bun:test";

import { DEFAULT_MCP_SERVERS } from "../src/ai/mcp/default-servers";

describe("default MCP servers", () => {
	it("configures Chrome DevTools with US English browser locale", () => {
		const chromeDevTools = DEFAULT_MCP_SERVERS.find((server) => server.id === "chrome-devtools");

		expect(chromeDevTools?.args).toContain("--chrome-arg=--accept-lang=en-US,en");
		expect(chromeDevTools?.args).toContain("--chrome-arg=--lang=en-US");
	});
});

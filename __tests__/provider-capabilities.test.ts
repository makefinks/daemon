import { afterEach, describe, expect, it } from "bun:test";
import { setModelProvider } from "../src/ai/model-config";
import { getProviderCapabilities } from "../src/ai/providers/capabilities";

describe("provider capabilities", () => {
	afterEach(() => {
		setModelProvider("openrouter");
	});

	it("returns explicit capabilities for each provider", () => {
		expect(getProviderCapabilities("openrouter").supportsSubagentTool).toBe(true);
		expect(getProviderCapabilities("copilot").supportsSubagentTool).toBe(false);
	});

	it("defaults to current provider when no provider is provided", () => {
		setModelProvider("copilot");
		expect(getProviderCapabilities().supportsSubagentTool).toBe(false);
	});
});

import { afterEach, describe, expect, it } from "bun:test";
import { setModelProvider } from "../src/ai/model-config";
import { getProviderCapabilities } from "../src/ai/providers/capabilities";

describe("provider capabilities", () => {
	afterEach(() => {
		setModelProvider("openrouter");
	});

	it("returns explicit capabilities for each provider", () => {
		expect(getProviderCapabilities("openrouter").supportsSubagentTool).toBe(true);
		expect(getProviderCapabilities("openrouter").supportsImageToolOutput).toBe(true);
		expect(getProviderCapabilities("openai-codex").supportsSubagentTool).toBe(true);
		expect(getProviderCapabilities("openai-codex").supportsImageToolOutput).toBe(true);
		expect(getProviderCapabilities("copilot").supportsSubagentTool).toBe(true);
		expect(getProviderCapabilities("copilot").supportsImageToolOutput).toBe(false);
	});

	it("defaults to current provider when no provider is provided", () => {
		setModelProvider("openai-codex");
		expect(getProviderCapabilities().supportsSubagentTool).toBe(true);
	});
});

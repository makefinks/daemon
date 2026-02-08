import { afterEach, describe, expect, it } from "bun:test";
import { setModelProvider } from "../src/ai/model-config";
import { getProviderAdapter } from "../src/ai/providers/registry";

describe("provider registry", () => {
	afterEach(() => {
		setModelProvider("openrouter");
	});

	it("returns adapter for explicit provider", () => {
		expect(getProviderAdapter("openrouter").id).toBe("openrouter");
		expect(getProviderAdapter("copilot").id).toBe("copilot");
	});

	it("defaults to current model provider", () => {
		setModelProvider("copilot");
		expect(getProviderAdapter().id).toBe("copilot");
	});
});

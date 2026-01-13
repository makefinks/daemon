import { describe, it, expect } from "bun:test";
import {
	calculateCost,
	formatCost,
	formatContextUsage,
	resolveOpenRouterProviderPricing,
} from "../src/utils/model-metadata";
import type { ModelPricing } from "../src/types";
import { formatContextWindowK } from "../src/utils/formatters";

describe("calculateCost", () => {
	const standardPricing: ModelPricing = {
		prompt: 5,
		completion: 15,
	};

	const cachedPricing: ModelPricing = {
		prompt: 5,
		completion: 15,
		inputCacheRead: 0.5,
		inputCacheWrite: 1,
	};

	it("calculates cost with no cached tokens", () => {
		const cost = calculateCost(1000, 500, standardPricing);
		expect(cost).toBeCloseTo(0.0125, 6);
	});

	it("calculates cost with cached tokens", () => {
		const cost = calculateCost(1000, 500, cachedPricing, 300);
		expect(cost).toBeCloseTo(0.01115, 6);
	});

	it("handles all tokens cached", () => {
		const cost = calculateCost(1000, 500, cachedPricing, 1000);
		expect(cost).toBeCloseTo(0.008, 6);
	});

	it("clamps cached tokens to prompt tokens", () => {
		const cost = calculateCost(1000, 500, cachedPricing, 2000);
		const expected = calculateCost(1000, 500, cachedPricing, 1000);
		expect(cost).toBe(expected);
	});

	it("handles zero tokens", () => {
		expect(calculateCost(0, 0, standardPricing)).toBe(0);
	});

	it("handles negative cached tokens", () => {
		const cost = calculateCost(1000, 500, cachedPricing, -100);
		const expected = calculateCost(1000, 500, cachedPricing, 0);
		expect(cost).toBe(expected);
	});

	it("uses prompt price when cache read price not available", () => {
		const cost = calculateCost(1000, 500, standardPricing, 300);
		const expected = (1000 / 1_000_000) * 5 + (500 / 1_000_000) * 15;
		expect(cost).toBe(expected);
	});
});

describe("formatCost", () => {
	it("formats very small costs", () => {
		expect(formatCost(0.00001)).toBe("<$0.0001");
		expect(formatCost(0.000099)).toBe("<$0.0001");
	});

	it("formats zero cost", () => {
		expect(formatCost(0)).toBe("$0.00");
	});

	it("formats small costs with 4 decimal places", () => {
		expect(formatCost(0.0001)).toBe("$0.0001");
		expect(formatCost(0.001)).toBe("$0.0010");
		expect(formatCost(0.0099)).toBe("$0.0099");
	});

	it("formats regular costs with 2 decimal places", () => {
		expect(formatCost(0.01)).toBe("$0.01");
		expect(formatCost(0.1)).toBe("$0.10");
		expect(formatCost(1)).toBe("$1.00");
		expect(formatCost(10.5)).toBe("$10.50");
	});

	it("formats large costs", () => {
		expect(formatCost(100)).toBe("$100.00");
		expect(formatCost(999.99)).toBe("$999.99");
	});
});

describe("formatContextUsage", () => {
	it("formats small percentages", () => {
		expect(formatContextUsage(50, 10000)).toBe("0.5%");
		expect(formatContextUsage(100, 10000)).toBe("1%");
		expect(formatContextUsage(5, 10000)).toBe("0.1%");
	});

	it("formats larger percentages without decimal", () => {
		expect(formatContextUsage(1500, 10000)).toBe("15%");
		expect(formatContextUsage(5000, 10000)).toBe("50%");
		expect(formatContextUsage(9999, 10000)).toBe("100%");
	});

	it("handles zero usage", () => {
		expect(formatContextUsage(0, 10000)).toBe("0.0%");
	});

	it("handles edge case of 100% exact", () => {
		expect(formatContextUsage(1000, 1000)).toBe("100%");
	});
});

describe("resolveOpenRouterProviderPricing", () => {
	it("resolves pricing by provider tag", () => {
		const providers = [{ tag: "openai", providerName: "OpenAI", pricing: { prompt: 5, completion: 10 } }];
		expect(resolveOpenRouterProviderPricing(providers, "openai")).toEqual({ prompt: 5, completion: 10 });
	});

	it("resolves pricing by provider name (case-insensitive)", () => {
		const providers = [{ tag: "openai", providerName: "OpenAI", pricing: { prompt: 5, completion: 10 } }];
		expect(resolveOpenRouterProviderPricing(providers, "OpenAI")).toEqual({ prompt: 5, completion: 10 });
		expect(resolveOpenRouterProviderPricing(providers, "openai")).toEqual({ prompt: 5, completion: 10 });
	});

	it("returns undefined when no pricing is available", () => {
		const providers = [{ tag: "openai", providerName: "OpenAI" }];
		expect(resolveOpenRouterProviderPricing(providers, "openai")).toBeUndefined();
	});
});

describe("formatContextWindowK", () => {
	it("formats context lengths in K", () => {
		expect(formatContextWindowK(32000)).toBe("32K");
		expect(formatContextWindowK(32768)).toBe("32K");
		expect(formatContextWindowK(8192)).toBe("8K");
	});
});

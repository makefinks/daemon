import { describe, it, expect } from "bun:test";
import { parsePreferences } from "../src/utils/preferences";
import type { AppPreferences } from "../src/types";

describe("parsePreferences", () => {
	it("creates default preferences for empty object", () => {
		const result = parsePreferences({});
		expect(result).not.toBeNull();
		expect(result?.onboardingCompleted).toBe(false);
		expect(result?.version).toBe(1);
		expect(typeof result?.createdAt).toBe("string");
		expect(typeof result?.updatedAt).toBe("string");
	});

	it("preserves existing values", () => {
		const input: AppPreferences = {
			version: 1,
			createdAt: "2024-01-01T00:00:00.000Z",
			updatedAt: "2024-01-02T00:00:00.000Z",
			onboardingCompleted: true,
			audioDeviceName: "Default Device",
			modelId: "anthropic/claude-3-opus",
			interactionMode: "voice",
			voiceInteractionType: "direct",
			speechSpeed: 1.5,
			reasoningEffort: "high",
			openRouterApiKey: "sk-or-xxx",
			openAiApiKey: "sk-xxx",
			exaApiKey: "exa-xxx",
		};
		const result = parsePreferences(input);
		expect(result).toEqual(input);
	});

	it("defaults onboardingCompleted to false", () => {
		const result = parsePreferences({});
		expect(result?.onboardingCompleted).toBe(false);
	});

	it("preserves onboardingCompleted when true", () => {
		const result = parsePreferences({ onboardingCompleted: true });
		expect(result?.onboardingCompleted).toBe(true);
	});

	it("defaults version to 1", () => {
		const result = parsePreferences({});
		expect(result?.version).toBe(1);
	});

	it("preserves version when provided", () => {
		const result = parsePreferences({ version: 2 });
		expect(result?.version).toBe(2);
	});

	it("defaults createdAt to current time", () => {
		const before = Date.now();
		const result = parsePreferences({});
		const after = Date.now();
		expect(result?.createdAt).toBeDefined();
		const createdAtTime = new Date(result?.createdAt ?? "").getTime();
		expect(createdAtTime).toBeGreaterThanOrEqual(before);
		expect(createdAtTime).toBeLessThanOrEqual(after);
	});

	it("preserves createdAt when provided", () => {
		const dateStr = "2024-01-01T00:00:00.000Z";
		const result = parsePreferences({ createdAt: dateStr });
		expect(result?.createdAt).toBe(dateStr);
	});

	it("defaults updatedAt to createdAt if not provided", () => {
		const result = parsePreferences({ createdAt: "2024-01-01T00:00:00.000Z" });
		expect(result?.updatedAt).toBe(result?.createdAt);
	});

	it("preserves updatedAt when provided", () => {
		const result = parsePreferences({
			createdAt: "2024-01-01T00:00:00.000Z",
			updatedAt: "2024-01-02T00:00:00.000Z",
		});
		expect(result?.updatedAt).toBe("2024-01-02T00:00:00.000Z");
	});

	describe("optional fields", () => {
		it("includes audioDeviceName when provided", () => {
			const result = parsePreferences({ audioDeviceName: "My Device" });
			expect(result?.audioDeviceName).toBe("My Device");
		});

		it("omits audioDeviceName when not provided", () => {
			const result = parsePreferences({});
			expect(result?.audioDeviceName).toBeUndefined();
		});

		it("includes modelId when provided", () => {
			const result = parsePreferences({ modelId: "gpt-4" });
			expect(result?.modelId).toBe("gpt-4");
		});

		it("omits modelId when not provided", () => {
			const result = parsePreferences({});
			expect(result?.modelId).toBeUndefined();
		});

		describe("interactionMode", () => {
			it("includes valid interactionMode values", () => {
				const textResult = parsePreferences({ interactionMode: "text" });
				expect(textResult?.interactionMode).toBe("text");

				const voiceResult = parsePreferences({ interactionMode: "voice" });
				expect(voiceResult?.interactionMode).toBe("voice");
			});

			it("omits invalid interactionMode values", () => {
				const result = parsePreferences({ interactionMode: "invalid" });
				expect(result?.interactionMode).toBeUndefined();
			});
		});

		describe("speechSpeed", () => {
			it("includes valid speechSpeed values", () => {
				for (const speed of [1.0, 1.25, 1.5, 1.75, 2.0] as const) {
					const result = parsePreferences({ speechSpeed: speed });
					expect(result?.speechSpeed).toBe(speed);
				}
			});

			it("omits invalid speechSpeed values", () => {
				const result = parsePreferences({ speechSpeed: 2.5 });
				expect(result?.speechSpeed).toBeUndefined();
			});
		});

		describe("reasoningEffort", () => {
			it("includes valid reasoningEffort values", () => {
				const low = parsePreferences({ reasoningEffort: "low" });
				expect(low?.reasoningEffort).toBe("low");

				const medium = parsePreferences({ reasoningEffort: "medium" });
				expect(medium?.reasoningEffort).toBe("medium");

				const high = parsePreferences({ reasoningEffort: "high" });
				expect(high?.reasoningEffort).toBe("high");
			});

			it("omits invalid reasoningEffort values", () => {
				const result = parsePreferences({ reasoningEffort: "extreme" });
				expect(result?.reasoningEffort).toBeUndefined();
			});
		});

		describe("API keys", () => {
			it("includes openRouterApiKey when provided", () => {
				const result = parsePreferences({ openRouterApiKey: "sk-or-xxx" });
				expect(result?.openRouterApiKey).toBe("sk-or-xxx");
			});

			it("omits openRouterApiKey when not provided", () => {
				const result = parsePreferences({});
				expect(result?.openRouterApiKey).toBeUndefined();
			});

			it("includes openAiApiKey when provided", () => {
				const result = parsePreferences({ openAiApiKey: "sk-xxx" });
				expect(result?.openAiApiKey).toBe("sk-xxx");
			});

			it("omits openAiApiKey when not provided", () => {
				const result = parsePreferences({});
				expect(result?.openAiApiKey).toBeUndefined();
			});

			it("includes exaApiKey when provided", () => {
				const result = parsePreferences({ exaApiKey: "exa-xxx" });
				expect(result?.exaApiKey).toBe("exa-xxx");
			});

			it("omits exaApiKey when not provided", () => {
				const result = parsePreferences({});
				expect(result?.exaApiKey).toBeUndefined();
			});
		});
	});
});

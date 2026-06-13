import type { ModelPricing } from "../types";

export function parseOpenRouterPricePerTokenToPerMillion(pricePerToken: unknown): number | undefined {
	if (typeof pricePerToken !== "string") return undefined;
	const parsed = Number(pricePerToken);
	if (!Number.isFinite(parsed)) return undefined;
	return parsed * 1_000_000;
}

export function mergePricingAverages(pricings: ModelPricing[]): ModelPricing | undefined {
	let promptSum = 0;
	let promptCount = 0;

	let completionSum = 0;
	let completionCount = 0;

	let inputCacheReadSum = 0;
	let inputCacheReadCount = 0;

	let inputCacheWriteSum = 0;
	let inputCacheWriteCount = 0;

	for (const pricing of pricings) {
		if (Number.isFinite(pricing.prompt)) {
			promptSum += pricing.prompt;
			promptCount += 1;
		}
		if (Number.isFinite(pricing.completion)) {
			completionSum += pricing.completion;
			completionCount += 1;
		}

		if (pricing.inputCacheRead !== undefined && Number.isFinite(pricing.inputCacheRead)) {
			inputCacheReadSum += pricing.inputCacheRead;
			inputCacheReadCount += 1;
		}
		if (pricing.inputCacheWrite !== undefined && Number.isFinite(pricing.inputCacheWrite)) {
			inputCacheWriteSum += pricing.inputCacheWrite;
			inputCacheWriteCount += 1;
		}
	}

	if (promptCount === 0 || completionCount === 0) return undefined;

	const merged: ModelPricing = {
		prompt: promptSum / promptCount,
		completion: completionSum / completionCount,
	};

	if (inputCacheReadCount > 0) {
		merged.inputCacheRead = inputCacheReadSum / inputCacheReadCount;
	}

	if (inputCacheWriteCount > 0) {
		merged.inputCacheWrite = inputCacheWriteSum / inputCacheWriteCount;
	}

	return merged;
}

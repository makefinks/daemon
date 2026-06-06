import type { ModelPricing } from "../types";

export function parseOpenRouterPricePerTokenToPerMillion(pricePerToken: unknown): number | undefined {
	if (typeof pricePerToken !== "string") return undefined;
	const parsed = Number(pricePerToken);
	if (!Number.isFinite(parsed)) return undefined;
	return parsed * 1_000_000;
}

export function mergePricingMinima(pricings: ModelPricing[]): ModelPricing | undefined {
	if (pricings.length === 0) return undefined;

	let minPrompt = Number.POSITIVE_INFINITY;
	let minCompletion = Number.POSITIVE_INFINITY;
	let minCacheRead: number | undefined;
	let minCacheWrite: number | undefined;

	for (const pricing of pricings) {
		if (Number.isFinite(pricing.prompt) && pricing.prompt < minPrompt) {
			minPrompt = pricing.prompt;
		}
		if (Number.isFinite(pricing.completion) && pricing.completion < minCompletion) {
			minCompletion = pricing.completion;
		}
		if (
			pricing.inputCacheRead !== undefined &&
			Number.isFinite(pricing.inputCacheRead) &&
			(minCacheRead === undefined || pricing.inputCacheRead < minCacheRead)
		) {
			minCacheRead = pricing.inputCacheRead;
		}
		if (
			pricing.inputCacheWrite !== undefined &&
			Number.isFinite(pricing.inputCacheWrite) &&
			(minCacheWrite === undefined || pricing.inputCacheWrite < minCacheWrite)
		) {
			minCacheWrite = pricing.inputCacheWrite;
		}
	}

	if (!Number.isFinite(minPrompt) || !Number.isFinite(minCompletion)) return undefined;

	const merged: ModelPricing = { prompt: minPrompt, completion: minCompletion };
	if (minCacheRead !== undefined) merged.inputCacheRead = minCacheRead;
	if (minCacheWrite !== undefined) merged.inputCacheWrite = minCacheWrite;
	return merged;
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

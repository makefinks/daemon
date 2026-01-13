/**
 * Fetches and caches model metadata from OpenRouter API.
 * Provides context window size and pricing information.
 */

import type { ModelPricing } from "../types";
import { debug } from "./debug-logger";
import { getOpenRouterModelEndpointsMetadata } from "./openrouter-endpoints";
import { mergePricingAverages } from "./openrouter-pricing";

export interface ModelMetadata {
	id: string;
	name: string;
	contextLength: number;
	pricing?: ModelPricing;
	/** Whether this model supports the reasoning effort parameter */
	supportsReasoning: boolean;
	/** Whether any provider endpoint supports caching (best-effort). */
	supportsCaching: boolean;
}

type CachedModelMetadataEntry = {
	timestamp: number;
	metadata: ModelMetadata;
};

// In-memory cache for model metadata (derived from per-model endpoints)
let cachedByModelId: Map<string, CachedModelMetadataEntry> | null = null;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Build model-level metadata from OpenRouter per-model endpoint info.
 */
async function fetchModelMetadata(modelId: string): Promise<ModelMetadata | null> {
	const now = Date.now();

	if (!cachedByModelId) cachedByModelId = new Map();

	const cached = cachedByModelId.get(modelId);
	if (cached && now - cached.timestamp < CACHE_TTL_MS) return cached.metadata;

	try {
		debug.log("Fetching model endpoint metadata from OpenRouter...", { modelId });

		const endpoints = await getOpenRouterModelEndpointsMetadata(modelId);
		if (!endpoints) return null;

		const contextLength = endpoints.providers.reduce((max, p) => {
			const value = typeof p.contextLength === "number" ? p.contextLength : 0;
			return Math.max(max, value);
		}, 0);

		const pricingCandidates = endpoints.providers
			.map((p) => p.pricing)
			.filter((p): p is ModelPricing => Boolean(p));

		const pricing = pricingCandidates.length > 0 ? mergePricingAverages(pricingCandidates) : undefined;

		const supportsCaching = endpoints.providers.some((p) => p.supportsCaching);

		const metadata: ModelMetadata = {
			id: endpoints.modelId,
			name: endpoints.modelName ?? endpoints.modelId,
			contextLength,
			pricing,
			supportsReasoning: endpoints.supportsReasoning,
			supportsCaching,
		};

		cachedByModelId.set(modelId, { timestamp: now, metadata });
		return metadata;
	} catch (error) {
		debug.error("Failed to fetch model metadata:", error);
		return cached?.metadata ?? null;
	}
}

/**
 * Get metadata for a specific model.
 * @param modelId - The OpenRouter model ID (e.g., "google/gemini-2.5-flash-preview")
 */
export async function getModelMetadata(modelId: string): Promise<ModelMetadata | null> {
	return fetchModelMetadata(modelId);
}

/**
 * Get metadata for multiple models.
 * @param modelIds - Array of OpenRouter model IDs
 * @returns Map of model ID to metadata (only includes models that were found)
 */
export async function getModelsMetadata(modelIds: string[]): Promise<Map<string, ModelMetadata>> {
	const result = new Map<string, ModelMetadata>();
	const concurrency = 4;
	let index = 0;

	const workers = Array.from({ length: Math.min(concurrency, modelIds.length) }).map(async () => {
		while (index < modelIds.length) {
			const current = modelIds[index++];
			if (!current) continue;
			const metadata = await fetchModelMetadata(current);
			if (metadata) result.set(current, metadata);
		}
	});

	await Promise.all(workers);
	return result;
}

export async function getOpenRouterProviderPricing(
	modelId: string,
	providerTag: string
): Promise<ModelPricing | undefined> {
	const endpoints = await getOpenRouterModelEndpointsMetadata(modelId);
	return resolveOpenRouterProviderPricing(endpoints?.providers ?? [], providerTag);
}

export function resolveOpenRouterProviderPricing(
	providers: Array<{ tag: string; providerName: string; pricing?: ModelPricing }>,
	providerId: string
): ModelPricing | undefined {
	const normalized = providerId.trim().toLowerCase();
	if (!normalized) return undefined;

	const provider = providers.find((p) => {
		return p.tag.toLowerCase() === normalized || p.providerName.trim().toLowerCase() === normalized;
	});

	return provider?.pricing;
}

export async function calculateOpenRouterCostForProvider(
	modelId: string,
	providerTag: string,
	promptTokens: number,
	completionTokens: number,
	cachedInputTokens?: number
): Promise<number | undefined> {
	const pricing = await getOpenRouterProviderPricing(modelId, providerTag);
	if (!pricing) return undefined;
	return calculateCost(promptTokens, completionTokens, pricing, cachedInputTokens);
}

/**
 * Calculate the cost in USD for a given token usage.
 *
 * Note: some providers expose discounted cache pricing (OpenRouter: `input_cache_read`).
 * When `cachedInputTokens` is provided and the model has `pricing.inputCacheRead`,
 * those cached tokens are charged at the discounted rate.
 */
export function calculateCost(
	promptTokens: number,
	completionTokens: number,
	pricing: ModelPricing,
	cachedInputTokens?: number
): number {
	const cached = Math.max(0, Math.min(cachedInputTokens ?? 0, promptTokens));
	const uncachedPromptTokens = Math.max(0, promptTokens - cached);

	const promptCost =
		(uncachedPromptTokens / 1_000_000) * pricing.prompt +
		(cached / 1_000_000) * (pricing.inputCacheRead ?? pricing.prompt);
	const completionCost = (completionTokens / 1_000_000) * pricing.completion;
	return promptCost + completionCost;
}

/**
 * Format a cost value as a USD string.
 */
export function formatCost(cost: number): string {
	if (cost <= 0) {
		return "$0.00";
	}
	if (cost < 0.0001) {
		return "<$0.0001";
	}
	if (cost < 0.01) {
		return `$${cost.toFixed(4)}`;
	}
	return `$${cost.toFixed(2)}`;
}

/**
 * Format context usage as a percentage string.
 */
export function formatContextUsage(usedTokens: number, contextLength: number): string {
	const percentage = (usedTokens / contextLength) * 100;
	if (percentage < 1) {
		return `${percentage.toFixed(1)}%`;
	}
	return `${Math.round(percentage)}%`;
}

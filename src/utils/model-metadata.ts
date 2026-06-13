/**
 * Resolves model metadata (capabilities) for the active provider.
 *
 * OpenRouter metadata is derived from the in-memory `/api/v1/models` cache
 * populated by `openrouter-models.ts`, so no per-model network call is required.
 * Per-provider pricing + inference routing still lives behind
 * `getOpenRouterProviderPricing`, which uses the lazy `/endpoints` API.
 */

import type { LlmProvider, ModelPricing } from "../types";
import { getOpenAiCodexModelMetadata } from "./openai-codex-models";
import { debug } from "./debug-logger";
import { getOpenRouterModelEndpointsMetadata } from "./openrouter-endpoints";
import {
	getOpenRouterModels,
	getOpenRouterRawModelItem,
	modelItemContextLength,
	modelItemDisplayName,
	modelItemSupportsCaching,
	modelItemSupportsReasoning,
	modelItemSupportsVision,
	subscribeOpenRouterModelsCacheChanged,
} from "./openrouter-models";

export interface ModelMetadata {
	id: string;
	name: string;
	contextLength: number;
	/** Whether this model supports the reasoning effort parameter */
	supportsReasoning: boolean;
	/** Whether the model advertises cache pricing (best-effort). */
	supportsCaching: boolean;
	/** Whether this model accepts image input. */
	supportsVision: boolean;
}

type CachedModelMetadataEntry = {
	timestamp: number;
	metadata: ModelMetadata;
};

// In-memory cache for derived ModelMetadata (per-id) so we don't recompute
// every time a component asks. Invalidated whenever the underlying OpenRouter
// models cache is replaced (see subscriber below).
let cachedByModelId: Map<string, CachedModelMetadataEntry> | null = null;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

subscribeOpenRouterModelsCacheChanged(() => {
	cachedByModelId = null;
});

function buildOpenRouterModelMetadata(modelId: string): ModelMetadata | null {
	const item = getOpenRouterRawModelItem(modelId);
	if (!item) return null;
	return {
		id: modelId,
		name: modelItemDisplayName(item, modelId),
		contextLength: modelItemContextLength(item),
		supportsReasoning: modelItemSupportsReasoning(item),
		supportsCaching: modelItemSupportsCaching(item),
		supportsVision: modelItemSupportsVision(item),
	};
}

function getCachedOrBuild(modelId: string): ModelMetadata | null {
	if (!cachedByModelId) cachedByModelId = new Map();
	const now = Date.now();
	const cached = cachedByModelId.get(modelId);
	if (cached && now - cached.timestamp < CACHE_TTL_MS) return cached.metadata;

	const built = buildOpenRouterModelMetadata(modelId);
	if (built) cachedByModelId.set(modelId, { timestamp: now, metadata: built });
	return built;
}

export async function getModelMetadataForProvider(
	modelId: string,
	provider: LlmProvider
): Promise<ModelMetadata | null> {
	if (provider === "openai-codex") {
		return getOpenAiCodexModelMetadata(modelId);
	}
	if (provider !== "openrouter") {
		return null;
	}
	try {
		// Ensure the raw OpenRouter catalog is loaded. `getOpenRouterModels` is
		// idempotent and returns immediately from the in-memory cache on
		// subsequent calls, so awaiting it is safe and avoids a cold-start race
		// where the daemon effect fires before the catalog loader resolves.
		await getOpenRouterModels();
		return getCachedOrBuild(modelId);
	} catch (error) {
		debug.error("Failed to resolve OpenRouter model metadata:", error);
		return null;
	}
}

/**
 * Per-provider pricing for an OpenRouter model. This is the only place we still
 * hit the per-model `/endpoints` API; callers should use it lazily (e.g. when
 * the user opens the provider routing menu, or when a specific provider is
 * already pinned).
 */
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

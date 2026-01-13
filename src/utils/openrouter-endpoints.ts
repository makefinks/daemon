/**
 * Fetches and caches per-model endpoint/provider data from OpenRouter.
 *
 * Note: OpenRouter's `/api/v1/models` endpoint does not include the full list of
 * inference providers. The provider list is exposed per-model via:
 * `/api/v1/models/{modelId}/endpoints`
 */

import { debug } from "./debug-logger";
import type { ModelPricing } from "../types";
import { mergePricingAverages, parseOpenRouterPricePerTokenToPerMillion } from "./openrouter-pricing";

export interface OpenRouterInferenceProvider {
	/** Provider routing slug (matches OpenRouter `provider.order` entries), e.g. "openai" */
	tag: string;
	/** Human-friendly provider name, e.g. "OpenAI" */
	providerName: string;
	/** Context length for this provider (best-effort, max across endpoints) */
	contextLength?: number;
	/** Prices per 1M tokens (best-effort, averaged across endpoints) */
	pricing?: ModelPricing;
	/** Whether this provider appears to support caching */
	supportsCaching: boolean;
}

interface OpenRouterEndpointsEndpoint {
	provider_name?: string;
	tag?: string;
	context_length?: number;
	pricing?: {
		prompt?: string;
		completion?: string;
		input_cache_read?: string;
		input_cache_write?: string;
	};
	supports_implicit_caching?: boolean;
	supported_parameters?: string[];
}

interface OpenRouterEndpointsResponse {
	data?: {
		id?: string;
		name?: string;
		endpoints?: OpenRouterEndpointsEndpoint[];
	};
}

export interface OpenRouterModelEndpointsMetadata {
	modelId: string;
	modelName?: string;
	/** Provider summaries derived from endpoints. */
	providers: OpenRouterInferenceProvider[];
	/** Whether ANY endpoint supports reasoning controls. */
	supportsReasoning: boolean;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

type CachedModelEntry = {
	timestamp: number;
	data: OpenRouterModelEndpointsMetadata;
};

let cachedByModelId: Map<string, CachedModelEntry> | null = null;

function encodeModelIdForEndpointsPath(modelId: string): string {
	// OpenRouter expects the slash to remain a path separator. Encode each segment.
	return modelId.split("/").map(encodeURIComponent).join("/");
}

function parseEndpointPricingToPerMillion(
	pricing: OpenRouterEndpointsEndpoint["pricing"]
): ModelPricing | undefined {
	if (!pricing || typeof pricing !== "object") return undefined;

	const prompt = parseOpenRouterPricePerTokenToPerMillion(pricing.prompt);
	const completion = parseOpenRouterPricePerTokenToPerMillion(pricing.completion);
	if (prompt === undefined || completion === undefined) return undefined;

	const parsed: ModelPricing = { prompt, completion };

	const cacheReadPrice = parseOpenRouterPricePerTokenToPerMillion(pricing.input_cache_read);
	if (cacheReadPrice !== undefined) parsed.inputCacheRead = cacheReadPrice;

	const cacheWritePrice = parseOpenRouterPricePerTokenToPerMillion(pricing.input_cache_write);
	if (cacheWritePrice !== undefined) parsed.inputCacheWrite = cacheWritePrice;

	return parsed;
}

function endpointSupportsReasoning(endpoint: OpenRouterEndpointsEndpoint): boolean {
	const params = endpoint.supported_parameters;
	if (!Array.isArray(params)) return false;
	return params.includes("reasoning") || params.includes("reasoning_effort");
}

async function fetchModelEndpointsMetadata(modelId: string): Promise<OpenRouterModelEndpointsMetadata> {
	const encodedPath = encodeModelIdForEndpointsPath(modelId);
	const url = `https://openrouter.ai/api/v1/models/${encodedPath}/endpoints`;

	const response = await fetch(url, {
		headers: {
			"Content-Type": "application/json",
		},
	});

	if (!response.ok) {
		throw new Error(`OpenRouter endpoints API error: ${response.status}`);
	}

	const data = (await response.json()) as OpenRouterEndpointsResponse;
	const endpoints = data.data?.endpoints ?? [];

	const supportsReasoning = endpoints.some(endpointSupportsReasoning);

	const byTag = new Map<string, OpenRouterInferenceProvider>();
	const pricingByTag = new Map<string, ModelPricing[]>();

	for (const endpoint of endpoints) {
		const tag = typeof endpoint.tag === "string" ? endpoint.tag : "";
		if (!tag) continue;

		const providerName =
			typeof endpoint.provider_name === "string" && endpoint.provider_name.trim().length > 0
				? endpoint.provider_name.trim()
				: tag;

		const existing = byTag.get(tag);
		if (existing) {
			const contextLength = typeof endpoint.context_length === "number" ? endpoint.context_length : undefined;
			if (contextLength !== undefined) {
				existing.contextLength = Math.max(existing.contextLength ?? 0, contextLength);
			}
			existing.supportsCaching =
				existing.supportsCaching ||
				endpoint.supports_implicit_caching === true ||
				endpoint.pricing?.input_cache_read !== undefined ||
				endpoint.pricing?.input_cache_write !== undefined;
		}

		if (!existing) {
			const contextLength = typeof endpoint.context_length === "number" ? endpoint.context_length : undefined;
			byTag.set(tag, {
				tag,
				providerName,
				contextLength,
				supportsCaching:
					endpoint.supports_implicit_caching === true ||
					endpoint.pricing?.input_cache_read !== undefined ||
					endpoint.pricing?.input_cache_write !== undefined,
			});
		}

		const parsedPricing = parseEndpointPricingToPerMillion(endpoint.pricing);
		if (parsedPricing) {
			const list = pricingByTag.get(tag);
			if (list) {
				list.push(parsedPricing);
			} else {
				pricingByTag.set(tag, [parsedPricing]);
			}
		}
	}

	const providers = Array.from(byTag.values())
		.map((provider) => {
			const prices = pricingByTag.get(provider.tag);
			const merged = prices ? mergePricingAverages(prices) : undefined;
			return merged ? { ...provider, pricing: merged } : provider;
		})
		.sort((a, b) => {
			const byName = a.providerName.localeCompare(b.providerName);
			if (byName !== 0) return byName;
			return a.tag.localeCompare(b.tag);
		});

	return {
		modelId,
		modelName: typeof data.data?.name === "string" ? data.data.name : undefined,
		providers,
		supportsReasoning,
	};
}

/**
 * Get the list of inference providers available for a given model.
 * Results are cached in-memory for a day.
 */
export async function getOpenRouterModelProviders(modelId: string): Promise<OpenRouterInferenceProvider[]> {
	const metadata = await getOpenRouterModelEndpointsMetadata(modelId);
	return metadata?.providers ?? [];
}

export async function getOpenRouterModelEndpointsMetadata(
	modelId: string
): Promise<OpenRouterModelEndpointsMetadata | null> {
	const now = Date.now();
	if (!cachedByModelId) cachedByModelId = new Map();

	const cached = cachedByModelId.get(modelId);
	if (cached && now - cached.timestamp < CACHE_TTL_MS) return cached.data;

	try {
		debug.log("Fetching OpenRouter endpoints for model...", { modelId });
		const data = await fetchModelEndpointsMetadata(modelId);
		cachedByModelId.set(modelId, { timestamp: now, data });
		return data;
	} catch (error) {
		debug.error("Failed to fetch OpenRouter endpoints:", error);
		return cached?.data ?? null;
	}
}

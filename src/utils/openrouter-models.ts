/**
 * Fetches and caches the full OpenRouter models list.
 * This is used to populate the "all models" picker section.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import type { ModelOption, ModelPricing } from "../types";
import { debug } from "./debug-logger";
import { getAppConfigDir } from "./preferences";
import { parseOpenRouterPricePerTokenToPerMillion } from "./openrouter-pricing";
import { openRouterModelSupportsXHigh } from "./openrouter-reasoning-tiers";

interface OpenRouterModelItem {
	id?: string;
	name?: string;
	context_length?: number;
	pricing?: {
		prompt?: string;
		completion?: string;
		input_cache_read?: string;
		input_cache_write?: string;
	};
	supports_tools?: boolean;
	supported_parameters?: string[];
	architecture?: {
		input_modalities?: string[];
	};
}

interface OpenRouterModelsResponse {
	data?: OpenRouterModelItem[];
}

interface OpenRouterModelsCache {
	timestamp: number;
	models: ModelOption[];
	rawById: Record<string, OpenRouterModelItem>;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_FILENAME = "openrouter-models.json";

let inMemoryCache: OpenRouterModelsCache | null = null;

function getCachePath(): string {
	return path.join(getAppConfigDir(), CACHE_FILENAME);
}

function parsePricing(pricing?: OpenRouterModelItem["pricing"]): ModelPricing | undefined {
	if (!pricing || typeof pricing !== "object") return undefined;

	const prompt = parseOpenRouterPricePerTokenToPerMillion(pricing.prompt);
	const completion = parseOpenRouterPricePerTokenToPerMillion(pricing.completion);
	if (prompt === undefined || completion === undefined) return undefined;

	const parsed: ModelPricing = { prompt, completion };

	const cacheRead = parseOpenRouterPricePerTokenToPerMillion(pricing.input_cache_read);
	if (cacheRead !== undefined) parsed.inputCacheRead = cacheRead;

	const cacheWrite = parseOpenRouterPricePerTokenToPerMillion(pricing.input_cache_write);
	if (cacheWrite !== undefined) parsed.inputCacheWrite = cacheWrite;

	return parsed;
}

export function modelItemSupportsCaching(item: OpenRouterModelItem | undefined): boolean {
	if (!item?.pricing) return false;
	return item.pricing.input_cache_read !== undefined || item.pricing.input_cache_write !== undefined;
}

function supportsToolCalling(model: OpenRouterModelItem): boolean {
	if (typeof model.supports_tools === "boolean") return model.supports_tools;

	const params = Array.isArray(model.supported_parameters)
		? model.supported_parameters.map((p) => p.toLowerCase())
		: [];

	if (params.length > 0) {
		const toolParams = new Set(["tools", "tool_choice", "functions", "function_call", "tool-call"]);
		return params.some((p) => toolParams.has(p));
	}

	// If the API doesn't expose tool support, exclude the model by default.
	return false;
}

function modelSupportsReasoningEffort(model: OpenRouterModelItem): boolean {
	const params = Array.isArray(model.supported_parameters)
		? model.supported_parameters.map((p) => p.toLowerCase())
		: [];
	return params.includes("reasoning") || params.includes("reasoning_effort");
}

export function modelItemSupportsVision(item: OpenRouterModelItem | undefined): boolean {
	return item?.architecture?.input_modalities?.includes("image") === true;
}

export function modelItemSupportsReasoning(item: OpenRouterModelItem | undefined): boolean {
	if (!item) return false;
	return modelSupportsReasoningEffort(item);
}

export function modelItemContextLength(item: OpenRouterModelItem | undefined): number {
	return typeof item?.context_length === "number" ? item.context_length : 0;
}

export function modelItemDisplayName(item: OpenRouterModelItem | undefined, id: string): string {
	if (item && typeof item.name === "string" && item.name.trim().length > 0) return item.name.trim();
	return id;
}

function normalizeModels(items: OpenRouterModelItem[]): {
	models: ModelOption[];
	rawById: Record<string, OpenRouterModelItem>;
} {
	const models: ModelOption[] = [];
	const rawById: Record<string, OpenRouterModelItem> = {};

	for (const item of items) {
		const id = typeof item.id === "string" ? item.id.trim() : "";
		if (!id) continue;
		rawById[id] = item;
		if (!supportsToolCalling(item)) continue;

		const name = modelItemDisplayName(item, id);
		const contextLength = typeof item.context_length === "number" ? item.context_length : undefined;
		const pricing = parsePricing(item.pricing);

		models.push({
			id,
			name,
			contextLength,
			pricing,
			supportsCaching: modelItemSupportsCaching(item),
			supportsVision: modelItemSupportsVision(item),
			supportsReasoningEffort: modelSupportsReasoningEffort(item),
			supportsReasoningEffortXHigh: openRouterModelSupportsXHigh(id),
		});
	}

	return { models, rawById };
}

async function readCache(): Promise<OpenRouterModelsCache | null> {
	try {
		const payload = await fs.readFile(getCachePath(), "utf8");
		const data = JSON.parse(payload) as OpenRouterModelsCache;
		if (!data || typeof data.timestamp !== "number" || !Array.isArray(data.models)) return null;
		if (!data.rawById || typeof data.rawById !== "object") {
			data.rawById = {};
		}
		// The trimmed `models` list is now derivable from `rawById`; re-normalize
		// so any newly-added fields (e.g. `supportsCaching`) are populated even
		// for caches written before they were introduced. Caches without
		// `rawById` (legacy) are treated as invalid so we refetch.
		const rawItems = Object.values(data.rawById);
		if (rawItems.length > 0) {
			const { models } = normalizeModels(rawItems);
			data.models = models;
			return data;
		}
		return null;
	} catch {
		return null;
	}
}

async function writeCache(cache: OpenRouterModelsCache): Promise<void> {
	try {
		const dir = getAppConfigDir();
		await fs.mkdir(dir, { recursive: true });
		await fs.writeFile(getCachePath(), JSON.stringify(cache, null, 2), "utf8");
	} catch (error) {
		debug.error("Failed to write OpenRouter models cache:", error);
	}
}

async function fetchOpenRouterModelsFromApi(): Promise<OpenRouterModelsCache> {
	const url = "https://openrouter.ai/api/v1/models";
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};

	const apiKey = process.env.OPENROUTER_API_KEY;
	if (apiKey) {
		headers.Authorization = `Bearer ${apiKey}`;
	}

	const response = await fetch(url, { headers });
	if (!response.ok) {
		throw new Error(`OpenRouter models API error: ${response.status}`);
	}

	const data = (await response.json()) as OpenRouterModelsResponse;
	const items = Array.isArray(data.data) ? data.data : [];

	const { models, rawById } = normalizeModels(items);
	const payload: OpenRouterModelsCache = {
		timestamp: Date.now(),
		models,
		rawById,
	};

	await writeCache(payload);
	return payload;
}

function isCacheFresh(cache: OpenRouterModelsCache): boolean {
	return Date.now() - cache.timestamp < CACHE_TTL_MS;
}

export interface OpenRouterModelsResult {
	models: ModelOption[];
	timestamp: number | null;
	fromCache: boolean;
}

export function getOpenRouterRawModelItem(modelId: string): OpenRouterModelItem | undefined {
	if (!inMemoryCache) return undefined;
	return inMemoryCache.rawById[modelId];
}

const cacheChangeListeners = new Set<() => void>();

/**
 * Subscribe to changes of the in-memory OpenRouter models cache. The listener
 * fires whenever the cache is replaced (initial load, disk read, or forced
 * refresh), letting dependents drop derived state (e.g. cached
 * `ModelMetadata`) that would otherwise go stale.
 */
export function subscribeOpenRouterModelsCacheChanged(listener: () => void): () => void {
	cacheChangeListeners.add(listener);
	return () => {
		cacheChangeListeners.delete(listener);
	};
}

function notifyCacheChanged(): void {
	for (const listener of cacheChangeListeners) {
		try {
			listener();
		} catch (error) {
			debug.error("OpenRouter models cache change listener threw:", error);
		}
	}
}

function setInMemoryCache(cache: OpenRouterModelsCache | null): void {
	inMemoryCache = cache;
	notifyCacheChanged();
}

export async function getOpenRouterModels(options?: {
	forceRefresh?: boolean;
}): Promise<OpenRouterModelsResult> {
	const forceRefresh = options?.forceRefresh ?? false;

	if (!forceRefresh && inMemoryCache && isCacheFresh(inMemoryCache)) {
		return {
			models: inMemoryCache.models,
			timestamp: inMemoryCache.timestamp,
			fromCache: true,
		};
	}

	if (!forceRefresh) {
		const diskCache = await readCache();
		if (diskCache && isCacheFresh(diskCache)) {
			setInMemoryCache(diskCache);
			return {
				models: diskCache.models,
				timestamp: diskCache.timestamp,
				fromCache: true,
			};
		}
	}

	try {
		debug.log("Fetching OpenRouter model list...");
		const cache = await fetchOpenRouterModelsFromApi();
		setInMemoryCache(cache);
		return { models: cache.models, timestamp: cache.timestamp, fromCache: false };
	} catch (error) {
		debug.error("Failed to fetch OpenRouter models:", error);
		const fallback = inMemoryCache ?? (await readCache());
		if (fallback) {
			setInMemoryCache(fallback);
			return {
				models: fallback.models,
				timestamp: fallback.timestamp,
				fromCache: true,
			};
		}
		return { models: [], timestamp: null, fromCache: true };
	}
}

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
}

interface OpenRouterModelsResponse {
	data?: OpenRouterModelItem[];
}

interface OpenRouterModelsCache {
	timestamp: number;
	models: ModelOption[];
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

function normalizeModels(items: OpenRouterModelItem[]): ModelOption[] {
	const models: ModelOption[] = [];

	for (const item of items) {
		const id = typeof item.id === "string" ? item.id.trim() : "";
		if (!id) continue;
		if (!supportsToolCalling(item)) continue;

		const name = typeof item.name === "string" && item.name.trim().length > 0 ? item.name.trim() : id;
		const contextLength = typeof item.context_length === "number" ? item.context_length : undefined;
		const pricing = parsePricing(item.pricing);

		models.push({
			id,
			name,
			contextLength,
			pricing,
		});
	}

	return models;
}

async function readCache(): Promise<OpenRouterModelsCache | null> {
	try {
		const payload = await fs.readFile(getCachePath(), "utf8");
		const data = JSON.parse(payload) as OpenRouterModelsCache;
		if (!data || typeof data.timestamp !== "number" || !Array.isArray(data.models)) return null;
		return data;
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

	const models = normalizeModels(items);
	const payload: OpenRouterModelsCache = {
		timestamp: Date.now(),
		models,
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
			inMemoryCache = diskCache;
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
		inMemoryCache = cache;
		return { models: cache.models, timestamp: cache.timestamp, fromCache: false };
	} catch (error) {
		debug.error("Failed to fetch OpenRouter models:", error);
		const fallback = inMemoryCache ?? (await readCache());
		if (fallback) {
			inMemoryCache = fallback;
			return {
				models: fallback.models,
				timestamp: fallback.timestamp,
				fromCache: true,
			};
		}
		return { models: [], timestamp: null, fromCache: true };
	}
}

import type { ModelOption } from "../types";
import { OPENAI_CODEX_BASE_URL, openAiCodexAuthenticatedFetch } from "../ai/openai-codex-fetch";
import type { ModelMetadata } from "./model-metadata";
import { debug } from "./debug-logger";

interface OpenAiCodexReasoningLevel {
	reasoning_effort?: string;
	effort?: string;
	value?: string;
	id?: string;
	name?: string;
	slug?: string;
}

interface OpenAiCodexModelInfo {
	slug?: string;
	display_name?: string;
	context_window?: number | null;
	supported_reasoning_levels?: OpenAiCodexReasoningLevel[];
	supported_in_api?: boolean;
	visibility?: string;
	priority?: number;
}

interface OpenAiCodexModelsResponse {
	models?: OpenAiCodexModelInfo[];
}

interface NormalizedModelEntry {
	option: ModelOption;
	metadata: ModelMetadata;
	priority: number;
}

let inMemoryCache: {
	timestamp: number;
	models: ModelOption[];
	metadataById: Map<string, ModelMetadata>;
} | null = null;

/** Normalize Codex reasoning-level payloads to lowercase string ids. */
function normalizeReasoningLevels(levels: OpenAiCodexReasoningLevel[] | undefined): string[] {
	if (!Array.isArray(levels)) return [];
	return levels
		.map((level) => {
			const candidate =
				level.reasoning_effort ?? level.effort ?? level.value ?? level.id ?? level.name ?? level.slug;
			return typeof candidate === "string" ? candidate.trim().toLowerCase() : "";
		})
		.filter(Boolean);
}

/** Convert one raw Codex model entry into DAEMON's model/menu metadata shape. */
function normalizeModelInfo(model: OpenAiCodexModelInfo): NormalizedModelEntry | null {
	if (typeof model.slug !== "string" || model.slug.trim().length === 0) {
		return null;
	}
	if (model.supported_in_api === false) {
		return null;
	}

	const id = model.slug.trim();
	const reasoningLevels = normalizeReasoningLevels(model.supported_reasoning_levels);
	const supportsReasoning = reasoningLevels.length > 0;
	const supportsXHigh = reasoningLevels.includes("xhigh") || reasoningLevels.includes("max");
	const contextLength =
		typeof model.context_window === "number" && model.context_window > 0 ? model.context_window : undefined;
	const name =
		typeof model.display_name === "string" && model.display_name.trim().length > 0
			? model.display_name.trim()
			: id;

	return {
		option: {
			id,
			name,
			contextLength,
			supportsReasoningEffort: supportsReasoning,
			supportsReasoningEffortXHigh: supportsXHigh,
		},
		metadata: {
			id,
			name,
			contextLength: contextLength ?? 0,
			supportsReasoning,
			supportsCaching: false,
			supportsVision: true,
		},
		priority: typeof model.priority === "number" ? model.priority : 0,
	};
}

/** Fetch and normalize the authenticated model catalog from the Codex backend. */
async function fetchOpenAiCodexModels(): Promise<{
	models: ModelOption[];
	metadataById: Map<string, ModelMetadata>;
}> {
	const response = await openAiCodexAuthenticatedFetch(`${OPENAI_CODEX_BASE_URL}/models`);
	if (!response.ok) {
		const details = await response.text().catch(() => "");
		throw new Error(`OpenAI Codex models request failed (${response.status}): ${details || "No details"}`);
	}

	const data = (await response.json()) as OpenAiCodexModelsResponse;
	const normalized = (data.models ?? [])
		.map(normalizeModelInfo)
		.filter((entry): entry is NonNullable<typeof entry> => entry !== null)
		.filter(
			(entry) =>
				entry.metadata.contextLength > 0 || entry.option.supportsReasoningEffort || entry.option.id.length > 0
		)
		.sort((a, b) => {
			if (a.priority !== b.priority) return b.priority - a.priority;
			return a.option.name.localeCompare(b.option.name);
		});

	return {
		models: normalized.map((entry) => entry.option),
		metadataById: new Map(normalized.map((entry) => [entry.metadata.id, entry.metadata])),
	};
}

/** Return the cached Codex model catalog, refreshing it on demand when needed. */
export async function getOpenAiCodexModels(options: { forceRefresh?: boolean } = {}): Promise<{
	models: ModelOption[];
	timestamp: number | null;
	fromCache: boolean;
}> {
	const now = Date.now();
	if (!options.forceRefresh && inMemoryCache) {
		return {
			models: inMemoryCache.models,
			timestamp: inMemoryCache.timestamp,
			fromCache: true,
		};
	}

	try {
		const result = await fetchOpenAiCodexModels();
		inMemoryCache = {
			timestamp: now,
			models: result.models,
			metadataById: result.metadataById,
		};
		return {
			models: result.models,
			timestamp: now,
			fromCache: false,
		};
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		debug.error("Failed to fetch OpenAI Codex models:", err);
		return {
			models: inMemoryCache?.models ?? [],
			timestamp: inMemoryCache?.timestamp ?? null,
			fromCache: Boolean(inMemoryCache),
		};
	}
}

/** Resolve metadata for a specific Codex model from the in-memory catalog cache. */
export async function getOpenAiCodexModelMetadata(modelId: string): Promise<ModelMetadata | null> {
	if (!modelId.trim()) return null;
	if (!inMemoryCache) {
		await getOpenAiCodexModels();
	}
	return inMemoryCache?.metadataById.get(modelId.trim()) ?? null;
}

/** Clear the in-memory Codex model cache so the next read refetches it. */
export function clearOpenAiCodexModelsCache(): void {
	inMemoryCache = null;
}

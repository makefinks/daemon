import type { ModelOption } from "../types";
import { listCopilotModelsSafe } from "../ai/copilot-client";
import { debug } from "./debug-logger";

let inMemoryCache: { timestamp: number; models: ModelOption[] } | null = null;
function supportsXHighReasoning(modelId: string): boolean {
	const normalized = modelId.trim().toLowerCase();
	return normalized.includes("5.1") || normalized.includes("5.2") || normalized.includes("codex");
}

function normalizeCopilotModels(
	items: Array<{
		id: string;
		name: string;
		capabilities?: {
			supports?: {
				reasoningEffort?: boolean;
			};
			limits?: {
				max_context_window_tokens?: number;
			};
		};
	}>
): ModelOption[] {
	return items
		.filter((item) => typeof item.id === "string" && item.id.trim().length > 0)
		.map((item) => ({
			id: item.id.trim(),
			name: typeof item.name === "string" && item.name.trim().length > 0 ? item.name.trim() : item.id.trim(),
			contextLength: item.capabilities?.limits?.max_context_window_tokens,
			supportsReasoningEffort: item.capabilities?.supports?.reasoningEffort === true,
			supportsReasoningEffortXHigh: supportsXHighReasoning(item.id.trim()),
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getCopilotModels(options: { forceRefresh?: boolean } = {}): Promise<{
	models: ModelOption[];
	timestamp: number | null;
	fromCache: boolean;
}> {
	const now = Date.now();
	const forceRefresh = options.forceRefresh === true;

	if (!forceRefresh && inMemoryCache) {
		return {
			models: inMemoryCache.models,
			timestamp: inMemoryCache.timestamp,
			fromCache: true,
		};
	}

	try {
		const modelInfo = await listCopilotModelsSafe();
		const models = normalizeCopilotModels(modelInfo);
		if (models.length > 0) {
			inMemoryCache = {
				timestamp: now,
				models,
			};
			return {
				models,
				timestamp: now,
				fromCache: false,
			};
		}
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		debug.error("Failed to fetch Copilot models:", err);
	}

	return {
		models: inMemoryCache?.models ?? [],
		timestamp: inMemoryCache?.timestamp ?? null,
		fromCache: Boolean(inMemoryCache),
	};
}

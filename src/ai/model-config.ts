/**
 * Centralized model configuration for DAEMON.
 */

import type { OpenRouterChatSettings } from "@openrouter/ai-sdk-provider";
import type { LlmProvider, ModelOption } from "../types";
import { loadManualConfig } from "../utils/config";

// Available models for selection (OpenRouter format)
export const AVAILABLE_OPENROUTER_MODELS: ModelOption[] = [
	{ id: "x-ai/grok-4.1-fast", name: "Grok 4.1 Fast" },
	{ id: "z-ai/glm-5.1", name: "GLM 5.1" },
	{ id: "minimax/minimax-m2.7", name: "Minimax M2.7" },
	{ id: "google/gemini-3-flash-preview", name: "Gemini 3 Flash" },
	{ id: "google/gemma-4-31b-it", name: "Gemma 4 31B" },
	{ id: "moonshotai/kimi-k2.5", name: "Kimi K2.5" },
];

// Default model IDs
export const DEFAULT_OPENROUTER_MODEL_ID = "z-ai/glm-4.7";
export const DEFAULT_COPILOT_MODEL_ID = "claude-sonnet-4.5";
export const DEFAULT_MODEL_ID = DEFAULT_OPENROUTER_MODEL_ID;
export const DEFAULT_MODEL_PROVIDER: LlmProvider = "openrouter";

// Backward-compatible alias used by existing OpenRouter pricing loaders.
export const AVAILABLE_MODELS = AVAILABLE_OPENROUTER_MODELS;

// Current selected provider + model IDs (mutable)
let currentModelProvider: LlmProvider = DEFAULT_MODEL_PROVIDER;
const currentModelIdByProvider: Record<LlmProvider, string> = {
	openrouter: DEFAULT_OPENROUTER_MODEL_ID,
	copilot: DEFAULT_COPILOT_MODEL_ID,
};
let currentOpenRouterProviderTag: string | undefined;

/**
 * Get the current response model ID.
 */
export function getResponseModel(): string {
	return currentModelIdByProvider[currentModelProvider];
}

/**
 * Get selected model ID for a specific provider.
 */
export function getResponseModelForProvider(provider: LlmProvider): string {
	return currentModelIdByProvider[provider];
}

/**
 * Get the currently selected LLM provider.
 */
export function getModelProvider(): LlmProvider {
	return currentModelProvider;
}

/**
 * Set the currently selected LLM provider.
 */
export function setModelProvider(provider: LlmProvider): void {
	currentModelProvider = provider;
}

/**
 * Get the current OpenRouter inference provider tag (slug) for routing.
 * When undefined, OpenRouter will choose automatically.
 */
export function getOpenRouterProviderTag(): string | undefined {
	return currentOpenRouterProviderTag;
}

/**
 * Set the OpenRouter inference provider tag (slug) for routing.
 * Use `undefined` to revert to automatic provider selection.
 */
export function setOpenRouterProviderTag(providerTag: string | undefined): void {
	const normalized =
		typeof providerTag === "string" && providerTag.trim().length > 0 ? providerTag.trim() : undefined;
	currentOpenRouterProviderTag = normalized;
}

/**
 * Set the current response model ID.
 */
export function setResponseModel(modelId: string): void {
	if (!modelId) return;
	setResponseModelForProvider(currentModelProvider, modelId);
}

/**
 * Set model ID for a specific provider.
 */
export function setResponseModelForProvider(provider: LlmProvider, modelId: string): void {
	if (!modelId) return;
	if (modelId !== currentModelIdByProvider[provider]) {
		currentModelIdByProvider[provider] = modelId;
		// Reset OpenRouter routing provider when switching OpenRouter models.
		if (provider === "openrouter") {
			currentOpenRouterProviderTag = undefined;
		}
	}
}

/**
 * Get the current subagent model ID (same as main agent).
 */
export function getSubagentModel(): string {
	return getResponseModel();
}

/**
 * Build OpenRouter chat settings that apply globally (e.g. provider routing),
 * optionally merged with call-specific settings (e.g. reasoning effort).
 */
export function buildOpenRouterChatSettings(
	overrides?: OpenRouterChatSettings
): OpenRouterChatSettings | undefined {
	const settings: OpenRouterChatSettings = {
		usage: {
			include: true,
		},
		...(currentOpenRouterProviderTag
			? {
					provider: {
						order: [currentOpenRouterProviderTag],
						allow_fallbacks: false,
					},
				}
			: {}),
		...(overrides ?? {}),
	};

	return Object.keys(settings).length > 0 ? settings : undefined;
}

// Transcription model (OpenAI)
export const TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe-2025-12-15";

// Default model for memory operations.
export const DEFAULT_MEMORY_MODEL_OPENROUTER = "openai/gpt-5.4-nano";

/**
 * Get the model ID for memory operations (deduplication, extraction).
 * Checks config.json for override, otherwise returns DEFAULT_MEMORY_MODEL_OPENROUTER.
 */
export function getMemoryModel(): string {
	const config = loadManualConfig();
	if (config.memoryModel) {
		return config.memoryModel;
	}
	return DEFAULT_MEMORY_MODEL_OPENROUTER;
}

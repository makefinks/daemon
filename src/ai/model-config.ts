/**
 * Centralized model configuration for DAEMON.
 */

import type { OpenRouterChatSettings } from "@openrouter/ai-sdk-provider";
import type { LlmProvider, ModelOption } from "../types";
import { loadManualConfig } from "../utils/config";

// Available models for selection (OpenRouter format)
export const AVAILABLE_OPENROUTER_MODELS: ModelOption[] = [
	{ id: "openai/gpt-5.5", name: "GPT-5.5" },
	{ id: "google/gemini-3.5-flash", name: "Gemini 3.5 Flash" },
	{ id: "anthropic/claude-opus-4.8", name: "Claude Opus 4.8" },
	{ id: "deepseek/deepseek-v4-flash", name: "DeepSeek V4 Flash" },
	{ id: "deepseek/deepseek-v4-pro", name: "DeepSeek V4 Pro" },
	{ id: "qwen/qwen3.7-max", name: "Qwen 3.7 Max" },
	{ id: "qwen/qwen3.7-plus", name: "Qwen 3.7 Plus" },
	{ id: "xiaomi/mimo-v2.5", name: "MiMo V2.5" },
	{ id: "xiaomi/mimo-v2.5-pro", name: "MiMo V2.5 Pro" },
	{ id: "minimax/minimax-m3", name: "MiniMax M3" },
];

// Default model IDs
export const DEFAULT_OPENROUTER_MODEL_ID = "deepseek/deepseek-v4-flash";
export const DEFAULT_OPENAI_CODEX_MODEL_ID = "gpt-5.5";
export const DEFAULT_COPILOT_MODEL_ID = "claude-sonnet-4.5";
export const DEFAULT_MODEL_ID = DEFAULT_OPENROUTER_MODEL_ID;
export const DEFAULT_MODEL_PROVIDER: LlmProvider = "openrouter";

// Backward-compatible alias used by existing OpenRouter pricing loaders.
export const AVAILABLE_MODELS = AVAILABLE_OPENROUTER_MODELS;

// Current selected provider + model IDs (mutable)
let currentModelProvider: LlmProvider = DEFAULT_MODEL_PROVIDER;
const currentModelIdByProvider: Record<LlmProvider, string> = {
	openrouter: DEFAULT_OPENROUTER_MODEL_ID,
	"openai-codex": DEFAULT_OPENAI_CODEX_MODEL_ID,
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
export const DEFAULT_MEMORY_MODEL_OPENROUTER = "deepseek/deepseek-v4-flash";

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

/**
 * Centralized model configuration for DAEMON.
 */

import type { OpenRouterChatSettings } from "@openrouter/ai-sdk-provider";
import type { ModelOption } from "../types";
import { loadManualConfig } from "../utils/config";

// Available models for selection (OpenRouter format)
export const AVAILABLE_MODELS: ModelOption[] = [
	{ id: "x-ai/grok-4.1-fast", name: "Grok 4.1 Fast" },
	{ id: "z-ai/glm-4.7", name: "GLM 4.7" },
	{ id: "minimax/minimax-m2.1", name: "Minimax M2.1" },
	{ id: "google/gemini-3-flash-preview", name: "Gemini 3 Flash" },
	{ id: "google/gemini-3-pro-preview", name: "Gemini 3 Pro" },
	{ id: "openai/gpt-5.2", name: "GPT 5.2" },
	{ id: "moonshotai/kimi-k2-thinking", name: "Kimi K2 Thinking" },
	{ id: "openai/gpt-oss-120b:exacto", name: "GPT-OSS-120" },
	{ id: "mistralai/devstral-2512:free", name: "Mistral Devstral" },
	{ id: "nvidia/nemotron-3-nano-30b-a3b:free", name: "Nemotron 3 Nano" },
];

// Default model ID
export const DEFAULT_MODEL_ID = "z-ai/glm-4.7";

// Current selected model (mutable)
let currentModelId = DEFAULT_MODEL_ID;
let currentOpenRouterProviderTag: string | undefined;

/**
 * Get the current response model ID.
 */
export function getResponseModel(): string {
	return currentModelId;
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
	if (modelId !== currentModelId) {
		currentModelId = modelId;
		// Always reset provider when switching to a DIFFERENT model
		currentOpenRouterProviderTag = undefined;
	}
}

/**
 * Get the current subagent model ID (same as main agent).
 */
export function getSubagentModel(): string {
	return currentModelId;
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

// Default model for memory operations (cheap & fast)
export const DEFAULT_MEMORY_MODEL = "x-ai/grok-4.1-fast";

/**
 * Get the model ID for memory operations (deduplication, extraction).
 * Checks config.json for override, otherwise uses DEFAULT_MEMORY_MODEL.
 */
export function getMemoryModel(): string {
	const config = loadManualConfig();
	return config.memoryModel ?? DEFAULT_MEMORY_MODEL;
}

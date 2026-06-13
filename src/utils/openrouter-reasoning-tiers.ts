/**
 * Per-model reasoning effort tier metadata for OpenRouter.
 *
 * OpenRouter's `/api/v1/models` endpoint does not expose per-model reasoning
 * effort tiers (it only indicates that `reasoning` is among the supported
 * parameters). Rather than guessing, this file maintains a small curated
 * allowlist of model ids known to support the XHIGH reasoning effort.
 *
 * `supportsReasoningEffort` for an OpenRouter model is still derived from the
 * live `/models` response (via `openrouter-endpoints.ts`), so any model that
 * reports `reasoning` in its `supported_parameters` can use LOW/MEDIUM/HIGH.
 * Only XHIGH is gated by this allowlist.
 */

import { REASONING_EFFORT_LEVELS_WITH_XHIGH } from "../types";

/**
 * Lowercase model ids (as returned by OpenRouter, e.g. "openai/gpt-5.2")
 * known to support the XHIGH reasoning effort.
 *
 */
const XHIGH_MODEL_IDS: ReadonlySet<string> = new Set([
	"openai/gpt-5.2",
	"openai/gpt-5.2-chat",
	"openai/gpt-5.2-pro",
	"openai/gpt-5.2-codex",
	"openai/gpt-5.3-chat",
	"openai/gpt-5.3-codex",
	"openai/gpt-5.4",
	"openai/gpt-5.4-pro",
	"openai/gpt-5.4-mini",
	"openai/gpt-5.4-nano",
	"openai/gpt-5.5",
	"openai/gpt-5.5-pro",
	"deepseek/deepseek-v4-pro",
	"deepseek/deepseek-v4-flash",
]);

function normalizeModelId(modelId: string): string {
	return modelId.trim().toLowerCase();
}

export function openRouterModelSupportsXHigh(modelId: string): boolean {
	return XHIGH_MODEL_IDS.has(normalizeModelId(modelId));
}

/**
 * Clamp the current reasoning effort to the highest tier supported by the
 * given model. If the model is xhigh-capable, the effort is returned as-is.
 * Otherwise, XHIGH is downgraded to HIGH; lower tiers are unaffected.
 */
export function clampOpenRouterReasoningEffort<E extends string>(modelId: string, effort: E): E | "high" {
	if (openRouterModelSupportsXHigh(modelId)) return effort;
	return effort === "xhigh" ? "high" : effort;
}

export { REASONING_EFFORT_LEVELS_WITH_XHIGH };

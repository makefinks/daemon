import type { LlmProvider } from "../../types";
import { getModelProvider } from "../model-config";
import { copilotProviderAdapter } from "./copilot-provider";
import { openRouterProviderAdapter } from "./openrouter-provider";
import type { LlmProviderAdapter } from "./types";

const PROVIDER_ADAPTERS: Record<LlmProvider, LlmProviderAdapter> = {
	openrouter: openRouterProviderAdapter,
	copilot: copilotProviderAdapter,
};

export function getProviderAdapter(provider: LlmProvider = getModelProvider()): LlmProviderAdapter {
	return PROVIDER_ADAPTERS[provider];
}

import type { LlmProvider } from "../../types";
import { getModelProvider } from "../model-config";
import type { ProviderCapabilities } from "./types";

const PROVIDER_CAPABILITIES: Record<LlmProvider, ProviderCapabilities> = {
	openrouter: {
		supportsSubagentTool: true,
	},
	copilot: {
		supportsSubagentTool: false,
	},
};

export function getProviderCapabilities(provider: LlmProvider = getModelProvider()): ProviderCapabilities {
	return PROVIDER_CAPABILITIES[provider];
}

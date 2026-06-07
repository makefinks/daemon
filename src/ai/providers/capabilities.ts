import type { LlmProvider } from "../../types";
import { getModelProvider } from "../model-config";
import type { ProviderCapabilities } from "./types";

const PROVIDER_CAPABILITIES: Record<LlmProvider, ProviderCapabilities> = {
	openrouter: {
		supportsSubagentTool: true,
		supportsImageToolOutput: true,
	},
	"openai-codex": {
		supportsSubagentTool: true,
		supportsImageToolOutput: true,
	},
	copilot: {
		supportsSubagentTool: true,
		supportsImageToolOutput: false,
	},
};

export function getProviderCapabilities(provider: LlmProvider = getModelProvider()): ProviderCapabilities {
	return PROVIDER_CAPABILITIES[provider];
}

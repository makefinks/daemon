import { useCallback, useMemo, useState } from "react";
import {
	AVAILABLE_MODELS,
	DEFAULT_COPILOT_MODEL_ID,
	DEFAULT_MODEL_ID,
	DEFAULT_MODEL_PROVIDER,
} from "../ai/model-config";
import type { ProviderMenuItem } from "../components/ProviderMenu";
import type { LlmProvider, ModelOption } from "../types";
import type { OpenRouterInferenceProvider } from "../utils/openrouter-endpoints";
import { mergePricingAverages } from "../utils/openrouter-pricing";
import { useAppCopilotModelsLoader } from "./use-app-copilot-models-loader";
import { useAppModelPricingLoader } from "./use-app-model-pricing-loader";
import { useAppOpenRouterModelsLoader } from "./use-app-openrouter-models-loader";
import { useAppOpenRouterProviderLoader } from "./use-app-openrouter-provider-loader";

export interface UseAppModelParams {
	preferencesLoaded: boolean;
	showProviderMenu: boolean;
}

export interface UseAppModelReturn {
	currentModelProvider: LlmProvider;
	setCurrentModelProvider: React.Dispatch<React.SetStateAction<LlmProvider>>;

	currentModelId: string;
	currentModelSupportsReasoning: boolean;
	currentModelSupportsReasoningXHigh: boolean;
	setCurrentModelId: (modelId: string) => void;
	setCurrentModelForProvider: (provider: LlmProvider, modelId: string) => void;

	currentOpenRouterProviderTag: string | undefined;
	setCurrentOpenRouterProviderTag: React.Dispatch<React.SetStateAction<string | undefined>>;

	modelsWithPricing: ModelOption[];
	openRouterModels: ModelOption[];
	openRouterModelsLoading: boolean;
	openRouterModelsUpdatedAt: number | null;

	providerMenuItems: ProviderMenuItem[];

	refreshOpenRouterModels: () => Promise<void>;
}

export function useAppModel(params: UseAppModelParams): UseAppModelReturn {
	const { preferencesLoaded, showProviderMenu } = params;

	const [currentModelProvider, setCurrentModelProvider] = useState<LlmProvider>(DEFAULT_MODEL_PROVIDER);
	const [openRouterModelId, setOpenRouterModelId] = useState(DEFAULT_MODEL_ID);
	const [copilotModelId, setCopilotModelId] = useState(DEFAULT_COPILOT_MODEL_ID);

	const [currentOpenRouterProviderTag, setCurrentOpenRouterProviderTag] = useState<string | undefined>(
		undefined
	);

	const [openRouterModelsWithPricing, setOpenRouterModelsWithPricing] =
		useState<ModelOption[]>(AVAILABLE_MODELS);
	const [openRouterModels, setOpenRouterModels] = useState<ModelOption[]>([]);
	const [openRouterModelsLoading, setOpenRouterModelsLoading] = useState(false);
	const [openRouterModelsUpdatedAt, setOpenRouterModelsUpdatedAt] = useState<number | null>(null);
	const [openRouterProviders, setOpenRouterProviders] = useState<OpenRouterInferenceProvider[]>([]);

	const [copilotModels, setCopilotModels] = useState<ModelOption[]>([]);
	const [copilotModelsLoading, setCopilotModelsLoading] = useState(false);
	const [copilotModelsUpdatedAt, setCopilotModelsUpdatedAt] = useState<number | null>(null);

	const currentModelId = currentModelProvider === "openrouter" ? openRouterModelId : copilotModelId;

	useAppModelPricingLoader({
		preferencesLoaded,
		setModelsWithPricing: setOpenRouterModelsWithPricing,
	});

	useAppOpenRouterProviderLoader({
		preferencesLoaded,
		showProviderMenu: showProviderMenu && currentModelProvider === "openrouter",
		modelId: openRouterModelId,
		setProviders: setOpenRouterProviders,
	});

	const { refresh: refreshOpenRouterModelsRaw } = useAppOpenRouterModelsLoader({
		preferencesLoaded,
		setModels: setOpenRouterModels,
		setLoading: setOpenRouterModelsLoading,
		setUpdatedAt: setOpenRouterModelsUpdatedAt,
	});

	const { refresh: refreshCopilotModels } = useAppCopilotModelsLoader({
		preferencesLoaded,
		setModels: setCopilotModels,
		setLoading: setCopilotModelsLoading,
		setUpdatedAt: setCopilotModelsUpdatedAt,
	});

	const providerMenuItems: ProviderMenuItem[] = useMemo(() => {
		const pricingCandidates = openRouterProviders
			.map((p) => p.pricing)
			.filter((p): p is NonNullable<typeof p> => Boolean(p));
		const avgPricing = pricingCandidates.length > 0 ? mergePricingAverages(pricingCandidates) : undefined;

		const maxContextLength = openRouterProviders.reduce((max, p) => {
			const value = typeof p.contextLength === "number" ? p.contextLength : 0;
			return Math.max(max, value);
		}, 0);

		const anyCaching = openRouterProviders.some((p) => p.supportsCaching);

		const items: ProviderMenuItem[] = [
			{
				tag: null,
				label: "AUTO (OpenRouter routing)",
				contextLength: maxContextLength || undefined,
				pricing: avgPricing,
				supportsCaching: anyCaching || undefined,
			},
		];

		const knownProviderTags = new Set<string>();
		for (const provider of openRouterProviders) {
			knownProviderTags.add(provider.tag);
			items.push({
				tag: provider.tag,
				label: `${provider.providerName} (${provider.tag})`,
				contextLength: provider.contextLength,
				pricing: provider.pricing,
				supportsCaching: provider.supportsCaching,
			});
		}

		if (currentOpenRouterProviderTag && !knownProviderTags.has(currentOpenRouterProviderTag)) {
			items.splice(1, 0, {
				tag: currentOpenRouterProviderTag,
				label: `SAVED (${currentOpenRouterProviderTag})`,
				supportsCaching: false,
			});
		}

		return items;
	}, [openRouterProviders, currentOpenRouterProviderTag]);

	const modelsWithPricing =
		currentModelProvider === "openrouter" ? openRouterModelsWithPricing : copilotModels;
	const modelsForMenu = currentModelProvider === "openrouter" ? openRouterModels : copilotModels;
	const modelsLoading =
		currentModelProvider === "openrouter" ? openRouterModelsLoading : copilotModelsLoading;
	const modelsUpdatedAt =
		currentModelProvider === "openrouter" ? openRouterModelsUpdatedAt : copilotModelsUpdatedAt;
	const currentModelSupportsReasoning = useMemo(() => {
		if (currentModelProvider !== "copilot") {
			return false;
		}
		const selected = copilotModels.find((model) => model.id === copilotModelId);
		return selected?.supportsReasoningEffort === true;
	}, [copilotModelId, copilotModels, currentModelProvider]);
	const currentModelSupportsReasoningXHigh = useMemo(() => {
		if (currentModelProvider !== "copilot") {
			return false;
		}
		const selected = copilotModels.find((model) => model.id === copilotModelId);
		return selected?.supportsReasoningEffortXHigh === true;
	}, [copilotModelId, copilotModels, currentModelProvider]);

	const setCurrentModelId = useCallback(
		(modelId: string) => {
			if (!modelId) return;
			if (currentModelProvider === "openrouter") {
				setOpenRouterModelId(modelId);
				return;
			}
			setCopilotModelId(modelId);
		},
		[currentModelProvider]
	);

	const setCurrentModelForProvider = useCallback((provider: LlmProvider, modelId: string) => {
		if (!modelId) return;
		if (provider === "openrouter") {
			setOpenRouterModelId(modelId);
			return;
		}
		setCopilotModelId(modelId);
	}, []);

	const refreshOpenRouterModels = useCallback(async () => {
		if (currentModelProvider === "openrouter") {
			await refreshOpenRouterModelsRaw();
			return;
		}
		await refreshCopilotModels();
	}, [currentModelProvider, refreshOpenRouterModelsRaw, refreshCopilotModels]);

	return {
		currentModelProvider,
		setCurrentModelProvider,
		currentModelId,
		currentModelSupportsReasoning,
		currentModelSupportsReasoningXHigh,
		setCurrentModelId,
		setCurrentModelForProvider,
		currentOpenRouterProviderTag,
		setCurrentOpenRouterProviderTag,
		modelsWithPricing,
		openRouterModels: modelsForMenu,
		openRouterModelsLoading: modelsLoading,
		openRouterModelsUpdatedAt: modelsUpdatedAt,
		providerMenuItems: currentModelProvider === "openrouter" ? providerMenuItems : [],
		refreshOpenRouterModels,
	};
}

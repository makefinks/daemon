import { useMemo, useState } from "react";
import { AVAILABLE_MODELS, DEFAULT_MODEL_ID } from "../ai/model-config";
import { mergePricingAverages } from "../utils/openrouter-pricing";
import { useAppModelPricingLoader } from "./use-app-model-pricing-loader";
import { useAppOpenRouterModelsLoader } from "./use-app-openrouter-models-loader";
import { useAppOpenRouterProviderLoader } from "./use-app-openrouter-provider-loader";
import type { ModelOption } from "../types";
import type { ProviderMenuItem } from "../components/ProviderMenu";
import type { OpenRouterInferenceProvider } from "../utils/openrouter-endpoints";

export interface UseAppModelParams {
	preferencesLoaded: boolean;
	showProviderMenu: boolean;
}

export interface UseAppModelReturn {
	currentModelId: string;
	setCurrentModelId: React.Dispatch<React.SetStateAction<string>>;

	currentOpenRouterProviderTag: string | undefined;
	setCurrentOpenRouterProviderTag: React.Dispatch<React.SetStateAction<string | undefined>>;

	modelsWithPricing: ModelOption[];
	openRouterModels: ModelOption[];
	openRouterModelsLoading: boolean;
	openRouterModelsUpdatedAt: number | null;

	providerMenuItems: ProviderMenuItem[];

	refreshOpenRouterModels: () => void;
}

export function useAppModel(params: UseAppModelParams): UseAppModelReturn {
	const { preferencesLoaded, showProviderMenu } = params;

	const [currentModelId, setCurrentModelId] = useState(DEFAULT_MODEL_ID);
	const [currentOpenRouterProviderTag, setCurrentOpenRouterProviderTag] = useState<string | undefined>(
		undefined
	);
	const [modelsWithPricing, setModelsWithPricing] = useState<ModelOption[]>(AVAILABLE_MODELS);
	const [openRouterModels, setOpenRouterModels] = useState<ModelOption[]>([]);
	const [openRouterModelsLoading, setOpenRouterModelsLoading] = useState(false);
	const [openRouterModelsUpdatedAt, setOpenRouterModelsUpdatedAt] = useState<number | null>(null);
	const [openRouterProviders, setOpenRouterProviders] = useState<OpenRouterInferenceProvider[]>([]);

	useAppModelPricingLoader({
		preferencesLoaded,
		setModelsWithPricing,
	});

	useAppOpenRouterProviderLoader({
		preferencesLoaded,
		showProviderMenu,
		modelId: currentModelId,
		setProviders: setOpenRouterProviders,
	});

	const { refresh: refreshOpenRouterModels } = useAppOpenRouterModelsLoader({
		preferencesLoaded,
		setModels: setOpenRouterModels,
		setLoading: setOpenRouterModelsLoading,
		setUpdatedAt: setOpenRouterModelsUpdatedAt,
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

	return {
		currentModelId,
		setCurrentModelId,
		currentOpenRouterProviderTag,
		setCurrentOpenRouterProviderTag,
		modelsWithPricing,
		openRouterModels,
		openRouterModelsLoading,
		openRouterModelsUpdatedAt,
		providerMenuItems,
		refreshOpenRouterModels,
	};
}

import { useEffect } from "react";
import type { ModelOption } from "../types";
import { AVAILABLE_MODELS } from "../ai/model-config";
import { getOpenRouterModels } from "../utils/openrouter-models";

export interface UseAppModelPricingLoaderParams {
	preferencesLoaded: boolean;
	setModelsWithPricing: React.Dispatch<React.SetStateAction<ModelOption[]>>;
}

export function useAppModelPricingLoader(params: UseAppModelPricingLoaderParams): void {
	const { preferencesLoaded, setModelsWithPricing } = params;

	useEffect(() => {
		if (!preferencesLoaded) return;

		let cancelled = false;

		(async () => {
			try {
				const { models } = await getOpenRouterModels();
				if (cancelled) return;

				const byId = new Map(models.map((model) => [model.id, model]));
				const curated: ModelOption[] = AVAILABLE_MODELS.map((model) => {
					const enriched = byId.get(model.id);
					if (!enriched) return model;
					return {
						...model,
						name: enriched.name || model.name,
						pricing: enriched.pricing,
						contextLength: enriched.contextLength,
						supportsCaching: enriched.supportsCaching,
						supportsVision: enriched.supportsVision,
					};
				});
				setModelsWithPricing(curated);
			} catch (_err: unknown) {
				// Silently fail - models will just not show pricing.
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [preferencesLoaded, setModelsWithPricing]);
}

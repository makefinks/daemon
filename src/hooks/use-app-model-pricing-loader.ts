import { useEffect } from "react";
import type { ModelOption } from "../types";
import { AVAILABLE_MODELS } from "../ai/model-config";
import { getModelsMetadata } from "../utils/model-metadata";

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
				const modelIds = AVAILABLE_MODELS.map((m) => m.id);
				const metadata = await getModelsMetadata(modelIds);
				if (cancelled) return;

				const modelsWithPrices: ModelOption[] = AVAILABLE_MODELS.map((model) => {
					const meta = metadata.get(model.id);
					return {
						...model,
						name: meta?.name ?? model.name,
						pricing: meta?.pricing,
						contextLength: meta?.contextLength,
						supportsCaching: meta?.supportsCaching,
					};
				});
				setModelsWithPricing(modelsWithPrices);
			} catch (_err: unknown) {
				// Silently fail - models will just not show pricing.
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [preferencesLoaded, setModelsWithPricing]);
}

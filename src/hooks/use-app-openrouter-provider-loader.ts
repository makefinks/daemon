import { useEffect } from "react";
import type { OpenRouterInferenceProvider } from "../utils/openrouter-endpoints";
import { getOpenRouterModelProviders } from "../utils/openrouter-endpoints";

export interface UseAppOpenRouterProviderLoaderParams {
	preferencesLoaded: boolean;
	showProviderMenu: boolean;
	modelId: string;
	setProviders: React.Dispatch<React.SetStateAction<OpenRouterInferenceProvider[]>>;
}

export function useAppOpenRouterProviderLoader(params: UseAppOpenRouterProviderLoaderParams): void {
	const { preferencesLoaded, showProviderMenu, modelId, setProviders } = params;

	useEffect(() => {
		if (!preferencesLoaded) return;
		if (!showProviderMenu) return;

		let cancelled = false;

		(async () => {
			try {
				const providers = await getOpenRouterModelProviders(modelId);
				if (cancelled) return;
				setProviders(providers);
			} catch (_err: unknown) {
				// Silently fail - provider menu will just show no providers.
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [preferencesLoaded, showProviderMenu, modelId, setProviders]);
}

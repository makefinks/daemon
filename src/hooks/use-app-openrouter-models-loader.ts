import { useCallback, useEffect } from "react";
import type { ModelOption } from "../types";
import { getOpenRouterModels } from "../utils/openrouter-models";

export interface UseAppOpenRouterModelsLoaderParams {
	preferencesLoaded: boolean;
	setModels: React.Dispatch<React.SetStateAction<ModelOption[]>>;
	setLoading: React.Dispatch<React.SetStateAction<boolean>>;
	setUpdatedAt: React.Dispatch<React.SetStateAction<number | null>>;
}

export interface UseAppOpenRouterModelsLoaderResult {
	refresh: () => Promise<void>;
}

export function useAppOpenRouterModelsLoader(
	params: UseAppOpenRouterModelsLoaderParams
): UseAppOpenRouterModelsLoaderResult {
	const { preferencesLoaded, setModels, setLoading, setUpdatedAt } = params;

	const refresh = useCallback(
		async (forceRefresh = false) => {
			if (!preferencesLoaded) return;
			setLoading(true);
			try {
				const result = await getOpenRouterModels({ forceRefresh });
				setModels(result.models);
				setUpdatedAt(result.timestamp);
			} finally {
				setLoading(false);
			}
		},
		[preferencesLoaded, setLoading, setModels, setUpdatedAt]
	);

	useEffect(() => {
		if (!preferencesLoaded) return;
		void refresh(false);
	}, [preferencesLoaded, refresh]);

	return {
		refresh: () => refresh(true),
	};
}

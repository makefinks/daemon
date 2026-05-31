import { useCallback, useEffect } from "react";
import type { ModelOption } from "../types";
import { getOpenAiCodexModels } from "../utils/openai-codex-models";

export interface UseAppOpenAiCodexModelsLoaderParams {
	preferencesLoaded: boolean;
	enabled?: boolean;
	setModels: React.Dispatch<React.SetStateAction<ModelOption[]>>;
	setLoading: React.Dispatch<React.SetStateAction<boolean>>;
	setUpdatedAt: React.Dispatch<React.SetStateAction<number | null>>;
}

export interface UseAppOpenAiCodexModelsLoaderResult {
	refresh: () => Promise<void>;
}

/** Load and refresh the authenticated Codex model list for app state. */
export function useAppOpenAiCodexModelsLoader(
	params: UseAppOpenAiCodexModelsLoaderParams
): UseAppOpenAiCodexModelsLoaderResult {
	const { preferencesLoaded, enabled = true, setModels, setLoading, setUpdatedAt } = params;

	const refresh = useCallback(
		async (forceRefresh = false) => {
			if (!preferencesLoaded || !enabled) return;
			setLoading(true);
			try {
				const result = await getOpenAiCodexModels({ forceRefresh });
				setModels(result.models);
				setUpdatedAt(result.timestamp);
			} finally {
				setLoading(false);
			}
		},
		[enabled, preferencesLoaded, setLoading, setModels, setUpdatedAt]
	);

	useEffect(() => {
		if (!preferencesLoaded || !enabled) return;
		void refresh(false);
	}, [enabled, preferencesLoaded, refresh]);

	return {
		refresh: () => refresh(true),
	};
}

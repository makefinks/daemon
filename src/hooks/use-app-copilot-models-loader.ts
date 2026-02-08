import { useCallback, useEffect } from "react";
import type { ModelOption } from "../types";
import { getCopilotModels } from "../utils/copilot-models";

export interface UseAppCopilotModelsLoaderParams {
	preferencesLoaded: boolean;
	enabled?: boolean;
	setModels: React.Dispatch<React.SetStateAction<ModelOption[]>>;
	setLoading: React.Dispatch<React.SetStateAction<boolean>>;
	setUpdatedAt: React.Dispatch<React.SetStateAction<number | null>>;
}

export interface UseAppCopilotModelsLoaderResult {
	refresh: () => Promise<void>;
}

export function useAppCopilotModelsLoader(
	params: UseAppCopilotModelsLoaderParams
): UseAppCopilotModelsLoaderResult {
	const { preferencesLoaded, enabled = true, setModels, setLoading, setUpdatedAt } = params;

	const refresh = useCallback(
		async (forceRefresh = false) => {
			if (!preferencesLoaded || !enabled) return;
			setLoading(true);
			try {
				const result = await getCopilotModels({ forceRefresh });
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

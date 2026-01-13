import { useEffect } from "react";
import { toast } from "@opentui-ui/toast/react";
import { detectVoiceDependencies, type VoiceDependencies } from "../utils/voice-dependencies";

export function useVoiceDependenciesNotification(): void {
	useEffect(() => {
		let cancelled = false;

		void (async () => {
			let deps: VoiceDependencies;
			try {
				deps = await detectVoiceDependencies();
			} catch (error) {
				if (cancelled) return;
				const err = error instanceof Error ? error : new Error(String(error));
				toast.warning("Voice dependency check failed", {
					description: err.message,
				});
				return;
			}

			if (cancelled) return;

			if (!deps.sox.available) {
				const hint =
					deps.sox.hint ?? (process.platform === "darwin" ? "Run: brew install sox" : "Install sox");
				toast.warning("Voice features unavailable", {
					description: `sox is not installed. ${hint}`,
				});
			}
		})();

		return () => {
			cancelled = true;
		};
	}, []);
}

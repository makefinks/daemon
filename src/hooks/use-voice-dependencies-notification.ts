import { toast } from "@opentui-ui/toast/react";
import { useEffect, useRef } from "react";
import { type VoiceDependencies, detectVoiceDependencies } from "../utils/voice-dependencies";

export interface UseVoiceDependenciesNotificationParams {
	/** When false, the notification is deferred until enabled becomes true */
	enabled: boolean;
}

export function useVoiceDependenciesNotification(params: UseVoiceDependenciesNotificationParams): void {
	const { enabled } = params;
	const hasNotifiedRef = useRef(false);
	const pendingNotificationRef = useRef<
		{ type: "error"; message: string } | { type: "sox"; hint: string } | null
	>(null);

	useEffect(() => {
		let cancelled = false;

		void (async () => {
			let deps: VoiceDependencies;
			try {
				deps = await detectVoiceDependencies();
			} catch (error) {
				if (cancelled) return;
				const err = error instanceof Error ? error : new Error(String(error));
				pendingNotificationRef.current = { type: "error", message: err.message };
				return;
			}

			if (cancelled) return;

			if (!deps.sox.available) {
				const hint =
					deps.sox.hint ?? (process.platform === "darwin" ? "Run: brew install sox" : "Install sox");
				pendingNotificationRef.current = { type: "sox", hint };
			}
		})();

		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		if (!enabled || hasNotifiedRef.current) return;
		const pending = pendingNotificationRef.current;
		if (!pending) return;

		hasNotifiedRef.current = true;

		if (pending.type === "error") {
			toast.warning("Voice dependency check failed", {
				description: pending.message,
			});
		} else {
			toast.warning("Voice features unavailable", {
				description: `sox is not installed. ${pending.hint}`,
			});
		}
	}, [enabled]);
}

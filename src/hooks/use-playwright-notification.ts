import { toast } from "@opentui-ui/toast/react";
import { useEffect, useRef } from "react";
import { detectLocalPlaywrightChromium } from "../utils/js-rendering";

export interface UsePlaywrightNotificationParams {
	enabled: boolean;
}

export function usePlaywrightNotification(params: UsePlaywrightNotificationParams): void {
	const { enabled } = params;
	const hasNotifiedRef = useRef(false);
	const pendingNotificationRef = useRef<{ reason: string; hint?: string } | null>(null);

	useEffect(() => {
		let cancelled = false;

		void (async () => {
			const capability = await detectLocalPlaywrightChromium();
			if (cancelled) return;

			if (capability.available) return;

			pendingNotificationRef.current = { reason: capability.reason, hint: capability.hint };
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

		const description = pending.hint ? `${pending.reason}\n\n${pending.hint}` : pending.reason;
		toast.warning("JS-rendered pages unavailable", { description });
	}, [enabled]);
}

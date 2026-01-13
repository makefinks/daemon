import { useEffect } from "react";
import { toast } from "@opentui-ui/toast/react";
import { detectLocalPlaywrightChromium } from "../utils/js-rendering";

export function usePlaywrightNotification(): void {
	useEffect(() => {
		let cancelled = false;

		void (async () => {
			const capability = await detectLocalPlaywrightChromium();
			if (cancelled) return;

			if (capability.available) return;

			const description = capability.hint ? `${capability.reason}\n\n${capability.hint}` : capability.reason;
			toast.warning("JS-rendered pages unavailable", { description });
		})();

		return () => {
			cancelled = true;
		};
	}, []);
}

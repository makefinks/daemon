import { useEffect } from "react";
import type { AudioDevice, OnboardingStep } from "../types";
import {
	getCurrentDeviceName,
	getSystemDefaultInputDeviceName,
	listAudioDevices,
} from "../voice/audio-recorder";

export interface UseAppAudioDevicesLoaderParams {
	preferencesLoaded: boolean;
	showDeviceMenu: boolean;
	onboardingStep: OnboardingStep;

	setDevices: React.Dispatch<React.SetStateAction<AudioDevice[]>>;
	setCurrentDevice: React.Dispatch<React.SetStateAction<string | undefined>>;
	setDeviceLoadTimedOut: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useAppAudioDevicesLoader(params: UseAppAudioDevicesLoaderParams): void {
	const {
		preferencesLoaded,
		showDeviceMenu,
		onboardingStep,
		setDevices,
		setCurrentDevice,
		setDeviceLoadTimedOut,
	} = params;

	useEffect(() => {
		if (!preferencesLoaded) return;
		if (!showDeviceMenu && onboardingStep !== "device") return;

		let cancelled = false;
		setDeviceLoadTimedOut(false);

		const timeoutId = setTimeout(() => {
			if (!cancelled) setDeviceLoadTimedOut(true);
		}, 3000);

		(async () => {
			try {
				const devs = await listAudioDevices();
				if (cancelled) return;

				clearTimeout(timeoutId);
				setDevices(devs);
				if (devs.length === 0) setDeviceLoadTimedOut(true);

				const explicitDeviceName = getCurrentDeviceName();
				const systemDefaultDeviceName = explicitDeviceName ?? (await getSystemDefaultInputDeviceName());
				if (cancelled) return;

				setCurrentDevice(systemDefaultDeviceName);
			} catch (_err: unknown) {
				if (!cancelled) setDeviceLoadTimedOut(true);
			}
		})();

		return () => {
			cancelled = true;
			clearTimeout(timeoutId);
		};
	}, [
		preferencesLoaded,
		showDeviceMenu,
		onboardingStep,
		setDevices,
		setCurrentDevice,
		setDeviceLoadTimedOut,
	]);
}

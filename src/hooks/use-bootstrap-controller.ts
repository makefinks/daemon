import type { TextareaRenderable } from "@opentui/core";
import { useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";

import { useAppAudioDevicesLoader } from "./use-app-audio-devices-loader";
import { usePlaywrightNotification } from "./use-playwright-notification";
import { useVoiceDependenciesNotification } from "./use-voice-dependencies-notification";

import type { AppPreferences, AudioDevice, OnboardingStep } from "../types";
import { getSoxInstallHint, isSoxAvailable } from "../voice/audio-recorder";

export interface BootstrapControllerResult {
	onboardingActive: boolean;
	setOnboardingActive: (active: boolean) => void;

	onboardingStep: OnboardingStep;
	setOnboardingStep: (step: OnboardingStep) => void;
	copilotAuthenticated: boolean;
	setCopilotAuthenticated: (authenticated: boolean) => void;

	loadedPreferences: AppPreferences | null;
	setLoadedPreferences: (prefs: AppPreferences | null) => void;

	devices: AudioDevice[];
	setDevices: (devices: AudioDevice[]) => void;

	currentDevice: string | undefined;
	setCurrentDevice: (deviceId: string | undefined) => void;

	currentOutputDevice: string | undefined;
	setCurrentOutputDevice: (deviceId: string | undefined) => void;

	deviceLoadTimedOut: boolean;
	setDeviceLoadTimedOut: (timedOut: boolean) => void;

	soxAvailable: boolean;
	soxInstallHint: string;

	apiKeyTextareaRef: MutableRefObject<TextareaRenderable | null>;
}

export function useBootstrapController({
	preferencesLoaded,
	showDeviceMenu,
}: {
	preferencesLoaded: boolean;
	showDeviceMenu: boolean;
}): BootstrapControllerResult {
	const [onboardingActive, setOnboardingActive] = useState(false);
	usePlaywrightNotification({ enabled: !onboardingActive });
	useVoiceDependenciesNotification({ enabled: !onboardingActive });

	const [loadedPreferences, setLoadedPreferences] = useState<AppPreferences | null>(null);
	const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>("intro");
	const [copilotAuthenticated, setCopilotAuthenticated] = useState(false);

	const [devices, setDevices] = useState<AudioDevice[]>([]);
	const [currentDevice, setCurrentDevice] = useState<string | undefined>(undefined);
	const [currentOutputDevice, setCurrentOutputDevice] = useState<string | undefined>(undefined);
	const [deviceLoadTimedOut, setDeviceLoadTimedOut] = useState(false);

	const soxAvailable = useMemo(() => isSoxAvailable(), []);
	const soxInstallHint = useMemo(() => getSoxInstallHint(), []);

	const apiKeyTextareaRef = useRef<TextareaRenderable | null>(null);

	useAppAudioDevicesLoader({
		preferencesLoaded,
		showDeviceMenu,
		onboardingStep,
		setDevices,
		setCurrentDevice,
		setDeviceLoadTimedOut,
	});

	return {
		onboardingActive,
		setOnboardingActive,
		onboardingStep,
		setOnboardingStep,
		copilotAuthenticated,
		setCopilotAuthenticated,
		loadedPreferences,
		setLoadedPreferences,
		devices,
		setDevices,
		currentDevice,
		setCurrentDevice,
		currentOutputDevice,
		setCurrentOutputDevice,
		deviceLoadTimedOut,
		setDeviceLoadTimedOut,
		soxAvailable,
		soxInstallHint,
		apiKeyTextareaRef,
	};
}

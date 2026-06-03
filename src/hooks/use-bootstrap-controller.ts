import type { TextareaRenderable } from "@opentui/core";
import { useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";

import { useAppAudioDevicesLoader } from "./use-app-audio-devices-loader";
import { useVoiceDependenciesNotification } from "./use-voice-dependencies-notification";

import type { AppPreferences, AudioDevice, OnboardingStep } from "../types";
import { detectVoiceDependencies } from "../utils/voice-dependencies";
import { getSoxInstallHint } from "../voice/audio-recorder";

export interface BootstrapControllerResult {
	onboardingActive: boolean;
	setOnboardingActive: (active: boolean) => void;

	onboardingStep: OnboardingStep;
	setOnboardingStep: (step: OnboardingStep) => void;
	openAiCodexAuthenticated: boolean;
	setOpenAiCodexAuthenticated: (authenticated: boolean) => void;
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
	useVoiceDependenciesNotification({ enabled: !onboardingActive });

	const [loadedPreferences, setLoadedPreferences] = useState<AppPreferences | null>(null);
	const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>("intro");
	const [openAiCodexAuthenticated, setOpenAiCodexAuthenticated] = useState(false);
	const [copilotAuthenticated, setCopilotAuthenticated] = useState(false);

	const [devices, setDevices] = useState<AudioDevice[]>([]);
	const [currentDevice, setCurrentDevice] = useState<string | undefined>(undefined);
	const [currentOutputDevice, setCurrentOutputDevice] = useState<string | undefined>(undefined);
	const [deviceLoadTimedOut, setDeviceLoadTimedOut] = useState(false);

	const [soxAvailable, setSoxAvailable] = useState(true);
	const [soxInstallHint, setSoxInstallHint] = useState(() => getSoxInstallHint());

	const apiKeyTextareaRef = useRef<TextareaRenderable | null>(null);

	useAppAudioDevicesLoader({
		preferencesLoaded,
		showDeviceMenu,
		onboardingStep,
		setDevices,
		setCurrentDevice,
		setDeviceLoadTimedOut,
	});

	useEffect(() => {
		let cancelled = false;

		void detectVoiceDependencies()
			.then((dependencies) => {
				if (cancelled) return;
				setSoxAvailable(dependencies.sox.available);
				if (dependencies.sox.hint) {
					setSoxInstallHint(dependencies.sox.hint);
				}
			})
			.catch(() => {
				if (!cancelled) setSoxAvailable(false);
			});

		return () => {
			cancelled = true;
		};
	}, []);

	return {
		onboardingActive,
		setOnboardingActive,
		onboardingStep,
		setOnboardingStep,
		openAiCodexAuthenticated,
		setOpenAiCodexAuthenticated,
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

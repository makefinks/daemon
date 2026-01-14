import { memo } from "react";
import { DeviceMenu } from "../../components/DeviceMenu";
import { GroundingMenu } from "../../components/GroundingMenu";
import { HotkeysPane } from "../../components/HotkeysPane";
import { ModelMenu } from "../../components/ModelMenu";
import { OnboardingOverlay } from "../../components/OnboardingOverlay";
import { ProviderMenu } from "../../components/ProviderMenu";
import { SessionMenu } from "../../components/SessionMenu";
import { SettingsMenu } from "../../components/SettingsMenu";
import { useAppContext } from "../../state/app-context";

function AppOverlaysImpl() {
	const ctx = useAppContext();
	const { menus, device, settings, model, session, grounding, onboarding } = ctx;
	const {
		deviceCallbacks,
		settingsCallbacks,
		modelCallbacks,
		sessionCallbacks,
		groundingCallbacks,
		onboardingCallbacks,
	} = ctx;

	return (
		<>
			{menus.showDeviceMenu && (
				<DeviceMenu
					devices={device.devices}
					currentDevice={device.currentDevice}
					currentOutputDevice={device.currentOutputDevice}
					soxAvailable={device.soxAvailable}
					soxInstallHint={device.soxInstallHint}
					onClose={() => menus.setShowDeviceMenu(false)}
					onSelect={deviceCallbacks.onDeviceSelect}
					onOutputSelect={deviceCallbacks.onOutputDeviceSelect}
				/>
			)}

			{menus.showSettingsMenu && (
				<SettingsMenu
					interactionMode={settings.interactionMode}
					voiceInteractionType={settings.voiceInteractionType}
					speechSpeed={settings.speechSpeed}
					reasoningEffort={settings.reasoningEffort}
					bashApprovalLevel={settings.bashApprovalLevel}
					supportsReasoning={settings.supportsReasoning}
					canEnableVoiceOutput={settings.canEnableVoiceOutput}
					showFullReasoning={settings.showFullReasoning}
					showToolOutput={settings.showToolOutput}
					onClose={() => menus.setShowSettingsMenu(false)}
					toggleInteractionMode={settingsCallbacks.onToggleInteractionMode}
					setVoiceInteractionType={settingsCallbacks.onSetVoiceInteractionType}
					setSpeechSpeed={settingsCallbacks.onSetSpeechSpeed}
					setReasoningEffort={settingsCallbacks.onSetReasoningEffort}
					setBashApprovalLevel={settingsCallbacks.onSetBashApprovalLevel}
					setShowFullReasoning={settings.setShowFullReasoning}
					setShowToolOutput={settings.setShowToolOutput}
					persistPreferences={settings.persistPreferences}
				/>
			)}

			{menus.showModelMenu && (
				<ModelMenu
					curatedModels={model.curatedModels}
					allModels={model.openRouterModels}
					allModelsLoading={model.openRouterModelsLoading}
					allModelsUpdatedAt={model.openRouterModelsUpdatedAt}
					currentModelId={model.currentModelId}
					onClose={() => menus.setShowModelMenu(false)}
					onSelect={modelCallbacks.onModelSelect}
					onRefreshAllModels={modelCallbacks.onModelRefresh}
				/>
			)}

			{menus.showProviderMenu && (
				<ProviderMenu
					items={model.providerMenuItems}
					currentProviderTag={model.currentOpenRouterProviderTag}
					modelId={model.currentModelId}
					onClose={() => menus.setShowProviderMenu(false)}
					onSelect={modelCallbacks.onProviderSelect}
				/>
			)}

			{menus.showSessionMenu && (
				<SessionMenu
					items={session.sessionMenuItems}
					currentSessionId={session.currentSessionId}
					onClose={() => menus.setShowSessionMenu(false)}
					onSelect={sessionCallbacks.onSessionSelect}
					onDelete={sessionCallbacks.onSessionDelete}
				/>
			)}

			{menus.showHotkeysPane && <HotkeysPane onClose={() => menus.setShowHotkeysPane(false)} />}

			{menus.showGroundingMenu && grounding.latestGroundingMap && (
				<GroundingMenu
					groundingMap={grounding.latestGroundingMap}
					initialIndex={grounding.groundingInitialIndex}
					onClose={() => menus.setShowGroundingMenu(false)}
					onSelect={groundingCallbacks.onGroundingSelect}
					onSelectedIndexChange={groundingCallbacks.onGroundingIndexChange}
				/>
			)}

			{onboarding.onboardingActive && (
				<OnboardingOverlay
					step={onboarding.onboardingStep}
					preferences={onboarding.onboardingPreferences}
					devices={device.devices}
					currentDevice={device.currentDevice}
					currentOutputDevice={device.currentOutputDevice}
					models={model.curatedModels}
					currentModelId={model.currentModelId}
					deviceLoadTimedOut={device.deviceLoadTimedOut}
					soxAvailable={device.soxAvailable}
					soxInstallHint={device.soxInstallHint}
					setCurrentDevice={device.setCurrentDevice}
					setCurrentOutputDevice={device.setCurrentOutputDevice}
					setCurrentModelId={model.setCurrentModelId}
					setOnboardingStep={onboarding.setOnboardingStep}
					completeOnboarding={onboardingCallbacks.completeOnboarding}
					persistPreferences={settings.persistPreferences}
					onKeySubmit={onboardingCallbacks.onKeySubmit}
					apiKeyTextareaRef={onboarding.apiKeyTextareaRef}
				/>
			)}
		</>
	);
}

export const AppOverlays = memo(AppOverlaysImpl);

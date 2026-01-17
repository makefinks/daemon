import { useCallback, useMemo } from "react";

export interface OverlayControllerState {
	showDeviceMenu: boolean;
	showSettingsMenu: boolean;
	showModelMenu: boolean;
	showProviderMenu: boolean;
	showSessionMenu: boolean;
	showHotkeysPane: boolean;
	showGroundingMenu: boolean;
	showUrlMenu: boolean;
	onboardingActive: boolean;
}

export interface OverlayControllerActions {
	setShowDeviceMenu: (show: boolean) => void;
	setShowSettingsMenu: (show: boolean) => void;
	setShowModelMenu: (show: boolean) => void;
	setShowProviderMenu: (show: boolean) => void;
	setShowSessionMenu: (show: boolean) => void;
	setShowHotkeysPane: (show: boolean) => void;
	setShowGroundingMenu: (show: boolean) => void;
	setShowUrlMenu: (show: boolean) => void;
}

export function useOverlayController(state: OverlayControllerState, actions: OverlayControllerActions) {
	const {
		showDeviceMenu,
		showSettingsMenu,
		showModelMenu,
		showProviderMenu,
		showSessionMenu,
		showHotkeysPane,
		showGroundingMenu,
		showUrlMenu,
		onboardingActive,
	} = state;

	const isOverlayOpen = useMemo(() => {
		return (
			showDeviceMenu ||
			showSettingsMenu ||
			showModelMenu ||
			showProviderMenu ||
			showSessionMenu ||
			showHotkeysPane ||
			showGroundingMenu ||
			showUrlMenu ||
			onboardingActive
		);
	}, [
		showDeviceMenu,
		showSettingsMenu,
		showModelMenu,
		showProviderMenu,
		showSessionMenu,
		showHotkeysPane,
		showGroundingMenu,
		showUrlMenu,
		onboardingActive,
	]);

	const closeAllOverlays = useCallback(() => {
		actions.setShowDeviceMenu(false);
		actions.setShowSettingsMenu(false);
		actions.setShowModelMenu(false);
		actions.setShowProviderMenu(false);
		actions.setShowSessionMenu(false);
		actions.setShowHotkeysPane(false);
		actions.setShowGroundingMenu(false);
		actions.setShowUrlMenu(false);
	}, [actions]);

	return {
		isOverlayOpen,
		closeAllOverlays,
	};
}

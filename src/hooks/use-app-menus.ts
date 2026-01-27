import { useState } from "react";

export interface UseAppMenusReturn {
	showDeviceMenu: boolean;
	setShowDeviceMenu: React.Dispatch<React.SetStateAction<boolean>>;

	showSettingsMenu: boolean;
	setShowSettingsMenu: React.Dispatch<React.SetStateAction<boolean>>;

	showModelMenu: boolean;
	setShowModelMenu: React.Dispatch<React.SetStateAction<boolean>>;

	showProviderMenu: boolean;
	setShowProviderMenu: React.Dispatch<React.SetStateAction<boolean>>;

	showSessionMenu: boolean;
	setShowSessionMenu: React.Dispatch<React.SetStateAction<boolean>>;

	showHotkeysPane: boolean;
	setShowHotkeysPane: React.Dispatch<React.SetStateAction<boolean>>;

	showGroundingMenu: boolean;
	setShowGroundingMenu: React.Dispatch<React.SetStateAction<boolean>>;

	showUrlMenu: boolean;
	setShowUrlMenu: React.Dispatch<React.SetStateAction<boolean>>;

	showToolsMenu: boolean;
	setShowToolsMenu: React.Dispatch<React.SetStateAction<boolean>>;

	showMemoryMenu: boolean;
	setShowMemoryMenu: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useAppMenus(): UseAppMenusReturn {
	const [showDeviceMenu, setShowDeviceMenu] = useState(false);
	const [showSettingsMenu, setShowSettingsMenu] = useState(false);
	const [showModelMenu, setShowModelMenu] = useState(false);
	const [showProviderMenu, setShowProviderMenu] = useState(false);
	const [showSessionMenu, setShowSessionMenu] = useState(false);
	const [showHotkeysPane, setShowHotkeysPane] = useState(false);
	const [showGroundingMenu, setShowGroundingMenu] = useState(false);
	const [showUrlMenu, setShowUrlMenu] = useState(false);
	const [showToolsMenu, setShowToolsMenu] = useState(false);
	const [showMemoryMenu, setShowMemoryMenu] = useState(false);

	return {
		showDeviceMenu,
		setShowDeviceMenu,
		showSettingsMenu,
		setShowSettingsMenu,
		showModelMenu,
		setShowModelMenu,
		showProviderMenu,
		setShowProviderMenu,
		showSessionMenu,
		setShowSessionMenu,
		showHotkeysPane,
		setShowHotkeysPane,
		showGroundingMenu,
		setShowGroundingMenu,
		showUrlMenu,
		setShowUrlMenu,
		showToolsMenu,
		setShowToolsMenu,
		showMemoryMenu,
		setShowMemoryMenu,
	};
}

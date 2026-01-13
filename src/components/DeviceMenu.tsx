import { useMemo } from "react";
import { useMenuKeyboard } from "../hooks/use-menu-keyboard";
import type { AudioDevice } from "../types";
import { COLORS } from "../ui/constants";

interface DeviceMenuProps {
	devices: AudioDevice[];
	currentDevice: string | undefined;
	currentOutputDevice: string | undefined;
	soxAvailable: boolean;
	soxInstallHint: string;
	onClose: () => void;
	onSelect: (device: AudioDevice) => void;
	onOutputSelect: (device: AudioDevice) => void;
}

export function DeviceMenu({
	devices,
	currentDevice,
	currentOutputDevice,
	soxAvailable,
	soxInstallHint,
	onClose,
	onSelect,
	onOutputSelect,
}: DeviceMenuProps) {
	const totalItems = devices.length * 2;

	const initialIndex = useMemo(() => {
		if (devices.length === 0) return 0;
		const idx = currentDevice ? devices.findIndex((device) => device.name === currentDevice) : -1;
		if (idx >= 0) return idx;
		return devices.length > 1 ? 1 : 0;
	}, [devices, currentDevice]);

	const { selectedIndex } = useMenuKeyboard({
		itemCount: totalItems,
		initialIndex,
		onClose,
		closeOnSelect: false,
		onSelect: (selectedIdx) => {
			const isOutputSection = selectedIdx >= devices.length;
			const deviceIdx = isOutputSection ? selectedIdx - devices.length : selectedIdx;
			const selectedDevice = devices[deviceIdx];
			if (selectedDevice) {
				if (isOutputSection) {
					onOutputSelect(selectedDevice);
				} else {
					onSelect(selectedDevice);
				}
			}
		},
	});

	const isInputSection = selectedIndex < devices.length;
	const inputSelectedIdx = isInputSection ? selectedIndex : -1;
	const outputSelectedIdx = !isInputSection ? selectedIndex - devices.length : -1;

	return (
		<box
			position="absolute"
			left={0}
			top={0}
			width="100%"
			height="100%"
			flexDirection="column"
			alignItems="center"
			justifyContent="center"
			zIndex={100}
		>
			<box
				flexDirection="column"
				backgroundColor={COLORS.MENU_BG}
				borderStyle="single"
				borderColor={COLORS.MENU_BORDER}
				paddingLeft={2}
				paddingRight={2}
				paddingTop={1}
				paddingBottom={1}
				width="50%"
				minWidth={50}
				maxWidth={120}
			>
				<box marginBottom={1}>
					<text>
						<span fg={COLORS.USER_LABEL}>
							{soxAvailable ? "↑/↓ or j/k to navigate, ENTER to select, ESC to cancel" : "ESC to close"}
						</span>
					</text>
				</box>
				{!soxAvailable ? (
					<box flexDirection="column" paddingTop={1}>
						<text>
							<span fg={COLORS.ERROR}>sox is not installed</span>
						</text>
						<box marginTop={1}>
							<text>
								<span fg={COLORS.USER_LABEL}>Voice input requires sox for audio capture.</span>
							</text>
						</box>
						<box marginTop={1}>
							<text>
								<span fg={COLORS.MENU_TEXT}>{soxInstallHint}</span>
							</text>
						</box>
					</box>
				) : devices.length === 0 ? (
					<box>
						<text>
							<span fg={COLORS.USER_LABEL}>Loading devices...</span>
						</text>
					</box>
				) : (
					<>
						<box marginBottom={1} marginTop={1}>
							<text>
								<span fg={COLORS.DAEMON_LABEL}>[ INPUT ]</span>
							</text>
						</box>
						<box flexDirection="column">
							{devices.map((device, idx) => (
								<box
									key={`input-${device.name}`}
									backgroundColor={idx === inputSelectedIdx ? COLORS.MENU_SELECTED_BG : COLORS.MENU_BG}
									paddingLeft={1}
									paddingRight={1}
								>
									<text>
										<span fg={idx === inputSelectedIdx ? COLORS.DAEMON_LABEL : COLORS.MENU_TEXT}>
											{idx === inputSelectedIdx ? "▶ " : "  "}
											{device.name}
											{device.name === currentDevice ? " ●" : ""}
										</span>
									</text>
								</box>
							))}
						</box>
						<box marginBottom={1} marginTop={1}>
							<text>
								<span fg={COLORS.DAEMON_LABEL}>[ OUTPUT ]</span>
							</text>
						</box>
						<box flexDirection="column">
							{devices.map((device, idx) => (
								<box
									key={`output-${device.name}`}
									backgroundColor={idx === outputSelectedIdx ? COLORS.MENU_SELECTED_BG : COLORS.MENU_BG}
									paddingLeft={1}
									paddingRight={1}
								>
									<text>
										<span fg={idx === outputSelectedIdx ? COLORS.DAEMON_LABEL : COLORS.MENU_TEXT}>
											{idx === outputSelectedIdx ? "▶ " : "  "}
											{device.name}
											{device.name === currentOutputDevice ? " ●" : ""}
										</span>
									</text>
								</box>
							))}
						</box>
					</>
				)}
			</box>
		</box>
	);
}

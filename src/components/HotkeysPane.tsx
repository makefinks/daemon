import type { KeyEvent } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useCallback } from "react";
import { COLORS } from "../ui/constants";

interface HotkeysPaneProps {
	onClose: () => void;
}

export function HotkeysPane({ onClose }: HotkeysPaneProps) {
	const handleKeyPress = useCallback(
		(key: KeyEvent) => {
			if (key.eventType !== "press") return;
			if (key.name === "escape" || key.sequence === "?") {
				onClose();
				key.preventDefault();
			}
		},
		[onClose]
	);

	useKeyboard(handleKeyPress);

	const sections = [
		{
			title: "PRIMARY",
			items: [
				{ key: "SPACE", label: "Speak / stop listening" },
				{ key: "SHIFT+TAB", label: "Toggle type mode" },
				{ key: "↑/↓", label: "Scroll conversation" },
				{ key: "J/K", label: "Scroll conversation" },
				{ key: "CTRL+U", label: "Page up conversation" },
				{ key: "CTRL+D", label: "Page down conversation" },
			],
		},
		{
			title: "SESSION",
			items: [
				{ key: "T", label: "Toggle full reasoning previews" },
				{ key: "O", label: "Toggle tool output previews" },
				{ key: "N", label: "New session" },
				{ key: "G", label: "Open Grounding Menu" },
				{ key: "CTRL+X", label: "Undo last message" },
			],
		},
		{
			title: "MENUS",
			items: [
				{ key: "D", label: "Devices" },
				{ key: "M", label: "Models" },
				{ key: "P", label: "Providers" },
				{ key: "L", label: "Sessions" },
				{ key: "S", label: "Settings" },
			],
		},
	];

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
				width="60%"
				minWidth={52}
				maxWidth={140}
			>
				<box marginBottom={1}>
					<text>
						<span fg={COLORS.DAEMON_LABEL}>[ HOTKEYS ]</span>
					</text>
				</box>
				<box marginBottom={1}>
					<text>
						<span fg={COLORS.USER_LABEL}>Press ? or ESC to close</span>
					</text>
				</box>
				<box flexDirection="column">
					{sections.map((section) => (
						<box key={section.title} flexDirection="column" marginBottom={1}>
							<box marginBottom={0}>
								<text>
									<span fg={COLORS.USER_LABEL}>— {section.title} —</span>
								</text>
							</box>
							{section.items.map((item) => (
								<box key={item.key} flexDirection="row">
									<text>
										<span fg={COLORS.DAEMON_LABEL}>{item.key}</span>
										<span fg={COLORS.MENU_TEXT}> · {item.label}</span>
									</text>
								</box>
							))}
						</box>
					))}
				</box>
			</box>
		</box>
	);
}

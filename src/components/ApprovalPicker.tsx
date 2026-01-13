import { useState, useCallback, useRef } from "react";
import { useKeyboard } from "@opentui/react";
import { TextAttributes, type KeyEvent } from "@opentui/core";
import { COLORS } from "../ui/constants";

interface ApprovalPickerProps {
	onApprove: () => void;
	onDeny: () => void;
	onApproveAll?: () => void;
	onDenyAll?: () => void;
	focused?: boolean;
}

export function ApprovalPicker({
	onApprove,
	onDeny,
	onApproveAll,
	onDenyAll,
	focused = true,
}: ApprovalPickerProps) {
	const [selectedIndex, setSelectedIndex] = useState(0);
	const respondedRef = useRef(false);

	const handleSelect = useCallback(() => {
		if (respondedRef.current) return;
		respondedRef.current = true;
		if (selectedIndex === 0) {
			onApprove();
		} else {
			onDeny();
		}
	}, [selectedIndex, onApprove, onDeny]);

	useKeyboard((key: KeyEvent) => {
		if (!focused) return;
		if (respondedRef.current) return;
		if (key.eventType !== "press") return;

		if (key.name === "left" || key.name === "right" || key.name === "tab") {
			setSelectedIndex((prev) => (prev === 0 ? 1 : 0));
			key.preventDefault();
		} else if (key.name === "return") {
			handleSelect();
			key.preventDefault();
		} else if (key.sequence === "y") {
			respondedRef.current = true;
			onApprove();
			key.preventDefault();
		} else if (key.sequence === "Y" && onApproveAll) {
			respondedRef.current = true;
			onApproveAll();
			key.preventDefault();
		} else if (key.sequence === "n") {
			respondedRef.current = true;
			onDeny();
			key.preventDefault();
		} else if (key.sequence === "N" && onDenyAll) {
			respondedRef.current = true;
			onDenyAll();
			key.preventDefault();
		}
	});

	const approveSelected = selectedIndex === 0;
	const denySelected = selectedIndex === 1;

	if (!focused) {
		return (
			<box flexDirection="row" alignItems="center" gap={1} marginTop={1} paddingLeft={2}>
				<text>
					<span fg={COLORS.REASONING_DIM}>{"   awaiting review..."}</span>
				</text>
			</box>
		);
	}

	return (
		<box flexDirection="row" alignItems="center" gap={1} marginTop={1} paddingLeft={2}>
			<text>
				<span fg={COLORS.STATUS_APPROVAL}>{">> "}</span>
				<span fg={COLORS.TOOL_INPUT_TEXT}>{"approve? "}</span>
			</text>
			<box
				paddingLeft={1}
				paddingRight={1}
				backgroundColor={approveSelected ? COLORS.STATUS_COMPLETED : undefined}
			>
				<text>
					<span
						fg={approveSelected ? COLORS.MENU_BG : COLORS.STATUS_COMPLETED}
						attributes={approveSelected ? TextAttributes.BOLD : TextAttributes.NONE}
					>
						{"[Y]es"}
					</span>
				</text>
			</box>
			<box paddingLeft={1} paddingRight={1} backgroundColor={denySelected ? COLORS.STATUS_FAILED : undefined}>
				<text>
					<span
						fg={denySelected ? COLORS.MENU_BG : COLORS.STATUS_FAILED}
						attributes={denySelected ? TextAttributes.BOLD : TextAttributes.NONE}
					>
						{"[N]o"}
					</span>
				</text>
			</box>
		</box>
	);
}

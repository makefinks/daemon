/**
 * Status bar component that displays the current daemon state.
 */

import { COLORS } from "../ui/constants";

const SESSION_TITLE_MAX_LENGTH = 40;
const HEX_COLOR_PATTERN = /^#?([0-9a-fA-F]{6})$/;

// Matches default timestamp titles: "Session 2025-12-30 20:53"
const DEFAULT_TITLE_PATTERN = /^Session \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;

function isDefaultSessionTitle(title: string): boolean {
	return DEFAULT_TITLE_PATTERN.test(title);
}

function truncateWithEllipsis(text: string, maxLength: number): string {
	if (text.length <= maxLength) return text;
	return text.slice(0, maxLength - 1) + "…";
}

function fadeColor(color: string, progress: number): string {
	const target = HEX_COLOR_PATTERN.exec(color)?.[1];
	const base = HEX_COLOR_PATTERN.exec(COLORS.BACKGROUND)?.[1];
	if (!target || !base) return color;

	const t = Math.max(0, Math.min(1, progress));
	const br = Number.parseInt(base.slice(0, 2), 16);
	const bg = Number.parseInt(base.slice(2, 4), 16);
	const bb = Number.parseInt(base.slice(4, 6), 16);
	const tr = Number.parseInt(target.slice(0, 2), 16);
	const tg = Number.parseInt(target.slice(2, 4), 16);
	const tb = Number.parseInt(target.slice(4, 6), 16);
	const r = Math.round(br + (tr - br) * t);
	const g = Math.round(bg + (tg - bg) * t);
	const b = Math.round(bb + (tb - bb) * t);

	return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b
		.toString(16)
		.padStart(2, "0")}`;
}

interface StatusBarProps {
	statusText: string;
	statusColor: string;
	errorText?: string;
	modelName?: string;
	reasoningEffortLabel?: string;
	sessionTitle?: string;
	hasInteracted?: boolean;
	fadeProgress?: number;
}

export function StatusBar({
	statusText,
	statusColor,
	errorText,
	modelName,
	reasoningEffortLabel,
	sessionTitle,
	hasInteracted,
	fadeProgress = 1,
}: StatusBarProps) {
	const borderColor = fadeColor(COLORS.STATUS_BORDER, fadeProgress);
	const displayStatusColor = fadeColor(statusColor, fadeProgress);
	const errorColor = fadeColor(COLORS.DAEMON_ERROR, fadeProgress);
	const effortColor = fadeColor(COLORS.REASONING, fadeProgress);
	const titleText = modelName
		? reasoningEffortLabel
			? `${modelName} · ${reasoningEffortLabel}`
			: modelName
		: undefined;

	if (hasInteracted) {
		const showTitleSpinner = sessionTitle && isDefaultSessionTitle(sessionTitle);
		const displayTitle =
			sessionTitle && !showTitleSpinner ? truncateWithEllipsis(sessionTitle, SESSION_TITLE_MAX_LENGTH) : null;

		return (
			<box
				width="100%"
				flexShrink={0}
				flexDirection="column"
				borderStyle="single"
				borderColor={borderColor}
				paddingTop={0}
				paddingLeft={1}
				paddingRight={1}
			>
				<box width="100%" flexDirection="row" justifyContent="center" alignItems="center">
					<box position="absolute" left={0} top={0} flexDirection="row">
						{modelName && (
							<text>
								<span fg={borderColor}>{modelName}</span>
							</text>
						)}
						{reasoningEffortLabel && (
							<text marginLeft={1}>
								<span fg={effortColor}>EFFORT {reasoningEffortLabel}</span>
							</text>
						)}
					</box>

					<text>
						<span fg={displayStatusColor}>{statusText}</span>
					</text>

					<box position="absolute" right={0} top={0} flexDirection="row">
						{showTitleSpinner && (
							<>
								<spinner name="dots" color={borderColor} />
								<text marginLeft={1}>
									<span fg={borderColor}>title generating...</span>
								</text>
							</>
						)}
						{displayTitle && (
							<text>
								<span fg={borderColor}>{displayTitle}</span>
							</text>
						)}
					</box>
				</box>

				{errorText && (
					<box width="100%" flexDirection="row" justifyContent="center" alignItems="center" marginTop={1}>
						<text>
							<span fg={errorColor}>{errorText}</span>
						</text>
					</box>
				)}
			</box>
		);
	}

	return (
		<box
			width="100%"
			flexShrink={0}
			flexDirection="column"
			alignItems="center"
			borderStyle="single"
			borderColor={borderColor}
			title={titleText}
			titleAlignment="center"
			paddingTop={0}
			paddingLeft={1}
			paddingRight={1}
		>
			{/* Main status text */}
			<box width="100%" flexDirection="row" justifyContent="center" alignItems="center">
				<text>
					<span fg={displayStatusColor}>{statusText}</span>
				</text>
			</box>

			{/* Error text if present */}
			{errorText && (
				<box width="100%" flexDirection="row" justifyContent="center" alignItems="center" marginTop={1}>
					<text>
						<span fg={errorColor}>{errorText}</span>
					</text>
				</box>
			)}
		</box>
	);
}

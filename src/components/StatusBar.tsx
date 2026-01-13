/**
 * Status bar component that displays the current daemon state.
 */

import { COLORS } from "../ui/constants";

const SESSION_TITLE_MAX_LENGTH = 40;

// Matches default timestamp titles: "Session 2025-12-30 20:53"
const DEFAULT_TITLE_PATTERN = /^Session \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;

function isDefaultSessionTitle(title: string): boolean {
	return DEFAULT_TITLE_PATTERN.test(title);
}

function truncateWithEllipsis(text: string, maxLength: number): string {
	if (text.length <= maxLength) return text;
	return text.slice(0, maxLength - 1) + "…";
}

interface StatusBarProps {
	statusText: string;
	statusColor: string;
	errorText?: string;
	modelName?: string;
	sessionTitle?: string;
	hasInteracted?: boolean;
}

export function StatusBar({
	statusText,
	statusColor,
	errorText,
	modelName,
	sessionTitle,
	hasInteracted,
}: StatusBarProps) {
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
				borderColor={COLORS.STATUS_BORDER}
				paddingTop={0}
				paddingLeft={1}
				paddingRight={1}
			>
				<box width="100%" flexDirection="row" justifyContent="center" alignItems="center">
					<box position="absolute" left={0} top={0}>
						{modelName && (
							<text>
								<span fg={COLORS.STATUS_BORDER}>{modelName}</span>
							</text>
						)}
					</box>

					<text>
						<span fg={statusColor}>{statusText}</span>
					</text>

					<box position="absolute" right={0} top={0} flexDirection="row">
						{showTitleSpinner && (
							<>
								<spinner name="dots" color={COLORS.STATUS_BORDER} />
								<text marginLeft={1}>
									<span fg={COLORS.STATUS_BORDER}>title generating...</span>
								</text>
							</>
						)}
						{displayTitle && (
							<text>
								<span fg={COLORS.STATUS_BORDER}>{displayTitle}</span>
							</text>
						)}
					</box>
				</box>

				{errorText && (
					<box width="100%" flexDirection="row" justifyContent="center" alignItems="center" marginTop={1}>
						<text>
							<span fg={COLORS.DAEMON_ERROR}>{errorText}</span>
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
			borderColor={COLORS.STATUS_BORDER}
			title={modelName}
			titleAlignment="center"
			paddingTop={0}
			paddingLeft={1}
			paddingRight={1}
		>
			{/* Main status text */}
			<box width="100%" flexDirection="row" justifyContent="center" alignItems="center">
				<text>
					<span fg={statusColor}>{statusText}</span>
				</text>
			</box>

			{/* Error text if present */}
			{errorText && (
				<box width="100%" flexDirection="row" justifyContent="center" alignItems="center" marginTop={1}>
					<text>
						<span fg={COLORS.DAEMON_ERROR}>{errorText}</span>
					</text>
				</box>
			)}
		</box>
	);
}

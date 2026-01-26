import { memo, useCallback } from "react";
import type { RefObject } from "react";
import type { DaemonAvatarRenderable } from "../../avatar/DaemonAvatarRenderable";
import { BANNER_GRADIENT, DAEMON_BANNER_LINES, useGlitchyBanner } from "../../hooks/use-glitchy-banner";
import { DaemonState } from "../../types";

export interface AvatarLayerProps {
	avatarRef: RefObject<DaemonAvatarRenderable | null>;
	daemonState: DaemonState;
	applyAvatarForState: (state: DaemonState) => void;
	width: number;
	height: number;
	zIndex?: number;
	showBanner?: boolean;
	animateBanner?: boolean;
}

function AvatarLayerImpl(props: AvatarLayerProps) {
	const {
		avatarRef,
		daemonState,
		applyAvatarForState,
		width,
		height,
		zIndex = 0,
		showBanner = false,
		animateBanner = false,
	} = props;

	// Use glitchy banner animation when animateBanner is true
	const glitchyBanner = useGlitchyBanner(showBanner && animateBanner);

	// Determine which lines/colors to use
	const bannerLines = animateBanner ? glitchyBanner.lines : DAEMON_BANNER_LINES;
	const bannerColors = animateBanner ? glitchyBanner.colors : BANNER_GRADIENT;

	const handleAvatarRef = useCallback(
		(ref: DaemonAvatarRenderable | null) => {
			avatarRef.current = ref;
			if (ref) {
				applyAvatarForState(daemonState);
			}
		},
		[avatarRef, applyAvatarForState, daemonState]
	);

	return (
		<>
			{showBanner && (
				<box
					position="absolute"
					top={6}
					left={0}
					width="100%"
					alignItems="center"
					justifyContent="center"
					flexDirection="column"
					zIndex={10}
				>
					{bannerLines.map((line, i) => (
						<text key={i}>
							<span fg={bannerColors[i]}>{line}</span>
						</text>
					))}
				</box>
			)}
			<box
				position="absolute"
				top={0}
				left={0}
				width="100%"
				height="100%"
				alignItems="center"
				justifyContent="center"
				zIndex={zIndex}
			>
				<daemon-avatar
					id="daemon-avatar"
					live
					width={width}
					height={height}
					respectAlpha={true}
					ref={handleAvatarRef}
				/>
			</box>
		</>
	);
}

export const AvatarLayer = memo(AvatarLayerImpl);

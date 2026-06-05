import { memo, useCallback, useEffect, useRef } from "react";
import type { RefObject } from "react";
import type { DaemonAvatarRenderable } from "../../avatar/DaemonAvatarRenderable";
import { BANNER_GRADIENT, DAEMON_BANNER_LINES, useGlitchyBanner } from "../../hooks/use-glitchy-banner";
import { DaemonState } from "../../types";
import type { DaemonStats } from "../../types";
import { COLORS } from "../../ui/constants";
import { APP_VERSION } from "../../utils/app-version";
import { AvatarHud } from "./AvatarHud";

export interface AvatarLayerProps {
	avatarRef: RefObject<DaemonAvatarRenderable | null>;
	daemonState: DaemonState;
	applyAvatarForState: (state: DaemonState) => void;
	width: number;
	height: number;
	terminalWidth: number;
	terminalHeight: number;
	zIndex?: number;
	showBanner?: boolean;
	animateBanner?: boolean;
	startupAnimationActive?: boolean;
	renderAvatar?: boolean;
	stats?: DaemonStats | null;
	showHud?: boolean;
	runningSessionCount?: number;
	approvalSessionCount?: number;
}

function AvatarLayerImpl(props: AvatarLayerProps) {
	const {
		avatarRef,
		daemonState,
		applyAvatarForState,
		width,
		height,
		terminalWidth,
		terminalHeight,
		zIndex = 0,
		showBanner = false,
		animateBanner = false,
		startupAnimationActive = false,
		renderAvatar = true,
		stats = null,
		showHud = false,
		runningSessionCount = 0,
		approvalSessionCount = 0,
	} = props;

	// Use glitchy banner animation when animateBanner is true
	const glitchyBanner = useGlitchyBanner(showBanner && animateBanner);

	// Determine which lines/colors to use
	const bannerLines = animateBanner ? glitchyBanner.lines : DAEMON_BANNER_LINES;
	const bannerColors = animateBanner ? glitchyBanner.colors : BANNER_GRADIENT;

	// Keep a stable callback ref so we don't detach/reattach on daemonState changes.
	const daemonStateRef = useRef(daemonState);
	const applyAvatarForStateRef = useRef(applyAvatarForState);
	const startupAnimationActiveRef = useRef(startupAnimationActive);

	useEffect(() => {
		daemonStateRef.current = daemonState;
	}, [daemonState]);
	useEffect(() => {
		applyAvatarForStateRef.current = applyAvatarForState;
	}, [applyAvatarForState]);
	useEffect(() => {
		startupAnimationActiveRef.current = startupAnimationActive;
	}, [startupAnimationActive]);

	const handleAvatarRef = useCallback(
		(ref: DaemonAvatarRenderable | null) => {
			if (ref === avatarRef.current) return;
			avatarRef.current = ref;
			if (!ref) return;

			applyAvatarForStateRef.current(daemonStateRef.current);
			if (startupAnimationActiveRef.current) {
				ref.resetSpawn();
			} else {
				ref.skipSpawn();
			}
		},
		[avatarRef]
	);

	useEffect(() => {
		const ref = avatarRef.current;
		if (!ref) return;
		if (startupAnimationActive) {
			ref.resetSpawn();
		} else {
			ref.skipSpawn();
		}
	}, [avatarRef, startupAnimationActive]);

	// Avatar pulse trigger: zoom in briefly on TYPING/LISTENING transitions
	const prevAvatarStateRef = useRef(daemonState);
	useEffect(() => {
		const prev = prevAvatarStateRef.current;
		prevAvatarStateRef.current = daemonState;
		const ref = avatarRef.current;
		if (!ref) return;
		if (
			(daemonState === DaemonState.TYPING) !== (prev === DaemonState.TYPING) ||
			(daemonState === DaemonState.LISTENING) !== (prev === DaemonState.LISTENING)
		) {
			ref.triggerPulse();
		}
	}, [daemonState, avatarRef]);

	return (
		<>
			<AvatarHud
				stats={stats}
				width={terminalWidth}
				height={terminalHeight}
				avatarWidth={width}
				avatarHeight={height}
				visible={renderAvatar && showHud}
				staggeredReveal={startupAnimationActive}
				daemonState={daemonState}
				runningSessionCount={runningSessionCount}
				approvalSessionCount={approvalSessionCount}
			/>
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
					{bannerLines.length > 0 && (!animateBanner || glitchyBanner.complete) && (
						<text>
							<span fg={COLORS.REASONING_DIM}>
								{"v".concat(APP_VERSION).padStart(DAEMON_BANNER_LINES[0]!.length)}
							</span>
						</text>
					)}
				</box>
			)}
			{renderAvatar && (
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
			)}
		</>
	);
}

export const AvatarLayer = memo(AvatarLayerImpl);

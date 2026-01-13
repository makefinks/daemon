import { memo, useCallback } from "react";
import type { RefObject } from "react";
import type { DaemonAvatarRenderable } from "../../avatar/DaemonAvatarRenderable";
import { DaemonState } from "../../types";

export interface AvatarLayerProps {
	avatarRef: RefObject<DaemonAvatarRenderable | null>;
	daemonState: DaemonState;
	applyAvatarForState: (state: DaemonState) => void;
	width: number;
	height: number;
	zIndex?: number;
}

function AvatarLayerImpl(props: AvatarLayerProps) {
	const { avatarRef, daemonState, applyAvatarForState, width, height, zIndex = 0 } = props;

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
	);
}

export const AvatarLayer = memo(AvatarLayerImpl);

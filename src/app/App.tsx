import { Toaster } from "@opentui-ui/toast/react";
import { extend } from "@opentui/react";
import "opentui-spinner/react";

import { DaemonAvatarRenderable } from "../avatar/DaemonAvatarRenderable";
import { useAppController } from "../hooks/use-app-controller";
import { ToolApprovalProvider } from "../hooks/use-tool-approval";
import { AppProvider } from "../state/app-context";
import { COLORS } from "../ui/constants";
import { AppOverlays } from "./components/AppOverlays";
import { AvatarLayer } from "./components/AvatarLayer";
import { ConversationPane } from "./components/ConversationPane";

const INITIAL_STATUS_TOP = "70%";

const TOAST_OPTIONS = {
	style: {
		border: true,
		borderStyle: "single",
		borderColor: COLORS.REASONING,
		backgroundColor: "#0a0a0f",
		foregroundColor: "#e5e7eb",
		mutedColor: "#9ca3af",
		paddingX: 1,
		paddingY: 0,
		minHeight: 3,
	},
	success: { style: { borderColor: COLORS.DAEMON_TEXT } },
	error: { style: { borderColor: COLORS.ERROR } },
	warning: { style: { borderColor: "#fbbf24" } },
	info: { style: { borderColor: COLORS.REASONING } },
	loading: { style: { borderColor: COLORS.REASONING_DIM } },
} as const;

declare module "@opentui/react" {
	interface OpenTUIComponents {
		"daemon-avatar": typeof DaemonAvatarRenderable;
	}
}

extend({
	"daemon-avatar": DaemonAvatarRenderable,
});

export function App() {
	const controller = useAppController({ initialStatusTop: INITIAL_STATUS_TOP });

	return (
		<ToolApprovalProvider>
			<box
				flexDirection="column"
				width="100%"
				height="100%"
				backgroundColor={COLORS.BACKGROUND}
				onMouseUp={controller.handleCopyOnSelectMouseUp}
			>
				<>
					<Toaster
						position="top-right"
						stackingMode="stack"
						visibleToasts={2}
						maxWidth={60}
						toastOptions={TOAST_OPTIONS}
					/>

					<AvatarLayer
						avatarRef={controller.avatarLayerProps.avatarRef}
						daemonState={controller.avatarLayerProps.daemonState}
						applyAvatarForState={controller.avatarLayerProps.applyAvatarForState}
						width={controller.avatarLayerProps.width}
						height={controller.avatarLayerProps.height}
						zIndex={controller.avatarLayerProps.zIndex}
						showBanner={controller.avatarLayerProps.showBanner}
						animateBanner={controller.avatarLayerProps.animateBanner}
					/>

					{controller.isListeningDim ? (
						<box
							position="absolute"
							top={controller.listeningDimTop}
							left={0}
							width="100%"
							height="100%"
							backgroundColor={COLORS.LISTENING_DIM}
							zIndex={1}
						/>
					) : null}

					<box
						flexDirection="column"
						width="100%"
						height="100%"
						zIndex={controller.conversationContainerZIndex}
					>
						<ConversationPane {...controller.conversationPaneProps} />
					</box>

					<AppProvider value={controller.appContextValue}>
						<AppOverlays {...controller.overlaysProps} />
					</AppProvider>
				</>
			</box>
		</ToolApprovalProvider>
	);
}

import { useTimeline } from "@opentui/react";
import { useEffect, useState, type ReactNode } from "react";

const FADE_DURATION_MS = 400;

interface ToolCardFadeInProps {
	children: ReactNode;
	isLive?: boolean;
}

export function ToolCardFadeIn({ children, isLive = false }: ToolCardFadeInProps) {
	if (!isLive) {
		return (
			<box flexDirection="column" style={{ opacity: 1 }}>
				{children}
			</box>
		);
	}

	return <ToolCardFadeInAnimated>{children}</ToolCardFadeInAnimated>;
}

function ToolCardFadeInAnimated({ children }: { children: ReactNode }) {
	const [opacity, setOpacity] = useState(0);
	const timeline = useTimeline({ duration: FADE_DURATION_MS, autoplay: false });

	useEffect(() => {
		timeline.add(
			{ opacity: 0 },
			{
				opacity: 1,
				duration: FADE_DURATION_MS,
				ease: "outQuad",
				onUpdate: (anim) => {
					setOpacity(anim.targets[0].opacity);
				},
			}
		);
	}, [timeline]);

	return (
		<box flexDirection="column" style={{ opacity }}>
			{children}
		</box>
	);
}

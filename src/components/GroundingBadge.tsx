import { COLORS } from "../ui/constants";

interface GroundingBadgeProps {
	count: number;
}

export function GroundingBadge({ count }: GroundingBadgeProps) {
	return (
		<box flexDirection="row" marginTop={1}>
			<text>
				<span fg={COLORS.REASONING_DIM}>[ </span>
				<span fg={COLORS.DAEMON_LABEL}>
					-&gt; {count} source{count !== 1 ? "s" : ""}
				</span>
				<span fg={COLORS.REASONING_DIM}> · press </span>
				<span fg={COLORS.DAEMON_LABEL}>G</span>
				<span fg={COLORS.REASONING_DIM}> to view ]</span>
			</text>
		</box>
	);
}

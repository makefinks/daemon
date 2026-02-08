/**
 * Component for displaying token usage statistics.
 */

import type { TokenUsage } from "../types";
import { COLORS } from "../ui/constants";
import { formatTokenCount } from "../utils/formatters";
import { type ModelMetadata, calculateCost, formatContextUsage, formatCost } from "../utils/model-metadata";

interface TokenUsageDisplayProps {
	usage: TokenUsage;
	modelMetadata?: ModelMetadata | null;
	hideCost?: boolean;
}

export function TokenUsageDisplay({ usage, modelMetadata, hideCost = false }: TokenUsageDisplayProps) {
	const mainPromptTokens = usage.promptTokens;
	const mainCompletionTokens = usage.completionTokens;

	// Calculate cost if we have pricing info
	const cost = hideCost
		? null
		: typeof usage.cost === "number"
			? usage.cost
			: modelMetadata?.pricing
				? calculateCost(
						mainPromptTokens + (usage.subagentPromptTokens ?? 0),
						mainCompletionTokens + (usage.subagentCompletionTokens ?? 0),
						modelMetadata.pricing,
						usage.cachedInputTokens
					)
				: null;

	// Context % uses latest turn only (prompt already includes full history, completion is that turn's output)
	const latestTurnTotal = (usage.latestTurnPromptTokens ?? 0) + (usage.latestTurnCompletionTokens ?? 0);
	const contextUsage =
		modelMetadata?.contextLength && latestTurnTotal > 0
			? formatContextUsage(latestTurnTotal, modelMetadata.contextLength)
			: null;

	return (
		<box
			height={1}
			width="100%"
			flexShrink={0}
			flexDirection="row"
			justifyContent="center"
			alignItems="center"
		>
			<text>
				{/* Context usage: X/Y (Z%) */}
				{contextUsage && (
					<>
						<span fg={COLORS.TOKEN_USAGE_LABEL}>Tokens: </span>
						<span fg={COLORS.TOKEN_USAGE}>{formatTokenCount(latestTurnTotal)}</span>
						<span fg={COLORS.TOKEN_USAGE_LABEL}>/</span>
						<span fg={COLORS.TOKEN_USAGE}>{formatTokenCount(modelMetadata!.contextLength)}</span>
						<span fg={COLORS.REASONING_DIM}> ({contextUsage})</span>
						<span fg={COLORS.TOKEN_USAGE_LABEL}> · </span>
					</>
				)}

				{/* Token breakdown: in/out */}
				<span fg={COLORS.TOKEN_USAGE}>{formatTokenCount(mainPromptTokens)} in</span>
				<span fg={COLORS.TOKEN_USAGE_LABEL}> / </span>
				<span fg={COLORS.TOKEN_USAGE}>{formatTokenCount(mainCompletionTokens)} out</span>

				{/* Reasoning tokens */}
				{usage.reasoningTokens !== undefined && usage.reasoningTokens > 0 && (
					<>
						<span fg={COLORS.TOKEN_USAGE_LABEL}> / </span>
						<span fg={COLORS.REASONING_DIM}>{formatTokenCount(usage.reasoningTokens)} reasoning</span>
					</>
				)}

				{/* Cached tokens */}
				{usage.cachedInputTokens !== undefined && usage.cachedInputTokens > 0 && (
					<>
						<span fg={COLORS.TOKEN_USAGE_LABEL}> / </span>
						<span fg={COLORS.DAEMON_LABEL}>{formatTokenCount(usage.cachedInputTokens)} cached</span>
					</>
				)}

				{/* Cost */}
				{cost !== null && (
					<>
						<span fg={COLORS.TOKEN_USAGE_LABEL}> · </span>
						<span fg={COLORS.TYPING_PROMPT}>{formatCost(cost)}</span>
					</>
				)}
			</text>
		</box>
	);
}

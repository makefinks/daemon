/**
 * Component for displaying token usage statistics.
 */

import { COLORS } from "../ui/constants";
import { formatTokenCount } from "../utils/formatters";
import { calculateCost, formatCost, formatContextUsage, type ModelMetadata } from "../utils/model-metadata";
import type { TokenUsage } from "../types";

interface TokenUsageDisplayProps {
	usage: TokenUsage;
	modelMetadata?: ModelMetadata | null;
}

export function TokenUsageDisplay({ usage, modelMetadata }: TokenUsageDisplayProps) {
	const mainPromptTokens = usage.promptTokens;
	const mainCompletionTokens = usage.completionTokens;
	const mainTotalTokens = mainPromptTokens + mainCompletionTokens;

	// Calculate cost if we have pricing info
	const cost =
		typeof usage.cost === "number"
			? usage.cost
			: modelMetadata?.pricing
				? calculateCost(
						mainPromptTokens + (usage.subagentPromptTokens ?? 0),
						mainCompletionTokens + (usage.subagentCompletionTokens ?? 0),
						modelMetadata.pricing,
						usage.cachedInputTokens
					)
				: null;

	// Calculate context usage percentage
	const contextTotalTokens = mainTotalTokens;
	const contextUsage = modelMetadata?.contextLength
		? formatContextUsage(contextTotalTokens, modelMetadata.contextLength)
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
				{modelMetadata?.contextLength && (
					<>
						<span fg={COLORS.TOKEN_USAGE_LABEL}>Tokens: </span>
						<span fg={COLORS.TOKEN_USAGE}>{formatTokenCount(contextTotalTokens)}</span>
						<span fg={COLORS.TOKEN_USAGE_LABEL}>/</span>
						<span fg={COLORS.TOKEN_USAGE}>{formatTokenCount(modelMetadata.contextLength)}</span>
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

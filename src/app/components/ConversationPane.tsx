import type { ScrollBoxRenderable, TextareaRenderable } from "@opentui/core";
import { memo } from "react";
import type { MutableRefObject } from "react";
import {
	ContentBlockView,
	isLastReasoningBlockInList,
	isLastTextBlockInList,
	shouldHideContentBlock,
} from "../../components/ContentBlockView";
import { GroundingBadge } from "../../components/GroundingBadge";
import { InlineStatusIndicator } from "../../components/InlineStatusIndicator";
import { StatusBar } from "../../components/StatusBar";
import { TokenUsageDisplay } from "../../components/TokenUsageDisplay";
import { TypingInputBar } from "../../components/TypingInputBar";
import type { ContentBlock, ConversationMessage, TokenUsage } from "../../types";
import { DaemonState } from "../../types";
import { COLORS, REASONING_MARKDOWN_STYLE } from "../../ui/constants";
import { renderReasoningTicker } from "../../ui/reasoning-ticker";
import { formatElapsedTime } from "../../utils/formatters";
import type { ModelMetadata } from "../../utils/model-metadata";

export interface ConversationDisplayState {
	conversationHistory: ConversationMessage[];
	currentTranscription: string;
	currentResponse: string;
	currentContentBlocks: ContentBlock[];
}

export interface StatusDisplayState {
	daemonState: DaemonState;
	statusText: string;
	statusColor: string;
	apiKeyMissingError: string;
	error: string;
	resetNotification: string;
	escPendingCancel: boolean;
}

export interface ReasoningDisplayState {
	showFullReasoning: boolean;
	showToolOutput: boolean;
	reasoningQueue: string;
	reasoningDisplay: string;
	fullReasoning: string;
}

export interface ProgressDisplayState {
	showWorkingSpinner: boolean;
	workingSpinnerLabel: string;
	isToolCalling: boolean;
	responseElapsedMs: number;
}

export interface TypingInputState {
	typingTextareaRef: MutableRefObject<TextareaRenderable | null>;
	conversationScrollRef: MutableRefObject<ScrollBoxRenderable | null>;
	onTypingContentChange: (value: string) => void;
	onTypingSubmit: () => void;
	onHistoryUp?: () => void;
	onHistoryDown?: () => void;
}

export interface ConversationPaneProps {
	conversation: ConversationDisplayState;
	status: StatusDisplayState;
	reasoning: ReasoningDisplayState;
	progress: ProgressDisplayState;
	typing: TypingInputState;
	sessionUsage: TokenUsage;
	modelMetadata: ModelMetadata | null;
	hasInteracted: boolean;
	suppressStatusBar?: boolean;
	frostColor: string;
	initialStatusTop: number | "auto" | `${number}%`;
	hasGrounding?: boolean;
	groundingCount?: number;
	modelName?: string;
	sessionTitle?: string;
	isVoiceOutputEnabled?: boolean;
	startupIntroDone?: boolean;
}

function ConversationPaneImpl(props: ConversationPaneProps) {
	const {
		conversation,
		status,
		reasoning,
		progress,
		typing,
		sessionUsage,
		modelMetadata,
		hasInteracted,
		suppressStatusBar = false,
		frostColor,
		initialStatusTop,
		hasGrounding,
		groundingCount,
		modelName,
		sessionTitle,
		isVoiceOutputEnabled,
		startupIntroDone = true,
	} = props;

	const { conversationHistory, currentTranscription, currentContentBlocks } = conversation;
	const {
		daemonState,
		statusText,
		statusColor,
		apiKeyMissingError,
		error,
		resetNotification,
		escPendingCancel,
	} = status;
	const { showFullReasoning, showToolOutput, reasoningQueue, reasoningDisplay, fullReasoning } = reasoning;
	const { showWorkingSpinner, isToolCalling, responseElapsedMs } = progress;
	const {
		typingTextareaRef,
		conversationScrollRef,
		onTypingContentChange,
		onTypingSubmit,
		onHistoryUp,
		onHistoryDown,
	} = typing;

	const showSessionDebug = Boolean(process.env.DEBUG_SESSION);

	const renderHistoryBlock = (block: ContentBlock, idx: number, blocks: ContentBlock[]) => {
		if (shouldHideContentBlock(block)) {
			return null;
		}

		let nextBlock: ContentBlock | undefined;
		for (let i = idx + 1; i < blocks.length; i++) {
			const b = blocks[i];
			if (b && !shouldHideContentBlock(b)) {
				nextBlock = b;
				break;
			}
		}

		const isTool = block.type === "tool";
		const isNextTool = nextBlock?.type === "tool";
		const marginBottom = isTool && isNextTool ? 0 : 1;

		return (
			<box key={idx} flexDirection="column" marginBottom={marginBottom}>
				<ContentBlockView
					block={block}
					isLastReasoningBlock={isLastReasoningBlockInList(blocks, block)}
					isLastTextBlock={isLastTextBlockInList(blocks, block)}
					isLastBlock={idx === blocks.length - 1}
					isStreaming={false}
					showFullReasoning={showFullReasoning}
					showToolOutput={showToolOutput}
				/>
			</box>
		);
	};

	const renderMessageDebug = (msg: ConversationMessage) => {
		if (!showSessionDebug) return null;
		const roles = msg.messages?.map((m) => m.role).join(",") ?? "none";
		const pendingLabel = msg.pending ? " · pending" : "";
		return (
			<box marginBottom={1}>
				<text>
					<span fg={COLORS.REASONING_DIM}>
						#id:{msg.id} · type:{msg.type} · roles:{roles} · blocks:
						{msg.contentBlocks?.length ?? 0}
						{pendingLabel}
					</span>
				</text>
			</box>
		);
	};

	const showTypingInput = hasInteracted && daemonState === DaemonState.TYPING;
	const isReasoning =
		daemonState === DaemonState.RESPONDING &&
		(!conversation.currentResponse || !!reasoningDisplay || !!reasoningQueue);
	const fullReasoningDurationLabel =
		responseElapsedMs > 0 ? ` · ${formatElapsedTime(responseElapsedMs, { style: "detailed" })}` : "";

	return (
		<>
			{hasInteracted && !suppressStatusBar && (
				<StatusBar
					statusText={statusText}
					statusColor={statusColor}
					errorText={apiKeyMissingError || error}
					modelName={modelName}
					sessionTitle={sessionTitle}
					hasInteracted={hasInteracted}
				/>
			)}

			{!hasInteracted && startupIntroDone && (
				<box
					position="absolute"
					left={0}
					top={initialStatusTop}
					width="100%"
					alignItems="center"
					justifyContent="center"
					zIndex={2}
				>
					<box flexDirection="column" alignItems="center">
						<StatusBar
							statusText={statusText}
							statusColor={statusColor}
							errorText={apiKeyMissingError || error}
							modelName={modelName}
						/>

						{isVoiceOutputEnabled && daemonState === DaemonState.IDLE && (
							<box marginTop={1}>
								<text>
									<span fg={COLORS.REASONING_DIM}>◉ voice output active</span>
								</text>
							</box>
						)}

						<box marginTop={2} width="100%" justifyContent="center">
							{daemonState === DaemonState.TYPING ? (
								<TypingInputBar
									onContentChange={onTypingContentChange}
									onSubmit={onTypingSubmit}
									onHistoryUp={onHistoryUp}
									onHistoryDown={onHistoryDown}
									textareaRef={typingTextareaRef}
									placeholder="Enter instructions..."
									width="75%"
									maxWidth={140}
									minWidth={55}
									height={5}
								/>
							) : (
								<></>
							)}
						</box>
					</box>
				</box>
			)}

			{hasInteracted &&
				(sessionUsage.totalTokens > 0 ||
					(sessionUsage.subagentTotalTokens ?? 0) > 0 ||
					typeof sessionUsage.cost === "number") && (
					<TokenUsageDisplay usage={sessionUsage} modelMetadata={modelMetadata} />
				)}

			{hasInteracted && resetNotification && (
				<box
					height={1}
					width="100%"
					flexShrink={0}
					flexDirection="row"
					justifyContent="center"
					alignItems="center"
					marginTop={1}
				>
					<text>
						<span fg={COLORS.REASONING}>[ {resetNotification} ]</span>
					</text>
				</box>
			)}

			{hasInteracted && escPendingCancel && (
				<box
					height={1}
					width="100%"
					flexShrink={0}
					flexDirection="row"
					justifyContent="center"
					alignItems="center"
				>
					<text>
						<span fg={COLORS.ERROR}>[ Press ESC again to cancel ]</span>
					</text>
				</box>
			)}

			{hasInteracted && (
				<scrollbox
					flexGrow={1}
					flexShrink={1}
					focused={false}
					stickyScroll={true}
					stickyStart="bottom"
					ref={conversationScrollRef}
					style={{
						rootOptions: { backgroundColor: frostColor },
						contentOptions: {
							backgroundColor: frostColor,
							paddingLeft: 2,
							paddingRight: 2,
						},
					}}
				>
					<box
						flexDirection="column"
						paddingTop={1}
						paddingBottom={2}
						width="100%"
						backgroundColor={frostColor}
					>
						{conversationHistory.map((msg: ConversationMessage) => (
							<box key={msg.id} flexDirection="column">
								{msg.type === "user" ? (
									<box
										marginBottom={1}
										paddingLeft={2}
										paddingRight={2}
										paddingTop={1}
										paddingBottom={1}
										backgroundColor={COLORS.USER_BG}
										width="100%"
									>
										<>
											{renderMessageDebug(msg)}
											<text>
												<span fg={COLORS.USER_LABEL}>YOU: </span>
												<span fg={COLORS.USER_TEXT}>{msg.content}</span>
											</text>
										</>
									</box>
								) : msg.contentBlocks && msg.contentBlocks.length > 0 ? (
									<>
										{renderMessageDebug(msg)}
										{msg.contentBlocks.map((block, idx) =>
											renderHistoryBlock(block, idx, msg.contentBlocks!)
										)}
									</>
								) : null}
							</box>
						))}

						{currentTranscription && (
							<box
								marginBottom={1}
								paddingLeft={2}
								paddingRight={2}
								paddingTop={1}
								paddingBottom={1}
								backgroundColor={COLORS.USER_BG}
								width="100%"
							>
								<text>
									<span fg={COLORS.USER_LABEL}>YOU: </span>
									<span fg={COLORS.USER_TEXT}>{currentTranscription}</span>
								</text>
							</box>
						)}

						{currentContentBlocks.length > 0 && (
							<box flexDirection="column">
								{currentContentBlocks.map((block, idx) => {
									if (shouldHideContentBlock(block)) {
										return null;
									}

									let nextBlock: ContentBlock | undefined;
									for (let i = idx + 1; i < currentContentBlocks.length; i++) {
										const b = currentContentBlocks[i];
										if (b && !shouldHideContentBlock(b)) {
											nextBlock = b;
											break;
										}
									}

									const isLastBlock = idx === currentContentBlocks.length - 1;
									const isLastText = isLastTextBlockInList(currentContentBlocks, block);
									const isLastReasoning = isLastReasoningBlockInList(currentContentBlocks, block);
									const isStreaming =
										daemonState === DaemonState.RESPONDING &&
										isLastBlock &&
										(block.type === "text" || block.type === "reasoning");

									const hasReasoningContent = !!(reasoningQueue || reasoningDisplay);

									const isTool = block.type === "tool";
									const isNextTool = nextBlock?.type === "tool";
									const marginBottom = isTool && isNextTool ? 0 : 1;

									return (
										<box key={idx} flexDirection="column" marginBottom={marginBottom}>
											<ContentBlockView
												block={block}
												isLastReasoningBlock={isLastReasoning}
												isLastTextBlock={isLastText}
												isLastBlock={isLastBlock}
												isStreaming={isStreaming}
												showFullReasoning={showFullReasoning}
												showToolOutput={showToolOutput}
												reasoningDisplay={reasoningDisplay}
												showReasoningTicker={hasReasoningContent}
											/>
										</box>
									);
								})}
							</box>
						)}

						{currentContentBlocks.length === 0 && (reasoningDisplay || reasoningQueue) && (
							<box marginBottom={1}>
								{showFullReasoning && fullReasoning ? (
									<box
										flexDirection="column"
										border={["left"]}
										borderStyle="heavy"
										borderColor={COLORS.REASONING_DIM}
										paddingLeft={1}
									>
										<text>
											<span fg={COLORS.REASONING}>{"REASONING"}</span>
											<span fg={COLORS.REASONING_DIM}>{fullReasoningDurationLabel}</span>
										</text>
										<code
											content={fullReasoning}
											filetype="markdown"
											syntaxStyle={REASONING_MARKDOWN_STYLE}
											streaming={true}
											drawUnstyledText={false}
										/>
									</box>
								) : reasoningDisplay ? (
									renderReasoningTicker(reasoningDisplay)
								) : null}
							</box>
						)}

						{hasGrounding &&
							groundingCount &&
							(daemonState === DaemonState.IDLE || daemonState === DaemonState.SPEAKING) && (
								<GroundingBadge count={groundingCount} />
							)}

						{showWorkingSpinner && (
							<InlineStatusIndicator
								daemonState={daemonState}
								isToolCalling={isToolCalling}
								isReasoning={isReasoning}
								responseElapsedMs={responseElapsedMs}
							/>
						)}

						{isReasoning && <box height={0} />}
					</box>
				</scrollbox>
			)}

			{showTypingInput && (
				<box
					flexShrink={0}
					marginTop={1}
					marginBottom={1}
					width="100%"
					justifyContent="center"
					alignItems="center"
				>
					<TypingInputBar
						onContentChange={onTypingContentChange}
						onSubmit={onTypingSubmit}
						onHistoryUp={onHistoryUp}
						onHistoryDown={onHistoryDown}
						textareaRef={typingTextareaRef}
						placeholder="Enter instructions..."
						height={4}
						width="92%"
						maxWidth={170}
						minWidth={80}
					/>
				</box>
			)}
		</>
	);
}

export const ConversationPane = memo(ConversationPaneImpl);

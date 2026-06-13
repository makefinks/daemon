/**
 * Daemon state manager - handles the full interaction flow.
 * Central state machine for DAEMON's operational states.
 */

import { AgentTurnRunner } from "../ai/agent-turn-runner";
import { transcribeAudio } from "../ai/daemon-ai";
import { backgroundJobManager } from "./background-job-manager";
import type {
	BashApprovalLevel,
	BackgroundJobSnapshot,
	ContentBlock,
	InteractionMode,
	McpServerToggles,
	ModelMessage,
	ReasoningEffort,
	SkillToggles,
	SpeechSpeed,
	PromptImageAttachment,
	ToolToggles,
	VoiceInteractionType,
} from "../types";
import { DEFAULT_TOOL_TOGGLES } from "../types";
import { DaemonState } from "../types";
import { debug, messageDebug } from "../utils/debug-logger";
import { SpeechController } from "../voice/tts/speech-controller";
import { VoiceInputController } from "../voice/voice-input-controller";
import { type DaemonStateEvents, daemonEvents } from "./daemon-events";
import { ModelHistoryStore } from "./model-history-store";
import { runWithRuntimeContext } from "./runtime-context";
import { sessionRuntimeStore } from "./session-runtime-store";

function buildBackgroundNotificationBlock(job: BackgroundJobSnapshot): ContentBlock {
	const label = [job.type, `#${job.id}`, job.state].filter(Boolean).join(" ");
	const preview = job.type === "bash" ? job.stdout?.trim() || job.stderr?.trim() : job.response?.trim();
	return {
		type: "backgroundNotification",
		title: label || "job finished",
		content: job.description || "A background job finished.",
		preview,
		jobId: job.id,
		state: job.state,
	};
}

/**
 * Daemon state manager - handles the full interaction flow
 */
class DaemonStateManager {
	private _state: DaemonState = DaemonState.IDLE;
	private _transcription: string = "";
	private modelHistory = new ModelHistoryStore();
	private ensureSessionIdFn: (() => Promise<string>) | null = null;
	private getCurrentSessionIdFn: (() => string | null) | null = null;
	private getSessionViewVisibleFn: (() => boolean) | null = null;
	private getSessionTitleFn: ((sessionId: string) => string | null) | null = null;
	private onFirstMessageFn: ((sessionId: string, message: string) => Promise<string | null>) | null = null;
	private voiceInput = new VoiceInputController();
	private speechController = new SpeechController();
	private agentTurnRunner = new AgentTurnRunner();
	private sessionAgentTurnRunners = new Map<string, AgentTurnRunner>();
	private transcriptionAbortController: AbortController | null = null;
	private _ttsEnabled = false;
	private _interactionMode: InteractionMode = "text";
	private _voiceInteractionType: VoiceInteractionType = "direct";
	private _speechSpeed: SpeechSpeed = 1.25;
	private _reasoningEffort: ReasoningEffort = "medium";
	private _bashApprovalLevel: BashApprovalLevel = "dangerous";
	private _toolToggles: ToolToggles = { ...DEFAULT_TOOL_TOGGLES };
	private _mcpServerToggles: McpServerToggles = {};
	private _skillToggles: SkillToggles = {};
	private _memoryEnabled = true;
	private _outputDeviceName: string | undefined = undefined;
	private _turnId = 0;
	private speechRunId = 0;

	constructor() {
		backgroundJobManager.setNotificationHandler((sessionId, job, notification) => {
			void this.injectBackgroundNotification(sessionId, job, notification);
		});

		backgroundJobManager.events.on("completed", (job: BackgroundJobSnapshot) => {
			if (!job.sessionId || !job.toolCallId) return;
			sessionRuntimeStore.backgroundToolComplete(
				job.sessionId,
				job.toolCallId,
				job.state === "completed",
				job
			);
		});

		backgroundJobManager.events.on(
			"outputDelta",
			(payload: { toolCallId: string; stream: "stdout" | "stderr"; chunk: string }) => {
				const live = backgroundJobManager.findJobByToolCallId(payload.toolCallId);
				if (!live || !live.sessionId) return;
				sessionRuntimeStore.toolExecutionDelta(live.sessionId, {
					toolName: "runBash",
					toolCallId: payload.toolCallId,
					stream: payload.stream,
					chunk: payload.chunk,
				});
			}
		);

		this.voiceInput.on("micLevel", (level: number) => {
			if (this._state !== DaemonState.LISTENING) return;
			this.emitEvent("micLevel", level);
		});
		this.voiceInput.on("error", (error: Error) => {
			this.emitEvent("error", error);
			this.setState(DaemonState.IDLE);
		});

		this.speechController.on("audioLevel", (level: number) => {
			if (this._state !== DaemonState.SPEAKING) return;
			this.emitEvent("ttsLevel", level);
		});
	}

	private emitEvent<K extends keyof DaemonStateEvents>(
		event: K,
		...args: Parameters<DaemonStateEvents[K]>
	): void {
		daemonEvents.emit(event, ...args);
	}

	get state(): DaemonState {
		return this._state;
	}

	get transcription(): string {
		return this._transcription;
	}

	get conversationHistory(): ModelMessage[] {
		return this.modelHistory.get();
	}

	setConversationHistory(history: ModelMessage[]): void {
		this.modelHistory.set(history);
	}

	get ttsEnabled(): boolean {
		return this._ttsEnabled;
	}

	set ttsEnabled(enabled: boolean) {
		this._ttsEnabled = enabled;
	}

	get interactionMode(): InteractionMode {
		return this._interactionMode;
	}

	set interactionMode(mode: InteractionMode) {
		this._interactionMode = mode;
		// Voice mode implies TTS enabled, Text mode implies TTS disabled
		this._ttsEnabled = mode === "voice";
	}

	get voiceInteractionType(): VoiceInteractionType {
		return this._voiceInteractionType;
	}

	set voiceInteractionType(type: VoiceInteractionType) {
		this._voiceInteractionType = type;
	}

	get speechSpeed(): SpeechSpeed {
		return this._speechSpeed;
	}

	set speechSpeed(speed: SpeechSpeed) {
		this._speechSpeed = speed;
	}

	get reasoningEffort(): ReasoningEffort {
		return this._reasoningEffort;
	}

	set reasoningEffort(effort: ReasoningEffort) {
		this._reasoningEffort = effort;
	}

	get bashApprovalLevel(): BashApprovalLevel {
		return this._bashApprovalLevel;
	}

	set bashApprovalLevel(level: BashApprovalLevel) {
		this._bashApprovalLevel = level;
	}

	get toolToggles(): ToolToggles {
		return this._toolToggles;
	}

	set toolToggles(toggles: ToolToggles) {
		this._toolToggles = toggles;
	}

	get mcpServerToggles(): McpServerToggles {
		return this._mcpServerToggles;
	}

	set mcpServerToggles(toggles: McpServerToggles) {
		this._mcpServerToggles = toggles;
	}

	get skillToggles(): SkillToggles {
		return this._skillToggles;
	}

	set skillToggles(toggles: SkillToggles) {
		this._skillToggles = toggles;
	}

	get memoryEnabled(): boolean {
		return this._memoryEnabled;
	}

	set memoryEnabled(enabled: boolean) {
		this._memoryEnabled = enabled;
	}

	get outputDeviceName(): string | undefined {
		return this._outputDeviceName;
	}

	set outputDeviceName(deviceName: string | undefined) {
		this._outputDeviceName = deviceName;
	}

	setEnsureSessionId(fn: (() => Promise<string>) | null): void {
		this.ensureSessionIdFn = fn;
	}

	setGetCurrentSessionId(fn: (() => string | null) | null): void {
		this.getCurrentSessionIdFn = fn;
	}

	setGetSessionViewVisible(fn: (() => boolean) | null): void {
		this.getSessionViewVisibleFn = fn;
	}

	setGetSessionTitle(fn: ((sessionId: string) => string | null) | null): void {
		this.getSessionTitleFn = fn;
	}

	setOnFirstMessage(fn: ((sessionId: string, message: string) => Promise<string | null>) | null): void {
		this.onFirstMessageFn = fn;
	}

	private getCurrentSessionId(): string | null {
		return this.getCurrentSessionIdFn?.() ?? null;
	}

	private isSessionViewVisible(): boolean {
		return this.getSessionViewVisibleFn?.() ?? false;
	}

	private getSessionTitle(sessionId: string): string | null {
		return this.getSessionTitleFn?.(sessionId) ?? null;
	}

	private getSessionRunner(sessionId: string): AgentTurnRunner {
		let runner = this.sessionAgentTurnRunners.get(sessionId);
		if (!runner) {
			runner = new AgentTurnRunner();
			this.sessionAgentTurnRunners.set(sessionId, runner);
		}
		return runner;
	}

	private setState(newState: DaemonState): void {
		if (this._state !== newState) {
			this._state = newState;
			this.emitEvent("stateChange", newState);
		}
	}

	syncVisibleState(state: DaemonState): void {
		this.setState(state);
	}

	private async ensureSessionId(): Promise<string | null> {
		if (!this.ensureSessionIdFn) return this.getCurrentSessionId();
		try {
			return await this.ensureSessionIdFn();
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			debug.error("session-ensure-failed", { message: err.message });
			this.emitEvent("error", err);
			return null;
		}
	}

	/**
	 * Start listening for voice input (called when space is pressed)
	 */
	startListening(): void {
		if (
			this._state !== DaemonState.IDLE &&
			this._state !== DaemonState.TYPING &&
			this._state !== DaemonState.SPEAKING
		) {
			return;
		}

		if (this._state === DaemonState.SPEAKING) {
			this.stopSpeaking();
		}

		this._transcription = "";
		this.setState(DaemonState.LISTENING);
		this.voiceInput.start();
	}

	/**
	 * Stop listening and process the audio (called when space is pressed again)
	 */
	async stopListening(): Promise<void> {
		if (this._state !== DaemonState.LISTENING) {
			return;
		}

		const { duration, audioBuffer } = await this.voiceInput.stop();

		// Check if we have enough audio data
		const minDuration = 0.5;
		if (audioBuffer.length < 1000 || duration < minDuration) {
			this.emitEvent("error", new Error(`Recording too short (${duration.toFixed(1)}s). Hold longer.`));
			this.setState(DaemonState.IDLE);
			return;
		}

		// Start transcription with abort support
		this.setState(DaemonState.TRANSCRIBING);
		this.transcriptionAbortController = new AbortController();

		try {
			const result = await transcribeAudio(audioBuffer, this.transcriptionAbortController.signal);
			this.transcriptionAbortController = null;
			this._transcription = result.text;

			if (!result.text.trim()) {
				this.setState(DaemonState.IDLE);
				return;
			}

			if (this._voiceInteractionType === "review") {
				this.setState(DaemonState.TYPING);
				this.emitEvent("transcriptionReady", result.text);
			} else {
				const sessionId = await this.ensureSessionId();
				if (!sessionId) {
					this.setState(DaemonState.IDLE);
					return;
				}
				sessionRuntimeStore.setCurrentTranscription(sessionId, result.text);
				await this.generateResponseFromText(sessionId, result.text);
			}
		} catch (error) {
			if (error instanceof Error && error.name === "AbortError") {
				this.transcriptionAbortController = null;
				this.emitEvent("cancelled");
				this.setState(DaemonState.IDLE);
				return;
			}
			this.transcriptionAbortController = null;
			const err = error instanceof Error ? error : new Error(String(error));
			this.emitEvent("error", err);
			this.setState(DaemonState.IDLE);
		}
	}

	/**
	 * Submit text input (for typing mode)
	 */
	async submitText(text: string, imageAttachments: PromptImageAttachment[] = []): Promise<void> {
		if (!text.trim() && imageAttachments.length === 0) return;

		const sessionId = await this.ensureSessionId();
		if (!sessionId) {
			this.setState(DaemonState.IDLE);
			return;
		}

		this._transcription = text;
		sessionRuntimeStore.setCurrentTranscription(sessionId, text);
		await this.generateResponseFromText(sessionId, text, imageAttachments);
	}

	/**
	 * Generate a response from text input
	 */
	private async generateResponseFromText(
		sessionId: string,
		text: string,
		imageAttachments: PromptImageAttachment[] = [],
		options: { hiddenUserMessage?: boolean; notificationBlock?: ContentBlock } = {}
	): Promise<void> {
		const runtime = sessionRuntimeStore.ensure(sessionId);
		const isFirstMessage = sessionRuntimeStore.beginUserMessage(sessionId, text, imageAttachments, {
			hidden: options.hiddenUserMessage,
			notificationBlock: options.notificationBlock,
		});
		const titlePromise = isFirstMessage
			? (this.onFirstMessageFn?.(sessionId, text) ?? Promise.resolve(null)).catch((error) => {
					const err = error instanceof Error ? error : new Error(String(error));
					messageDebug.warn("session-title-generation-failed", { sessionId, message: err.message });
					return null;
				})
			: Promise.resolve(null);
		if (runtime.state === DaemonState.RESPONDING) {
			return;
		}

		if (!sessionId) {
			this.setState(DaemonState.IDLE);
			return;
		}

		sessionRuntimeStore.beginResponse(sessionId);
		if (this.getCurrentSessionId() === sessionId) {
			this.setState(DaemonState.RESPONDING);
		}
		const turnId = ++this._turnId;
		messageDebug.info("agent-turn-start", {
			turnId,
			text,
			mode: this._interactionMode,
			reasoningEffort: this._reasoningEffort,
		});

		try {
			const runner = this.getSessionRunner(sessionId);
			const result = await runWithRuntimeContext({ sessionId, messageId: runtime.messageId }, () =>
				runner.run(
					{
						userText: text,
						imageAttachments,
						conversationHistory: runtime.modelHistory,
						interactionMode: this._interactionMode,
						reasoningEffort: this._reasoningEffort,
					},
					{
						onReasoningToken: (token) => {
							sessionRuntimeStore.appendReasoning(sessionId, token);
							if (this.getCurrentSessionId() === sessionId) {
								daemonEvents.emit("reasoningToken", token);
							}
						},
						onToolCallStart: (toolName, toolCallId) =>
							sessionRuntimeStore.toolInputStart(sessionId, toolName, toolCallId),
						onToolCallInputDelta: (toolCallId, delta) =>
							sessionRuntimeStore.toolInputDelta(sessionId, toolCallId, delta),
						onToolCall: (toolName, args, toolCallId) =>
							sessionRuntimeStore.toolInvocation(sessionId, toolName, args, toolCallId),
						onToolResult: (toolName, resultValue, toolCallId) =>
							sessionRuntimeStore.toolResult(sessionId, toolName, resultValue, toolCallId),
						onToolExecutionDelta: (delta) => sessionRuntimeStore.toolExecutionDelta(sessionId, delta),
						onToolApprovalRequest: (request) => {
							const requestWithSession = { ...request, sessionId };
							sessionRuntimeStore.toolApprovalRequest(sessionId, requestWithSession);
							this.emitEvent("toolApprovalRequest", requestWithSession);
						},
						onAwaitingApprovals: (pendingApprovals, respondToApprovals) => {
							const approvalsWithSession = pendingApprovals.map((request) => ({ ...request, sessionId }));
							this.emitEvent("awaitingApprovals", approvalsWithSession, respondToApprovals);
						},
						onSubagentToolCall: (toolCallId, toolName, input) =>
							sessionRuntimeStore.subagentToolCall(sessionId, toolCallId, toolName, input),
						onSubagentUsage: (usage) => sessionRuntimeStore.subagentUsage(sessionId, usage),
						onSubagentToolResult: (toolCallId, toolName, success, result) =>
							sessionRuntimeStore.subagentToolResult(sessionId, toolCallId, toolName, success, result),
						onSubagentComplete: (toolCallId, success) =>
							sessionRuntimeStore.subagentComplete(sessionId, toolCallId, success),
						onToken: (token) => {
							sessionRuntimeStore.appendToken(sessionId, token);
						},
						onStepUsage: (usage) => sessionRuntimeStore.stepUsage(sessionId, usage),
						onMemorySaved: (preview) => this.emitEvent("memorySaved", preview),
						onBackgroundNotification: (job) => {
							if (!job.sessionId) return;
							const block = buildBackgroundNotificationBlock(job);
							sessionRuntimeStore.addNotificationBlock(job.sessionId, block);
						},
					}
				)
			);

			if (!result) {
				if (this.getCurrentSessionId() === sessionId && this._state === DaemonState.RESPONDING) {
					this.setState(DaemonState.IDLE);
				}
				sessionRuntimeStore.cancelResponse(sessionId);
				return;
			}

			messageDebug.info("agent-turn-complete", {
				turnId,
				fullText: result.fullText,
				finalText: result.finalText,
				responseMessages: result.responseMessages,
				usage: result.usage,
			});
			const generatedTitle = await titlePromise;
			sessionRuntimeStore.completeResponse(
				sessionId,
				result.fullText,
				result.responseMessages,
				this.getCurrentSessionId(),
				this.isSessionViewVisible(),
				generatedTitle ?? this.getSessionTitle(sessionId)
			);

			// Trigger TTS if enabled - use finalText (last assistant message only) for speech
			const textToSpeak = result.finalText ?? result.fullText;
			if (this._ttsEnabled && textToSpeak.trim() && this.getCurrentSessionId() === sessionId) {
				void this.speakResponse(textToSpeak);
			} else {
				if (this.getCurrentSessionId() === sessionId) this.setState(DaemonState.IDLE);
			}

			setImmediate(() => {
				void this.flushQueuedBackgroundNotifications(sessionId);
			});
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			const snapshot = sessionRuntimeStore.getSnapshot(sessionId);
			debug.error("agent-turn-error", {
				turnId,
				message: err.message,
				stack: err.stack,
				partialResponseLength: snapshot?.currentResponse.length ?? 0,
			});
			if (this.getCurrentSessionId() === sessionId && this._state === DaemonState.RESPONDING) {
				messageDebug.info("agent-turn-error-finalizing-partial", {
					turnId,
					message: err.message,
					partialResponse: snapshot?.currentResponse ?? "",
				});
				sessionRuntimeStore.cancelResponse(sessionId);
			}
			this.emitEvent("error", err);
			if (this.getCurrentSessionId() === sessionId) this.setState(DaemonState.IDLE);
		}
	}

	async injectBackgroundNotification(
		sessionId: string,
		job: BackgroundJobSnapshot,
		notification: string
	): Promise<void> {
		const runtime = sessionRuntimeStore.getSnapshot(sessionId);
		if (runtime?.state === DaemonState.RESPONDING) {
			backgroundJobManager.queueNotification(sessionId, job, notification);
			return;
		}

		await this.generateResponseFromText(sessionId, notification, [], {
			hiddenUserMessage: true,
			notificationBlock: buildBackgroundNotificationBlock(job),
		});
	}

	private async flushQueuedBackgroundNotifications(sessionId: string): Promise<void> {
		const runtime = sessionRuntimeStore.getSnapshot(sessionId);
		if (runtime?.state === DaemonState.RESPONDING) return;
		const notifications = backgroundJobManager.takeQueuedNotifications(sessionId);
		if (notifications.length === 0) return;
		const [first, ...rest] = notifications;
		if (!first) return;
		const combinedNotification = [first.notification, ...rest.map((entry) => entry.notification)].join(
			"\n\n"
		);
		await this.generateResponseFromText(sessionId, combinedNotification, [], {
			hiddenUserMessage: true,
			notificationBlock: buildBackgroundNotificationBlock(first.job),
		});
	}

	/**
	 * Enter typing mode (shift+tab pressed)
	 */
	enterTypingMode(): void {
		const sessionId = this.getCurrentSessionId();
		if (sessionId) sessionRuntimeStore.setTyping(sessionId);
		if (this._state === DaemonState.IDLE) {
			this.setState(DaemonState.TYPING);
		}
	}

	/**
	 * Exit typing mode (escape or submission)
	 */
	exitTypingMode(): void {
		const sessionId = this.getCurrentSessionId();
		if (sessionId) sessionRuntimeStore.setIdle(sessionId);
		if (this._state === DaemonState.TYPING) {
			this.setState(DaemonState.IDLE);
		}
	}

	/**
	 * Speak a response using TTS with audio effects.
	 */
	private async speakResponse(text: string): Promise<void> {
		if (!text.trim()) {
			this.setState(DaemonState.IDLE);
			return;
		}

		const speechRunId = ++this.speechRunId;
		this.setState(DaemonState.SPEAKING);
		this.emitEvent("speakingStart");

		try {
			await this.speechController.speak(text, {
				speed: this._speechSpeed,
				outputDeviceName: this._outputDeviceName,
			});
		} catch (error) {
			if (error instanceof Error && error.name !== "AbortError") {
				this.emitEvent("error", new Error(`TTS error: ${error.message}`));
			}
		} finally {
			if (speechRunId === this.speechRunId) {
				this.emitEvent("speakingComplete");
				this.setState(DaemonState.IDLE);
			}
		}
	}

	/**
	 * Stop current TTS playback
	 */
	stopSpeaking(): void {
		if (this._state !== DaemonState.SPEAKING) return;

		this.speechRunId++;
		this.speechController.stop();
		this.emitEvent("speakingComplete");
		this.setState(DaemonState.IDLE);
	}

	/**
	 * Cancel recording without processing (escape pressed during listening)
	 */
	cancelListening(): void {
		if (this._state !== DaemonState.LISTENING) {
			return;
		}

		this.voiceInput.cancel();
		this._transcription = "";
		this.emitEvent("cancelled");
		this.setState(DaemonState.IDLE);
	}

	/**
	 * Cancel current action (transcription, response generation, or speaking)
	 */
	cancelCurrentAction(): void {
		const visibleSessionId = this.getCurrentSessionId();
		if (visibleSessionId) {
			const snapshot = sessionRuntimeStore.getSnapshot(visibleSessionId);
			if (snapshot?.state === DaemonState.RESPONDING) {
				this.cancelSessionAction(visibleSessionId);
				return;
			}
		}

		if (this._state === DaemonState.LISTENING) {
			this.cancelListening();
			return;
		}

		if (this._state === DaemonState.SPEAKING) {
			this.stopSpeaking();
			return;
		}

		if (this._state !== DaemonState.TRANSCRIBING && this._state !== DaemonState.RESPONDING) {
			return;
		}

		if (this._state === DaemonState.TRANSCRIBING && this.transcriptionAbortController) {
			this.transcriptionAbortController.abort();
			this.transcriptionAbortController = null;
		}

		if (this._state === DaemonState.RESPONDING) {
			const sessionId = this.getCurrentSessionId();
			if (sessionId) {
				this.cancelSessionAction(sessionId);
				return;
			}
			this.agentTurnRunner.cancel();
		}

		this._transcription = "";
		this.emitEvent("cancelled");
		this.setState(DaemonState.IDLE);
	}

	cancelSessionAction(sessionId: string): void {
		const runner = this.sessionAgentTurnRunners.get(sessionId);
		runner?.cancel();
		sessionRuntimeStore.cancelResponse(sessionId);
		if (this.getCurrentSessionId() === sessionId) {
			this._transcription = "";
			this.emitEvent("cancelled");
			this.setState(DaemonState.IDLE);
		}
	}

	/**
	 * Clear conversation history
	 */
	clearHistory(): void {
		this.modelHistory.clear();
		this._transcription = "";
	}

	/**
	 * Undo the last turn (user message + assistant response) from the model history.
	 * Returns the number of messages removed, or 0 if nothing to undo.
	 */
	undoLastTurn(): number {
		return this.modelHistory.undoLastTurn();
	}

	/**
	 * Clean up resources
	 */
	destroy(): void {
		backgroundJobManager.setNotificationHandler(null);
		this.agentTurnRunner.cancel();
		for (const runner of this.sessionAgentTurnRunners.values()) {
			runner.cancel();
		}
		this.sessionAgentTurnRunners.clear();
		if (this.transcriptionAbortController) {
			this.transcriptionAbortController.abort();
			this.transcriptionAbortController = null;
		}
		this.speechController.destroy();
		this.voiceInput.destroy();
	}
}

// Singleton instance
let manager: DaemonStateManager | null = null;

export function getDaemonManager(): DaemonStateManager {
	if (!manager) {
		manager = new DaemonStateManager();
	}
	return manager;
}

export function destroyDaemonManager(): void {
	if (manager) {
		manager.destroy();
		manager = null;
	}
}

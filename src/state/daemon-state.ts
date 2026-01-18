/**
 * Daemon state manager - handles the full interaction flow.
 * Central state machine for DAEMON's operational states.
 */

import { AgentTurnRunner } from "../ai/agent-turn-runner";
import { transcribeAudio } from "../ai/daemon-ai";
import type {
	BashApprovalLevel,
	InteractionMode,
	ModelMessage,
	ReasoningEffort,
	SpeechSpeed,
	ToolToggles,
	VoiceInteractionType,
} from "../types";
import { DEFAULT_TOOL_TOGGLES } from "../types";
import { DaemonState } from "../types";
import { debug } from "../utils/debug-logger";
import { SpeechController } from "../voice/tts/speech-controller";
import { VoiceInputController } from "../voice/voice-input-controller";
import { type DaemonStateEvents, daemonEvents } from "./daemon-events";
import { ModelHistoryStore } from "./model-history-store";

/**
 * Daemon state manager - handles the full interaction flow
 */
class DaemonStateManager {
	private _state: DaemonState = DaemonState.IDLE;
	private _transcription: string = "";
	private _response: string = "";
	private modelHistory = new ModelHistoryStore();
	private ensureSessionIdFn: (() => Promise<string>) | null = null;
	private voiceInput = new VoiceInputController();
	private speechController = new SpeechController();
	private agentTurnRunner = new AgentTurnRunner();
	private transcriptionAbortController: AbortController | null = null;
	private _ttsEnabled = false;
	private _interactionMode: InteractionMode = "text";
	private _voiceInteractionType: VoiceInteractionType = "direct";
	private _speechSpeed: SpeechSpeed = 1.25;
	private _reasoningEffort: ReasoningEffort = "medium";
	private _bashApprovalLevel: BashApprovalLevel = "dangerous";
	private _toolToggles: ToolToggles = { ...DEFAULT_TOOL_TOGGLES };
	private _outputDeviceName: string | undefined = undefined;
	private _turnId = 0;
	private speechRunId = 0;

	constructor() {
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

	get response(): string {
		return this._response;
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

	get outputDeviceName(): string | undefined {
		return this._outputDeviceName;
	}

	set outputDeviceName(deviceName: string | undefined) {
		this._outputDeviceName = deviceName;
	}

	setEnsureSessionId(fn: (() => Promise<string>) | null): void {
		this.ensureSessionIdFn = fn;
	}

	private setState(newState: DaemonState): void {
		if (this._state !== newState) {
			this._state = newState;
			this.emitEvent("stateChange", newState);
		}
	}

	private async ensureSessionId(): Promise<boolean> {
		if (!this.ensureSessionIdFn) return true;
		try {
			await this.ensureSessionIdFn();
			return true;
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			debug.error("session-ensure-failed", { message: err.message });
			this.emitEvent("error", err);
			return false;
		}
	}

	/**
	 * Start listening for voice input (called when space is pressed)
	 */
	startListening(): void {
		if (this._state !== DaemonState.IDLE && this._state !== DaemonState.TYPING) {
			return;
		}

		this._transcription = "";
		this._response = "";
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
				this.emitEvent("transcriptionUpdate", result.text);
				this.emitEvent("userMessage", result.text);
				await this.generateResponseFromText(result.text);
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
	async submitText(text: string): Promise<void> {
		if (!text.trim()) return;

		this._transcription = text;
		this.emitEvent("transcriptionUpdate", text);
		this.emitEvent("userMessage", text);
		await this.generateResponseFromText(text);
	}

	/**
	 * Generate a response from text input
	 */
	private async generateResponseFromText(text: string): Promise<void> {
		const ok = await this.ensureSessionId();
		if (!ok) {
			this.setState(DaemonState.IDLE);
			return;
		}

		this.setState(DaemonState.RESPONDING);
		this._response = "";
		const turnId = ++this._turnId;
		debug.info("agent-turn-start", {
			turnId,
			text,
			mode: this._interactionMode,
			reasoningEffort: this._reasoningEffort,
		});

		try {
			const result = await this.agentTurnRunner.run(
				{
					userText: text,
					conversationHistory: this.modelHistory.get(),
					interactionMode: this._interactionMode,
					reasoningEffort: this._reasoningEffort,
				},
				{
					onReasoningToken: (token) => this.emitEvent("reasoningToken", token),
					onToolCallStart: (toolName, toolCallId) => this.emitEvent("toolInputStart", toolName, toolCallId),
					onToolCall: (toolName, args, toolCallId) =>
						this.emitEvent("toolInvocation", toolName, args, toolCallId),
					onToolResult: (toolName, resultValue, toolCallId) =>
						this.emitEvent("toolResult", toolName, resultValue, toolCallId),
					onToolApprovalRequest: (request) => this.emitEvent("toolApprovalRequest", request),
					onAwaitingApprovals: (pendingApprovals, respondToApprovals) =>
						this.emitEvent("awaitingApprovals", pendingApprovals, respondToApprovals),
					onSubagentToolCall: (toolCallId, toolName, input) =>
						this.emitEvent("subagentToolCall", toolCallId, toolName, input),
					onSubagentUsage: (usage) => this.emitEvent("subagentUsage", usage),
					onSubagentToolResult: (toolCallId, toolName, success) =>
						this.emitEvent("subagentToolResult", toolCallId, toolName, success),
					onSubagentComplete: (toolCallId, success) =>
						this.emitEvent("subagentComplete", toolCallId, success),
					onToken: (token) => {
						this._response += token;
						this.emitEvent("responseToken", token);
					},
					onStepUsage: (usage) => this.emitEvent("stepUsage", usage),
				}
			);

			if (!result) {
				if (this._state === DaemonState.RESPONDING) {
					this.setState(DaemonState.IDLE);
				}
				return;
			}

			debug.info("agent-turn-complete", {
				turnId,
				fullText: result.fullText,
				finalText: result.finalText,
				responseMessages: result.responseMessages,
				usage: result.usage,
			});
			this.modelHistory.appendTurn(text, result.responseMessages);
			this.emitEvent("responseComplete", result.fullText, result.responseMessages, result.usage);

			// Trigger TTS if enabled - use finalText (last assistant message only) for speech
			const textToSpeak = result.finalText ?? result.fullText;
			if (this._ttsEnabled && textToSpeak.trim()) {
				void this.speakResponse(textToSpeak);
			} else {
				this.setState(DaemonState.IDLE);
			}
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			debug.error("agent-turn-error", {
				turnId,
				message: err.message,
				stack: err.stack,
			});
			this.emitEvent("error", err);
			this.setState(DaemonState.IDLE);
		}
	}

	/**
	 * Enter typing mode (shift+tab pressed)
	 */
	enterTypingMode(): void {
		if (this._state === DaemonState.IDLE) {
			this.setState(DaemonState.TYPING);
		}
	}

	/**
	 * Exit typing mode (escape or submission)
	 */
	exitTypingMode(): void {
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
			this.agentTurnRunner.cancel();
		}

		this._transcription = "";
		this._response = "";
		this.emitEvent("cancelled");
		this.setState(DaemonState.IDLE);
	}

	/**
	 * Clear conversation history
	 */
	clearHistory(): void {
		this.modelHistory.clear();
		this._transcription = "";
		this._response = "";
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
		this.agentTurnRunner.cancel();
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

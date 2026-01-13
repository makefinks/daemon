/**
 * OpenAI TTS client using the streaming API.
 * Generates speech audio and emits PCM chunks as they arrive for real-time playback.
 */

import { EventEmitter } from "node:events";
import OpenAI from "openai";
import type { SpeechCreateParams } from "openai/resources/audio/speech";

export interface OpenAITTSOptions {
	/** OpenAI API key (defaults to OPENAI_API_KEY env var) */
	apiKey?: string;
	/** OpenAI speech model (default: gpt-4o-mini-tts) */
	model?: SpeechCreateParams["model"];
	/** Voice name (default: onyx) */
	voice?: SpeechCreateParams["voice"];
	/** Output format (default: pcm) */
	outputFormat?: SpeechCreateParams["response_format"];
	/** Speech speed multiplier (0.25 to 4.0) */
	speed?: SpeechCreateParams["speed"];
	/** Optional style instructions (works with gpt-4o-mini-tts, not tts-1/tts-1-hd) */
	instructions?: SpeechCreateParams["instructions"];
}

export interface OpenAITTSStreamEvents {
	audio: (chunk: Buffer) => void;
	done: () => void;
	error: (error: Error) => void;
}

const DEFAULT_MODEL: SpeechCreateParams["model"] = "gpt-4o-mini-tts";
const DEFAULT_VOICE: SpeechCreateParams["voice"] = "onyx";
const DEFAULT_FORMAT: SpeechCreateParams["response_format"] = "pcm";
const DEFAULT_SPEED: SpeechCreateParams["speed"] = 1.1;

const DEFAULT_INSTRUCTIONS =
	"Speak with a confident and precise tone inspired by JARVIS from Iron Man with a purposeful and helpful cadence.";

interface SpeechAudioDeltaEvent {
	type: "speech.audio.delta";
	audio: string;
}

interface SpeechAudioDoneEvent {
	type: "speech.audio.done";
	usage?: {
		input_tokens: number;
		output_tokens: number;
		total_tokens: number;
	};
}

type SpeechStreamEvent = SpeechAudioDeltaEvent | SpeechAudioDoneEvent;

/**
 * OpenAI TTS client using the streaming API.
 * Emits 'audio' events with Buffer chunks as they arrive, then 'done' when complete.
 */
export class OpenAITTSStream extends EventEmitter {
	private client: OpenAI;
	private model: SpeechCreateParams["model"];
	private voice: SpeechCreateParams["voice"];
	private outputFormat: SpeechCreateParams["response_format"];
	private speed: SpeechCreateParams["speed"];
	private instructions: SpeechCreateParams["instructions"];
	private _isSpeaking = false;
	private _aborted = false;
	private abortController: AbortController | null = null;

	constructor(options: OpenAITTSOptions = {}) {
		super();

		this.client = new OpenAI({
			apiKey: options.apiKey,
		});
		this.model = options.model ?? DEFAULT_MODEL;
		this.voice = options.voice ?? DEFAULT_VOICE;
		this.outputFormat = options.outputFormat ?? DEFAULT_FORMAT;
		this.speed = options.speed ?? DEFAULT_SPEED;
		this.instructions = options.instructions ?? DEFAULT_INSTRUCTIONS;
	}

	get isSpeaking(): boolean {
		return this._isSpeaking;
	}

	async speak(text: string): Promise<void> {
		if (!text.trim()) {
			this.emit("done");
			return;
		}

		this.stop();
		this._aborted = false;
		this._isSpeaking = true;
		this.abortController = new AbortController();

		try {
			const modelStr = String(this.model);
			const supportsSSE = !modelStr.startsWith("tts-1");

			const params: SpeechCreateParams = {
				model: this.model,
				input: text,
				voice: this.voice,
				response_format: this.outputFormat,
				speed: this.speed,
			};

			if (supportsSSE) {
				params.stream_format = "sse";
				params.instructions = this.instructions;
			}

			const response = await this.client.audio.speech.create(params, {
				signal: this.abortController.signal,
			});

			const body = response.body;
			if (!body) {
				throw new Error("No response body from OpenAI TTS API");
			}

			if (supportsSSE) {
				await this.processSSEStream(body);
			} else {
				await this.processRawAudioStream(body);
			}

			this._isSpeaking = false;
			if (!this._aborted) {
				this.emit("done");
			}
		} catch (error) {
			this._isSpeaking = false;
			if (!this._aborted) {
				const err = error instanceof Error ? error : new Error(String(error));
				this.emit("error", err);
			}
		} finally {
			this.abortController = null;
		}
	}

	private async processSSEStream(body: ReadableStream<Uint8Array>): Promise<void> {
		const reader = body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";

		try {
			while (true) {
				if (this._aborted) break;

				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });

				const lines = buffer.split("\n");
				buffer = lines.pop() ?? "";

				for (const line of lines) {
					if (this._aborted) break;

					const trimmed = line.trim();
					if (!trimmed || trimmed.startsWith(":")) continue;

					if (trimmed.startsWith("data: ")) {
						const data = trimmed.slice(6);
						if (data === "[DONE]") continue;

						try {
							const event = JSON.parse(data) as SpeechStreamEvent;

							if (event.type === "speech.audio.delta") {
								const audioBuffer = Buffer.from(event.audio, "base64");
								this.emit("audio", audioBuffer);
							}
						} catch {}
					}
				}
			}
		} finally {
			reader.releaseLock();
		}
	}

	private async processRawAudioStream(body: ReadableStream<Uint8Array>): Promise<void> {
		const reader = body.getReader();

		try {
			while (true) {
				if (this._aborted) break;

				const { done, value } = await reader.read();
				if (done) break;

				this.emit("audio", Buffer.from(value));
			}
		} finally {
			reader.releaseLock();
		}
	}

	stop(): void {
		this._aborted = true;

		if (this.abortController) {
			try {
				this.abortController.abort();
			} catch {}
			this.abortController = null;
		}

		this._isSpeaking = false;
	}

	destroy(): void {
		this.stop();
		this.removeAllListeners();
	}
}

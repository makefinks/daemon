import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { OpenAITTSStream, type OpenAITTSOptions } from "./openai-tts-stream";
import { debug } from "../../utils/debug-logger";

const PCM_SAMPLE_RATE = 24000;
const PCM_BYTES_PER_SAMPLE = 2;
const AUDIO_LEVEL_TICK_MS = 16;

interface AudioLevelFrame {
	level: number;
	durationMs: number;
}

export interface TTSPlayerOptions {
	openai?: OpenAITTSOptions;
	outputDeviceName?: string;
	debug?: boolean;
}

export interface TTSPlayerEvents {
	speaking: () => void;
	done: () => void;
	error: (error: Error) => void;
	audioLevel: (level: number) => void;
}

export class TTSPlayer extends EventEmitter {
	private options: TTSPlayerOptions;
	private tts: OpenAITTSStream | null = null;
	private player: ChildProcess | null = null;
	private _isSpeaking = false;
	private audioChunksReceived = 0;
	private abortController: AbortController | null = null;
	private audioLevelSmoothed = 0;
	private audioLevelLastEmitMs = 0;
	private audioLevelTimer: ReturnType<typeof setInterval> | null = null;
	private audioLevelQueue: AudioLevelFrame[] = [];
	private audioLevelFrameRemainingMs = 0;

	constructor(options: TTSPlayerOptions = {}) {
		super();
		this.options = options;
	}

	updateOptions(options: TTSPlayerOptions = {}): void {
		this.options = {
			...this.options,
			...options,
			openai: {
				...this.options.openai,
				...options.openai,
			},
		};
	}

	get isSpeaking(): boolean {
		return this._isSpeaking;
	}

	private computeAudioLevelFromChunk(chunk: Buffer): AudioLevelFrame | null {
		if (chunk.length < PCM_BYTES_PER_SAMPLE) return null;

		let samples = 0;
		let sumSquares = 0;

		const sampleCount = Math.floor(chunk.length / PCM_BYTES_PER_SAMPLE);
		const view = new Int16Array(chunk.buffer, chunk.byteOffset, sampleCount);
		for (let i = 0; i < view.length; i++) {
			const v = view[i] ?? 0;
			const f = v / 32768;
			sumSquares += f * f;
			samples++;
		}
		if (!samples) return null;

		const rms = Math.sqrt(sumSquares / samples);
		const noiseFloor = 0.004;
		const gain = 18;
		const rawLevel = Math.max(0, (rms - noiseFloor) * gain);
		const level = Math.min(1, rawLevel);
		const durationMs = (samples / PCM_SAMPLE_RATE) * 1000;

		return { level, durationMs };
	}

	private startAudioLevelTimer(): void {
		if (this.audioLevelTimer) return;
		this.audioLevelLastEmitMs = Date.now();
		this.audioLevelTimer = setInterval(() => this.emitNextPlaybackAudioLevel(), AUDIO_LEVEL_TICK_MS);
	}

	private stopAudioLevelTimer(): void {
		if (this.audioLevelTimer) {
			clearInterval(this.audioLevelTimer);
			this.audioLevelTimer = null;
		}
		this.audioLevelQueue = [];
		this.audioLevelFrameRemainingMs = 0;
		this.audioLevelSmoothed = 0;
	}

	private emitNextPlaybackAudioLevel(): void {
		const now = Date.now();
		let elapsedMs = now - this.audioLevelLastEmitMs;
		this.audioLevelLastEmitMs = now;
		if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) elapsedMs = AUDIO_LEVEL_TICK_MS;
		elapsedMs = Math.min(100, elapsedMs);

		let weightedLevel = 0;
		let consumedMs = 0;

		while (elapsedMs > 0) {
			const frame = this.audioLevelQueue[0];
			if (!frame) break;

			if (this.audioLevelFrameRemainingMs <= 0) {
				this.audioLevelFrameRemainingMs = frame.durationMs;
			}

			const takeMs = Math.min(elapsedMs, this.audioLevelFrameRemainingMs);
			weightedLevel += frame.level * takeMs;
			consumedMs += takeMs;
			elapsedMs -= takeMs;
			this.audioLevelFrameRemainingMs -= takeMs;

			if (this.audioLevelFrameRemainingMs <= 0.001) {
				this.audioLevelQueue.shift();
				this.audioLevelFrameRemainingMs = 0;
			}
		}

		const level = consumedMs > 0 ? weightedLevel / consumedMs : 0;

		const prev = this.audioLevelSmoothed;
		const alpha = level > prev ? 0.7 : 0.25;
		this.audioLevelSmoothed = prev + (level - prev) * alpha;
		this.emit("audioLevel", this.audioLevelSmoothed);
	}

	private enqueueAudioLevelFromChunk(chunk: Buffer): void {
		const frame = this.computeAudioLevelFromChunk(chunk);
		if (!frame || frame.durationMs <= 0) return;
		this.audioLevelQueue.push(frame);
		this.startAudioLevelTimer();
	}

	async speak(text: string, signal?: AbortSignal): Promise<void> {
		if (!text.trim()) return;

		this.stop();

		this._isSpeaking = true;
		this.audioChunksReceived = 0;
		this.stopAudioLevelTimer();
		this.emit("speaking");

		this.abortController = new AbortController();

		if (signal) {
			if (signal.aborted) {
				this.stop();
				return;
			}
			signal.addEventListener("abort", () => this.stop(), { once: true });
		}

		return new Promise<void>((resolve, reject) => {
			const cleanup = () => {
				this._isSpeaking = false;
				this.stopAudioLevelTimer();
				this.emit("done");
				resolve();
			};

			const handleError = (error: Error) => {
				this.stop();
				this.emit("error", error);
				reject(error);
			};

			try {
				this.tts = new OpenAITTSStream({
					outputFormat: "pcm",
					...this.options.openai,
				});

				const soxArgs: string[] = [
					"-q",
					"-t",
					"raw",
					"-e",
					"signed-integer",
					"-b",
					"16",
					"-r",
					"24000",
					"-c",
					"1",
					"-",
				];

				if (this.options.outputDeviceName) {
					soxArgs.push("-t", "coreaudio", this.options.outputDeviceName);
				} else {
					soxArgs.push("-d");
				}

				this.player = spawn("sox", soxArgs, {
					stdio: ["pipe", "ignore", "pipe"],
				});

				this.tts.on("audio", (chunk: Buffer) => {
					this.audioChunksReceived++;
					if (this.options.debug && this.audioChunksReceived === 1) {
						debug.info("tts-player-first-audio-chunk");
					}
					this.enqueueAudioLevelFromChunk(chunk);
					if (this.player?.stdin?.writable) {
						this.player.stdin.write(chunk);
					}
				});

				this.tts.on("done", () => {
					if (this.options.debug) {
						debug.info("tts-player-tts-done");
					}
					try {
						this.player?.stdin?.end();
					} catch {
						// Ignore
					}
				});

				this.tts.on("error", handleError);

				this.player.on("error", (err) => {
					handleError(new Error(`sox player error: ${err.message}. Ensure sox is installed.`));
				});

				this.player.on("close", (code) => {
					if (this.options.debug) {
						debug.info("tts-player-sox-exited", { code });
					}
					cleanup();
				});

				this.player.stderr?.on("data", (data: Buffer) => {
					const msg = data.toString();
					if (this.options.debug) {
						debug.info("tts-player-sox-stderr", { msg });
					}
				});

				if (this.options.debug) {
					debug.info("tts-player-starting-openai-tts");
				}
				this.tts.speak(text).catch(handleError);
			} catch (error) {
				handleError(error instanceof Error ? error : new Error(String(error)));
			}
		});
	}

	stop(): void {
		if (this.abortController) {
			this.abortController.abort();
			this.abortController = null;
		}

		if (this.tts) {
			this.tts.destroy();
			this.tts = null;
		}

		if (this.player) {
			try {
				this.player.kill("SIGTERM");
			} catch {
				// Ignore
			}
			this.player = null;
		}
		this.stopAudioLevelTimer();

		if (this._isSpeaking) {
			this._isSpeaking = false;
			this.emit("done");
		}
	}

	destroy(): void {
		this.stop();
		this.removeAllListeners();
	}
}

let player: TTSPlayer | null = null;

export function getTTSPlayer(options?: TTSPlayerOptions): TTSPlayer {
	if (!player) {
		player = new TTSPlayer(options);
	} else if (options) {
		player.updateOptions(options);
	}
	return player;
}

export function destroyTTSPlayer(): void {
	if (player) {
		player.destroy();
		player = null;
	}
}

export async function speak(text: string, signal?: AbortSignal): Promise<void> {
	const p = getTTSPlayer();
	return p.speak(text, signal);
}

export function stopSpeaking(): void {
	if (player) {
		player.stop();
	}
}

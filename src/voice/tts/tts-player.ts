import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { OpenAITTSStream, type OpenAITTSOptions } from "./openai-tts-stream";
import { debug } from "../../utils/debug-logger";

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

	private emitAudioLevelFromChunk(chunk: Buffer): void {
		if (chunk.length < 2) return;

		let samples = 0;
		let sumSquares = 0;

		const sampleCount = Math.floor(chunk.length / 2);
		const view = new Int16Array(chunk.buffer, chunk.byteOffset, sampleCount);
		for (let i = 0; i < view.length; i++) {
			const v = view[i] ?? 0;
			const f = v / 32768;
			sumSquares += f * f;
			samples++;
		}
		if (!samples) return;

		const rms = Math.sqrt(sumSquares / samples);
		const noiseFloor = 0.01;
		const gain = 8;
		const rawLevel = Math.max(0, (rms - noiseFloor) * gain);
		const level = Math.min(1, rawLevel);

		const prev = this.audioLevelSmoothed;
		const alpha = level > prev ? 0.55 : 0.15;
		this.audioLevelSmoothed = prev + (level - prev) * alpha;

		const now = Date.now();
		if (now - this.audioLevelLastEmitMs < 16) return;
		this.audioLevelLastEmitMs = now;
		this.emit("audioLevel", this.audioLevelSmoothed);
	}

	async speak(text: string, signal?: AbortSignal): Promise<void> {
		if (!text.trim()) return;

		this.stop();

		this._isSpeaking = true;
		this.audioChunksReceived = 0;
		this.audioLevelSmoothed = 0;
		this.audioLevelLastEmitMs = 0;
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
					this.emitAudioLevelFromChunk(chunk);
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

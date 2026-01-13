import { EventEmitter } from "node:events";

import { destroyTTSPlayer, getTTSPlayer, stopSpeaking } from "./tts-player";

export interface SpeechControllerOptions {
	speed: number;
	outputDeviceName?: string;
}

export interface SpeechControllerEvents {
	audioLevel: (level: number) => void;
}

export class SpeechController extends EventEmitter {
	private abortController: AbortController | null = null;

	async speak(text: string, options: SpeechControllerOptions, signal?: AbortSignal): Promise<void> {
		if (!text.trim()) return;

		this.stop();
		this.abortController = new AbortController();

		if (signal) {
			if (signal.aborted) {
				this.stop();
				return;
			}
			signal.addEventListener("abort", () => this.stop(), { once: true });
		}

		const player = getTTSPlayer({
			openai: {
				speed: options.speed,
			},
			outputDeviceName: options.outputDeviceName,
		});

		const handleAudioLevel = (level: number) => {
			this.emit("audioLevel", level);
		};
		player.on("audioLevel", handleAudioLevel);

		try {
			await player.speak(text, this.abortController.signal);
		} finally {
			player.off("audioLevel", handleAudioLevel);
			this.abortController = null;
		}
	}

	stop(): void {
		if (this.abortController) {
			this.abortController.abort();
			this.abortController = null;
		}
		stopSpeaking();
	}

	destroy(): void {
		this.stop();
		destroyTTSPlayer();
		this.removeAllListeners();
	}
}

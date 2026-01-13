import { EventEmitter } from "node:events";

import { getRecorder, destroyRecorder } from "./audio-recorder";
import { computeMicLevelFromPcm16Chunk, smoothMicLevel } from "./mic-level";

export interface VoiceInputControllerEvents {
	micLevel: (level: number) => void;
	error: (error: Error) => void;
}

export class VoiceInputController extends EventEmitter {
	private recorderErrorHandler: ((error: Error) => void) | null = null;
	private recorderDataHandler: ((chunk: Buffer) => void) | null = null;
	private activeRecorder: ReturnType<typeof getRecorder> | null = null;
	private micLevelSmoothed = 0;
	private micLevelLastEmitMs = 0;

	private detachRecorderListeners(): void {
		if (!this.activeRecorder) return;
		if (this.recorderErrorHandler) {
			this.activeRecorder.off("error", this.recorderErrorHandler);
			this.recorderErrorHandler = null;
		}
		if (this.recorderDataHandler) {
			this.activeRecorder.off("data", this.recorderDataHandler);
			this.recorderDataHandler = null;
		}
	}

	private emitMicLevelFromChunk(chunk: Buffer): void {
		const level = computeMicLevelFromPcm16Chunk(chunk);
		if (level === null) return;

		this.micLevelSmoothed = smoothMicLevel(this.micLevelSmoothed, level);

		const now = Date.now();
		if (now - this.micLevelLastEmitMs < 16) return;
		this.micLevelLastEmitMs = now;
		this.emit("micLevel", this.micLevelSmoothed);
	}

	start(): void {
		this.detachRecorderListeners();

		const recorder = getRecorder();
		this.activeRecorder = recorder;
		this.micLevelSmoothed = 0;
		this.micLevelLastEmitMs = 0;

		this.recorderDataHandler = (chunk: Buffer) => {
			this.emitMicLevelFromChunk(chunk);
		};
		this.recorderErrorHandler = (err: Error) => {
			try {
				recorder.stop();
			} catch {
				// Ignore; we're already failing.
			}
			this.detachRecorderListeners();
			this.emit("error", err);
		};

		recorder.on("data", this.recorderDataHandler);
		recorder.on("error", this.recorderErrorHandler);
		recorder.start();
	}

	async stop(): Promise<{ audioBuffer: Buffer; duration: number }> {
		const recorder = this.activeRecorder ?? getRecorder();
		this.detachRecorderListeners();
		this.activeRecorder = null;

		const duration = recorder.getDuration();
		const audioBuffer = await recorder.stopAsync();

		return { audioBuffer, duration };
	}

	cancel(): void {
		const recorder = this.activeRecorder ?? getRecorder();
		this.detachRecorderListeners();
		this.activeRecorder = null;
		try {
			recorder.stop();
		} catch {
			// Ignore
		}
	}

	destroy(): void {
		this.detachRecorderListeners();
		this.activeRecorder = null;
		destroyRecorder();
		this.removeAllListeners();
	}
}

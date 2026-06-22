import { EventEmitter } from "node:events";

import OpenAI from "openai";
import { OpenAIRealtimeWebSocket } from "openai/realtime/websocket";

import { TRANSCRIPTION_MODEL } from "../ai/model-config";

const REALTIME_TRANSPORT_MODEL = "gpt-realtime";
const FINISH_TIMEOUT_MS = 5000;
/** 128ms of audio at 24kHz 16-bit mono, matching OpenAI realtime examples. */
const COALESCE_BYTES = 6144;

type RealtimeEvent = {
	type: string;
	delta?: string;
	transcript?: string;
};

/** Streams mic PCM to OpenAI Realtime and emits live transcription text. */
export class RealtimeTranscriptionController extends EventEmitter {
	private socket: OpenAIRealtimeWebSocket | null = null;
	private audioBuffer: Buffer[] = [];
	private audioBufferBytes = 0;
	private text = "";
	private ready = false;
	private finished = false;
	private pendingCommit = false;
	private finishResolver: ((text: string) => void) | null = null;
	private finishRejecter: ((error: Error) => void) | null = null;
	private finishTimer: ReturnType<typeof setTimeout> | null = null;

	start(): boolean {
		this.stop();
		this.text = "";
		this.audioBuffer = [];
		this.audioBufferBytes = 0;
		this.ready = false;
		this.finished = false;
		this.pendingCommit = false;

		let socket: OpenAIRealtimeWebSocket;
		try {
			socket = new OpenAIRealtimeWebSocket(
				{
					model: REALTIME_TRANSPORT_MODEL,
					onURL: (url) => {
						url.searchParams.delete("model");
						url.searchParams.set("intent", "transcription");
					},
				},
				new OpenAI()
			);
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			this.emit("error", err);
			return false;
		}
		this.socket = socket;

		socket.socket.addEventListener("open", () => {
			this.ready = true;
			socket.send({
				type: "session.update",
				session: {
					type: "transcription",
					audio: {
						input: {
							format: { type: "audio/pcm", rate: 24000 },
							transcription: {
								model: TRANSCRIPTION_MODEL,
								delay: "minimal",
							},
							turn_detection: null,
						},
					},
				},
			});
			this.flushAudioBuffer();
			this.commitIfPending();
		});

		socket.on("event", (event: RealtimeEvent) => {
			if (event.type === "conversation.item.input_audio_transcription.delta" && event.delta) {
				this.text += event.delta;
				this.emit("update", this.text);
				return;
			}

			if (event.type === "conversation.item.input_audio_transcription.completed") {
				this.resolveFinish(event.transcript ?? this.text);
			}
		});

		socket.on("error", (error) => {
			const err = error instanceof Error ? error : new Error(String(error));
			this.emit("error", err);
			this.resolveFinish(this.text);
		});

		return true;
	}

	appendAudio(chunk: Buffer): void {
		if (this.finished) return;
		this.audioBuffer.push(chunk);
		this.audioBufferBytes += chunk.length;
		if (this.ready && this.audioBufferBytes >= COALESCE_BYTES) {
			this.flushAudioBuffer();
		}
	}

	finish(): Promise<string> {
		if (this.finished) return Promise.resolve(this.text);
		this.finished = true;
		this.flushAudioBuffer();

		return new Promise((resolve, reject) => {
			this.finishResolver = resolve;
			this.finishRejecter = reject;
			this.finishTimer = setTimeout(() => this.resolveFinish(this.text), FINISH_TIMEOUT_MS);
			this.pendingCommit = true;
			this.commitIfPending();
		});
	}

	stop(): void {
		this.finishRejecter?.(
			Object.assign(new Error("Realtime transcription cancelled"), { name: "AbortError" })
		);
		this.finished = true;
		this.clearFinishTimer();
		this.finishResolver = null;
		this.finishRejecter = null;
		this.pendingCommit = false;
		this.audioBuffer = [];
		this.audioBufferBytes = 0;
		this.ready = false;
		if (this.socket) {
			this.socket.close({ code: 1000, reason: "done" });
			this.socket = null;
		}
	}

	private flushAudioBuffer(): void {
		if (!this.ready || !this.socket || this.audioBufferBytes === 0) return;
		const combined = Buffer.concat(this.audioBuffer);
		this.audioBuffer = [];
		this.audioBufferBytes = 0;
		this.socket.send({
			type: "input_audio_buffer.append",
			audio: combined.toString("base64"),
		});
	}

	private commitIfPending(): void {
		if (!this.pendingCommit || !this.ready || !this.socket) return;
		this.pendingCommit = false;
		this.socket.send({ type: "input_audio_buffer.commit" });
	}

	private resolveFinish(text: string): void {
		this.text = text;
		this.clearFinishTimer();
		this.finishResolver?.(text);
		this.finishResolver = null;
		this.finishRejecter = null;
		this.emit("complete", text);
		this.stop();
	}

	private clearFinishTimer(): void {
		if (!this.finishTimer) return;
		clearTimeout(this.finishTimer);
		this.finishTimer = null;
	}
}

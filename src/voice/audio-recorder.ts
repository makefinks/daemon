import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import type { AudioDevice } from "../types";

let soxAvailableCache: boolean | null = null;

/**
 * Get the appropriate sox audio driver for the current platform.
 * Falls back to pulseaudio for unknown platforms.
 */
function getPlatformAudioDriver(): string {
	switch (process.platform) {
		case "darwin":
			return "coreaudio";
		case "linux":
			// pulseaudio is most common on modern Linux (Ubuntu, Fedora, etc.)
			// Falls back gracefully - sox will error if driver unavailable
			return "pulseaudio";
		case "win32":
			return "waveaudio";
		default:
			return "pulseaudio";
	}
}

/**
 * Get sox install instructions for the current platform.
 */
export function getSoxInstallHint(): string {
	switch (process.platform) {
		case "darwin":
			return "Run: brew install sox";
		case "linux":
			return "Install sox via your package manager (e.g., apt install sox libsox-fmt-pulse)";
		case "win32":
			return "Install sox from https://sox.sourceforge.net/";
		default:
			return "Install sox using your package manager.";
	}
}

export function isSoxAvailable(): boolean {
	if (soxAvailableCache !== null) {
		return soxAvailableCache;
	}

	const result = spawnSync("sox", ["--version"], {
		stdio: "ignore",
		timeout: 2000,
	});
	soxAvailableCache = result.status === 0;
	return soxAvailableCache;
}

export class SoxNotAvailableError extends Error {
	constructor() {
		super(`sox is not installed. Voice recording requires sox. ${getSoxInstallHint()}`);
		this.name = "SoxNotAvailableError";
	}
}

export type AudioRecorderEvents = {
	data: (chunk: Buffer) => void;
	error: (error: Error) => void;
	stop: () => void;
};

export type AudioRecorderOptions = {
	/** Sample rate in Hz (default: 16000) */
	sampleRate?: number;
	/** Input device name for coreaudio (optional - uses default if not specified) */
	deviceName?: string;
};

interface DefaultInputDeviceCache {
	name: string | undefined;
	timestampMs: number;
}

let defaultInputDeviceCache: DefaultInputDeviceCache | null = null;

function parseDeviceFromEnv(): string | undefined {
	return process.env.DAEMON_AUDIO_DEVICE ?? process.env.AUDIO_DEVICE ?? undefined;
}

function parseSoxBufferBytesFromEnv(): number | undefined {
	const raw = process.env.DAEMON_AUDIO_BUFFER_BYTES ?? process.env.DAEMON_SOX_BUFFER_BYTES ?? undefined;
	if (!raw) return undefined;
	const n = Number(raw);
	if (!Number.isFinite(n)) return undefined;
	const clamped = Math.max(256, Math.min(16384, Math.floor(n)));
	return clamped;
}

function parseDefaultInputDeviceFromSystemProfiler(output: string): string | undefined {
	let currentDeviceName: string | undefined;

	for (const line of output.split("\n")) {
		// In `system_profiler SPAudioDataType`, device sections look like:
		// "        MacBook Air-Mikrofon:" (8 spaces, name, colon)
		const headerMatch = line.match(/^\s{8}(.+):\s*$/);
		if (headerMatch && headerMatch[1] && headerMatch[1] !== "Devices") {
			currentDeviceName = headerMatch[1];
			continue;
		}

		if (currentDeviceName && line.includes("Default Input Device: Yes")) {
			return currentDeviceName;
		}
	}

	return undefined;
}

/**
 * Best-effort: read the macOS system default input device name.
 * Used for UI selection highlighting when no explicit device was chosen.
 */
export async function getSystemDefaultInputDeviceName(): Promise<string | undefined> {
	if (process.platform !== "darwin") return undefined;

	const now = Date.now();
	if (defaultInputDeviceCache && now - defaultInputDeviceCache.timestampMs < 10_000) {
		return defaultInputDeviceCache.name;
	}

	try {
		const output = await new Promise<string>((resolve, reject) => {
			const proc = spawn("system_profiler", ["SPAudioDataType"], {
				stdio: ["ignore", "pipe", "ignore"],
			});

			let stdout = "";
			proc.stdout?.on("data", (data: Buffer) => {
				stdout += data.toString();
			});

			proc.once("error", (error) => reject(error));
			proc.once("close", () => resolve(stdout));
		});

		const name = parseDefaultInputDeviceFromSystemProfiler(output);
		defaultInputDeviceCache = { name, timestampMs: now };
		return name;
	} catch (error: unknown) {
		const err = error instanceof Error ? error : new Error(String(error));
		defaultInputDeviceCache = { name: undefined, timestampMs: now };
		return undefined;
	}
}

/**
 * Create a valid WAV header for raw PCM data.
 * @param dataLength Length of the raw PCM data in bytes
 * @param sampleRate Sample rate in Hz
 * @param numChannels Number of audio channels
 * @param bitsPerSample Bits per sample (typically 16)
 */
function createWavHeader(
	dataLength: number,
	sampleRate: number,
	numChannels: number = 1,
	bitsPerSample: number = 16
): Buffer {
	const header = Buffer.alloc(44);
	const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
	const blockAlign = numChannels * (bitsPerSample / 8);

	// RIFF chunk descriptor
	header.write("RIFF", 0);
	header.writeUInt32LE(36 + dataLength, 4); // File size - 8
	header.write("WAVE", 8);

	// fmt sub-chunk
	header.write("fmt ", 12);
	header.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
	header.writeUInt16LE(1, 20); // AudioFormat (1 = PCM)
	header.writeUInt16LE(numChannels, 22);
	header.writeUInt32LE(sampleRate, 24);
	header.writeUInt32LE(byteRate, 28);
	header.writeUInt16LE(blockAlign, 32);
	header.writeUInt16LE(bitsPerSample, 34);

	// data sub-chunk
	header.write("data", 36);
	header.writeUInt32LE(dataLength, 40);

	return header;
}

/**
 * Audio recorder using sox for cross-platform microphone capture.
 * Records mono audio suitable for transcription APIs.
 *
 * Uses sox with coreaudio on macOS for direct device capture.
 */
export class AudioRecorder extends EventEmitter {
	private process: ChildProcess | null = null;
	private chunks: Buffer[] = [];
	private _isRecording = false;
	private options: Required<Omit<AudioRecorderOptions, "deviceName">> &
		Pick<AudioRecorderOptions, "deviceName">;
	private startTime: number = 0;

	constructor(options: AudioRecorderOptions = {}) {
		super();
		this.options = {
			sampleRate: options.sampleRate ?? 16000,
			deviceName: options.deviceName,
		};
	}

	get isRecording(): boolean {
		return this._isRecording;
	}

	/**
	 * Start recording audio from the microphone.
	 * Uses sox with platform-appropriate driver (coreaudio/pulseaudio/waveaudio).
	 * Outputs raw PCM s16le which we wrap with a WAV header on stop().
	 */
	start(): void {
		if (this._isRecording) return;

		if (!isSoxAvailable()) {
			this.emit("error", new SoxNotAvailableError());
			return;
		}

		this.chunks = [];
		this._isRecording = true;
		this.startTime = Date.now();

		const deviceName = this.options.deviceName ?? parseDeviceFromEnv();
		const soxBufferBytes = parseSoxBufferBytesFromEnv() ?? 2048;
		const audioDriver = getPlatformAudioDriver();

		const args: string[] = [
			"--buffer",
			String(soxBufferBytes),
			"--input-buffer",
			String(soxBufferBytes),
			"-q",
			"-t",
			audioDriver,
		];

		if (deviceName) {
			args.push(deviceName);
		} else {
			args.push("default");
		}

		// Output format: raw signed 16-bit little-endian mono
		args.push(
			"-t",
			"raw",
			"-e",
			"signed-integer",
			"-b",
			"16",
			"-c",
			"1",
			"-r",
			String(this.options.sampleRate),
			"-"
		);

		this.process = spawn("sox", args, {
			stdio: ["pipe", "pipe", "pipe"],
		});

		this.process.stdout?.on("data", (chunk: Buffer) => {
			this.chunks.push(chunk);
			this.emit("data", chunk);
		});

		this.process.stderr?.on("data", (data: Buffer) => {
			const msg = data.toString();
			// Only emit as error if it's a real failure
			if (
				msg.includes("FAIL") ||
				msg.includes("error") ||
				msg.includes("Error") ||
				msg.includes("Invalid") ||
				msg.includes("Could not") ||
				msg.includes("can't")
			) {
				this.emit("error", new Error(msg.trim()));
			}
		});

		this.process.on("error", (err) => {
			this._isRecording = false;
			this.emit(
				"error",
				new Error(
					`Failed to start recording: ${err.message}. ` +
						`${getSoxInstallHint()} ` +
						`(Tip: set DAEMON_AUDIO_DEVICE to a specific input device name)`
				)
			);
		});

		this.process.on("close", (code) => {
			this._isRecording = false;
			this.emit("stop");
		});
	}

	/**
	 * Stop recording and return the captured audio as a WAV Buffer.
	 * Adds a proper WAV header to the raw PCM data.
	 * Note: This returns immediately. For full buffer flush, use stopAsync().
	 */
	stop(): Buffer {
		const proc = this.process;
		if (proc) {
			// Send SIGINT to sox for graceful exit
			proc.kill("SIGINT");
			this.process = null;
		}
		this._isRecording = false;

		// Combine all raw PCM chunks
		const pcmData = Buffer.concat(this.chunks);

		// We trust sox delivered the sample rate we asked for
		const actualSampleRate = this.options.sampleRate;
		const wavHeader = createWavHeader(pcmData.length, actualSampleRate);

		// Combine header + PCM data
		const wavBuffer = Buffer.concat([wavHeader, pcmData]);

		return wavBuffer;
	}

	/**
	 * Stop recording and wait for sox to fully flush its buffers.
	 * Returns the captured audio as a WAV Buffer.
	 */
	async stopAsync(): Promise<Buffer> {
		const proc = this.process;
		if (!proc) {
			return this.stop();
		}

		return new Promise((resolve) => {
			// Resolve only after stdout has ended and the process has closed,
			// to avoid truncating buffered audio.
			let stdoutEnded = proc.stdout ? false : true;
			let procClosed = false;

			const finalize = () => {
				if (!stdoutEnded || !procClosed) return;
				this._isRecording = false;

				const pcmData = Buffer.concat(this.chunks);
				const actualSampleRate = this.options.sampleRate;
				const wavHeader = createWavHeader(pcmData.length, actualSampleRate);
				const wavBuffer = Buffer.concat([wavHeader, pcmData]);

				resolve(wavBuffer);
			};

			proc.stdout?.once("end", () => {
				stdoutEnded = true;
				finalize();
			});

			// Wait for process to close (stdio closed)
			proc.once("close", () => {
				procClosed = true;
				finalize();
			});

			// Send SIGINT to sox for graceful exit
			proc.kill("SIGINT");
			this.process = null;

			// Timeout safety - kill if sox doesn't exit
			setTimeout(() => {
				if (proc.exitCode !== null) return;
				proc.kill("SIGTERM");
			}, 3000);
		});
	}

	/**
	 * Get the current recording as a Buffer without stopping.
	 */
	getBuffer(): Buffer {
		return Buffer.concat(this.chunks);
	}

	/**
	 * Get the current recording duration in seconds (approximate).
	 */
	getDuration(): number {
		// Use elapsed time for more accurate duration during recording
		if (this._isRecording) {
			return (Date.now() - this.startTime) / 1000;
		}
		// After stopping, calculate from raw PCM buffer size
		// Raw PCM: 16-bit mono samples at sampleRate (2 bytes per sample)
		const bytes = this.chunks.reduce((acc, chunk) => acc + chunk.length, 0);
		const samples = bytes / 2; // 16-bit = 2 bytes per sample
		return samples / this.options.sampleRate;
	}

	/**
	 * Clean up resources.
	 */
	destroy(): void {
		if (this.process) {
			this.process.kill("SIGKILL");
			this.process = null;
		}
		this._isRecording = false;
		this.chunks = [];
		this.removeAllListeners();
	}
}

// Singleton instance for convenience
let recorder: AudioRecorder | null = null;
let recorderConfig: AudioRecorderOptions | null = null;

export function getRecorder(options: AudioRecorderOptions = {}): AudioRecorder {
	if (!recorder) {
		recorder = new AudioRecorder(options);
		recorderConfig = { ...options };
		return recorder;
	}

	if (options.sampleRate !== undefined || options.deviceName !== undefined) {
		const current = recorderConfig ?? {};
		const desiredSampleRate = options.sampleRate ?? current.sampleRate;
		const desiredDeviceName = options.deviceName ?? current.deviceName;

		if (desiredSampleRate !== current.sampleRate || desiredDeviceName !== current.deviceName) {
			recorder.destroy();
			recorder = new AudioRecorder({
				sampleRate: desiredSampleRate,
				deviceName: desiredDeviceName,
			});
			recorderConfig = {
				sampleRate: desiredSampleRate,
				deviceName: desiredDeviceName,
			};
		}
	}
	return recorder;
}

export function destroyRecorder(): void {
	if (recorder) {
		recorder.destroy();
		recorder = null;
		recorderConfig = null;
	}
}

/**
 * Set the audio device for recording by name.
 * This will recreate the recorder with the new device.
 */
export function setAudioDevice(deviceName: string): void {
	const current = recorderConfig ?? {};
	if (recorder) {
		recorder.destroy();
	}
	recorder = new AudioRecorder({
		sampleRate: current.sampleRate ?? 16000,
		deviceName,
	});
	recorderConfig = {
		sampleRate: current.sampleRate ?? 16000,
		deviceName,
	};
}

/**
 * Get the currently selected device name.
 */
export function getCurrentDeviceName(): string | undefined {
	return recorderConfig?.deviceName;
}

/**
 * List available audio input devices using sox.
 * macOS: Uses coreaudio verbose output parsing.
 * Linux: Uses pactl for PulseAudio sources.
 * Other: Returns default device only.
 */
export async function listAudioDevices(): Promise<AudioDevice[]> {
	if (process.platform === "darwin") {
		return listAudioDevicesMacOS();
	}
	if (process.platform === "linux") {
		return listAudioDevicesLinux();
	}
	return [{ name: "default" }];
}

async function listAudioDevicesMacOS(): Promise<AudioDevice[]> {
	return new Promise((resolve) => {
		const proc = spawn("sox", ["-V6", "-n", "-t", "coreaudio", "nonexistent_device_to_force_list"], {
			stdio: ["ignore", "pipe", "pipe"],
		});

		let output = "";
		proc.stderr?.on("data", (data: Buffer) => {
			output += data.toString();
		});

		proc.on("close", () => {
			const devices: AudioDevice[] = [];
			const lines = output.split("\n");
			const seen = new Set<string>();

			for (const line of lines) {
				const match = line.match(/Found Audio Device "(.+)"/);
				if (match && match[1]) {
					const name = match[1];
					if (!seen.has(name)) {
						seen.add(name);
						devices.push({ name });
					}
				}
			}

			if (devices.length === 0) {
				devices.push({ name: "default" });
			}

			resolve(devices);
		});

		proc.on("error", () => {
			resolve([{ name: "default" }]);
		});
	});
}

async function listAudioDevicesLinux(): Promise<AudioDevice[]> {
	return new Promise((resolve) => {
		const proc = spawn("pactl", ["list", "sources", "short"], {
			stdio: ["ignore", "pipe", "pipe"],
		});

		let output = "";
		proc.stdout?.on("data", (data: Buffer) => {
			output += data.toString();
		});

		proc.on("close", () => {
			const devices: AudioDevice[] = [];
			const lines = output.split("\n");

			for (const line of lines) {
				const parts = line.split("\t");
				if (parts[1]) {
					devices.push({ name: parts[1] });
				}
			}

			if (devices.length === 0) {
				devices.push({ name: "default" });
			}

			resolve(devices);
		});

		proc.on("error", () => {
			resolve([{ name: "default" }]);
		});
	});
}

export interface MicLevelOptions {
	noiseFloor?: number;
	gain?: number;
}

/**
 * Compute a normalized mic level (0..1) from a PCM16 LE audio chunk.
 * Returns `null` if the chunk is too small to analyze.
 */
export function computeMicLevelFromPcm16Chunk(chunk: Buffer, options: MicLevelOptions = {}): number | null {
	if (chunk.length < 2) return null;

	const sampleCount = Math.floor(chunk.length / 2);
	if (sampleCount <= 0) return null;

	let sumSquares = 0;

	const view = new Int16Array(chunk.buffer, chunk.byteOffset, sampleCount);
	for (let i = 0; i < view.length; i++) {
		const v = view[i] ?? 0;
		const f = v / 32768;
		sumSquares += f * f;
	}

	const rms = Math.sqrt(sumSquares / view.length);
	const noiseFloor = options.noiseFloor ?? 0.005;
	const gain = options.gain ?? 25;
	const rawLevel = Math.max(0, (rms - noiseFloor) * gain);
	return Math.min(1, rawLevel);
}

export function smoothMicLevel(prev: number, next: number): number {
	const alpha = next > prev ? 0.9 : 0.6;
	return prev + (next - prev) * alpha;
}

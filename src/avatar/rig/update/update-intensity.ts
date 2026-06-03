import type { RigState } from "../state/rig-state";

export function updateIntensityAndAudio(state: RigState, dt: number): number {
	const { intensity, audio, typing, reasoning } = state;

	typing.pulse = Math.max(0, typing.pulse - dt * 5);

	const intensityRate = intensity.target > intensity.current ? 10 : 8;
	intensity.current += (intensity.target - intensity.current) * dt * intensityRate;

	intensity.spinBoost += (0 - intensity.spinBoost) * dt * 2.5;
	const previousAudio = audio.current;
	audio.current += (audio.target - audio.current) * dt * 25;
	const sustainRate = audio.current > audio.sustain ? 12 : 7;
	audio.sustain += (audio.current - audio.sustain) * Math.min(1, dt * sustainRate);
	const audioRise = Math.max(0, audio.current - previousAudio);
	audio.surge = Math.min(1, Math.max(0, audio.surge - dt * 5) + audioRise * 3);
	audio.wavePhase += dt * (1.3 + intensity.current * 1.5 + audio.sustain * 6 + audio.surge * 2.5);
	reasoning.blend += ((reasoning.active ? 1 : 0) - reasoning.blend) * dt * 6;

	return intensity.current;
}

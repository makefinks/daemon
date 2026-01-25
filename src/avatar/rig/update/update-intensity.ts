import type { RigState } from "../state/rig-state";

export function updateIntensityAndAudio(state: RigState, dt: number): number {
	const { intensity, audio, typing, reasoning } = state;

	typing.pulse = Math.max(0, typing.pulse - dt * 5);

	const intensityRate = intensity.target > intensity.current ? 10 : 8;
	intensity.current += (intensity.target - intensity.current) * dt * intensityRate;

	intensity.spinBoost += (0 - intensity.spinBoost) * dt * 2.5;
	audio.current += (audio.target - audio.current) * dt * 25;
	reasoning.blend += ((reasoning.active ? 1 : 0) - reasoning.blend) * dt * 6;

	return intensity.current;
}

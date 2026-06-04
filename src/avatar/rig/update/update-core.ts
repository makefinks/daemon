import type { SceneElements } from "../scene/create-scene-elements";
import type { RigState } from "../state/rig-state";
import { clamp01 } from "../utils/math";

export function updateCore(elements: SceneElements, state: RigState, dt: number, intensity: number): void {
	const { phase, audio, reasoning } = state;

	const audioLevel = audio.sustain > 0.012 ? Math.pow(clamp01((audio.sustain - 0.012) / 0.988), 0.75) : 0;
	const surgeLevel = audio.surge > 0.04 ? clamp01((audio.surge - 0.04) / 0.96) : 0;
	const audioEnergy = Math.max(audioLevel, surgeLevel * 0.35);
	if (reasoning.powerPulse > 0) {
		reasoning.powerPulseAge += dt;
	}
	reasoning.powerPulse = Math.max(0, reasoning.powerPulse - dt * 0.95);
	const powerPulse = Math.pow(reasoning.powerPulse, 1.35);
	const powerDistortion = Math.pow(reasoning.powerPulse, 0.9);
	const coreSpeed = 0.1 + intensity * 0.9 + audioEnergy * 0.35;
	elements.glowMesh.rotation.y += dt * coreSpeed;
	elements.glowMesh.rotation.x += dt * (coreSpeed * 0.6 + audioLevel * 0.2 + surgeLevel * 0.18);

	const glowScale = 1 + intensity * 0.2 + audioLevel * 0.135 + surgeLevel * 0.09 + powerPulse * 0.1;
	elements.glowMesh.scale.setScalar(glowScale);
	elements.glowMat.opacity = clamp01(
		0.4 + intensity * 0.35 + audioLevel * 0.12 + surgeLevel * 0.04 + powerPulse * 0.22
	);
	elements.pointLight.intensity =
		0.8 + intensity * 0.25 + audioLevel * 0.15 + surgeLevel * 0.08 + powerPulse * 0.42;
	const normalCorePulseSpeed = 1 + intensity * 4 + audioLevel * 0.8;
	const reasoningCorePulseSpeed = 0.4;
	const corePulseSpeed =
		normalCorePulseSpeed * (1 - reasoning.blend) + reasoningCorePulseSpeed * reasoning.blend;
	phase.corePulse += dt * corePulseSpeed;

	const normalCorePulseAmount = 0.01 + intensity * 0.15;
	const reasoningCorePulseAmount = 0.08;
	const corePulseAmount =
		normalCorePulseAmount * (1 - reasoning.blend) + reasoningCorePulseAmount * reasoning.blend;
	const corePulse = 1 + Math.sin(phase.corePulse) * corePulseAmount + powerPulse * 0.045;

	elements.coreGroup.scale.setScalar(corePulse);
	elements.coreMesh.scale.setScalar(1);

	const positions = elements.glowPos;
	const base = elements.glowBasePositions;
	const audioLiquidAmount = audioLevel * 0.05 + surgeLevel * 0.024;
	const audioSpikeAmount = audioLevel * 0.062 + surgeLevel * 0.038;
	const pulseLiquidAmount = powerDistortion * 0.003;
	const pulseSpikeAmount = powerPulse * 0.17;
	const hasLiquidWave = audioLiquidAmount + audioSpikeAmount + pulseLiquidAmount + pulseSpikeAmount > 0.0001;
	const seedPhase = reasoning.powerPulseSeed * 2.399963;
	const pulsePhase = reasoning.powerPulseAge * 2.2 + seedPhase;

	for (let i = 0; i < positions.count; i++) {
		const index = i * 3;
		const x = base[index] ?? 0;
		const y = base[index + 1] ?? 0;
		const z = base[index + 2] ?? 0;
		if (!hasLiquidWave) {
			positions.setXYZ(i, x, y, z);
			continue;
		}
		const length = Math.sqrt(x * x + y * y + z * z) || 1;
		const nx = x / length;
		const ny = y / length;
		const nz = z / length;
		const longitude = Math.atan2(z, x);
		const directional = x * 5.2 + y * 3.1 - z * 4.4;
		const audioLiquidWave =
			Math.sin(audio.wavePhase + directional * 8.5) * 0.55 +
			Math.sin(audio.wavePhase * 1.55 - y * 12 + longitude * 2.5) * 0.3 +
			Math.sin(audio.wavePhase * 0.72 + longitude * 5 + z * 8) * 0.2;
		const audioSpikeWave =
			Math.sin(audio.wavePhase * 1.35 + x * 14 - y * 10 + z * 12) * 0.55 +
			Math.sin(audio.wavePhase * 1.9 + longitude * 4 + directional * 6) * 0.45;
		const audioSpike = Math.pow(clamp01((audioSpikeWave + 0.05) / 1.05), 1.8) * audioSpikeAmount;
		const pulseLiquidWave =
			Math.sin(pulsePhase + directional * 8.5) * 0.55 +
			Math.sin(pulsePhase * 1.55 - y * 12 + longitude * 2.5) * 0.3 +
			Math.sin(pulsePhase * 0.72 + longitude * 5 + z * 8) * 0.2;
		const depth = clamp01((nz + 1) * 0.5);
		const longitudeBand =
			0.45 + Math.pow(clamp01(Math.sin(longitude * 3.5 + pulsePhase * 0.12 + seedPhase * 0.7)), 2) * 1.45;
		const depthBand = 0.55 + Math.pow(depth, 1.25) * 1.35;
		const primarySpike = Math.pow(
			clamp01((Math.sin(pulsePhase * 1.15 + x * 11 - y * 8 + z * 15 + seedPhase * 0.9) + 0.08) / 1.08),
			1.65
		);
		const secondarySpike = Math.pow(
			clamp01(
				(Math.sin(pulsePhase * 0.75 + longitude * 5 + directional * 4.5 + seedPhase * 1.3) + 0.2) / 1.2
			),
			2.1
		);
		const pulseSpike =
			(primarySpike * 0.82 + secondarySpike * 0.18) * longitudeBand * depthBand * pulseSpikeAmount;
		const tension = Math.sin(directional * 10 + pulsePhase * 0.3 + seedPhase * 0.5) * powerPulse * 0.0144;
		const offset =
			audioLiquidWave * audioLiquidAmount +
			audioSpike +
			pulseLiquidWave * pulseLiquidAmount +
			pulseSpike +
			tension;

		positions.setXYZ(i, x + nx * offset, y + ny * offset, z + nz * offset);
	}
	positions.needsUpdate = true;
}

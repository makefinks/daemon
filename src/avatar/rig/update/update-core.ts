import type { SceneElements } from "../scene/create-scene-elements";
import type { RigState } from "../state/rig-state";
import { clamp01 } from "../utils/math";

export function updateCore(elements: SceneElements, state: RigState, dt: number, intensity: number): void {
	const { phase, audio, reasoning } = state;

	const audioLevel = audio.current > 0.03 ? clamp01((audio.current - 0.03) / 0.97) : 0;
	const surgeLevel = audio.surge > 0.04 ? clamp01((audio.surge - 0.04) / 0.96) : 0;
	const audioEnergy = Math.max(audioLevel, surgeLevel * 0.7);
	const coreSpeed = 0.1 + intensity * 0.9 + audioEnergy * 0.35;
	elements.glowMesh.rotation.y += dt * coreSpeed;
	elements.glowMesh.rotation.x += dt * (coreSpeed * 0.6 + surgeLevel * 0.35);

	const glowScale = 1 + intensity * 0.2 + audioLevel * 0.078 + surgeLevel * 0.122;
	elements.glowMesh.scale.setScalar(glowScale);
	elements.glowMat.opacity = clamp01(0.4 + intensity * 0.35 + audioLevel * 0.1 + surgeLevel * 0.08);
	elements.pointLight.intensity = 0.8 + intensity * 0.25 + audioLevel * 0.12 + surgeLevel * 0.16;
	const normalCorePulseSpeed = 1 + intensity * 4 + audioLevel * 0.8;
	const reasoningCorePulseSpeed = 0.4;
	const corePulseSpeed =
		normalCorePulseSpeed * (1 - reasoning.blend) + reasoningCorePulseSpeed * reasoning.blend;
	phase.corePulse += dt * corePulseSpeed;

	const normalCorePulseAmount = 0.01 + intensity * 0.15;
	const reasoningCorePulseAmount = 0.08;
	const corePulseAmount =
		normalCorePulseAmount * (1 - reasoning.blend) + reasoningCorePulseAmount * reasoning.blend;
	const corePulse = 1 + Math.sin(phase.corePulse) * corePulseAmount;

	elements.coreGroup.scale.setScalar(corePulse);
	elements.coreMesh.scale.setScalar(1);

	const positions = elements.glowPos;
	const base = elements.glowBasePositions;
	const liquidAmount = audioLevel * 0.038 + surgeLevel * 0.057;
	const hasLiquidWave = liquidAmount > 0.0001;

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
		const liquidWave =
			Math.sin(audio.wavePhase + directional * 8.5) * 0.55 +
			Math.sin(audio.wavePhase * 1.55 - y * 12 + longitude * 2.5) * 0.3 +
			Math.sin(audio.wavePhase * 0.72 + longitude * 5 + z * 8) * 0.2;
		const offset = liquidWave * liquidAmount;

		positions.setXYZ(i, x + nx * offset, y + ny * offset, z + nz * offset);
	}
	positions.needsUpdate = true;
}

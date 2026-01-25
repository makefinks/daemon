import type { SceneElements } from "../scene/create-scene-elements";
import type { RigState } from "../state/rig-state";
import { clamp01 } from "../utils/math";

export function updateParticles(
	elements: SceneElements,
	state: RigState,
	dt: number,
	intensity: number,
	allowGlitch: boolean
): void {
	const { audio, particlePulse } = state;
	const particleCount = elements.particleVelocities.length;

	const glitchChance = allowGlitch ? 0.0002 + intensity * 0.006 : 0;
	const audioJitterBoost = 1 + audio.current * 0.8;
	const particleSpeedMult = (0.3 + intensity * 1.2) * audioJitterBoost;

	for (let i = 0; i < particleCount; i++) {
		const vel = elements.particleVelocities[i]!;
		let x = elements.particlePos.getX(i) + vel.x * dt * particleSpeedMult;
		let y = elements.particlePos.getY(i) + vel.y * dt * particleSpeedMult;
		let z = elements.particlePos.getZ(i) + vel.z * dt * particleSpeedMult;

		if (Math.random() < glitchChance) {
			const r = 1.5 + Math.random() * 2;
			const theta = Math.random() * Math.PI * 2;
			const phi = Math.acos(Math.random() * 2 - 1);
			x = r * Math.sin(phi) * Math.cos(theta);
			y = r * Math.sin(phi) * Math.sin(theta);
			z = r * Math.cos(phi);
		}

		const distSq = x * x + y * y + z * z;
		if (distSq > 20) {
			x *= -0.8;
			y *= -0.8;
			z *= -0.8;
		}

		elements.particlePos.setXYZ(i, x, y, z);
	}
	elements.particlePos.needsUpdate = true;

	const idleParticleBoost = particlePulse.brightness * 0.4;
	elements.particleMat.opacity = clamp01(0.3 + intensity * 0.4 + audio.current * 0.25 + idleParticleBoost);
	elements.particleMat.size =
		0.02 + intensity * 0.015 + audio.current * 0.01 + particlePulse.brightness * 0.02;
}

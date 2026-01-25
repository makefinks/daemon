import type { SceneElements } from "../scene/create-scene-elements";
import type { RigState } from "../state/rig-state";
import { clamp01 } from "../utils/math";

export function updateSigils(elements: SceneElements, state: RigState, dt: number, intensity: number): void {
	const { phase, audio, tool } = state;

	for (let i = 0; i < elements.fragments.length; i++) {
		const curr = elements.fragments[i]!;
		const next = elements.fragments[(i + 1) % elements.fragments.length]!;
		elements.sigilPos.setXYZ(i * 2, curr.mesh.position.x, curr.mesh.position.y, curr.mesh.position.z);
		elements.sigilPos.setXYZ(i * 2 + 1, next.mesh.position.x, next.mesh.position.y, next.mesh.position.z);
	}
	elements.sigilPos.needsUpdate = true;

	const sigilPulseSpeed = 1 + intensity * 2;
	phase.sigilPulse += dt * sigilPulseSpeed;

	tool.sigilBrightnessBoost += ((tool.active ? 1 : 0) - tool.sigilBrightnessBoost) * dt * 8;

	const sigilBaseOpacity = 0.2 + intensity * 0.2 + tool.sigilBrightnessBoost * 0.5;
	const sigilPulseAmount = 0.05 + intensity * 0.12;
	elements.sigilMat.opacity = clamp01(
		sigilBaseOpacity + Math.sin(phase.sigilPulse) * sigilPulseAmount + audio.current * 0.2
	);
}

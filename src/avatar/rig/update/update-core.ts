import type { SceneElements } from "../scene/create-scene-elements";
import type { RigState } from "../state/rig-state";
import { clamp01 } from "../utils/math";

export function updateCore(elements: SceneElements, state: RigState, dt: number, intensity: number): void {
	const { phase, audio, reasoning } = state;

	const coreSpeed = 0.1 + intensity * 0.9;
	elements.glowMesh.rotation.y += dt * coreSpeed;
	elements.glowMesh.rotation.x += dt * coreSpeed * 0.6;

	const glowScale = 1 + intensity * 0.25;
	elements.glowMesh.scale.setScalar(glowScale);
	elements.glowMat.opacity = clamp01(0.4 + intensity * 0.4 + audio.current * 0.25);
	const normalCorePulseSpeed = 1 + intensity * 4;
	const reasoningCorePulseSpeed = 0.4;
	const corePulseSpeed =
		normalCorePulseSpeed * (1 - reasoning.blend) + reasoningCorePulseSpeed * reasoning.blend;
	phase.corePulse += dt * corePulseSpeed;

	const normalCorePulseAmount = 0.01 + intensity * 0.15;
	const reasoningCorePulseAmount = 0.08;
	const corePulseAmount =
		normalCorePulseAmount * (1 - reasoning.blend) + reasoningCorePulseAmount * reasoning.blend;
	const corePulse = 1 + Math.sin(phase.corePulse) * corePulseAmount;

	elements.coreGroup.scale.setScalar(corePulse * (1 + audio.current * 0.18));

	const squashStretch = 1 + audio.current * 0.15;
	elements.coreMesh.scale.set(1, squashStretch, 1);
	elements.glowMesh.scale.y *= squashStretch;
}

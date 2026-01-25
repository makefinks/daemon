import type { SceneElements } from "../scene/create-scene-elements";
import type { RigState } from "../state/rig-state";
import { clamp01 } from "../utils/math";

export function updateFragments(
	elements: SceneElements,
	state: RigState,
	dt: number,
	intensity: number
): void {
	const { audio, tool, reasoning, intensity: intensityState } = state;

	tool.fragmentScatterBoost += (0 - tool.fragmentScatterBoost) * dt * 6;
	tool.settleTimer = Math.max(0, tool.settleTimer - dt);

	const settleContraction = tool.settleTimer > 0 ? Math.sin(tool.settleTimer * 20) * 0.08 : 0;
	const reasoningContraction = reasoning.blend * 0.25;
	const fragmentScale =
		0.5 + intensity * 0.6 + tool.fragmentScatterBoost - settleContraction - reasoningContraction;
	elements.fragmentGroup.scale.setScalar(fragmentScale);

	elements.fragments.forEach((frag) => {
		const reasoningOrbitSlowdown = 1 - reasoning.blend * 0.6;
		const audioOrbitBoost = audio.current * 0.4;
		const orbitSpeed =
			frag.orbitSpeed * (0.4 + intensity * 1.2 + audioOrbitBoost) * reasoningOrbitSlowdown +
			intensityState.spinBoost * 0.5;
		frag.orbitAngle += dt * orbitSpeed;

		const dynamicRadius = frag.orbitRadius;
		const bobAmount = 0.08 + intensity * 0.2;
		const bobSpeed = frag.bobSpeed * (0.5 + intensity * 1.0);
		frag.bobPhase += dt * bobSpeed;

		const bob = Math.sin(frag.bobPhase) * bobAmount;
		frag.mesh.position.x = Math.cos(frag.orbitAngle) * dynamicRadius;
		frag.mesh.position.z = Math.sin(frag.orbitAngle) * dynamicRadius;
		frag.mesh.position.y += (bob - frag.mesh.position.y) * dt * 3;

		const tumbleSpeed = 0.1 + intensity * 0.5;
		frag.mesh.rotation.x += dt * tumbleSpeed;
		frag.mesh.rotation.y += dt * tumbleSpeed * 1.5;

		frag.material.opacity = clamp01(0.45 + intensity * 0.4 + audio.current * 0.22);
	});
}

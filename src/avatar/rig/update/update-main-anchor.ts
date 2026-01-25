import type { SceneElements } from "../scene/create-scene-elements";
import type { RigState } from "../state/rig-state";

export function updateMainAnchor(
	elements: SceneElements,
	state: RigState,
	dt: number,
	intensity: number
): void {
	const { phase, audio } = state;

	const driftSpeed = 0.08 + intensity * 0.3;
	phase.drift += dt * driftSpeed;
	const driftAmount = 0.03 + intensity * 0.12;

	elements.mainAnchor.rotation.y = Math.sin(phase.drift) * driftAmount;
	elements.mainAnchor.rotation.x = Math.sin(phase.drift * 0.7) * driftAmount * 0.5;
	elements.mainAnchor.rotation.z = Math.sin(phase.drift * 0.5) * intensity * 0.08;
	elements.mainAnchor.scale.setScalar(1 + audio.current * 0.12);
}

import type { SceneElements } from "../scene/create-scene-elements";
import type { RigState } from "../state/rig-state";
import { clamp01 } from "../utils/math";

export function updateRings(elements: SceneElements, state: RigState, dt: number, intensity: number): void {
	const { audio, intensity: intensityState } = state;

	const orbitScale = 0.75 + intensity * 0.4;
	elements.orbitGroup.scale.setScalar(orbitScale);

	elements.rings.forEach((ring, i) => {
		const ringIntensity = Math.pow(intensity, 1.35);
		const ringSpeed = ring.speed * (0.4 + ringIntensity * 1.5) + intensityState.spinBoost * (1 + i * 0.2);
		ring.mesh.rotateOnAxis(ring.axis, dt * ringSpeed);

		const wobbleSpeed = 3 + i * 0.5;
		ring.wobblePhase += dt * wobbleSpeed;
		const wobbleAmount = audio.current * 0.06;
		const wobbleX = Math.sin(ring.wobblePhase) * wobbleAmount;
		const wobbleZ = Math.cos(ring.wobblePhase * 1.3) * wobbleAmount;
		ring.mesh.rotation.x += wobbleX;
		ring.mesh.rotation.z += wobbleZ;

		const phaseSpeed = 1 + intensity * 3;
		ring.phase += dt * phaseSpeed;

		const baseOpacity = 0.4 + intensity * 0.4 + i * 0.1;
		if (intensity > 0.1) {
			const wave = Math.sin(ring.phase + i * 1.5) * 0.2 * intensity;
			ring.material.opacity = clamp01(baseOpacity + wave + audio.current * 0.25);
		} else {
			ring.material.opacity = clamp01(baseOpacity + audio.current * 0.25);
		}
	});
}

import type { SceneElements } from "../scene/create-scene-elements";
import type { RigState } from "../state/rig-state";

export function updateGlitchBehavior(
	elements: SceneElements,
	state: RigState,
	dt: number,
	intensity: number,
	allowGlitch: boolean
): void {
	const { glitch } = state;

	if (!allowGlitch) {
		glitch.timer = 0;
		if (glitch.isActive) {
			glitch.isActive = false;
			elements.coreGroup.position.set(0, 0, 0);
			elements.fragmentGroup.scale.set(1, 1, 1);
		}
		return;
	}

	glitch.timer += dt;

	const intensityFactor = Math.max(0.1, intensity);
	const baseInterval = 3.0 / intensityFactor;
	const randomFactor = 0.5 + Math.random();
	const glitchInterval = baseInterval * randomFactor;

	if (!glitch.isActive && glitch.timer > glitchInterval) {
		glitch.isActive = true;
		glitch.duration = 0.05 + Math.random() * 0.1 + intensity * 0.05;
		glitch.timer = 0;
	}

	if (glitch.isActive) {
		glitch.duration -= dt;

		const displaceMult = intensity * 0.5;
		elements.coreGroup.position.set(
			(Math.random() - 0.5) * 0.05 * displaceMult,
			(Math.random() - 0.5) * 0.05 * displaceMult,
			(Math.random() - 0.5) * 0.03 * displaceMult
		);

		const scatterAmount = 1.0 + (Math.random() - 0.5) * intensity * 0.15;
		elements.fragmentGroup.scale.setScalar(scatterAmount);

		elements.rings.forEach((ring, i) => {
			const baseOpacity = 0.5 + i * 0.15;
			const flickerRange = intensity * 0.2;
			ring.material.opacity = baseOpacity * (1 - flickerRange + Math.random() * flickerRange * 2);
		});

		if (glitch.duration <= 0) {
			glitch.isActive = false;
			elements.coreGroup.position.set(0, 0, 0);
			elements.fragmentGroup.scale.set(1, 1, 1);
			elements.rings.forEach((ring, i) => {
				ring.material.opacity = 0.5 + i * 0.15;
			});
		}
	}
}

import type { SceneElements } from "../scene/create-scene-elements";
import type { RigState } from "../state/rig-state";
import { clamp01, lerpColor } from "../utils/math";

export function updateEye(elements: SceneElements, state: RigState, dt: number, intensity: number): void {
	const { phase, audio, typing, reasoning, tool, theme } = state;

	const eyeSpeed = 1.5 + intensity * 4;
	phase.eyePulse += dt * eyeSpeed;
	const effortPulse = Math.pow(reasoning.powerPulse, 1.35);
	const eyePulseAmount = 0.1 + intensity * 0.3 + typing.pulse * 0.1;
	const eyePulse = 0.9 + Math.sin(phase.eyePulse) * eyePulseAmount;
	elements.eye.scale.setScalar(eyePulse * (1 + audio.surge * 0.02) * (1 - effortPulse * 0.34));

	const pupilSpeed = 2 + intensity * 5;
	phase.pupilPulse += dt * pupilSpeed;
	const pupilPulseAmount = 0.15 + intensity * 0.35 + typing.pulse * 0.15;
	const normalPupilBase = 0.8 + Math.sin(phase.pupilPulse) * pupilPulseAmount;
	const reasoningPupilDilation = 1.4;
	const pupilBase = normalPupilBase * (1 - reasoning.blend) + reasoningPupilDilation * reasoning.blend;
	elements.pupil.scale.setScalar(
		pupilBase * (1 + audio.current * 0.015 + audio.surge * 0.02) * (1 - effortPulse * 0.42)
	);

	if (tool.flashTimer > 0) {
		tool.flashTimer -= dt;
		const flashIntensity = clamp01(tool.flashTimer / 0.15);
		elements.eyeMat.color.setHex(lerpColor(theme.current.eye, tool.flashColor, flashIntensity));
		elements.pupilMat.color.setHex(lerpColor(theme.current.eye, tool.flashColor, flashIntensity));
	}

	elements.eyeMat.opacity = clamp01(0.85 + intensity * 0.15 + audio.current * 0.04 + audio.surge * 0.04);
	elements.pupilMat.opacity = clamp01(0.9 + intensity * 0.1 + audio.current * 0.03 + audio.surge * 0.04);
}

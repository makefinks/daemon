import type { SceneElements } from "../scene/create-scene-elements";
import type { RigState } from "../state/rig-state";
import { lerpColor } from "../utils/math";

export function updateThemeColors(elements: SceneElements, state: RigState, dt: number): void {
	const { theme, typing, tool } = state;

	const t = dt * 4;
	theme.current.primary = lerpColor(theme.current.primary, theme.target.primary, t);
	theme.current.glow = lerpColor(theme.current.glow, theme.target.glow, t);
	theme.current.eye = lerpColor(theme.current.eye, theme.target.eye, t);

	let displayPrimary = theme.current.primary;
	let displayEye = theme.current.eye;

	if (typing.pulse > 0.01) {
		const flashStrength = Math.pow(typing.pulse, 1.5) * 0.5;
		displayPrimary = lerpColor(displayPrimary, 0xffffff, flashStrength);
		displayEye = lerpColor(displayEye, 0xff8888, flashStrength * 0.3);
	}

	elements.glowMat.color.setHex(displayPrimary);
	if (tool.flashTimer <= 0) {
		elements.eyeMat.color.setHex(displayEye);
		elements.pupilMat.color.setHex(displayEye);
	}
	elements.pointLight.color.setHex(theme.current.glow);

	elements.rings.forEach((ring) => ring.material.color.setHex(displayPrimary));
	elements.fragments.forEach((frag) => frag.material.color.setHex(displayPrimary));
}

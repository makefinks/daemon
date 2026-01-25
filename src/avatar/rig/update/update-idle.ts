import type { SceneElements } from "../scene/create-scene-elements";
import type { RigState } from "../state/rig-state";

export function updateIdleAmbience(
	elements: SceneElements,
	state: RigState,
	dt: number,
	isIdle: boolean
): void {
	const { idleMicroGlitch, eyeDrift, particlePulse, coreDrift, typing } = state;

	if (isIdle) {
		idleMicroGlitch.timer += dt;
		if (!idleMicroGlitch.active && idleMicroGlitch.timer > idleMicroGlitch.cooldown) {
			idleMicroGlitch.active = true;
			idleMicroGlitch.duration = 0.08 + Math.random() * 0.12;
			idleMicroGlitch.timer = 0;
			idleMicroGlitch.cooldown = 3 + Math.random() * 5;
		}
		if (idleMicroGlitch.active) {
			idleMicroGlitch.duration -= dt;
			const jitterAmount = 0.06;
			elements.coreGroup.position.x += (Math.random() - 0.5) * jitterAmount;
			elements.coreGroup.position.y += (Math.random() - 0.5) * jitterAmount;
			if (idleMicroGlitch.duration <= 0) {
				idleMicroGlitch.active = false;
				elements.coreGroup.position.x = 0;
				elements.coreGroup.position.y = 0;
			}
		}
	} else {
		idleMicroGlitch.timer = 0;
		idleMicroGlitch.active = false;
	}

	if (typing.active) {
		typing.eyeScanTimer += dt;
		if (typing.eyeScanTimer > typing.eyeScanInterval) {
			typing.eyeScanTimer = 0;
			const scanWidth = 0.2;
			eyeDrift.targetX = (Math.random() - 0.5) * scanWidth;
			eyeDrift.targetY = (Math.random() - 0.5) * 0.05;
			typing.eyeScanInterval = 0.3 + Math.random() * 0.8;
		}
		const trackSpeed = 5;
		eyeDrift.x += (eyeDrift.targetX - eyeDrift.x) * dt * trackSpeed;
		eyeDrift.y += (eyeDrift.targetY - eyeDrift.y) * dt * trackSpeed;
	} else if (isIdle) {
		eyeDrift.timer += dt;
		if (eyeDrift.timer > eyeDrift.interval) {
			eyeDrift.timer = 0;
			const isFast = Math.random() > 0.4;
			eyeDrift.interval = isFast ? 0.15 + Math.random() * 0.25 : 2.0 + Math.random() * 3.0;
			eyeDrift.targetX = (Math.random() - 0.5) * 0.25;
			eyeDrift.targetY = (Math.random() - 0.5) * 0.15;
		}
		const interpSpeed = eyeDrift.interval < 0.5 ? 30 : 1.5;
		eyeDrift.x += (eyeDrift.targetX - eyeDrift.x) * dt * interpSpeed;
		eyeDrift.y += (eyeDrift.targetY - eyeDrift.y) * dt * interpSpeed;
	} else {
		eyeDrift.x += (0 - eyeDrift.x) * dt * 4;
		eyeDrift.y += (0 - eyeDrift.y) * dt * 4;
	}

	elements.eye.position.x = eyeDrift.x;
	elements.eye.position.y = eyeDrift.y;
	elements.pupil.position.x = eyeDrift.x;
	elements.pupil.position.y = eyeDrift.y;

	if (isIdle) {
		particlePulse.timer += dt;
		if (particlePulse.timer > particlePulse.interval) {
			particlePulse.timer = 0;
			particlePulse.interval = 1 + Math.random() * 2;
			particlePulse.brightness = 1.0;
		}
	}
	particlePulse.brightness = Math.max(0, particlePulse.brightness - dt * 1.5);

	const coreDriftSpeed = 0.4;
	const coreDriftAmount = 0.08;
	coreDrift.phaseX += dt * coreDriftSpeed;
	coreDrift.phaseY += dt * coreDriftSpeed * 0.7;
	coreDrift.phaseZ += dt * coreDriftSpeed * 0.5;

	const targetDriftX = Math.sin(coreDrift.phaseX) * coreDriftAmount;
	const targetDriftY = Math.sin(coreDrift.phaseY) * coreDriftAmount;
	const targetDriftZ = Math.sin(coreDrift.phaseZ) * coreDriftAmount * 0.5;

	coreDrift.x += (targetDriftX - coreDrift.x) * dt * 2;
	coreDrift.y += (targetDriftY - coreDrift.y) * dt * 2;
	coreDrift.z += (targetDriftZ - coreDrift.z) * dt * 2;

	elements.mainAnchor.position.set(coreDrift.x, coreDrift.y, coreDrift.z);
}

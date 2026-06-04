import type { SceneElements } from "../scene/create-scene-elements";
import type { RigState } from "../state/rig-state";
import { clamp01 } from "../utils/math";

import { STARTUP_AVATAR_SPAWN_DURATION_S } from "../../../ui/startup";

const SPAWN_DURATION = STARTUP_AVATAR_SPAWN_DURATION_S;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * clamp01(t);

/** Easing for jitter intensity - high at start, fades quickly */
function jitterEasing(t: number): number {
	return Math.pow(1 - t, 2);
}

function smoothstep(edge0: number, edge1: number, value: number): number {
	const t = clamp01((value - edge0) / (edge1 - edge0));
	return t * t * (3 - 2 * t);
}

function easeOutCubic(value: number): number {
	const t = clamp01(value);
	return 1 - Math.pow(1 - t, 3);
}

function easeInOutCubic(value: number): number {
	const t = clamp01(value);
	return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function multiplyOpacity(material: { opacity: number }, factor: number): void {
	material.opacity = clamp01(material.opacity * factor);
}

function signalFlicker(progress: number, elapsed: number): number {
	const instability = 1 - smoothstep(0.28, 0.92, progress);
	const dropout = Math.random() < instability * 0.18 ? instability * 0.55 : 0;
	const scan = 1 - Math.abs(Math.sin(elapsed * 80)) * instability * 0.18;
	return clamp01((1 - dropout) * scan);
}

function shimmerPulse(progress: number, elapsed: number): number {
	const active = smoothstep(0.04, 0.24, progress) * (1 - smoothstep(0.72, 1, progress));
	const fast = Math.sin(elapsed * 95) * 0.5 + 0.5;
	const slow = Math.sin(elapsed * 31 + 1.4) * 0.5 + 0.5;
	const staticFlash = Math.random() < active * 0.07 ? 1 : 0;
	return active * (0.18 + fast * 0.24 + slow * 0.14 + staticFlash * 0.25);
}

/**
 * Updates the spawn animation state and applies visual effects.
 * Returns the current spawn progress (0-1) for other systems to use.
 */
export function updateSpawn(elements: SceneElements, state: RigState, dt: number): number {
	const easedProgress = advanceSpawn(state, dt);
	applySpawn(elements, state);
	return easedProgress;
}

/**
 * Advances spawn timers/state (no rendering side effects).
 * Returns the eased progress (0-1).
 */
export function advanceSpawn(state: RigState, dt: number): number {
	if (state.spawn.complete) return 1;

	state.spawn.elapsed += dt;
	const rawProgress = Math.min(1, state.spawn.elapsed / SPAWN_DURATION);
	state.spawn.progress = rawProgress;
	state.spawn.glitchIntensity = jitterEasing(rawProgress);

	// Mark complete when done
	if (rawProgress >= 1) {
		state.spawn.complete = true;
		state.spawn.progress = 1;
		state.spawn.glitchIntensity = 0;
		return 1;
	}

	return rawProgress;
}

/**
 * Applies spawn animation effects to scene elements using current state.
 * Safe to call multiple times per frame.
 */
export function applySpawn(elements: SceneElements, state: RigState): void {
	if (state.spawn.complete) {
		if (!state.spawn.settled) {
			applySpawnSettled(elements);
			state.spawn.settled = true;
		}
		return;
	}

	const progress = state.spawn.progress;
	const elapsed = state.spawn.elapsed;
	const flicker = signalFlicker(progress, elapsed);
	const shimmer = shimmerPulse(progress, elapsed);

	const silhouette = smoothstep(0, 0.28, progress);
	const coreRise = easeOutCubic(smoothstep(0.02, 0.46, progress));
	const solidCore = smoothstep(0.08, 0.62, progress);
	const ringReveal = easeOutCubic(smoothstep(0.12, 0.7, progress));
	const fragmentReveal = easeInOutCubic(smoothstep(0.08, 0.9, progress));
	const eyeReveal = smoothstep(0.62, 0.9, progress);
	const settle = smoothstep(0.72, 1, progress);

	// Keep the avatar's origin locked to its idle pose; the intro should not snap position when it settles.
	elements.coreGroup.position.set(0, 0, 0);
	elements.coreGroup.rotation.x = (1 - settle) * -0.35;
	elements.coreGroup.rotation.y = (1 - settle) * 0.45;
	elements.coreGroup.rotation.z = (1 - settle) * -0.8;
	elements.coreGroup.scale.multiplyScalar(lerp(1.04, 1, coreRise));

	const coreOvershoot = Math.sin(settle * Math.PI) * 0.08;
	const coreSolidScale = lerp(1.08, 1, solidCore) + coreOvershoot;
	elements.coreMesh.scale.x *= coreSolidScale;
	elements.coreMesh.scale.y *= coreSolidScale;
	elements.coreMesh.scale.z *= coreSolidScale;

	const glowScale = lerp(1.45, 1, coreRise);
	elements.glowMesh.scale.x *= glowScale;
	elements.glowMesh.scale.y *= glowScale;
	elements.glowMesh.scale.z *= glowScale;
	elements.glowMesh.scale.multiplyScalar(1 + shimmer * 0.04);
	multiplyOpacity(elements.glowMat, lerp(0.35, 1, silhouette) * flicker * (1 + shimmer * 0.35));
	elements.pointLight.intensity = Math.max(
		0,
		lerp(0.04, 0.8, silhouette) + Math.sin(elapsed * 22) * (1 - settle) * 0.08 + shimmer * 0.28
	);

	elements.orbitGroup.rotation.x = (1 - settle) * 1.1;
	elements.orbitGroup.rotation.y = (1 - settle) * -0.85;
	elements.orbitGroup.rotation.z = (1 - settle) * 0.5;
	elements.orbitGroup.scale.multiplyScalar(lerp(1.18, 1, ringReveal));
	elements.rings.forEach((ring, i) => {
		const ringScale = lerp(1.14 + i * 0.04, 1, ringReveal);
		ring.mesh.scale.setScalar(ringScale + shimmer * (0.02 + i * 0.006));
		ring.material.opacity = clamp01(ring.material.opacity * ringReveal * flicker * (1 + shimmer * 0.45));
	});

	const fragmentScatter = lerp(2.4, 1, fragmentReveal);
	elements.fragmentGroup.rotation.x = (1 - settle) * -0.25;
	elements.fragmentGroup.rotation.y = (1 - settle) * 1.35;
	elements.fragmentGroup.scale.multiplyScalar(fragmentScatter);
	elements.fragments.forEach((fragment, i) => {
		const shardDelay = Math.min(0.18, i * 0.012);
		const shardReveal = easeOutCubic(smoothstep(0.18 + shardDelay, 0.9, progress));
		fragment.mesh.scale.setScalar(lerp(0.85, 1, shardReveal) + shimmer * 0.016);
		fragment.material.opacity = clamp01(
			fragment.material.opacity * shardReveal * flicker * (1 + shimmer * 0.3)
		);
	});

	const particleReveal = smoothstep(0, 0.58, progress);
	elements.particleSystem.scale.setScalar(lerp(1.8, 1, fragmentReveal));
	multiplyOpacity(elements.particleMat, lerp(0.35, 1, particleReveal) * flicker * (1 + shimmer * 0.55));
	elements.particleMat.size *= lerp(1.9, 1, settle) + shimmer * 0.28;

	elements.sigilLines.scale.setScalar(fragmentScatter);
	multiplyOpacity(elements.sigilMat, smoothstep(0.34, 0.96, progress) * flicker * (1 + shimmer * 0.5));

	const eyeFlash = eyeReveal * lerp(0.72, 1, flicker);
	elements.eye.scale.multiplyScalar(lerp(0.7, 1, eyeReveal) + Math.sin(settle * Math.PI) * 0.18);
	elements.pupil.scale.multiplyScalar(lerp(0.45, 1, eyeReveal) + Math.sin(settle * Math.PI) * 0.08);
	multiplyOpacity(elements.eyeMat, eyeFlash * (1 + shimmer * 0.22));
	multiplyOpacity(elements.pupilMat, smoothstep(0.7, 0.94, progress) * flicker * (1 + shimmer * 0.22));
}

function applySpawnSettled(elements: SceneElements): void {
	elements.coreGroup.position.set(0, 0, 0);
	elements.coreGroup.rotation.set(0, 0, 0);
	elements.orbitGroup.rotation.set(0, 0, 0);
	elements.fragmentGroup.rotation.set(0, 0, 0);
	elements.particleSystem.scale.setScalar(1);
	elements.sigilLines.scale.setScalar(1);
	elements.pointLight.intensity = 0.8;
	elements.rings.forEach((ring) => ring.mesh.scale.setScalar(1));
	elements.fragments.forEach((fragment) => fragment.mesh.scale.setScalar(1));
}

/**
 * Resets spawn state for a fresh spawn animation.
 */
export function resetSpawnState(state: RigState): void {
	state.spawn.progress = 0;
	state.spawn.elapsed = 0;
	state.spawn.complete = false;
	state.spawn.settled = false;
	state.spawn.glitchIntensity = 1;
}

/**
 * Skips spawn animation and sets everything to fully spawned.
 */
export function skipSpawnAnimation(state: RigState): void {
	state.spawn.progress = 1;
	state.spawn.elapsed = SPAWN_DURATION;
	state.spawn.complete = true;
	state.spawn.settled = false;
	state.spawn.glitchIntensity = 0;
}

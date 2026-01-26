import type { SceneElements } from "../scene/create-scene-elements";
import type { RigState } from "../state/rig-state";

import { STARTUP_BANNER_DURATION_S } from "../../../ui/startup";

const SPAWN_DURATION = STARTUP_BANNER_DURATION_S;

/** Easing for jitter intensity - high at start, fades quickly */
function jitterEasing(t: number): number {
	return Math.pow(1 - t, 2);
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
	// Minimal startup effect: jitter only (synced to banner reveal duration).
	if (state.spawn.complete) {
		elements.coreGroup.position.x = 0;
		elements.coreGroup.position.y = 0;
		return;
	}

	const jitterAmount = state.spawn.glitchIntensity * 0.15;
	const jitterX = (Math.random() - 0.5) * jitterAmount;
	const jitterY = (Math.random() - 0.5) * jitterAmount;
	elements.coreGroup.position.x = jitterX;
	elements.coreGroup.position.y = jitterY;
}

/**
 * Resets spawn state for a fresh spawn animation.
 */
export function resetSpawnState(state: RigState): void {
	state.spawn.progress = 0;
	state.spawn.elapsed = 0;
	state.spawn.complete = false;
	state.spawn.glitchIntensity = 1;
}

/**
 * Skips spawn animation and sets everything to fully spawned.
 */
export function skipSpawnAnimation(state: RigState): void {
	state.spawn.progress = 1;
	state.spawn.elapsed = SPAWN_DURATION;
	state.spawn.complete = true;
	state.spawn.glitchIntensity = 0;
}

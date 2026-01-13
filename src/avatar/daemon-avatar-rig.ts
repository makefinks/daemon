/**
 * If you have opened this file to understand it, this is your friendly suggestion to leave and forget this file existed.
 * This file is a messy god component that requires refractoring and is a result of multiple LLM atrocities.
 */

import { THREE } from "@opentui/core/3d";
import type { AvatarColorTheme } from "../types";

// Re-export for consumers that expect DaemonColorTheme
export type { AvatarColorTheme as DaemonColorTheme } from "../types";

export type ToolCategory = "web" | "file" | "bash" | "subagent";

export const TOOL_CATEGORY_COLORS: Record<ToolCategory, number> = {
	web: 0x22d3ee,
	file: 0x4ade80,
	bash: 0xfbbf24,
	subagent: 0xa78bfa,
};

export interface DaemonRig {
	scene: THREE.Scene;
	camera: THREE.PerspectiveCamera;
	update(deltaS: number): void;
	setColors(theme: AvatarColorTheme): void;
	setIntensity(intensity: number, options?: { immediate?: boolean }): void;
	setAudioLevel(level: number, options?: { immediate?: boolean }): void;
	/** Set whether a tool is currently active (affects sigil lines and ambient state) */
	setToolActive(active: boolean, category?: ToolCategory): void;
	/** Trigger eye flash and fragment scatter burst when tool is invoked */
	triggerToolFlash(category?: ToolCategory): void;
	/** Trigger settle animation when tool completes */
	triggerToolComplete(): void;
	/** Set reasoning mode - activates contemplative animations (slow pulse, dilated pupil, inward drift) */
	setReasoningMode(active: boolean): void;
	/** Set typing mode - activates eye micro-tracking */
	setTypingMode(active: boolean): void;
	/** Trigger a subtle pulse/reaction for a typing keystroke */
	triggerTypingPulse(): void;
	dispose(): void;
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const clamp01 = (value: number): number => clamp(value, 0, 1);

function lerpColor(current: number, target: number, t: number): number {
	const cr = (current >> 16) & 0xff;
	const cg = (current >> 8) & 0xff;
	const cb = current & 0xff;
	const tr = (target >> 16) & 0xff;
	const tg = (target >> 8) & 0xff;
	const tb = target & 0xff;
	return (
		(Math.round(cr + (tr - cr) * t) << 16) |
		(Math.round(cg + (tg - cg) * t) << 8) |
		Math.round(cb + (tb - cb) * t)
	);
}

// ═══════════════════════════════════════════════════════════════════════════
// STATE INTERFACES - Grouped for maintainability
// ═══════════════════════════════════════════════════════════════════════════

interface PhaseState {
	drift: number;
	corePulse: number;
	eyePulse: number;
	pupilPulse: number;
	sigilPulse: number;
}

interface IntensityState {
	current: number;
	target: number;
	spinBoost: number;
}

interface AudioState {
	current: number;
	target: number;
}

interface GlitchState {
	timer: number;
	isActive: boolean;
	duration: number;
}

interface ToolState {
	active: boolean;
	flashTimer: number;
	flashColor: number;
	fragmentScatterBoost: number;
	sigilBrightnessBoost: number;
	settleTimer: number;
}

interface ReasoningState {
	active: boolean;
	blend: number;
}

interface TypingState {
	active: boolean;
	pulse: number;
	eyeScanTimer: number;
	eyeScanInterval: number;
}

interface IdleMicroGlitchState {
	timer: number;
	cooldown: number;
	active: boolean;
	duration: number;
}

interface EyeDriftState {
	x: number;
	y: number;
	targetX: number;
	targetY: number;
	timer: number;
	interval: number;
}

interface ParticlePulseState {
	timer: number;
	interval: number;
	brightness: number;
}

interface CoreDriftState {
	x: number;
	y: number;
	z: number;
	phaseX: number;
	phaseY: number;
	phaseZ: number;
}

interface ThemeState {
	current: AvatarColorTheme;
	target: AvatarColorTheme;
}

// ═══════════════════════════════════════════════════════════════════════════
// RING & FRAGMENT DATA STRUCTURES
// ═══════════════════════════════════════════════════════════════════════════

interface RingData {
	mesh: THREE.Line;
	material: THREE.LineBasicMaterial;
	speed: number;
	axis: THREE.Vector3;
	phase: number;
	wobblePhase: number;
}

interface FragmentData {
	mesh: THREE.Mesh;
	material: THREE.MeshBasicMaterial;
	orbitRadius: number;
	orbitSpeed: number;
	orbitAngle: number;
	bobSpeed: number;
	bobPhase: number;
}

interface ParticleVelocity {
	x: number;
	y: number;
	z: number;
	phase: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// SCENE ELEMENTS INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

interface SceneElements {
	mainAnchor: THREE.Group;
	coreGroup: THREE.Group;
	orbitGroup: THREE.Group;
	fragmentGroup: THREE.Group;
	coreMesh: THREE.Mesh;
	glowMesh: THREE.Mesh;
	glowMat: THREE.MeshBasicMaterial;
	eye: THREE.Mesh;
	eyeMat: THREE.MeshBasicMaterial;
	pupil: THREE.Mesh;
	pupilMat: THREE.MeshBasicMaterial;
	rings: RingData[];
	fragments: FragmentData[];
	particleSystem: THREE.Points;
	particleMat: THREE.PointsMaterial;
	particlePos: THREE.BufferAttribute;
	particleVelocities: ParticleVelocity[];
	sigilLines: THREE.LineSegments;
	sigilMat: THREE.LineBasicMaterial;
	sigilPos: THREE.BufferAttribute;
	pointLight: THREE.PointLight;
}

// ═══════════════════════════════════════════════════════════════════════════
// SCENE CONSTRUCTION
// ═══════════════════════════════════════════════════════════════════════════

function createSceneElements(
	scene: THREE.Scene,
	trackGeo: <T extends THREE.BufferGeometry>(g: T) => T,
	trackMat: <T extends THREE.Material>(m: T) => T
): SceneElements {
	const mainAnchor = new THREE.Group();
	scene.add(mainAnchor);

	const coreGroup = new THREE.Group();
	mainAnchor.add(coreGroup);

	const orbitGroup = new THREE.Group();
	mainAnchor.add(orbitGroup);

	const fragmentGroup = new THREE.Group();
	mainAnchor.add(fragmentGroup);

	// ─────────────────────────────────────────────────────────────────────
	// THE CORE - A pulsing void at the center
	// ─────────────────────────────────────────────────────────────────────
	const coreGeo = trackGeo(new THREE.IcosahedronGeometry(0.35, 0));
	const coreMat = trackMat(
		new THREE.MeshBasicMaterial({
			color: 0x000000,
			transparent: true,
			opacity: 0.95,
		})
	);
	const coreMesh = new THREE.Mesh(coreGeo, coreMat);
	coreGroup.add(coreMesh);

	// Inner glow sphere
	const glowGeo = trackGeo(new THREE.IcosahedronGeometry(0.38, 1));
	const glowMat = trackMat<THREE.MeshBasicMaterial>(
		new THREE.MeshBasicMaterial({
			color: 0x666666,
			wireframe: true,
			transparent: true,
			opacity: 0.6,
			blending: THREE.AdditiveBlending,
		})
	);
	const glowMesh = new THREE.Mesh(glowGeo, glowMat);
	coreGroup.add(glowMesh);

	// ─────────────────────────────────────────────────────────────────────
	// THE EYE - Single cyclopean sensor
	// ─────────────────────────────────────────────────────────────────────
	const eyeGeo = trackGeo(new THREE.RingGeometry(0.08, 0.16, 6));
	const eyeMat = trackMat<THREE.MeshBasicMaterial>(
		new THREE.MeshBasicMaterial({
			color: 0xffffff,
			side: THREE.DoubleSide,
			transparent: true,
			opacity: 1.0,
			blending: THREE.AdditiveBlending,
		})
	);
	const eye = new THREE.Mesh(eyeGeo, eyeMat);
	eye.position.set(0, 0, 0.36);
	coreGroup.add(eye);

	// Inner pupil
	const pupilGeo = trackGeo(new THREE.CircleGeometry(0.06, 6));
	const pupilMat = trackMat<THREE.MeshBasicMaterial>(
		new THREE.MeshBasicMaterial({
			color: 0xffffff,
			transparent: true,
			opacity: 1.0,
			blending: THREE.AdditiveBlending,
		})
	);
	const pupil = new THREE.Mesh(pupilGeo, pupilMat);
	pupil.position.set(0, 0, 0.37);
	coreGroup.add(pupil);

	// ─────────────────────────────────────────────────────────────────────
	// ORBITING GEOMETRY - Arcane rings and fragments
	// ─────────────────────────────────────────────────────────────────────
	const rings: RingData[] = [];

	for (let i = 0; i < 3; i++) {
		const radius = 0.7 + i * 0.25;
		const segments = 32;
		const points: THREE.Vector3[] = [];

		for (let j = 0; j <= segments; j++) {
			const theta = (j / segments) * Math.PI * 2;
			// Add gaps in the ring for that broken/glitchy feel
			if (j % 8 < 6 || i === 1) {
				points.push(new THREE.Vector3(Math.cos(theta) * radius, Math.sin(theta) * radius, 0));
			}
		}

		const geo = trackGeo(new THREE.BufferGeometry().setFromPoints(points));
		const mat = trackMat<THREE.LineBasicMaterial>(
			new THREE.LineBasicMaterial({
				color: 0x888888,
				transparent: true,
				opacity: 0.5 + i * 0.15,
				blending: THREE.AdditiveBlending,
			})
		);

		const ring = new THREE.Line(geo, mat);

		// Tilt each ring differently
		ring.rotation.x = (i * Math.PI) / 3 + Math.random() * 0.3;
		ring.rotation.y = (i * Math.PI) / 4;

		rings.push({
			mesh: ring,
			material: mat,
			speed: 0.3 + i * 0.15,
			axis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
			phase: Math.random() * Math.PI * 2,
			wobblePhase: Math.random() * Math.PI * 2,
		});
		orbitGroup.add(ring);
	}

	// ─────────────────────────────────────────────────────────────────────
	// FLOATING FRAGMENTS - Shattered pieces of alien geometry
	// ─────────────────────────────────────────────────────────────────────
	const fragments: FragmentData[] = [];
	const fragmentCount = 12;

	for (let i = 0; i < fragmentCount; i++) {
		let geo: THREE.BufferGeometry;
		const shapeType = i % 4;
		const size = 0.08 + Math.random() * 0.06;

		switch (shapeType) {
			case 0:
				geo = trackGeo(new THREE.TetrahedronGeometry(size));
				break;
			case 1:
				geo = trackGeo(new THREE.OctahedronGeometry(size));
				break;
			case 2:
				geo = trackGeo(new THREE.BoxGeometry(size, size * 0.3, size * 0.3));
				break;
			default:
				geo = trackGeo(new THREE.IcosahedronGeometry(size * 0.7, 0));
		}

		const mat = trackMat<THREE.MeshBasicMaterial>(
			new THREE.MeshBasicMaterial({
				color: 0x666666,
				wireframe: Math.random() > 0.5,
				transparent: true,
				opacity: 0.6 + Math.random() * 0.3,
				blending: THREE.AdditiveBlending,
			})
		);

		const mesh = new THREE.Mesh(geo, mat);

		const orbitRadius = 1.6;
		const orbitOffset = (i / fragmentCount) * Math.PI * 2;

		mesh.position.set(
			Math.cos(orbitOffset) * orbitRadius,
			(Math.random() - 0.5) * 0.4,
			Math.sin(orbitOffset) * orbitRadius
		);

		mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

		fragments.push({
			mesh,
			material: mat,
			orbitRadius,
			orbitSpeed: 0.4,
			orbitAngle: orbitOffset,
			bobSpeed: 1 + Math.random() * 1.5,
			bobPhase: Math.random() * Math.PI * 2,
		});
		fragmentGroup.add(mesh);
	}

	// ─────────────────────────────────────────────────────────────────────
	// GLITCH PARTICLES - Digital noise in the void
	// ─────────────────────────────────────────────────────────────────────
	const particleCount = 60;
	const pGeo = trackGeo(new THREE.BufferGeometry());
	const pPos = new Float32Array(particleCount * 3);
	const particleVelocities: ParticleVelocity[] = [];

	for (let i = 0; i < particleCount; i++) {
		const r = 1.5 + Math.random() * 2.5;
		const theta = Math.random() * Math.PI * 2;
		const phi = Math.acos(Math.random() * 2 - 1);

		pPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
		pPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
		pPos[i * 3 + 2] = r * Math.cos(phi);

		particleVelocities.push({
			x: (Math.random() - 0.5) * 0.15,
			y: (Math.random() - 0.5) * 0.15,
			z: (Math.random() - 0.5) * 0.15,
			phase: Math.random() * Math.PI * 2,
		});
	}

	pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
	const particleMat = trackMat<THREE.PointsMaterial>(
		new THREE.PointsMaterial({
			color: 0x888888,
			size: 0.025,
			transparent: true,
			opacity: 0.5,
			blending: THREE.AdditiveBlending,
		})
	);
	const particleSystem = new THREE.Points(pGeo, particleMat);
	scene.add(particleSystem);
	const particlePos = particleSystem.geometry.attributes.position as THREE.BufferAttribute;

	// ─────────────────────────────────────────────────────────────────────
	// SIGIL LINES - Connecting fragments like a constellation
	// ─────────────────────────────────────────────────────────────────────
	const sigilGeo = trackGeo(new THREE.BufferGeometry());
	const sigilPositions = new Float32Array(fragmentCount * 2 * 3);
	sigilGeo.setAttribute("position", new THREE.BufferAttribute(sigilPositions, 3));

	const sigilMat = trackMat<THREE.LineBasicMaterial>(
		new THREE.LineBasicMaterial({
			color: 0x444444,
			transparent: true,
			opacity: 0.3,
			blending: THREE.AdditiveBlending,
		})
	);
	const sigilLines = new THREE.LineSegments(sigilGeo, sigilMat);
	scene.add(sigilLines);
	const sigilPos = sigilLines.geometry.attributes.position as THREE.BufferAttribute;

	// Central light
	const pointLight = new THREE.PointLight(0xffffff, 0.8, 6);
	pointLight.position.set(0, 0, 0.5);
	coreGroup.add(pointLight);

	return {
		mainAnchor,
		coreGroup,
		orbitGroup,
		fragmentGroup,
		coreMesh,
		glowMesh,
		glowMat,
		eye,
		eyeMat,
		pupil,
		pupilMat,
		rings,
		fragments,
		particleSystem,
		particleMat,
		particlePos,
		particleVelocities,
		sigilLines,
		sigilMat,
		sigilPos,
		pointLight,
	};
}

// ═══════════════════════════════════════════════════════════════════════════
// STATE FACTORY
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_THEME: AvatarColorTheme = {
	primary: 0x9ca3af,
	glow: 0x67e8f9,
	eye: 0xff0000,
};

function createInitialState() {
	return {
		phase: {
			drift: 0,
			corePulse: 0,
			eyePulse: 0,
			pupilPulse: 0,
			sigilPulse: 0,
		} as PhaseState,

		intensity: {
			current: 0,
			target: 0,
			spinBoost: 0,
		} as IntensityState,

		audio: {
			current: 0,
			target: 0,
		} as AudioState,

		glitch: {
			timer: 0,
			isActive: false,
			duration: 0,
		} as GlitchState,

		tool: {
			active: false,
			flashTimer: 0,
			flashColor: 0xffffff,
			fragmentScatterBoost: 0,
			sigilBrightnessBoost: 0,
			settleTimer: 0,
		} as ToolState,

		reasoning: {
			active: false,
			blend: 0,
		} as ReasoningState,

		typing: {
			active: false,
			pulse: 0,
			eyeScanTimer: 0,
			eyeScanInterval: 0.5,
		} as TypingState,

		idleMicroGlitch: {
			timer: 0,
			cooldown: 3 + Math.random() * 5,
			active: false,
			duration: 0,
		} as IdleMicroGlitchState,

		eyeDrift: {
			x: 0,
			y: 0,
			targetX: 0,
			targetY: 0,
			timer: 0,
			interval: 1.5 + Math.random() * 2,
		} as EyeDriftState,

		particlePulse: {
			timer: 0,
			interval: 1 + Math.random() * 2,
			brightness: 0,
		} as ParticlePulseState,

		coreDrift: {
			x: 0,
			y: 0,
			z: 0,
			phaseX: Math.random() * Math.PI * 2,
			phaseY: Math.random() * Math.PI * 2,
			phaseZ: Math.random() * Math.PI * 2,
		} as CoreDriftState,

		theme: {
			current: { ...DEFAULT_THEME },
			target: { ...DEFAULT_THEME },
		} as ThemeState,
	};
}

type RigState = ReturnType<typeof createInitialState>;

// ═══════════════════════════════════════════════════════════════════════════
// UPDATE SUBSYSTEMS - Each handles a specific aspect of the animation
// ═══════════════════════════════════════════════════════════════════════════

function updateIntensityAndAudio(state: RigState, dt: number): number {
	const { intensity, audio, typing, reasoning } = state;

	typing.pulse = Math.max(0, typing.pulse - dt * 5);

	// Faster decay than rise so avatar "calms down" quickly when returning to IDLE
	const intensityRate = intensity.target > intensity.current ? 10 : 8;
	intensity.current += (intensity.target - intensity.current) * dt * intensityRate;

	intensity.spinBoost += (0 - intensity.spinBoost) * dt * 2.5;
	audio.current += (audio.target - audio.current) * dt * 25;
	reasoning.blend += ((reasoning.active ? 1 : 0) - reasoning.blend) * dt * 6;

	return intensity.current;
}

function updateMainAnchor(elements: SceneElements, state: RigState, dt: number, intensity: number): void {
	const { phase, audio } = state;

	const driftSpeed = 0.08 + intensity * 0.3;
	phase.drift += dt * driftSpeed;
	const driftAmount = 0.03 + intensity * 0.12;

	elements.mainAnchor.rotation.y = Math.sin(phase.drift) * driftAmount;
	elements.mainAnchor.rotation.x = Math.sin(phase.drift * 0.7) * driftAmount * 0.5;
	elements.mainAnchor.rotation.z = Math.sin(phase.drift * 0.5) * intensity * 0.08;
	elements.mainAnchor.scale.setScalar(1 + audio.current * 0.12);
}

function updateCore(elements: SceneElements, state: RigState, dt: number, intensity: number): void {
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

	// Core squash-stretch - vertical stretch based on audio amplitude
	const squashStretch = 1 + audio.current * 0.15;
	elements.coreMesh.scale.set(1, squashStretch, 1);
	elements.glowMesh.scale.y *= squashStretch;
}

function updateEye(elements: SceneElements, state: RigState, dt: number, intensity: number): void {
	const { phase, audio, typing, reasoning, tool, theme } = state;

	const eyeSpeed = 1.5 + intensity * 4;
	phase.eyePulse += dt * eyeSpeed;
	const eyePulseAmount = 0.1 + intensity * 0.3 + typing.pulse * 0.1;
	const eyePulse = 0.9 + Math.sin(phase.eyePulse) * eyePulseAmount;
	elements.eye.scale.setScalar(eyePulse * (1 + audio.current * 0.1));

	const pupilSpeed = 2 + intensity * 5;
	phase.pupilPulse += dt * pupilSpeed;
	const pupilPulseAmount = 0.15 + intensity * 0.35 + typing.pulse * 0.15;
	const normalPupilBase = 0.8 + Math.sin(phase.pupilPulse) * pupilPulseAmount;
	const reasoningPupilDilation = 1.4;
	const pupilBase = normalPupilBase * (1 - reasoning.blend) + reasoningPupilDilation * reasoning.blend;
	elements.pupil.scale.setScalar(pupilBase * (1 + audio.current * 0.08));

	if (tool.flashTimer > 0) {
		tool.flashTimer -= dt;
		const flashIntensity = clamp01(tool.flashTimer / 0.15);
		elements.eyeMat.color.setHex(lerpColor(theme.current.eye, tool.flashColor, flashIntensity));
		elements.pupilMat.color.setHex(lerpColor(theme.current.eye, tool.flashColor, flashIntensity));
	}

	elements.eyeMat.opacity = clamp01(0.85 + intensity * 0.15 + audio.current * 0.15);
	elements.pupilMat.opacity = clamp01(0.9 + intensity * 0.1 + audio.current * 0.1);
}

function updateRings(elements: SceneElements, state: RigState, dt: number, intensity: number): void {
	const { audio, intensity: intensityState } = state;

	// Scale the entire orbit group based on intensity
	const orbitScale = 0.75 + intensity * 0.4;
	elements.orbitGroup.scale.setScalar(orbitScale);

	elements.rings.forEach((ring, i) => {
		// Use a gentle curve so small intensity changes don't disproportionately increase angular velocity
		const ringIntensity = Math.pow(intensity, 1.35);
		const ringSpeed = ring.speed * (0.4 + ringIntensity * 1.5) + intensityState.spinBoost * (1 + i * 0.2);
		ring.mesh.rotateOnAxis(ring.axis, dt * ringSpeed);

		// Ring wobble with audio - oscillatory wobble around perpendicular axes
		const wobbleSpeed = 3 + i * 0.5;
		ring.wobblePhase += dt * wobbleSpeed;
		const wobbleAmount = audio.current * 0.06;
		const wobbleX = Math.sin(ring.wobblePhase) * wobbleAmount;
		const wobbleZ = Math.cos(ring.wobblePhase * 1.3) * wobbleAmount;
		ring.mesh.rotation.x += wobbleX;
		ring.mesh.rotation.z += wobbleZ;

		// Update opacity phase
		const phaseSpeed = 1 + intensity * 3;
		ring.phase += dt * phaseSpeed;

		// Ring opacity: visible in idle, bright when active
		const baseOpacity = 0.4 + intensity * 0.4 + i * 0.1;
		if (intensity > 0.1) {
			const wave = Math.sin(ring.phase + i * 1.5) * 0.2 * intensity;
			ring.material.opacity = clamp01(baseOpacity + wave + audio.current * 0.25);
		} else {
			ring.material.opacity = clamp01(baseOpacity + audio.current * 0.25);
		}
	});
}

function updateFragments(elements: SceneElements, state: RigState, dt: number, intensity: number): void {
	const { audio, tool, reasoning, intensity: intensityState } = state;

	// Decay tool effects
	tool.fragmentScatterBoost += (0 - tool.fragmentScatterBoost) * dt * 6;
	tool.settleTimer = Math.max(0, tool.settleTimer - dt);

	const settleContraction = tool.settleTimer > 0 ? Math.sin(tool.settleTimer * 20) * 0.08 : 0;
	const reasoningContraction = reasoning.blend * 0.25;
	const fragmentScale =
		0.5 + intensity * 0.6 + tool.fragmentScatterBoost - settleContraction - reasoningContraction;
	elements.fragmentGroup.scale.setScalar(fragmentScale);

	elements.fragments.forEach((frag) => {
		const reasoningOrbitSlowdown = 1 - reasoning.blend * 0.6;
		// Audio-modulated orbit speed - fragments orbit faster with audio
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

		// Tumble speed
		const tumbleSpeed = 0.1 + intensity * 0.5;
		frag.mesh.rotation.x += dt * tumbleSpeed;
		frag.mesh.rotation.y += dt * tumbleSpeed * 1.5;

		// Fragment opacity
		frag.material.opacity = clamp01(0.45 + intensity * 0.4 + audio.current * 0.22);
	});
}

function updateSigils(elements: SceneElements, state: RigState, dt: number, intensity: number): void {
	const { phase, audio, tool } = state;

	// Update sigil line positions (connect fragments)
	for (let i = 0; i < elements.fragments.length; i++) {
		const curr = elements.fragments[i]!;
		const next = elements.fragments[(i + 1) % elements.fragments.length]!;

		elements.sigilPos.setXYZ(i * 2, curr.mesh.position.x, curr.mesh.position.y, curr.mesh.position.z);
		elements.sigilPos.setXYZ(i * 2 + 1, next.mesh.position.x, next.mesh.position.y, next.mesh.position.z);
	}
	elements.sigilPos.needsUpdate = true;

	// Sigil opacity with tool brightness boost
	const sigilPulseSpeed = 1 + intensity * 2;
	phase.sigilPulse += dt * sigilPulseSpeed;

	tool.sigilBrightnessBoost += ((tool.active ? 1 : 0) - tool.sigilBrightnessBoost) * dt * 8;

	const sigilBaseOpacity = 0.2 + intensity * 0.2 + tool.sigilBrightnessBoost * 0.5;
	const sigilPulseAmount = 0.05 + intensity * 0.12;
	elements.sigilMat.opacity = clamp01(
		sigilBaseOpacity + Math.sin(phase.sigilPulse) * sigilPulseAmount + audio.current * 0.2
	);
}

function updateParticles(
	elements: SceneElements,
	state: RigState,
	dt: number,
	intensity: number,
	allowGlitch: boolean
): void {
	const { audio, particlePulse } = state;
	const particleCount = elements.particleVelocities.length;

	const glitchChance = allowGlitch ? 0.0002 + intensity * 0.006 : 0;
	// Particle dance intensity - velocity multiplier increases with audio
	const audioJitterBoost = 1 + audio.current * 0.8;
	const particleSpeedMult = (0.3 + intensity * 1.2) * audioJitterBoost;

	for (let i = 0; i < particleCount; i++) {
		const vel = elements.particleVelocities[i]!;
		let x = elements.particlePos.getX(i) + vel.x * dt * particleSpeedMult;
		let y = elements.particlePos.getY(i) + vel.y * dt * particleSpeedMult;
		let z = elements.particlePos.getZ(i) + vel.z * dt * particleSpeedMult;

		// Occasional teleport glitch
		if (Math.random() < glitchChance) {
			const r = 1.5 + Math.random() * 2;
			const theta = Math.random() * Math.PI * 2;
			const phi = Math.acos(Math.random() * 2 - 1);
			x = r * Math.sin(phi) * Math.cos(theta);
			y = r * Math.sin(phi) * Math.sin(theta);
			z = r * Math.cos(phi);
		}

		// Boundary wrap
		const distSq = x * x + y * y + z * z;
		if (distSq > 20) {
			x *= -0.8;
			y *= -0.8;
			z *= -0.8;
		}

		elements.particlePos.setXYZ(i, x, y, z);
	}
	elements.particlePos.needsUpdate = true;

	// Particle appearance
	const idleParticleBoost = particlePulse.brightness * 0.4;
	elements.particleMat.opacity = clamp01(0.3 + intensity * 0.4 + audio.current * 0.25 + idleParticleBoost);
	elements.particleMat.size =
		0.02 + intensity * 0.015 + audio.current * 0.01 + particlePulse.brightness * 0.02;
}

function updateGlitchBehavior(
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

function updateIdleAmbience(elements: SceneElements, state: RigState, dt: number, isIdle: boolean): void {
	const { idleMicroGlitch, eyeDrift, particlePulse, coreDrift, typing } = state;

	// ─────────────────────────────────────────────────────────────────────
	// Idle micro-glitches
	// ─────────────────────────────────────────────────────────────────────
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

	// ─────────────────────────────────────────────────────────────────────
	// Eye drift behavior (typing mode, idle, or centering)
	// ─────────────────────────────────────────────────────────────────────
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
			// Frequent scary fast snaps (60%) mixed with slow drifting
			const isFast = Math.random() > 0.4;
			eyeDrift.interval = isFast ? 0.15 + Math.random() * 0.25 : 2.0 + Math.random() * 3.0;
			eyeDrift.targetX = (Math.random() - 0.5) * 0.25;
			eyeDrift.targetY = (Math.random() - 0.5) * 0.15;
		}
		// Scary fast snap (30x) vs very slow drift (1.5x)
		const interpSpeed = eyeDrift.interval < 0.5 ? 30 : 1.5;
		eyeDrift.x += (eyeDrift.targetX - eyeDrift.x) * dt * interpSpeed;
		eyeDrift.y += (eyeDrift.targetY - eyeDrift.y) * dt * interpSpeed;
	} else {
		// Return to center when active
		eyeDrift.x += (0 - eyeDrift.x) * dt * 4;
		eyeDrift.y += (0 - eyeDrift.y) * dt * 4;
	}

	// Apply eye drift position
	elements.eye.position.x = eyeDrift.x;
	elements.eye.position.y = eyeDrift.y;
	elements.pupil.position.x = eyeDrift.x;
	elements.pupil.position.y = eyeDrift.y;

	// ─────────────────────────────────────────────────────────────────────
	// Particle brightness pulses in idle
	// ─────────────────────────────────────────────────────────────────────
	if (isIdle) {
		particlePulse.timer += dt;
		if (particlePulse.timer > particlePulse.interval) {
			particlePulse.timer = 0;
			particlePulse.interval = 1 + Math.random() * 2;
			particlePulse.brightness = 1.0;
		}
	}
	particlePulse.brightness = Math.max(0, particlePulse.brightness - dt * 1.5);

	// ─────────────────────────────────────────────────────────────────────
	// Core micro-drift in idle
	// ─────────────────────────────────────────────────────────────────────
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

function updateColors(elements: SceneElements, state: RigState, dt: number): void {
	const { theme, typing, tool } = state;

	const t = dt * 4;
	theme.current.primary = lerpColor(theme.current.primary, theme.target.primary, t);
	theme.current.glow = lerpColor(theme.current.glow, theme.target.glow, t);
	theme.current.eye = lerpColor(theme.current.eye, theme.target.eye, t);

	let displayPrimary = theme.current.primary;
	let displayEye = theme.current.eye;

	// Typing flash effect
	if (typing.pulse > 0.01) {
		const flashStrength = Math.pow(typing.pulse, 1.5) * 0.5;
		displayPrimary = lerpColor(displayPrimary, 0xffffff, flashStrength);
		displayEye = lerpColor(displayEye, 0xff8888, flashStrength * 0.3);
	}

	// Apply colors to materials
	elements.glowMat.color.setHex(displayPrimary);
	if (tool.flashTimer <= 0) {
		elements.eyeMat.color.setHex(displayEye);
		elements.pupilMat.color.setHex(displayEye);
	}
	elements.pointLight.color.setHex(theme.current.glow);

	// Update rings and fragments
	elements.rings.forEach((r) => (r.mesh.material as THREE.LineBasicMaterial).color.setHex(displayPrimary));
	elements.fragments.forEach((f) => f.material.color.setHex(displayPrimary));
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN RIG FACTORY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Creates the DAEMON avatar - An eldritch geometric entity
 * Alien technology glitching through dimensions
 */
export function createDaemonRig(options: { aspectRatio: number }): DaemonRig {
	const scene = new THREE.Scene();

	const camera = new THREE.PerspectiveCamera(28, options.aspectRatio, 0.1, 100);
	camera.position.set(0, 0, 8);
	camera.lookAt(0, 0, 0);

	// Resource tracking for disposal
	const disposables: { dispose(): void }[] = [];
	const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
		disposables.push(g);
		return g;
	};
	const trackMat = <T extends THREE.Material>(m: T): T => {
		disposables.push(m);
		return m;
	};

	// Create all scene elements
	const elements = createSceneElements(scene, trackGeo, trackMat);

	// Initialize state
	const state = createInitialState();

	// ───────────────────────────────────────────────────────────────────────
	// MAIN UPDATE LOOP
	// ───────────────────────────────────────────────────────────────────────
	function update(deltaS: number): void {
		const dt = Math.min(0.1, deltaS);
		state.glitch.timer += dt;

		// Update core animation state
		const intensity = updateIntensityAndAudio(state, dt);
		const isIdle = intensity < 0.1;
		const allowGlitch = intensity > 0.4 && !state.reasoning.active;

		// Update all subsystems
		updateMainAnchor(elements, state, dt, intensity);
		updateCore(elements, state, dt, intensity);
		updateEye(elements, state, dt, intensity);
		updateRings(elements, state, dt, intensity);
		updateFragments(elements, state, dt, intensity);
		updateSigils(elements, state, dt, intensity);
		updateParticles(elements, state, dt, intensity, allowGlitch);
		updateGlitchBehavior(elements, state, dt, intensity, allowGlitch);
		updateIdleAmbience(elements, state, dt, isIdle);
		updateColors(elements, state, dt);
	}

	// ───────────────────────────────────────────────────────────────────────
	// PUBLIC API
	// ───────────────────────────────────────────────────────────────────────
	function setColors(theme: AvatarColorTheme): void {
		state.theme.target = { ...theme };
	}

	function setIntensity(intensity: number, options?: { immediate?: boolean }): void {
		const next = clamp01(intensity);
		if (options?.immediate) {
			state.intensity.target = next;
			state.intensity.current = next;
		} else {
			// Trigger burst if intensity is rising significantly
			if (next > state.intensity.target + 0.1) {
				state.intensity.spinBoost = 12.0;
			}
			state.intensity.target = next;
		}
	}

	function setAudioLevel(level: number, options?: { immediate?: boolean }): void {
		const next = clamp01(level);
		if (options?.immediate) {
			state.audio.target = next;
			state.audio.current = next;
		} else {
			state.audio.target = next;
		}
	}

	function setToolActive(active: boolean, category?: ToolCategory): void {
		state.tool.active = active;
		if (active && category) {
			elements.sigilMat.color.setHex(TOOL_CATEGORY_COLORS[category]);
		} else {
			elements.sigilMat.color.setHex(state.theme.current.primary);
		}
	}

	function triggerToolFlash(category?: ToolCategory): void {
		state.tool.flashColor = category ? TOOL_CATEGORY_COLORS[category] : 0xffffff;
		state.tool.flashTimer = 0.15;
		state.tool.fragmentScatterBoost = 0.3;
		state.intensity.spinBoost = Math.max(state.intensity.spinBoost, 8);
	}

	function triggerToolComplete(): void {
		state.tool.settleTimer = 0.2;
	}

	function setReasoningMode(active: boolean): void {
		state.reasoning.active = active;
	}

	function setTypingMode(active: boolean): void {
		state.typing.active = active;
	}

	function triggerTypingPulse(): void {
		state.typing.pulse = Math.min(1.0, state.typing.pulse + 0.3);
		state.intensity.spinBoost = Math.max(state.intensity.spinBoost, 1.5);
	}

	function dispose(): void {
		disposables.forEach((d) => d.dispose());
	}

	return {
		scene,
		camera,
		update,
		setColors,
		setIntensity,
		setAudioLevel,
		setToolActive,
		triggerToolFlash,
		triggerToolComplete,
		setReasoningMode,
		setTypingMode,
		triggerTypingPulse,
		dispose,
	};
}

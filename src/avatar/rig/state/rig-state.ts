import type { AvatarColorTheme } from "src/types";

export interface PhaseState {
	drift: number;
	corePulse: number;
	eyePulse: number;
	pupilPulse: number;
	sigilPulse: number;
}

export interface IntensityState {
	current: number;
	target: number;
	spinBoost: number;
}

export interface AudioState {
	current: number;
	target: number;
}

export interface GlitchState {
	timer: number;
	isActive: boolean;
	duration: number;
}

export interface ToolState {
	active: boolean;
	flashTimer: number;
	flashColor: number;
	fragmentScatterBoost: number;
	sigilBrightnessBoost: number;
	settleTimer: number;
}

export interface ReasoningState {
	active: boolean;
	blend: number;
}

export interface TypingState {
	active: boolean;
	pulse: number;
	eyeScanTimer: number;
	eyeScanInterval: number;
}

export interface IdleMicroGlitchState {
	timer: number;
	cooldown: number;
	active: boolean;
	duration: number;
}

export interface EyeDriftState {
	x: number;
	y: number;
	targetX: number;
	targetY: number;
	timer: number;
	interval: number;
}

export interface ParticlePulseState {
	timer: number;
	interval: number;
	brightness: number;
}

export interface CoreDriftState {
	x: number;
	y: number;
	z: number;
	phaseX: number;
	phaseY: number;
	phaseZ: number;
}

export interface SpawnState {
	progress: number;
	elapsed: number;
	complete: boolean;
	glitchIntensity: number;
}

export interface ThemeState {
	current: AvatarColorTheme;
	target: AvatarColorTheme;
}

export interface RigState {
	phase: PhaseState;
	intensity: IntensityState;
	audio: AudioState;
	glitch: GlitchState;
	tool: ToolState;
	reasoning: ReasoningState;
	typing: TypingState;
	idleMicroGlitch: IdleMicroGlitchState;
	eyeDrift: EyeDriftState;
	particlePulse: ParticlePulseState;
	coreDrift: CoreDriftState;
	spawn: SpawnState;
	theme: ThemeState;
}

export const DEFAULT_THEME: AvatarColorTheme = {
	primary: 0x9ca3af,
	glow: 0x67e8f9,
	eye: 0xff0000,
};

export function createInitialState(): RigState {
	return {
		phase: {
			drift: 0,
			corePulse: 0,
			eyePulse: 0,
			pupilPulse: 0,
			sigilPulse: 0,
		},
		intensity: {
			current: 0,
			target: 0,
			spinBoost: 0,
		},
		audio: {
			current: 0,
			target: 0,
		},
		glitch: {
			timer: 0,
			isActive: false,
			duration: 0,
		},
		tool: {
			active: false,
			flashTimer: 0,
			flashColor: 0xffffff,
			fragmentScatterBoost: 0,
			sigilBrightnessBoost: 0,
			settleTimer: 0,
		},
		reasoning: {
			active: false,
			blend: 0,
		},
		typing: {
			active: false,
			pulse: 0,
			eyeScanTimer: 0,
			eyeScanInterval: 0.5,
		},
		idleMicroGlitch: {
			timer: 0,
			cooldown: 3 + Math.random() * 5,
			active: false,
			duration: 0,
		},
		eyeDrift: {
			x: 0,
			y: 0,
			targetX: 0,
			targetY: 0,
			timer: 0,
			interval: 1.5 + Math.random() * 2,
		},
		particlePulse: {
			timer: 0,
			interval: 1 + Math.random() * 2,
			brightness: 0,
		},
		coreDrift: {
			x: 0,
			y: 0,
			z: 0,
			phaseX: Math.random() * Math.PI * 2,
			phaseY: Math.random() * Math.PI * 2,
			phaseZ: Math.random() * Math.PI * 2,
		},
		spawn: {
			progress: 0,
			elapsed: 0,
			complete: false,
			glitchIntensity: 1,
		},
		theme: {
			current: { ...DEFAULT_THEME },
			target: { ...DEFAULT_THEME },
		},
	};
}

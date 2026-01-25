import { THREE } from "@opentui/core/3d";
import type { AvatarColorTheme } from "src/types";
import { type SceneElements, createSceneElements } from "../scene/create-scene-elements";
import { type RigState, createInitialState } from "../state/rig-state";
import { updateThemeColors } from "../theme/rig-theme";
import { TOOL_CATEGORY_COLORS, type ToolCategory } from "../tools/rig-tools";
import { updateCore } from "../update/update-core";
import { updateEye } from "../update/update-eye";
import { updateFragments } from "../update/update-fragments";
import { updateGlitchBehavior } from "../update/update-glitch";
import { updateIdleAmbience } from "../update/update-idle";
import { updateIntensityAndAudio } from "../update/update-intensity";
import { updateMainAnchor } from "../update/update-main-anchor";
import { updateParticles } from "../update/update-particles";
import { updateRings } from "../update/update-rings";
import { updateSigils } from "../update/update-sigils";
import { clamp01 } from "../utils/math";
import type { RigEngineOptions, RigEvent } from "./rig-types";

export class RigEngine {
	public readonly scene: THREE.Scene;
	public readonly camera: THREE.PerspectiveCamera;
	private readonly elements: SceneElements;
	private readonly state: RigState;
	private readonly disposables: Array<{ dispose(): void }> = [];

	constructor(options: RigEngineOptions) {
		this.scene = new THREE.Scene();
		this.camera = new THREE.PerspectiveCamera(28, options.aspectRatio, 0.1, 100);
		this.camera.position.set(0, 0, 8);
		this.camera.lookAt(0, 0, 0);

		const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
			this.disposables.push(g);
			return g;
		};
		const trackMat = <T extends THREE.Material>(m: T): T => {
			this.disposables.push(m);
			return m;
		};

		this.elements = createSceneElements(this.scene, trackGeo, trackMat);
		this.state = createInitialState();
	}

	public getScene(): THREE.Scene {
		return this.scene;
	}

	public getCamera(): THREE.PerspectiveCamera {
		return this.camera;
	}

	public update(deltaS: number): void {
		const dt = Math.min(0.1, deltaS);
		this.state.glitch.timer += dt;

		const intensity = updateIntensityAndAudio(this.state, dt);
		const isIdle = intensity < 0.1;
		const allowGlitch = intensity > 0.4 && !this.state.reasoning.active;

		updateMainAnchor(this.elements, this.state, dt, intensity);
		updateCore(this.elements, this.state, dt, intensity);
		updateEye(this.elements, this.state, dt, intensity);
		updateRings(this.elements, this.state, dt, intensity);
		updateFragments(this.elements, this.state, dt, intensity);
		updateSigils(this.elements, this.state, dt, intensity);
		updateParticles(this.elements, this.state, dt, intensity, allowGlitch);
		updateGlitchBehavior(this.elements, this.state, dt, intensity, allowGlitch);
		updateIdleAmbience(this.elements, this.state, dt, isIdle);
		updateThemeColors(this.elements, this.state, dt);
	}

	public handle(event: RigEvent): void {
		switch (event.type) {
			case "theme":
				this.setTheme(event.theme);
				break;
			case "intensity":
				this.setIntensity(event.intensity, { immediate: event.immediate });
				break;
			case "audio":
				this.setAudioLevel(event.level, { immediate: event.immediate });
				break;
			case "tool-active":
				this.setToolActive(event.active, event.category);
				break;
			case "tool-flash":
				this.triggerToolFlash(event.category);
				break;
			case "tool-complete":
				this.triggerToolComplete();
				break;
			case "reasoning":
				this.setReasoningMode(event.active);
				break;
			case "typing":
				this.setTypingMode(event.active);
				break;
			case "typing-pulse":
				this.triggerTypingPulse();
				break;
			default:
				break;
		}
	}

	public setTheme(theme: AvatarColorTheme): void {
		this.state.theme.target = { ...theme };
	}

	public setColors(theme: AvatarColorTheme): void {
		this.setTheme(theme);
	}

	public setIntensity(intensity: number, options?: { immediate?: boolean }): void {
		const next = clamp01(intensity);
		if (options?.immediate) {
			this.state.intensity.target = next;
			this.state.intensity.current = next;
		} else {
			if (next > this.state.intensity.target + 0.1) {
				this.state.intensity.spinBoost = 12.0;
			}
			this.state.intensity.target = next;
		}
	}

	public setAudioLevel(level: number, options?: { immediate?: boolean }): void {
		const next = clamp01(level);
		if (options?.immediate) {
			this.state.audio.target = next;
			this.state.audio.current = next;
		} else {
			this.state.audio.target = next;
		}
	}

	public setToolActive(active: boolean, category?: ToolCategory): void {
		this.state.tool.active = active;
		if (active && category) {
			this.elements.sigilMat.color.setHex(TOOL_CATEGORY_COLORS[category]);
		} else {
			this.elements.sigilMat.color.setHex(this.state.theme.current.primary);
		}
	}

	public triggerToolFlash(category?: ToolCategory): void {
		this.state.tool.flashColor = category ? TOOL_CATEGORY_COLORS[category] : 0xffffff;
		this.state.tool.flashTimer = 0.15;
		this.state.tool.fragmentScatterBoost = 0.3;
		this.state.intensity.spinBoost = Math.max(this.state.intensity.spinBoost, 8);
	}

	public triggerToolComplete(): void {
		this.state.tool.settleTimer = 0.2;
	}

	public setReasoningMode(active: boolean): void {
		this.state.reasoning.active = active;
	}

	public setTypingMode(active: boolean): void {
		this.state.typing.active = active;
	}

	public triggerTypingPulse(): void {
		this.state.typing.pulse = Math.min(1.0, this.state.typing.pulse + 0.3);
		this.state.intensity.spinBoost = Math.max(this.state.intensity.spinBoost, 1.5);
	}

	public dispose(): void {
		this.disposables.forEach((d) => d.dispose());
	}
}

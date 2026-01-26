import {
	type CliRenderer,
	FrameBufferRenderable,
	OptimizedBuffer,
	RGBA,
	TextAttributes,
} from "@opentui/core";
import { SuperSampleType, ThreeCliRenderer } from "@opentui/core/3d";
import {
	type DaemonColorTheme,
	type DaemonRig,
	type ToolCategory,
	createDaemonRig,
} from "./daemon-avatar-rig";

export type { ToolCategory } from "./daemon-avatar-rig";

export class DaemonAvatarRenderable extends FrameBufferRenderable {
	private three: ThreeCliRenderer | null = null;
	private rig: DaemonRig | null = null;
	private renderBuffer: OptimizedBuffer | null = null;
	private lastAppliedAspectRatio: number | null = null;

	private initStarted = false;
	private initError: Error | null = null;
	private renderInFlight = false;
	private destroyedSelf = false;

	private lastFrameTimeMs = performance.now();
	private pendingTheme: DaemonColorTheme | null = null;
	private pendingIntensity: { value: number; immediate: boolean } | null = null;
	private pendingAudioLevel: { value: number; immediate: boolean } | null = null;
	private pendingSpawnAction: "reset" | "skip" | null = null;

	private getDesiredAspectRatio(width: number, height: number): number {
		if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 1;

		const cliRenderer = this._ctx as unknown as CliRenderer;

		// Terminal cells are usually not square. If we know the terminal pixel resolution,
		// derive a per-cell width/height ratio; otherwise fall back to the same 0.5
		// heuristic used by @opentui/core's ThreeCliRenderer.
		let cellAspectRatio = 0.5;
		const resolution = cliRenderer.resolution;
		if (resolution) {
			const termW = cliRenderer.terminalWidth;
			const termH = cliRenderer.terminalHeight;
			if (termW > 0 && termH > 0 && resolution.width > 0 && resolution.height > 0) {
				const cellW = resolution.width / termW;
				const cellH = resolution.height / termH;
				const derived = cellW / cellH;
				if (Number.isFinite(derived) && derived > 0) {
					cellAspectRatio = derived;
				}
			}
		}

		const aspect = (width / height) * cellAspectRatio;
		if (!Number.isFinite(aspect) || aspect <= 0) return 1;
		return aspect;
	}

	private updateCameraSettings(): void {
		if (!this.rig) return;

		// 1. Aspect Ratio
		const desiredAspect = this.getDesiredAspectRatio(this.frameBuffer.width, this.frameBuffer.height);
		if (
			this.lastAppliedAspectRatio === null ||
			Math.abs(this.lastAppliedAspectRatio - desiredAspect) >= 0.001
		) {
			this.rig.camera.aspect = desiredAspect;
			this.rig.camera.updateProjectionMatrix();
			this.lastAppliedAspectRatio = desiredAspect;
		}

		// 2. Dynamic Z-Distance (Scaling)
		// "Sensibly bigger if we have more space and smaller when theres less space"
		// We use height as the primary driver for scale in the landscape terminal environment.
		// Base height: 30 rows. Base Z: 5.0 (Closer default to fix "small/pixelated" look).
		const h = this.frameBuffer.height;
		const baseHeight = 30;
		const baseZ = 5.0;

		// Power factor determines sensitivity. 0.1 is subtle.
		let scaleFactor = Math.pow(baseHeight / Math.max(10, h), 0.1);

		// Clamp Z to prevent extreme clipping or disappearing
		// Min Z=4.0 (Very close)
		// Max Z=12.0 (Far away)
		let targetZ = baseZ * scaleFactor;
		targetZ = Math.max(4.0, Math.min(12.0, targetZ));

		this.rig.camera.position.z = targetZ;
	}

	private startInitIfNeeded(): void {
		if (this.initStarted || this.initError || this.destroyedSelf) return;
		this.initStarted = true;

		void this.initThree().catch((err: unknown) => {
			const error = err instanceof Error ? err : new Error(String(err));
			this.initError = error;
			this._ctx.requestRender();
		});
	}

	private async initThree(): Promise<void> {
		const cliRenderer = this._ctx as unknown as CliRenderer;

		const three = new ThreeCliRenderer(cliRenderer, {
			width: this.frameBuffer.width,
			height: this.frameBuffer.height,
			alpha: true,
			backgroundColor: RGBA.fromValues(0, 0, 0, 0),
			superSample: SuperSampleType.GPU,
			autoResize: false,
		});

		await three.init();
		if (this.destroyedSelf) {
			three.destroy();
			return;
		}

		const rig = createDaemonRig({
			aspectRatio: this.getDesiredAspectRatio(this.frameBuffer.width, this.frameBuffer.height),
		});
		three.setActiveCamera(rig.camera);

		this.three = three;
		this.rig = rig;
		if (this.pendingTheme) {
			this.rig.setColors(this.pendingTheme);
		}
		if (this.pendingIntensity) {
			this.rig.setIntensity(this.pendingIntensity.value, { immediate: this.pendingIntensity.immediate });
		}
		if (this.pendingAudioLevel) {
			this.rig.setAudioLevel(this.pendingAudioLevel.value, { immediate: this.pendingAudioLevel.immediate });
		}
		if (this.pendingSpawnAction) {
			if (this.pendingSpawnAction === "reset") {
				this.rig.resetSpawn();
			} else {
				this.rig.skipSpawn();
			}
			this.pendingSpawnAction = null;
		}
		this.renderBuffer = OptimizedBuffer.create(
			this.frameBuffer.width,
			this.frameBuffer.height,
			cliRenderer.widthMethod,
			{
				respectAlpha: true,
				id: `${this.frameBuffer.id}-render`,
			}
		);
		this.updateCameraSettings();
		this._ctx.requestRender();
	}

	private kickRenderFrame(): void {
		if (!this.three || !this.rig || !this.renderBuffer || this.destroyedSelf) return;
		if (this.renderInFlight) return;

		this.updateCameraSettings();

		const renderBuffer = this.renderBuffer;

		const now = performance.now();
		let deltaS = (now - this.lastFrameTimeMs) / 1000;
		this.lastFrameTimeMs = now;
		// Avoid "time compounding" when the render loop calls us multiple times within the
		// same timer tick (some environments have coarse `performance.now()` resolution).
		// A 0 delta should mean "no time advanced", not "assume 60fps".
		if (!Number.isFinite(deltaS) || deltaS < 0) deltaS = 0;
		deltaS = Math.min(deltaS, 0.1);

		// ThreeCliRenderer does not guarantee it overwrites every cell each frame when alpha
		// is enabled; if we don't clear, old pixels can "stick" (most visible on thin,
		// additive elements like the rotating rings). We clear a *back buffer* to avoid
		// blanking the currently displayed frame while drawScene is in-flight.
		renderBuffer.clear(RGBA.fromValues(0, 0, 0, 0));

		this.rig.update(deltaS);

		this.renderInFlight = true;
		void this.three
			.drawScene(this.rig.scene, renderBuffer, deltaS)
			.then(() => {
				if (this.destroyedSelf) return;

				// Present: copy rendered back buffer into the displayed framebuffer.
				// (FrameBufferRenderable always draws `this.frameBuffer`.)
				this.frameBuffer.clear(RGBA.fromValues(0, 0, 0, 0));
				this.frameBuffer.drawFrameBuffer(0, 0, renderBuffer);

				this.renderInFlight = false;
				this._ctx.requestRender();
			})
			.catch((err: unknown) => {
				this.renderInFlight = false;
				this.initError = err instanceof Error ? err : new Error(String(err));
				this._ctx.requestRender();
			});
	}

	protected override onResize(width: number, height: number): void {
		super.onResize(width, height);
		if (this.three) {
			this.three.setSize(width, height, true);
			this.updateCameraSettings();
		}
		if (this.renderBuffer) {
			this.renderBuffer.resize(width, height);
		}
	}

	protected override renderSelf(buffer: OptimizedBuffer): void {
		if (!this.visible || this.isDestroyed) return;

		this.startInitIfNeeded();

		if (this.initError) {
			const fb = this.frameBuffer;
			const w = fb.width;
			const h = fb.height;
			fb.clear(RGBA.fromValues(0, 0, 0, 0));
			const msg = "SYSTEM FAILURE";
			fb.drawText(
				msg,
				Math.max(0, (w - msg.length) / 2),
				h / 2,
				RGBA.fromInts(255, 50, 50, 255),
				RGBA.fromInts(0, 0, 0, 0),
				TextAttributes.BOLD
			);
		} else if (!this.three || !this.rig) {
			const fb = this.frameBuffer;
			const w = fb.width;
			const h = fb.height;
			fb.clear(RGBA.fromValues(0, 0, 0, 0));
		} else {
			this.kickRenderFrame();
		}

		super.renderSelf(buffer);
	}

	protected override destroySelf(): void {
		this.destroyedSelf = true;
		this.rig?.dispose();
		this.rig = null;
		this.three?.destroy();
		this.three = null;
		this.renderBuffer?.destroy();
		this.renderBuffer = null;
		super.destroySelf();
	}

	/**
	 * Set the color theme for the DAEMON avatar.
	 * Colors will smoothly transition to the new theme.
	 */
	public setColors(theme: DaemonColorTheme): void {
		this.pendingTheme = theme;
		if (this.rig) {
			this.rig.setColors(theme);
		}
	}

	/**
	 * Set animation intensity (0 = idle, 1 = responding/active).
	 * Higher intensity causes faster, more dramatic animations.
	 */
	public setIntensity(intensity: number, options?: { immediate?: boolean }): void {
		this.pendingIntensity = { value: intensity, immediate: options?.immediate ?? false };
		if (this.rig) {
			this.rig.setIntensity(intensity, options);
		}
	}

	/**
	 * Set real-time audio level (0 = silence, 1 = loud).
	 * Used for reactive size/opacity without changing spin speed.
	 */
	public setAudioLevel(level: number, options?: { immediate?: boolean }): void {
		this.pendingAudioLevel = { value: level, immediate: options?.immediate ?? false };
		if (this.rig) {
			this.rig.setAudioLevel(level, options);
		}
	}

	public setToolActive(active: boolean, category?: ToolCategory): void {
		if (this.rig) {
			this.rig.setToolActive(active, category);
		}
	}

	public triggerToolFlash(category?: ToolCategory): void {
		if (this.rig) {
			this.rig.triggerToolFlash(category);
		}
	}

	public triggerToolComplete(): void {
		if (this.rig) {
			this.rig.triggerToolComplete();
		}
	}

	public setReasoningMode(active: boolean): void {
		if (this.rig) {
			this.rig.setReasoningMode(active);
		}
	}

	public setTypingMode(active: boolean): void {
		if (this.rig) {
			this.rig.setTypingMode(active);
		}
	}

	public triggerTypingPulse(): void {
		if (this.rig) {
			this.rig.triggerTypingPulse();
		}
	}

	public resetSpawn(): void {
		this.pendingSpawnAction = "reset";
		if (this.rig) {
			this.rig.resetSpawn();
		}
	}

	public skipSpawn(): void {
		this.pendingSpawnAction = "skip";
		if (this.rig) {
			this.rig.skipSpawn();
		}
	}
}

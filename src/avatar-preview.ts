import { OptimizedBuffer, createCliRenderer, RGBA } from "@opentui/core";
import { SuperSampleType, ThreeCliRenderer } from "@opentui/core/3d";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createDaemonRig } from "./avatar/daemon-avatar-rig";

/** Resolve ffmpeg path - tries ffmpeg-static if available, otherwise falls back to system PATH. */
function getFfmpegPath(): string {
	try {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const ffmpegStatic = require("ffmpeg-static") as string;
		if (ffmpegStatic && existsSync(ffmpegStatic)) {
			return ffmpegStatic;
		}
	} catch {
		// ffmpeg-static not installed, use system ffmpeg
	}
	return "ffmpeg";
}

type PreviewOptions = {
	outDir: string;
	width: number;
	height: number;
	frames: number;
	fps: number;
	mp4?: string;
};

function parseArgs(argv: string[]): PreviewOptions {
	const out: PreviewOptions = {
		outDir: "tmp/avatar-preview",
		width: 320,
		height: 180,
		frames: 180,
		fps: 30,
	};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		const next = argv[i + 1];
		if (!arg) continue;

		if (arg === "--out" && next) {
			out.outDir = next;
			i++;
			continue;
		}
		if (arg === "--width" && next) {
			out.width = Number(next);
			i++;
			continue;
		}
		if (arg === "--height" && next) {
			out.height = Number(next);
			i++;
			continue;
		}
		if (arg === "--frames" && next) {
			out.frames = Number(next);
			i++;
			continue;
		}
		if (arg === "--fps" && next) {
			out.fps = Number(next);
			i++;
			continue;
		}
		if (arg === "--mp4" && next) {
			out.mp4 = next;
			i++;
			continue;
		}
	}

	if (!Number.isFinite(out.width) || out.width <= 0) throw new Error("Invalid --width");
	if (!Number.isFinite(out.height) || out.height <= 0) throw new Error("Invalid --height");
	if (!Number.isFinite(out.frames) || out.frames <= 0) throw new Error("Invalid --frames");
	if (!Number.isFinite(out.fps) || out.fps <= 0) throw new Error("Invalid --fps");

	return out;
}

async function stitchToMp4(opts: { outDir: string; fps: number; mp4Path: string }): Promise<void> {
	const inputPattern = join(opts.outDir, "frame_%04d.png");

	const args = [
		"-y",
		"-hide_banner",
		"-loglevel",
		"error",
		"-framerate",
		String(opts.fps),
		"-i",
		inputPattern,
		"-c:v",
		"libx264",
		"-pix_fmt",
		"yuv420p",
		"-crf",
		"18",
		"-preset",
		"medium",
		// Avoid odd-size issues with yuv420p encodes.
		"-vf",
		"pad=ceil(iw/2)*2:ceil(ih/2)*2",
		opts.mp4Path,
	];

	await new Promise<void>((resolve, reject) => {
		const ffmpegPath = getFfmpegPath();
		const child = spawn(ffmpegPath, args, { stdio: "inherit" });
		child.on("error", (err) => reject(err));
		child.on("exit", (code) => {
			if (code === 0) resolve();
			else reject(new Error(`ffmpeg exited with code ${code}`));
		});
	});
}

async function main() {
	const opts = parseArgs(process.argv.slice(2));
	await mkdir(opts.outDir, { recursive: true });

	// We still need CliRenderer because ThreeCliRenderer plugs into OpenTUI's WebGPU + lifecycle.
	// But this script doesn't mount a UI; it just renders frames to PNG.
	const cli = await createCliRenderer({
		useConsole: false,
		useMouse: false,
		enableMouseMovement: false,
		useAlternateScreen: false,
		exitOnCtrlC: true,
		targetFps: 60,
		maxFps: 60,
		backgroundColor: "#000000",
	});

	const three = new ThreeCliRenderer(cli, {
		width: opts.width,
		height: opts.height,
		alpha: true,
		backgroundColor: RGBA.fromValues(0, 0, 0, 0),
		superSample: SuperSampleType.GPU,
		autoResize: false,
	});

	const buffer = OptimizedBuffer.create(opts.width, opts.height, cli.widthMethod, {
		respectAlpha: true,
		id: "avatar-preview",
	});

	let rig: ReturnType<typeof createDaemonRig> | null = null;
	try {
		await three.init();
		rig = createDaemonRig({ aspectRatio: three.aspectRatio });
		three.setActiveCamera(rig.camera);

		const deltaS = 1 / opts.fps;

		for (let frame = 0; frame < opts.frames; frame++) {
			rig.update(deltaS);
			await three.drawScene(rig.scene, buffer, deltaS);

			const filename = `frame_${String(frame).padStart(4, "0")}.png`;
			await three.saveToFile(join(opts.outDir, filename));
		}

		if (opts.mp4) {
			try {
				await stitchToMp4({ outDir: opts.outDir, fps: opts.fps, mp4Path: opts.mp4 });
			} catch (err: unknown) {
				const e = err instanceof Error ? err : new Error(String(err));
				console.error(`Failed to stitch MP4. Ensure ffmpeg is installed and on PATH. (${e.message})`);
			}
		}
	} finally {
		rig?.dispose();
		buffer.destroy();
		three.destroy();
		cli.destroy();
	}
}

await main();

import {
	spawn,
	type ChildProcess,
	type ChildProcessWithoutNullStreams,
	type SpawnOptions,
} from "node:child_process";

export const PROCESS_TREE_TERM_GRACE_MS = 250;

export interface ProcessTreeSpawnOptions {
	cwd: string;
	env: NodeJS.ProcessEnv;
}

export interface ProcessTreeTerminator {
	terminate(signal?: NodeJS.Signals): void;
	dispose(): void;
}

/**
 * Returns spawn options that place the child in a new process group on POSIX
 * so the entire group can be signalled together. On non-POSIX platforms the
 * options are unchanged and termination falls back to killing the direct child.
 */
export function processTreeSpawnOptions(options: ProcessTreeSpawnOptions): SpawnOptions {
	if (process.platform === "win32") {
		return { cwd: options.cwd, env: options.env, shell: false };
	}
	return { cwd: options.cwd, env: options.env, shell: false, detached: true };
}

/**
 * Spawn `bash -c <command>` inside a new process group where the platform
 * supports it. The returned process stream can be terminated as a group via
 * {@link createProcessTreeTerminator}.
 */
export function spawnBashProcessTree(
	command: string,
	options: ProcessTreeSpawnOptions
): ChildProcessWithoutNullStreams {
	const proc = spawn("bash", ["-c", command], processTreeSpawnOptions(options)) as ChildProcess;
	if (!proc.stdout || !proc.stderr || !proc.stdin) {
		throw new Error("bash process did not provide stdio streams");
	}
	return proc as ChildProcessWithoutNullStreams;
}

/**
 * Build a two-phase process-tree terminator:
 *  1. send `signal` (default SIGTERM) to the whole process group
 *  2. if the process is still alive after a short grace period, escalate to SIGKILL
 *
 * On platforms without process-group support (Windows), this falls back to
 * signalling the direct child process. The returned `dispose()` clears the
 * pending hard-kill timer and is safe to call multiple times.
 */
export function createProcessTreeTerminator(
	proc: ChildProcessWithoutNullStreams,
	options: { graceMs?: number } = {}
): ProcessTreeTerminator {
	const graceMs = options.graceMs ?? PROCESS_TREE_TERM_GRACE_MS;
	let disposed = false;
	let hardKillTimer: ReturnType<typeof setTimeout> | null = null;
	let signalled = false;

	const signalGroup = (signal: NodeJS.Signals): void => {
		if (signalled) return;
		signalled = true;
		if (process.platform !== "win32" && typeof proc.pid === "number") {
			try {
				process.kill(-proc.pid, signal);
				return;
			} catch {
				// Group kill unsupported (e.g. missing permissions or already reaped). Fall through.
			}
		}
		try {
			proc.kill(signal);
		} catch {
			// Process may already be gone.
		}
	};

	return {
		terminate(signal: NodeJS.Signals = "SIGTERM") {
			if (disposed) return;
			signalGroup(signal);
			if (hardKillTimer) return;
			hardKillTimer = setTimeout(() => {
				if (disposed) return;
				if (proc.exitCode !== null || proc.signalCode !== null) return;
				try {
					if (process.platform !== "win32" && typeof proc.pid === "number") {
						try {
							process.kill(-proc.pid, "SIGKILL");
							return;
						} catch {
							// Fall through to direct kill.
						}
					}
					proc.kill("SIGKILL");
				} catch {
					// Process may already be gone.
				}
			}, graceMs);
		},
		dispose() {
			if (disposed) return;
			disposed = true;
			if (hardKillTimer) {
				clearTimeout(hardKillTimer);
				hardKillTimer = null;
			}
		},
	};
}

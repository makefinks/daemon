import { platform, release } from "os";

async function readFromCommand(command: string, args: string[]): Promise<string> {
	try {
		const proc = Bun.spawn([command, ...args], {
			stdout: "pipe",
			stderr: "ignore",
		});
		const text = await new Response(proc.stdout).text();
		await proc.exited;
		return text;
	} catch {
		return "";
	}
}

async function writeToCommand(command: string, args: string[], text: string): Promise<boolean> {
	try {
		const proc = Bun.spawn([command, ...args], {
			stdin: "pipe",
			stdout: "ignore",
			stderr: "ignore",
		});
		proc.stdin.write(text);
		proc.stdin.end();
		const exitCode = await proc.exited;
		return exitCode === 0;
	} catch {
		return false;
	}
}

export async function readClipboardText(): Promise<string> {
	const os = platform();

	if (os === "darwin" && Bun.which("pbpaste")) {
		return readFromCommand("pbpaste", []);
	}

	if (os === "win32" || release().includes("WSL")) {
		return readFromCommand("powershell", ["-command", "Get-Clipboard -Raw"]);
	}

	if (os === "linux") {
		if (process.env.WAYLAND_DISPLAY && Bun.which("wl-paste")) {
			return readFromCommand("wl-paste", ["-n"]);
		}
		if (Bun.which("xclip")) {
			return readFromCommand("xclip", ["-selection", "clipboard", "-o"]);
		}
		if (Bun.which("xsel")) {
			return readFromCommand("xsel", ["--clipboard", "--output"]);
		}
	}

	return "";
}

export async function writeClipboardText(text: string): Promise<boolean> {
	if (!text) return false;

	const os = platform();

	if (os === "darwin" && Bun.which("pbcopy")) {
		return writeToCommand("pbcopy", [], text);
	}

	if (os === "win32" || release().includes("WSL")) {
		return writeToCommand(
			"powershell",
			["-command", "Set-Clipboard -Value ([Console]::In.ReadToEnd())"],
			text
		);
	}

	if (os === "linux") {
		if (process.env.WAYLAND_DISPLAY && Bun.which("wl-copy")) {
			return writeToCommand("wl-copy", [], text);
		}
		if (Bun.which("xclip")) {
			return writeToCommand("xclip", ["-selection", "clipboard"], text);
		}
		if (Bun.which("xsel")) {
			return writeToCommand("xsel", ["--clipboard", "--input"], text);
		}
	}

	return false;
}

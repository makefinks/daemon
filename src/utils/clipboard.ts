import { platform, release } from "os";
import fs from "node:fs/promises";
import path from "node:path";

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

async function readBinaryFromCommand(command: string, args: string[]): Promise<Buffer | null> {
	try {
		const proc = Bun.spawn([command, ...args], {
			stdout: "pipe",
			stderr: "ignore",
		});
		const buffer = Buffer.from(await new Response(proc.stdout).arrayBuffer());
		const exitCode = await proc.exited;
		if (exitCode !== 0 || buffer.length === 0) return null;
		return buffer;
	} catch {
		return null;
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

export interface ClipboardImageContent {
	data: string;
	mediaType: string;
	filename: string;
}

async function readMacClipboardPng(): Promise<Buffer | null> {
	if (!Bun.which("osascript")) return null;
	const filePath = path.join("/tmp", `daemon-clipboard-${process.pid}-${Date.now()}.png`);
	const script = [
		"try",
		"  set imageData to the clipboard as «class PNGf»",
		`  set fileRef to open for access POSIX file "${filePath}" with write permission`,
		"  set eof fileRef to 0",
		"  write imageData to fileRef",
		"  close access fileRef",
		"on error",
		"  try",
		'    close access POSIX file "' + filePath + '"',
		"  end try",
		"  error number -128",
		"end try",
	];

	try {
		const proc = Bun.spawn(["osascript", ...script.flatMap((line) => ["-e", line])], {
			stdout: "ignore",
			stderr: "ignore",
		});
		if ((await proc.exited) !== 0) return null;
		const data = await fs.readFile(filePath);
		return data.length > 0 ? data : null;
	} catch {
		return null;
	} finally {
		void fs.unlink(filePath).catch(() => undefined);
	}
}

export async function readClipboardImage(): Promise<ClipboardImageContent | null> {
	const os = platform();
	let buffer: Buffer | null = null;

	if (os === "darwin") {
		buffer = await readMacClipboardPng();
	} else if (os === "linux") {
		if (process.env.WAYLAND_DISPLAY && Bun.which("wl-paste")) {
			buffer = await readBinaryFromCommand("wl-paste", ["-n", "-t", "image/png"]);
		}
		if (!buffer && Bun.which("xclip")) {
			buffer = await readBinaryFromCommand("xclip", ["-selection", "clipboard", "-t", "image/png", "-o"]);
		}
	}

	if (!buffer) return null;
	return {
		data: buffer.toString("base64"),
		mediaType: "image/png",
		filename: "clipboard.png",
	};
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

import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

export type JsRenderingUnavailableReason = "package-not-installed" | "binaries-missing";

export interface JsRenderingCapability {
	available: boolean;
	reason: string;
	hint?: string;
	unavailableReason?: JsRenderingUnavailableReason;
}

function getGlobalNodeModulesPath(): string | null {
	try {
		return execSync("npm root -g", { encoding: "utf-8" }).trim();
	} catch {
		return null;
	}
}

export async function tryImportPlaywright(): Promise<any | null> {
	try {
		return await import("playwright");
	} catch {}

	const globalPath = getGlobalNodeModulesPath();
	if (!globalPath) return null;

	const playwrightPath = path.join(globalPath, "playwright");
	if (!fs.existsSync(playwrightPath)) return null;

	try {
		const require = createRequire(import.meta.url);
		return require(playwrightPath);
	} catch {
		return null;
	}
}

export async function detectLocalPlaywrightChromium(): Promise<JsRenderingCapability> {
	const playwright = await tryImportPlaywright();

	if (!playwright) {
		return {
			available: false,
			reason: "Playwright is not installed.",
			hint: "Run: npm i -g playwright && npx playwright install chromium",
			unavailableReason: "package-not-installed",
		};
	}

	try {
		const executablePath = playwright.chromium.executablePath();
		if (!executablePath || !fs.existsSync(executablePath)) {
			return {
				available: false,
				reason: "Playwright Chromium binaries are not installed.",
				hint: "Run: npx playwright install chromium",
				unavailableReason: "binaries-missing",
			};
		}

		return {
			available: true,
			reason: "Playwright Chromium is installed.",
		};
	} catch {
		return {
			available: false,
			reason: "Playwright Chromium binaries are not installed.",
			hint: "Run: npx playwright install chromium",
			unavailableReason: "binaries-missing",
		};
	}
}

import { tool } from "ai";
import { z } from "zod";
import { tryImportPlaywright } from "../../utils/js-rendering";

const DEFAULT_LINE_LIMIT = 80;
const MAX_CHAR_LIMIT = 50000;
const MAX_LINE_LIMIT = 1000;
const RENDER_CACHE_TTL_MS = 2 * 60 * 1000;
const RENDER_CACHE_MAX_ENTRIES = 20;
const HARD_TIMEOUT_MS = 20000;

const DEFAULT_USER_AGENT =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";

type RenderCacheEntry = {
	text: string;
	createdAt: number;
};

const renderCache = new Map<string, RenderCacheEntry>();

function getCachedRender(url: string): string | null {
	const entry = renderCache.get(url);
	if (!entry) return null;
	if (Date.now() - entry.createdAt > RENDER_CACHE_TTL_MS) {
		renderCache.delete(url);
		return null;
	}
	return entry.text;
}

function pruneRenderCache(): void {
	while (renderCache.size > RENDER_CACHE_MAX_ENTRIES) {
		const oldestKey = renderCache.keys().next().value as string | undefined;
		if (!oldestKey) return;
		renderCache.delete(oldestKey);
	}
}

function setCachedRender(url: string, text: string): void {
	if (!text.trim()) return;
	renderCache.set(url, { text, createdAt: Date.now() });
	pruneRenderCache();
}

function normalizeLines(text: string): string[] {
	return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

async function tryWaitForNetworkIdle(page: any, timeoutMs: number): Promise<void> {
	try {
		await page.waitForLoadState("networkidle", { timeout: timeoutMs });
	} catch {
		// Some SPAs never reach networkidle; ignore.
	}
}

async function tryWaitForNonEmptyText(page: any, timeoutMs: number): Promise<void> {
	try {
		await page.waitForFunction(
			() => {
				const doc = (globalThis as any).document;
				if (!doc) return false;

				const h1 = doc.querySelector("main h1, h1");
				if (h1 && typeof h1.innerText === "string" && h1.innerText.trim().length > 0) {
					return true;
				}

				const main = doc.querySelector("main");
				if (main && typeof main.innerText === "string" && main.innerText.trim().length > 200) {
					return true;
				}

				const article = doc.querySelector("article");
				if (article && typeof article.innerText === "string" && article.innerText.trim().length > 200) {
					return true;
				}

				return false;
			},
			{ timeout: timeoutMs }
		);
	} catch {
		// Best-effort only.
	}
}

async function extractRenderedText(page: any): Promise<string> {
	return await page.evaluate(() => {
		const doc = (globalThis as any).document;
		if (!doc) return "";

		const pick = (selector: string): string => {
			const el = doc.querySelector(selector);
			if (!el) return "";
			if (typeof (el as any).innerText === "string") return (el as any).innerText;
			return "";
		};

		// Prefer semantic containers to reduce nav/footer noise.
		const mainText = pick("main");
		if (mainText.trim().length > 200) return mainText;

		const articleText = pick("article");
		if (articleText.trim().length > 200) return articleText;

		const body = doc.body as any;
		const bodyInnerText = typeof body?.innerText === "string" ? body.innerText : "";
		if (bodyInnerText.trim().length > 0) return bodyInnerText;

		// Fallback: some sites hide text visually; textContent can still capture the payload.
		return typeof body?.textContent === "string" ? body.textContent : "";
	});
}

function normalizeError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

export const renderUrl = tool({
	description:
		"Render a JavaScript-heavy page locally (Playwright Chromium) and extract visible text from the live DOM. By default, reads up to 80 lines from the start of the rendered page (capped at 50k characters). For pagination (lineOffset > 0), provide both lineOffset and lineLimit. If the requested range exceeds what exists, returns whatever is available. Returns remainingLines (exact when knowable, otherwise null).",
	inputSchema: z.object({
		url: z.string().url().describe("URL to render and extract text from."),
		lineOffset: z
			.number()
			.int()
			.min(0)
			.optional()
			.describe(
				"0-based line offset to start reading from. For pagination (lineOffset > 0), provide lineLimit too."
			),
		lineLimit: z
			.number()
			.int()
			.min(1)
			.max(MAX_LINE_LIMIT)
			.optional()
			.describe(
				`Maximum lines to read (max ${MAX_LINE_LIMIT}). If provided without lineOffset, reads from the start.`
			),
	}),
	execute: async ({ url, lineOffset, lineLimit }, { abortSignal }) => {
		const normalizedUrl = new URL(url).toString();
		const hasOffset = typeof lineOffset === "number";
		const hasLimit = typeof lineLimit === "number";

		if (hasOffset && !hasLimit && (lineOffset ?? 0) > 0) {
			return {
				success: false,
				url,
				lineOffset,
				lineLimit,
				error: "Provide both lineOffset and lineLimit for paginated reads (lineOffset > 0).",
			};
		}

		const effectiveOffset = hasOffset ? lineOffset : 0;
		const effectiveLimit = hasLimit ? lineLimit : DEFAULT_LINE_LIMIT;

		const cachedText = getCachedRender(normalizedUrl);
		if (cachedText !== null) {
			const cappedText = cachedText.slice(0, MAX_CHAR_LIMIT);
			const lines = normalizeLines(cappedText);
			const cappedOffset = Math.min(effectiveOffset, lines.length);
			const cappedEnd = Math.min(cappedOffset + effectiveLimit, lines.length);
			const slicedText = lines.slice(cappedOffset, cappedEnd).join("\n");
			const truncatedByCap = cachedText.length > MAX_CHAR_LIMIT;

			return {
				success: true,
				url,
				text: slicedText,
				lineOffset: effectiveOffset,
				lineLimit: effectiveLimit,
				totalLines: lines.length,
				remainingLines: truncatedByCap ? null : Math.max(0, lines.length - cappedEnd),
			};
		}

		// Use `any` here to avoid a hard dependency on Playwright types.
		let browser: any = null;

		// Hard timeout wrapper to prevent indefinite hangs on browser operations.
		const timeoutPromise = new Promise<never>((_, reject) => {
			setTimeout(
				() => reject(new Error(`Render timed out after ${HARD_TIMEOUT_MS / 1000}s`)),
				HARD_TIMEOUT_MS
			);
		});

		const renderWork = async () => {
			if (abortSignal?.aborted) {
				return { success: false as const, url, error: "Aborted." };
			}

			const playwright = await tryImportPlaywright();
			if (!playwright) {
				return {
					success: false as const,
					url,
					error: "Playwright is not installed. Run: npm i -g playwright && npx playwright install chromium",
				};
			}

			browser = await playwright.chromium.launch({ headless: true });

			const context = await browser.newContext({
				userAgent: DEFAULT_USER_AGENT,
				locale: "en-US",
				extraHTTPHeaders: {
					"Accept-Language": "en-US,en;q=0.9",
				},
			});
			const page = await context.newPage();

			await page.goto(url, {
				waitUntil: "domcontentloaded",
				timeout: 10000,
			});

			// Best-effort waits:
			// - networkidle (short) helps for classic pages
			// - non-empty text helps for SPAs that render after first paint
			await tryWaitForNetworkIdle(page, 1500);
			await tryWaitForNonEmptyText(page, 8000);

			if (abortSignal?.aborted) {
				return { success: false as const, url, error: "Aborted." };
			}

			const fullText = await extractRenderedText(page);
			setCachedRender(normalizedUrl, fullText);

			// Cap the maximum readable window per URL to keep tool I/O small and predictable.
			const cappedText = fullText.slice(0, MAX_CHAR_LIMIT);
			const lines = normalizeLines(cappedText);
			const cappedOffset = Math.min(effectiveOffset, lines.length);
			const cappedEnd = Math.min(cappedOffset + effectiveLimit, lines.length);
			const slicedText = lines.slice(cappedOffset, cappedEnd).join("\n");
			const truncatedByCap = fullText.length > MAX_CHAR_LIMIT;
			const remainingLines = truncatedByCap ? null : Math.max(0, lines.length - cappedEnd);

			return {
				success: true as const,
				url,
				text: slicedText,
				lineOffset: effectiveOffset,
				lineLimit: effectiveLimit,
				totalLines: lines.length,
				remainingLines,
			};
		};

		try {
			return await Promise.race([renderWork(), timeoutPromise]);
		} catch (error) {
			const err = normalizeError(error);
			return {
				success: false,
				url,
				lineOffset,
				lineLimit,
				error: err.message,
			};
		} finally {
			try {
				await browser?.close();
			} catch {
				// Best-effort cleanup only.
			}
		}
	},
});

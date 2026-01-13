/**
 * Per-session cache for Exa URL fetches.
 * Used by fetchUrls tool to avoid redundant API calls.
 */

import { getExaClient } from "./exa-client";

const MAX_CHAR_LIMIT = 50_000;
const DEFAULT_TTL_MS = 30 * 60 * 1000;

interface CachedPage {
	url: string;
	text: string;
	fetchedAt: number;
	ttlMs: number;
}

const cache = new Map<string, CachedPage>();

function normalizeUrl(url: string): string {
	try {
		const parsed = new URL(url);
		parsed.host = parsed.host.toLowerCase();
		if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
			parsed.pathname = parsed.pathname.slice(0, -1);
		}
		return parsed.toString();
	} catch {
		return url;
	}
}

function isValidCache(entry: CachedPage): boolean {
	return Date.now() - entry.fetchedAt < entry.ttlMs;
}

export function getCachedPage(url: string): CachedPage | null {
	const key = normalizeUrl(url);
	const entry = cache.get(key);
	if (!entry) return null;
	if (!isValidCache(entry)) {
		cache.delete(key);
		return null;
	}
	return entry;
}

export function setCachedPage(url: string, text: string, ttlMs: number = DEFAULT_TTL_MS): void {
	const key = normalizeUrl(url);
	cache.set(key, {
		url,
		text,
		fetchedAt: Date.now(),
		ttlMs,
	});
}

export async function fetchWithCache(
	url: string
): Promise<{ text: string; fromCache: boolean } | { error: string }> {
	const cached = getCachedPage(url);
	if (cached) {
		return { text: cached.text, fromCache: true };
	}

	const exaClientResult = getExaClient();
	if ("error" in exaClientResult) {
		return { error: exaClientResult.error };
	}

	try {
		const rawData = (await exaClientResult.client.getContents([url], {
			text: { maxCharacters: MAX_CHAR_LIMIT },
		})) as unknown as {
			results?: Array<{
				url?: string;
				text?: string;
				[key: string]: unknown;
			}>;
		};

		const first = rawData.results?.[0];
		const fullText = first?.text ?? "";
		const cappedText = fullText.slice(0, MAX_CHAR_LIMIT);

		setCachedPage(url, cappedText);

		return { text: cappedText, fromCache: false };
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		return { error: err.message };
	}
}

export function clearFetchCache(): void {
	cache.clear();
}

export function getCacheStats(): { size: number; urls: string[] } {
	return {
		size: cache.size,
		urls: Array.from(cache.keys()),
	};
}

/**
 * Per-session cache for Exa URL fetches.
 * Used by fetchUrls tool to avoid redundant API calls.
 */

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

export function clearFetchCache(): void {
	cache.clear();
}

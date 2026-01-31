import type { ContentBlock, ConversationMessage, GroundingMap, UrlMenuItem } from "../types";

function normalizeUrlKey(rawUrl: string): string {
	try {
		const parsed = new URL(rawUrl);
		parsed.hash = "";
		return parsed.toString();
	} catch {
		return rawUrl;
	}
}

function unescapeXmlAttribute(value: string): string {
	return value
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&amp;/g, "&");
}

function parseFetchUrlsXml(result: string): {
	items: Array<{
		url: string;
		lineOffset?: number;
		lineLimit?: number;
		totalLines?: number;
		remainingLines?: number | null;
		error?: string;
		success: boolean;
	}>;
	error?: string;
} {
	const items: Array<{
		url: string;
		lineOffset?: number;
		lineLimit?: number;
		totalLines?: number;
		remainingLines?: number | null;
		error?: string;
		success: boolean;
	}> = [];

	let error: string | undefined;
	const errorMatch = result.match(/<fetchUrls[^>]*\serror="([^"]+)"[^>]*\/?>/);
	if (errorMatch?.[1]) {
		error = unescapeXmlAttribute(errorMatch[1]);
	}

	const regex = /<url\s+([^>]*?)(\/?)>/g;
	let match = regex.exec(result);
	while (match) {
		const attrText = match[1] ?? "";
		const attrs: Record<string, string> = {};
		for (const attr of attrText.matchAll(/(\w+)="([^"]*)"/g)) {
			const key = attr[1];
			if (!key) continue;
			const value = attr[2] ?? "";
			attrs[key] = unescapeXmlAttribute(value);
		}
		const url = attrs.href;
		if (!url) continue;
		const lineOffset = attrs.lineOffset !== undefined ? Number(attrs.lineOffset) : undefined;
		const lineLimit = attrs.lineLimit !== undefined ? Number(attrs.lineLimit) : undefined;
		const totalLines = attrs.totalLines !== undefined ? Number(attrs.totalLines) : undefined;
		let remainingLines: number | null | undefined = undefined;
		if (attrs.remainingLines === "unknown") remainingLines = null;
		else if (attrs.remainingLines !== undefined) remainingLines = Number(attrs.remainingLines);
		const error = attrs.error;
		const success = !error;
		items.push({
			url,
			lineOffset: Number.isFinite(lineOffset) ? lineOffset : undefined,
			lineLimit: Number.isFinite(lineLimit) ? lineLimit : undefined,
			totalLines: Number.isFinite(totalLines) ? totalLines : undefined,
			remainingLines:
				remainingLines === null || (typeof remainingLines === "number" && Number.isFinite(remainingLines))
					? remainingLines
					: undefined,
			error,
			success,
		});
		match = regex.exec(result);
	}

	return { items, error };
}

function computeCoveragePercent(intervals: Array<[number, number]>, totalLines: number): number | undefined {
	if (!Number.isFinite(totalLines) || totalLines <= 0) return undefined;
	if (intervals.length === 0) return undefined;

	const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
	let covered = 0;
	let curStart = sorted[0]?.[0] ?? 0;
	let curEnd = sorted[0]?.[1] ?? 0;

	for (const [start, end] of sorted.slice(1)) {
		if (start <= curEnd) {
			curEnd = Math.max(curEnd, end);
			continue;
		}
		covered += Math.max(0, curEnd - curStart);
		curStart = start;
		curEnd = end;
	}
	covered += Math.max(0, curEnd - curStart);

	const percent = Math.round((covered / totalLines) * 100);
	return Math.max(0, Math.min(100, percent));
}

export function deriveUrlMenuItems(params: {
	conversationHistory: ConversationMessage[];
	currentContentBlocks: ContentBlock[];
	latestGroundingMap: GroundingMap | null;
}): UrlMenuItem[] {
	const { conversationHistory, currentContentBlocks, latestGroundingMap } = params;

	const intervalsByUrl = new Map<string, Array<[number, number]>>();
	const totalLinesByUrl = new Map<string, number>();
	const lastSeenIndexByUrl = new Map<string, number>();
	const statusByUrl = new Map<string, "ok" | "error">();
	const errorByUrl = new Map<string, string>();

	const allBlocks = [
		...conversationHistory.flatMap((msg) => msg.contentBlocks ?? []),
		...currentContentBlocks,
	];

	for (const [blockIndex, block] of allBlocks.entries()) {
		if (block.type !== "tool") continue;
		if (block.call.name !== "fetchUrls" && block.call.name !== "renderUrl") continue;

		const input = block.call.input as { url?: string; requests?: Array<{ url?: string }> } | undefined;
		const urls: string[] = [];
		if (input?.url && typeof input.url === "string") {
			urls.push(input.url);
		}
		if (Array.isArray(input?.requests)) {
			for (const request of input.requests) {
				if (request?.url && typeof request.url === "string") {
					urls.push(request.url);
				}
			}
		}
		if (urls.length === 0) continue;

		for (const url of urls) {
			lastSeenIndexByUrl.set(url, blockIndex);
		}

		const result = block.result as
			| {
					success?: boolean;
					error?: string;
					results?: Array<{
						success?: boolean;
						url?: string;
						lineOffset?: number;
						lineLimit?: number;
						totalLines?: number;
						error?: string;
					}>;
					lineOffset?: number;
					lineLimit?: number;
					totalLines?: number;
			  }
			| undefined;

		if (!result) continue;

		if (typeof result === "string") {
			const parsed = parseFetchUrlsXml(result);
			for (const item of parsed.items) {
				const itemUrl = item.url;

				if (!item.success && item.error && item.error.trim().length > 0) {
					statusByUrl.set(itemUrl, "error");
					errorByUrl.set(itemUrl, item.error.trim());
				} else if (item.success) {
					statusByUrl.set(itemUrl, "ok");
				}

				if (typeof item.totalLines === "number" && item.totalLines > 0) {
					const prev = totalLinesByUrl.get(itemUrl) ?? 0;
					totalLinesByUrl.set(itemUrl, Math.max(prev, item.totalLines));
				}

				if (
					typeof item.lineOffset === "number" &&
					typeof item.lineLimit === "number" &&
					item.lineLimit > 0 &&
					item.lineOffset >= 0
				) {
					const start = item.lineOffset;
					const end = item.lineOffset + item.lineLimit;
					const list = intervalsByUrl.get(itemUrl) ?? [];
					list.push([start, end]);
					intervalsByUrl.set(itemUrl, list);
				}
			}
			if (parsed.items.length === 0 && parsed.error) {
				for (const url of urls) {
					statusByUrl.set(url, "error");
					errorByUrl.set(url, parsed.error);
				}
			}
			continue;
		}

		if (typeof result !== "object") continue;

		if (Array.isArray(result.results)) {
			for (const item of result.results) {
				if (!item || typeof item !== "object") continue;
				const itemUrl = typeof item.url === "string" ? item.url : null;
				if (!itemUrl) continue;

				if (item.success === false && typeof item.error === "string" && item.error.trim().length > 0) {
					statusByUrl.set(itemUrl, "error");
					errorByUrl.set(itemUrl, item.error.trim());
				} else if (item.success === true) {
					statusByUrl.set(itemUrl, "ok");
				}

				if (typeof item.totalLines === "number" && Number.isFinite(item.totalLines) && item.totalLines > 0) {
					const prev = totalLinesByUrl.get(itemUrl) ?? 0;
					totalLinesByUrl.set(itemUrl, Math.max(prev, item.totalLines));
				}

				if (
					typeof item.lineOffset === "number" &&
					typeof item.lineLimit === "number" &&
					Number.isFinite(item.lineOffset) &&
					Number.isFinite(item.lineLimit) &&
					item.lineLimit > 0 &&
					item.lineOffset >= 0
				) {
					const start = item.lineOffset;
					const end = item.lineOffset + item.lineLimit;
					const list = intervalsByUrl.get(itemUrl) ?? [];
					list.push([start, end]);
					intervalsByUrl.set(itemUrl, list);
				}
			}
		} else if (
			result.success === false &&
			typeof result.error === "string" &&
			result.error.trim().length > 0
		) {
			for (const url of urls) {
				statusByUrl.set(url, "error");
				errorByUrl.set(url, result.error.trim());
			}
		} else if (result.success === true) {
			for (const url of urls) {
				statusByUrl.set(url, "ok");
			}
		} else if (
			typeof result.totalLines === "number" &&
			Number.isFinite(result.totalLines) &&
			result.totalLines > 0 &&
			typeof result.lineOffset === "number" &&
			typeof result.lineLimit === "number"
		) {
			for (const url of urls) {
				const prev = totalLinesByUrl.get(url) ?? 0;
				totalLinesByUrl.set(url, Math.max(prev, result.totalLines));
				const start = result.lineOffset;
				const end = result.lineOffset + result.lineLimit;
				const list = intervalsByUrl.get(url) ?? [];
				list.push([start, end]);
				intervalsByUrl.set(url, list);
			}
		}
	}

	const groundedCountByUrl = new Map<string, number>();
	for (const groundedItem of latestGroundingMap?.items ?? []) {
		const groundedUrl = groundedItem.source?.url;
		if (!groundedUrl) continue;
		const next = (groundedCountByUrl.get(groundedUrl) ?? 0) + 1;
		groundedCountByUrl.set(groundedUrl, next);
	}

	function lookupGroundedCount(url: string): number {
		const direct = groundedCountByUrl.get(url);
		if (direct !== undefined) return direct;

		const key = normalizeUrlKey(url);
		for (const [gUrl, count] of groundedCountByUrl.entries()) {
			if (normalizeUrlKey(gUrl) === key) return count;
		}
		return 0;
	}

	const urls = [...lastSeenIndexByUrl.keys()];
	return urls.map((url) => {
		const groundedCount = lookupGroundedCount(url);
		const totalLines = totalLinesByUrl.get(url);
		const intervals = intervalsByUrl.get(url) ?? [];
		const readPercent = totalLines !== undefined ? computeCoveragePercent(intervals, totalLines) : undefined;
		const error = errorByUrl.get(url);
		const status = statusByUrl.get(url) ?? (error ? "error" : "ok");
		const lastSeenIndex = lastSeenIndexByUrl.get(url) ?? 0;

		return {
			url,
			groundedCount,
			readPercent,
			status,
			error,
			lastSeenIndex,
		};
	});
}

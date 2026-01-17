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
	const highlightsCountByUrl = new Map<string, number>();
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

		const input = block.call.input as { url?: string } | undefined;
		const url = input?.url;
		if (!url) continue;

		lastSeenIndexByUrl.set(url, blockIndex);

		const result = block.result as
			| {
					lineOffset?: number;
					lineLimit?: number;
					totalLines?: number;
					highlights?: unknown[];
					success?: boolean;
					error?: string;
			  }
			| undefined;

		if (!result || typeof result !== "object") continue;

		if (result.success === false && typeof result.error === "string" && result.error.trim().length > 0) {
			statusByUrl.set(url, "error");
			errorByUrl.set(url, result.error.trim());
		} else if (result.success === true) {
			statusByUrl.set(url, "ok");
		}

		if (Array.isArray(result.highlights)) {
			highlightsCountByUrl.set(url, result.highlights.length);
		}

		if (
			typeof result.totalLines === "number" &&
			Number.isFinite(result.totalLines) &&
			result.totalLines > 0
		) {
			const prev = totalLinesByUrl.get(url) ?? 0;
			totalLinesByUrl.set(url, Math.max(prev, result.totalLines));
		}

		if (
			typeof result.lineOffset === "number" &&
			typeof result.lineLimit === "number" &&
			Number.isFinite(result.lineOffset) &&
			Number.isFinite(result.lineLimit) &&
			result.lineLimit > 0 &&
			result.lineOffset >= 0
		) {
			const start = result.lineOffset;
			const end = result.lineOffset + result.lineLimit;
			const list = intervalsByUrl.get(url) ?? [];
			list.push([start, end]);
			intervalsByUrl.set(url, list);
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
		const highlightsCount = highlightsCountByUrl.get(url);
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
			highlightsCount,
			status,
			error,
			lastSeenIndex,
		};
	});
}

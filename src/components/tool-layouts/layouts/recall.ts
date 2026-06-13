import type { ToolLayoutConfig, ToolHeader, ToolPreviewSegment } from "../types";
import { registerToolLayout } from "../registry";
import { getSessionTitleSync } from "../../../state/session-store";
import { COLORS } from "../../../ui/constants";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractRecallInput(
	input: unknown
): { query?: string; sessionId?: string; messageIds?: number[] } | null {
	if (!isRecord(input)) return null;
	const query = typeof input.query === "string" ? input.query : undefined;
	const sessionId = typeof input.sessionId === "string" ? input.sessionId : undefined;
	const messageIds = Array.isArray(input.messageIds)
		? input.messageIds.filter((n): n is number => typeof n === "number")
		: undefined;
	if (!query && !sessionId && !messageIds) return null;
	return { query, sessionId, messageIds };
}

function tokenizeQuery(query: string): string[] {
	return query
		.toLowerCase()
		.split(/\s+/)
		.filter((token) => token.length > 0);
}

function highlightLine(text: string, queryTokens: string[]): ToolPreviewSegment[] {
	if (queryTokens.length === 0) {
		return [{ text }];
	}
	const segments: ToolPreviewSegment[] = [];
	const lower = text.toLowerCase();
	let cursor = 0;
	while (cursor < text.length) {
		let earliest: { index: number; length: number } | null = null;
		for (const token of queryTokens) {
			const found = lower.indexOf(token, cursor);
			if (found === -1) continue;
			if (earliest === null || found < earliest.index) {
				earliest = { index: found, length: token.length };
			}
		}
		if (!earliest) {
			segments.push({ text: text.slice(cursor) });
			break;
		}
		if (earliest.index > cursor) {
			segments.push({ text: text.slice(cursor, earliest.index) });
		}
		segments.push({
			text: text.slice(earliest.index, earliest.index + earliest.length),
			color: COLORS.TOOL_HIGHLIGHT,
		});
		cursor = earliest.index + earliest.length;
	}
	return segments;
}

function formatRecallResult(
	result: unknown,
	query: string | undefined
): (string | ToolPreviewSegment[])[] | null {
	if (!isRecord(result)) return null;
	if (result.success === false && typeof result.error === "string") {
		const segments: ToolPreviewSegment[] = [{ text: `error: ${result.error}` }];
		return [segments] as Array<string | ToolPreviewSegment[]>;
	}
	if (result.success !== true) return null;

	const count = typeof result.count === "number" ? result.count : 0;
	const xml = typeof result.xml === "string" ? result.xml : "";

	if (count === 0) {
		const segments: ToolPreviewSegment[] = [{ text: "no results" }];
		return [segments] as Array<string | ToolPreviewSegment[]>;
	}

	const MAX_LINES = 6;
	const MAX_HITS_PER_SESSION = 2;
	const tokens = query ? tokenizeQuery(query) : [];
	const lines: Array<string | ToolPreviewSegment[]> = [];
	let remaining = MAX_LINES;

	const sessionMatches = xml.matchAll(/<session\s+[^>]*title="([^"]*)"[^>]*>([\s\S]*?)<\/session>/g);
	for (const match of sessionMatches) {
		if (remaining <= 0) break;
		const title = match[1] ?? "session";
		const sessionBlock = match[2] ?? "";
		const hitCount = (sessionBlock.match(/<hit\b/g) ?? []).length;
		lines.push(`${title} (${hitCount} hit${hitCount !== 1 ? "s" : ""})`);
		remaining -= 1;

		let hitsShown = 0;
		const hits = sessionBlock.matchAll(/<hit[^>]*>([^<]*)<\/hit>/g);
		for (const hit of hits) {
			if (remaining <= 0 || hitsShown >= MAX_HITS_PER_SESSION) break;
			const snippet = (hit[1] ?? "").trim();
			if (snippet) {
				const truncated = snippet.length > 120 ? `${snippet.slice(0, 119)}…` : snippet;
				lines.push(highlightLine(`  ${truncated}`, tokens));
				remaining -= 1;
				hitsShown += 1;
			}
		}
	}

	if (lines.length === 0) {
		const messageMatches = xml.matchAll(/<message\s+id="(\d+)"\s+role="([^"]*)">([\s\S]*?)<\/message>/g);
		for (const match of messageMatches) {
			if (remaining <= 0) break;
			const id = match[1] ?? "?";
			const role = match[2] ?? "?";
			const content = (match[3] ?? "").trim();
			const truncated = content.length > 120 ? `${content.slice(0, 119)}…` : content;
			lines.push(highlightLine(`[${id}] ${role}: ${truncated}`, tokens));
			remaining -= 1;
		}
	}

	if (lines.length === 0) {
		const segments: ToolPreviewSegment[] = [{ text: `${count} result${count !== 1 ? "s" : ""}` }];
		return [segments] as Array<string | ToolPreviewSegment[]>;
	}
	if (count > lines.length) lines.push(`... (${count - lines.length} more)`);
	return lines;
}

export const recallLayout: ToolLayoutConfig = {
	abbreviation: "recall",

	getHeader: (input, _result): ToolHeader | null => {
		const params = extractRecallInput(input);
		if (!params) return null;

		const sessionTitle = params.sessionId ? getSessionTitleSync(params.sessionId) : undefined;

		if (params.query && params.sessionId) {
			return {
				primary: `"${params.query}"`,
				secondary: sessionTitle ? `in "${sessionTitle}"` : undefined,
			};
		}
		if (params.query) {
			return { primary: `"${params.query}"` };
		}
		if (params.sessionId && params.messageIds) {
			const count = `${params.messageIds.length} message${params.messageIds.length !== 1 ? "s" : ""}`;
			const title = sessionTitle ?? params.sessionId.slice(0, 8);
			return {
				primary: count,
				secondary: `from session "${title}"`,
			};
		}
		return null;
	},

	formatResult: (result: unknown, input?: unknown) =>
		formatRecallResult(result, extractRecallInput(input)?.query),
};

registerToolLayout("recall", recallLayout);

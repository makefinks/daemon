/**
 * Utilities for collapsing large pastes into placeholders so the prompt
 * stays compact and the textarea can grow naturally with content.
 *
 * Mirrors opencode's prompt behaviour: pastes that exceed a size threshold
 * are inserted as `[Pasted ~N lines]` (or `[Pasted ~N chars]`) placeholders
 * and the original text is tracked via an extmark. Callers are responsible
 * for inserting/extmarking the placeholder; this module only formats the
 * placeholder text and expands the original text back out on demand.
 */

export const PASTE_SUMMARY_TYPE_NAME = "daemon-paste-summary";
export const PASTE_SUMMARY_STYLE_NAME = "daemon.pasteSummary";

export const PASTE_SUMMARY_LINE_THRESHOLD = 3;
export const PASTE_SUMMARY_LENGTH_THRESHOLD = 150;

export function isLargePaste(text: string): boolean {
	if (!text) return false;
	if (text.length > PASTE_SUMMARY_LENGTH_THRESHOLD) return true;
	const lineCount = (text.match(/\n/g)?.length ?? 0) + 1;
	return lineCount >= PASTE_SUMMARY_LINE_THRESHOLD;
}

export function countPasteLines(text: string): number {
	return (text.match(/\n/g)?.length ?? 0) + 1;
}

export function formatPastePlaceholder(text: string): string {
	const lines = countPasteLines(text);
	if (lines > 1) return `[Pasted ~${lines} lines]`;
	return `[Pasted ~${text.length} chars]`;
}

export interface PasteSummaryRange {
	start: number;
	end: number;
	pasteId: string;
}

export interface PasteSummaryResolver {
	getFullText(pasteId: string): string | undefined;
}

export function expandPastePlaceholders(
	plainText: string,
	ranges: PasteSummaryRange[],
	resolver: PasteSummaryResolver
): string {
	if (ranges.length === 0) return plainText;
	const sorted = ranges.slice().sort((a, b) => b.start - a.start);
	let result = plainText;
	for (const range of sorted) {
		const fullText = resolver.getFullText(range.pasteId);
		if (fullText === undefined) continue;
		result = result.slice(0, range.start) + fullText + result.slice(range.end);
	}
	return result;
}

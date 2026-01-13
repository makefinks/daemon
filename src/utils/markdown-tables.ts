/**
 * Markdown table formatter based on OpenCode's table alignment fix.
 * Ensures cell widths match what the terminal actually renders with concealment.
 */

const widthCache = new Map<string, number>();
let cacheOperationCount = 0;

export interface MarkdownTableFormatOptions {
	maxWidth?: number;
}

export function formatMarkdownTables(text: string, options: MarkdownTableFormatOptions = {}): string {
	const lines = text.split("\n");
	const result: string[] = [];
	let i = 0;

	while (i < lines.length) {
		const line = lines[i];
		if (line === undefined) break;

		if (isTableRow(line)) {
			const tableLines: string[] = [line];
			i++;

			while (i < lines.length) {
				const nextLine = lines[i];
				if (nextLine === undefined || !isTableRow(nextLine)) break;
				tableLines.push(nextLine);
				i++;
			}

			if (isValidTable(tableLines)) {
				result.push(...formatTable(tableLines, options));
			} else {
				result.push(...tableLines);
			}
		} else {
			result.push(line);
			i++;
		}
	}

	incrementOperationCount();
	return result.join("\n");
}

function isTableRow(line: string): boolean {
	const trimmed = line.trim();
	return trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.split("|").length > 2;
}

function isSeparatorRow(line: string): boolean {
	const trimmed = line.trim();
	if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return false;
	const cells = trimmed.split("|").slice(1, -1);
	return cells.length > 0 && cells.every((cell) => /^\s*:?-+:?\s*$/.test(cell));
}

function isValidTable(lines: string[]): boolean {
	if (lines.length < 2) return false;

	const rows = lines.map((line) =>
		line
			.split("|")
			.slice(1, -1)
			.map((cell) => cell.trim())
	);

	const firstRow = rows[0];
	if (!firstRow || firstRow.length === 0) return false;

	const firstRowCellCount = firstRow.length;
	const allSameColumnCount = rows.every((row) => row.length === firstRowCellCount);
	if (!allSameColumnCount) return false;

	const hasSeparator = lines.some((line) => isSeparatorRow(line));
	return hasSeparator;
}

function formatTable(lines: string[], options: MarkdownTableFormatOptions): string[] {
	const separatorIndices = new Set<number>();
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line && isSeparatorRow(line)) separatorIndices.add(i);
	}

	const rows = lines.map((line) =>
		line
			.split("|")
			.slice(1, -1)
			.map((cell) => cell.trim())
	);

	if (rows.length === 0) return lines;

	const colCount = Math.max(...rows.map((row) => row.length));

	const colAlignments: Array<"left" | "center" | "right"> = Array(colCount).fill("left");
	for (const rowIndex of separatorIndices) {
		const row = rows[rowIndex];
		if (!row) continue;
		for (let col = 0; col < row.length; col++) {
			const cell = row[col] ?? "";
			colAlignments[col] = getAlignment(cell);
		}
	}

	const colWidths: number[] = Array(colCount).fill(3);
	for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
		if (separatorIndices.has(rowIndex)) continue;
		const row = rows[rowIndex];
		if (!row) continue;
		for (let col = 0; col < row.length; col++) {
			const displayWidth = calculateDisplayWidth(row[col] ?? "");
			const currentWidth = colWidths[col] ?? 0;
			colWidths[col] = Math.max(currentWidth, displayWidth);
		}
	}

	const totalWidth =
		2 + colWidths.reduce((sum, width) => sum + width, 0) + (colCount > 1 ? 3 * (colCount - 1) : 0) + 2;

	if (options.maxWidth && totalWidth > options.maxWidth) {
		return lines;
	}

	return rows.map((row, rowIndex) => {
		const cells: string[] = [];
		for (let col = 0; col < colCount; col++) {
			const cell = row[col] ?? "";
			const align = colAlignments[col] ?? "left";

			if (separatorIndices.has(rowIndex)) {
				cells.push(formatSeparatorCell(colWidths[col] ?? 3));
			} else {
				cells.push(padCell(cell, colWidths[col] ?? 3, align));
			}
		}
		if (separatorIndices.has(rowIndex)) {
			return "╞═" + cells.join("═╪═") + "═╡";
		}
		return "│ " + cells.join(" │ ") + " │";
	});
}

function getAlignment(delimiterCell: string): "left" | "center" | "right" {
	const trimmed = delimiterCell.trim();
	const hasLeftColon = trimmed.startsWith(":");
	const hasRightColon = trimmed.endsWith(":");

	if (hasLeftColon && hasRightColon) return "center";
	if (hasRightColon) return "right";
	return "left";
}

function calculateDisplayWidth(text: string): number {
	if (widthCache.has(text)) {
		return widthCache.get(text)!;
	}

	const width = getStringWidth(text);
	widthCache.set(text, width);
	return width;
}

function getStringWidth(text: string): number {
	// Strip markdown symbols for concealment mode.
	// Content inside backticks should preserve its inner markdown symbols.

	const codeBlocks: string[] = [];
	const textWithPlaceholders = text.replace(/`(.+?)`/g, (_match, content) => {
		codeBlocks.push(content);
		return `__DAEMON_CODE_BLOCK_${codeBlocks.length - 1}__`;
	});

	let visualText = textWithPlaceholders;
	let previousText = "";

	while (visualText !== previousText) {
		previousText = visualText;
		visualText = visualText
			.replace(/\*\*\*(.+?)\*\*\*/g, "$1")
			.replace(/\*\*(.+?)\*\*/g, "$1")
			.replace(/\*(.+?)\*/g, "$1")
			.replace(/~~(.+?)~~/g, "$1")
			.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "$1")
			.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
			.replace(/\[([^\]]+)\]\s*\[([^\]]*)\]/g, "$1")
			.replace(/\[(g\d+|\d+)\]/g, "$1");
	}

	visualText = visualText.replace(/__DAEMON_CODE_BLOCK_(\d+)__/g, (_match, index) => {
		return codeBlocks[Number(index)] ?? "";
	});

	const bun = (globalThis as { Bun?: { stringWidth: (value: string) => number } }).Bun;
	if (bun?.stringWidth) {
		return bun.stringWidth(visualText);
	}
	return Array.from(visualText).length;
}

function padCell(text: string, width: number, align: "left" | "center" | "right"): string {
	const displayWidth = calculateDisplayWidth(text);
	const totalPadding = Math.max(0, width - displayWidth);

	if (align === "center") {
		const leftPad = Math.floor(totalPadding / 2);
		const rightPad = totalPadding - leftPad;
		return " ".repeat(leftPad) + text + " ".repeat(rightPad);
	}
	if (align === "right") {
		return " ".repeat(totalPadding) + text;
	}
	return text + " ".repeat(totalPadding);
}

function formatSeparatorCell(width: number): string {
	return "═".repeat(width);
}

function incrementOperationCount() {
	cacheOperationCount++;

	if (cacheOperationCount > 100 || widthCache.size > 1000) {
		cleanupCache();
	}
}

function cleanupCache() {
	widthCache.clear();
	cacheOperationCount = 0;
}

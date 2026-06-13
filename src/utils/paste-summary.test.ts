/**
 * Tests for the paste-summary utility.
 *
 * Mirrors the formatting/threshold rules used by opencode's prompt component
 * so we keep the same "large paste → placeholder" UX.
 */

import { describe, expect, test } from "bun:test";
import {
	countPasteLines,
	expandPastePlaceholders,
	formatPastePlaceholder,
	isLargePaste,
} from "./paste-summary";

describe("isLargePaste", () => {
	test("returns false for short single-line text", () => {
		expect(isLargePaste("hello")).toBe(false);
	});

	test("returns false for short multi-line text under the line threshold", () => {
		expect(isLargePaste("line1\nline2")).toBe(false);
	});

	test("returns true at the line threshold", () => {
		expect(isLargePaste("a\nb\nc")).toBe(true);
	});

	test("returns true for long single-line text", () => {
		const long = "x".repeat(151);
		expect(isLargePaste(long)).toBe(true);
	});

	test("returns true just above the length threshold", () => {
		const at = "x".repeat(151);
		expect(isLargePaste(at)).toBe(true);
	});

	test("returns false at or below the length threshold without enough lines", () => {
		const at = "x".repeat(150);
		expect(isLargePaste(at)).toBe(false);
	});

	test("returns false for empty text", () => {
		expect(isLargePaste("")).toBe(false);
		expect(isLargePaste("   \n   ")).toBe(false);
	});
});

describe("countPasteLines", () => {
	test("counts single line as 1", () => {
		expect(countPasteLines("hello")).toBe(1);
	});

	test("counts explicit newlines", () => {
		expect(countPasteLines("a\nb\nc")).toBe(3);
	});
});

describe("formatPastePlaceholder", () => {
	test("formats multi-line pastes by line count", () => {
		expect(formatPastePlaceholder("a\nb\nc")).toBe("[Pasted ~3 lines]");
	});

	test("formats long single-line pastes by char count", () => {
		const text = "x".repeat(200);
		expect(formatPastePlaceholder(text)).toBe("[Pasted ~200 chars]");
	});
});

describe("expandPastePlaceholders", () => {
	const resolver = (mapping: Record<string, string>) => ({
		getFullText: (id: string) => mapping[id],
	});

	test("returns text untouched when no ranges", () => {
		expect(expandPastePlaceholders("hello world", [], resolver({}))).toBe("hello world");
	});

	test("expands a single placeholder in order", () => {
		const text = "before [Pasted ~2 lines] after";
		const expanded = expandPastePlaceholders(
			text,
			[{ start: 7, end: 7 + "[Pasted ~2 lines]".length, pasteId: "A" }],
			resolver({ A: "alpha\nbeta" })
		);
		expect(expanded).toBe("before alpha\nbeta after");
	});

	test("expands multiple placeholders from right to left", () => {
		const placeholderA = "[Pasted ~1 lines]";
		const placeholderB = "[Pasted ~1 lines]";
		const text = `${placeholderA} and ${placeholderB}`;
		const expanded = expandPastePlaceholders(
			text,
			[
				{ start: 0, end: placeholderA.length, pasteId: "A" },
				{
					start: placeholderA.length + " and ".length,
					end: placeholderA.length + " and ".length + placeholderB.length,
					pasteId: "B",
				},
			],
			resolver({ A: "first", B: "second" })
		);
		expect(expanded).toBe("first and second");
	});

	test("skips placeholders whose pasteId is missing from the resolver", () => {
		const text = "before [Pasted ~2 lines] after";
		const expanded = expandPastePlaceholders(
			text,
			[{ start: 7, end: 7 + "[Pasted ~2 lines]".length, pasteId: "missing" }],
			resolver({})
		);
		expect(expanded).toBe("before [Pasted ~2 lines] after");
	});
});

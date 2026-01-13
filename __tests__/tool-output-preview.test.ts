import { describe, it, expect } from "bun:test";
import { formatToolOutputPreview } from "../src/utils/tool-output-preview";

describe("formatToolOutputPreview", () => {
	it("returns null for undefined result", () => {
		expect(formatToolOutputPreview("runBash", undefined)).toBeNull();
	});

	it("formats successful bash result", () => {
		const result = { success: true, exitCode: 0, stdout: "hello world" };
		const output = formatToolOutputPreview("runBash", result);
		expect(output).toEqual(["stdout (success=true exit=0): hello world"]);
	});

	it("formats bash result with stderr", () => {
		const result = { success: false, exitCode: 1, stderr: "error occurred" };
		const output = formatToolOutputPreview("runBash", result);
		expect(output).toEqual(["stderr (success=false exit=1): error occurred"]);
	});

	it("formats bash result with error string", () => {
		const result = { success: true, error: "some error" };
		const output = formatToolOutputPreview("runBash", result);
		expect(output).toEqual(["error (success=true): some error"]);
	});

	it("formats bash result with success flag only", () => {
		const result = { success: true };
		const output = formatToolOutputPreview("runBash", result);
		expect(output).toEqual(["success=true"]);
	});

	it("formats bash result with exit code and success", () => {
		const result = { success: false, exitCode: 1 };
		const output = formatToolOutputPreview("runBash", result);
		expect(output).toEqual(["success=false exit=1"]);
	});

	it("handles null bash result", () => {
		expect(formatToolOutputPreview("runBash", null)).toBeNull();
	});

	describe("webSearch formatting", () => {
		it("formats web search results", () => {
			const result = {
				success: true,
				data: {
					results: [
						{ title: "Test Title", url: "https://example.com", text: "content" },
						{ title: "Another", url: "https://example.org", text: "more" },
					],
				},
			};
			const output = formatToolOutputPreview("webSearch", result);
			expect(output).toHaveLength(2);
			expect(output?.[0]).toBe("1) Test Title — https://example.com");
			expect(output?.[1]).toBe("2) Another — https://example.org");
		});

		it("handles web search with contents field", () => {
			const result = {
				success: true,
				data: {
					contents: [{ url: "https://example.com", title: "Test" }],
				},
			};
			const output = formatToolOutputPreview("webSearch", result);
			expect(output).toEqual(["1) Test — https://example.com"]);
		});

		it("handles web search with missing titles", () => {
			const result = {
				success: true,
				data: {
					results: [{ url: "https://example.com", title: "" }],
				},
			};
			const output = formatToolOutputPreview("webSearch", result);
			expect(output).toEqual(["1) https://example.com"]);
		});

		it("handles web search errors", () => {
			const result = { success: false, error: "API error" };
			const output = formatToolOutputPreview("webSearch", result);
			expect(output).toEqual(["error: API error"]);
		});

		it("handles null web search result", () => {
			expect(formatToolOutputPreview("webSearch", null)).toBeNull();
		});
	});

	describe("fetchUrls formatting", () => {
		it("formats fetch result", () => {
			const result = {
				success: true,
				url: "https://example.com",
				text: "This is page content\n\nWith multiple lines",
				remainingLines: 0,
			};
			const output = formatToolOutputPreview("fetchUrls", result);
			expect(output).toHaveLength(3);
			expect(output?.[0]).toBe("https://example.com (remainingLines=0)");
			expect(output?.[1]).toMatch(/This is page content/);
		});

		it("truncates long content", () => {
			const longText = "a".repeat(300);
			const result = {
				success: true,
				url: "https://example.com",
				text: longText,
				remainingLines: null,
			};
			const output = formatToolOutputPreview("fetchUrls", result);
			expect(output?.[1].length).toBeLessThanOrEqual(160);
		});

		it("handles fetch errors", () => {
			const result = { success: false, error: "404 Not Found" };
			const output = formatToolOutputPreview("fetchUrls", result);
			expect(output).toEqual(["error: 404 Not Found"]);
		});
	});

	describe("renderUrl formatting", () => {
		it("formats render result", () => {
			const result = {
				success: true,
				url: "https://example.com",
				text: "Rendered page text\n\nWith multiple lines",
				remainingLines: 42,
			};
			const output = formatToolOutputPreview("renderUrl", result);
			expect(output).toHaveLength(3);
			expect(output?.[0]).toBe("https://example.com (remainingLines=42)");
			expect(output?.[1]).toMatch(/Rendered page text/);
		});

		it("handles render errors", () => {
			const result = { success: false, error: "Playwright missing" };
			const output = formatToolOutputPreview("renderUrl", result);
			expect(output).toEqual(["error: Playwright missing"]);
		});
	});

	describe("readFile formatting", () => {
		it("formats file read result", () => {
			const result = {
				success: true,
				path: "/path/to/file.ts",
				startLine: 1,
				endLine: 10,
				content: "file content",
			};
			const output = formatToolOutputPreview("readFile", result);
			expect(output).toEqual(["/path/to/file.ts (1-10):", "file content"]);
		});

		it("formats with hasMore flag", () => {
			const result = {
				success: true,
				path: "/path/to/file.ts",
				startLine: 1,
				endLine: 100,
				hasMore: true,
				content: "content",
			};
			const output = formatToolOutputPreview("readFile", result);
			expect(output?.[0]).toBe("/path/to/file.ts (1-100+):");
		});

		it("handles empty content", () => {
			const result = {
				success: true,
				path: "/path/to/file.ts",
				content: "   ",
			};
			const output = formatToolOutputPreview("readFile", result);
			expect(output).toEqual(["/path/to/file.ts"]);
		});

		it("handles missing path", () => {
			const result = {
				success: true,
				content: "content",
			};
			const output = formatToolOutputPreview("readFile", result);
			expect(output?.[0]).toBe(":");
		});
	});

	describe("unknown tool and general errors", () => {
		it("returns null for unknown tool with success result", () => {
			const result = { success: true, data: "something" };
			expect(formatToolOutputPreview("unknownTool", result)).toBeNull();
		});

		it("formats error for unknown tool with error", () => {
			const result = { success: false, error: "tool failed" };
			const output = formatToolOutputPreview("unknownTool", result);
			expect(output).toEqual(["error: tool failed"]);
		});

		it("handles non-record results for unknown tools", () => {
			expect(formatToolOutputPreview("unknownTool", "string")).toBeNull();
			expect(formatToolOutputPreview("unknownTool", 123)).toBeNull();
		});
	});

	describe("truncation behavior", () => {
		it("truncates to max lines", () => {
			const result = {
				success: true,
				stdout: Array.from({ length: 10 }, () => "line").join("\n"),
			};
			const output = formatToolOutputPreview("runBash", result);
			expect(output?.length).toBeLessThanOrEqual(4);
		});

		it("truncates long lines", () => {
			const longLine = "x".repeat(300);
			const result = { success: true, stdout: longLine };
			const output = formatToolOutputPreview("runBash", result);
			expect(output?.[0].length).toBeLessThanOrEqual(160);
		});

		it("respects total character limit", () => {
			const result = {
				success: true,
				stdout: Array.from({ length: 3 }, (_, i) => "x".repeat(100)).join("\n"),
			};
			const output = formatToolOutputPreview("runBash", result);
			const totalLength = output?.reduce((sum, line) => sum + line.length, 0) ?? 0;
			expect(totalLength).toBeLessThanOrEqual(260);
		});

		it("adds ellipsis when truncated", () => {
			const result = { success: true, stdout: "a".repeat(200) };
			const output = formatToolOutputPreview("runBash", result);
			expect(output?.[0]).toEndWith("…");
		});
	});
});

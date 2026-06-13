import { describe, expect, it } from "bun:test";
import { buildStructuredTextFragmentUrl, textFragmentDisplayText } from "../src/utils/text-fragment";

describe("buildStructuredTextFragmentUrl", () => {
	it("adds text fragment to plain URL", () => {
		const url = "https://example.com/article";
		const fragment = { textStart: "hello world" };
		const result = buildStructuredTextFragmentUrl(url, fragment);
		expect(result).toBe("https://example.com/article#:~:text=hello%20world");
	});

	it("appends text fragment to existing hash", () => {
		const url = "https://example.com/article#section";
		const fragment = { textStart: "hello" };
		const result = buildStructuredTextFragmentUrl(url, fragment);
		expect(result).toBe("https://example.com/article#section:~:text=hello");
	});

	it("replaces existing text fragment", () => {
		const url = "https://example.com/article#:~:text=oldtext";
		const fragment = { textStart: "newtext" };
		const result = buildStructuredTextFragmentUrl(url, fragment);
		expect(result).toBe("https://example.com/article#:~:text=newtext");
	});

	it("replaces existing text fragment with hash", () => {
		const url = "https://example.com/article#section:~:text=oldtext";
		const fragment = { textStart: "newtext" };
		const result = buildStructuredTextFragmentUrl(url, fragment);
		expect(result).toBe("https://example.com/article#section:~:text=newtext");
	});

	it("encodes special characters in fragment parts", () => {
		const url = "https://example.com/article";
		const fragment = { textStart: "hello & goodbye" };
		const result = buildStructuredTextFragmentUrl(url, fragment);
		expect(result).toBe("https://example.com/article#:~:text=hello%20%26%20goodbye");
	});

	it("encodes dashes and commas inside fragment parts", () => {
		const url = "https://example.com/article";
		const fragment = { textStart: "word-with, punctuation" };
		const result = buildStructuredTextFragmentUrl(url, fragment);
		expect(result).toBe("https://example.com/article#:~:text=word%2Dwith%2C%20punctuation");
	});

	it("returns original URL if textStart is empty", () => {
		const url = "https://example.com/article";
		const fragment = { textStart: "" };
		const result = buildStructuredTextFragmentUrl(url, fragment);
		expect(result).toBe("https://example.com/article");
	});

	it("handles URL with query string", () => {
		const url = "https://example.com/article?page=1&sort=date";
		const fragment = { textStart: "hello" };
		const result = buildStructuredTextFragmentUrl(url, fragment);
		expect(result).toBe("https://example.com/article?page=1&sort=date#:~:text=hello");
	});

	it("handles URL with query string and hash", () => {
		const url = "https://example.com/article?page=1#section";
		const fragment = { textStart: "hello" };
		const result = buildStructuredTextFragmentUrl(url, fragment);
		expect(result).toBe("https://example.com/article?page=1#section:~:text=hello");
	});

	it("builds a range fragment", () => {
		const url = "https://example.com/article";
		const fragment = { textStart: "start text", textEnd: "end text" };
		const result = buildStructuredTextFragmentUrl(url, fragment);
		expect(result).toBe("https://example.com/article#:~:text=start%20text,end%20text");
	});

	it("builds a prefix fragment", () => {
		const url = "https://example.com/article";
		const fragment = { prefix: "before text", textStart: "target" };
		const result = buildStructuredTextFragmentUrl(url, fragment);
		expect(result).toBe("https://example.com/article#:~:text=before%20text-,target");
	});

	it("builds a suffix fragment", () => {
		const url = "https://example.com/article";
		const fragment = { textStart: "target", suffix: "after text" };
		const result = buildStructuredTextFragmentUrl(url, fragment);
		expect(result).toBe("https://example.com/article#:~:text=target,-after%20text");
	});

	it("builds a prefix and suffix range fragment", () => {
		const url = "https://example.com/article";
		const fragment = {
			prefix: "before",
			textStart: "first",
			textEnd: "last",
			suffix: "after",
		};
		const result = buildStructuredTextFragmentUrl(url, fragment);
		expect(result).toBe("https://example.com/article#:~:text=before-,first,last,-after");
	});

	it("encodes punctuation correctly", () => {
		const url = "https://example.com/article";
		const fragment = { textStart: "Hello, world! How are you?" };
		const result = buildStructuredTextFragmentUrl(url, fragment);
		expect(result).toContain(":~:text=");
		expect(result).toContain("Hello%2C%20world!");
	});
});

describe("textFragmentDisplayText", () => {
	it("shows the start text for simple fragments", () => {
		expect(textFragmentDisplayText({ textStart: "hello" })).toBe("hello");
	});

	it("shows the start and end text for range fragments", () => {
		expect(textFragmentDisplayText({ textStart: "first", textEnd: "last" })).toBe("first ... last");
	});
});

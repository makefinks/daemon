import { describe, expect, it } from "bun:test";
import { buildTextFragmentUrl } from "../src/utils/text-fragment";

describe("buildTextFragmentUrl", () => {
	it("adds text fragment to plain URL", () => {
		const url = "https://example.com/article";
		const fragment = { fragmentText: "hello world" };
		const result = buildTextFragmentUrl(url, fragment);
		expect(result).toBe("https://example.com/article#:~:text=hello%20world");
	});

	it("appends text fragment to existing hash", () => {
		const url = "https://example.com/article#section";
		const fragment = { fragmentText: "hello" };
		const result = buildTextFragmentUrl(url, fragment);
		expect(result).toBe("https://example.com/article#section:~:text=hello");
	});

	it("replaces existing text fragment", () => {
		const url = "https://example.com/article#:~:text=oldtext";
		const fragment = { fragmentText: "newtext" };
		const result = buildTextFragmentUrl(url, fragment);
		expect(result).toBe("https://example.com/article#:~:text=newtext");
	});

	it("replaces existing text fragment with hash", () => {
		const url = "https://example.com/article#section:~:text=oldtext";
		const fragment = { fragmentText: "newtext" };
		const result = buildTextFragmentUrl(url, fragment);
		expect(result).toBe("https://example.com/article#section:~:text=newtext");
	});

	it("encodes special characters in fragment", () => {
		const url = "https://example.com/article";
		const fragment = { fragmentText: "hello & goodbye" };
		const result = buildTextFragmentUrl(url, fragment);
		expect(result).toBe("https://example.com/article#:~:text=hello%20%26%20goodbye");
	});

	it("encodes dashes in fragment", () => {
		const url = "https://example.com/article";
		const fragment = { fragmentText: "word-with-dashes" };
		const result = buildTextFragmentUrl(url, fragment);
		expect(result).toBe("https://example.com/article#:~:text=word%2Dwith%2Ddashes");
	});

	it("returns original URL if fragmentText is empty", () => {
		const url = "https://example.com/article";
		const fragment = { fragmentText: "" };
		const result = buildTextFragmentUrl(url, fragment);
		expect(result).toBe("https://example.com/article");
	});

	it("handles URL with query string", () => {
		const url = "https://example.com/article?page=1&sort=date";
		const fragment = { fragmentText: "hello" };
		const result = buildTextFragmentUrl(url, fragment);
		expect(result).toBe("https://example.com/article?page=1&sort=date#:~:text=hello");
	});

	it("handles URL with query string and hash", () => {
		const url = "https://example.com/article?page=1#section";
		const fragment = { fragmentText: "hello" };
		const result = buildTextFragmentUrl(url, fragment);
		expect(result).toBe("https://example.com/article?page=1#section:~:text=hello");
	});

	it("encodes punctuation correctly", () => {
		const url = "https://example.com/article";
		const fragment = { fragmentText: "Hello, world! How are you?" };
		const result = buildTextFragmentUrl(url, fragment);
		expect(result).toContain(":~:text=");
		expect(result).toContain("Hello%2C%20world!");
	});
});

import { describe, expect, it } from "bun:test";

import { buildDaemonSystemPrompt } from "../src/ai/system-prompt";

describe("MCP guidance in system prompt", () => {
	it("omits default MCP guidance when none is provided", () => {
		const prompt = buildDaemonSystemPrompt({ currentDate: new Date("2026-01-01T00:00:00.000Z") });

		expect(prompt).not.toContain("Default MCP Tools");
		expect(prompt).not.toContain("Chrome DevTools MCP");
	});

	it("includes provided MCP guidance", () => {
		const prompt = buildDaemonSystemPrompt({
			currentDate: new Date("2026-01-01T00:00:00.000Z"),
			mcpToolGuidance: [
				`### Chrome DevTools MCP
Use evaluate_script to highlight relevant page sections.
Do not take a screenshot for this behavior unless the user explicitly asks for one.`,
			],
		});

		expect(prompt).toContain("Default MCP Tools");
		expect(prompt).toContain("Chrome DevTools MCP");
		expect(prompt).toContain("evaluate_script");
		expect(prompt).toContain("unless the user explicitly asks for one");
	});
});

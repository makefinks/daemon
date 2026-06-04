import { tool } from "ai";
import { z } from "zod";

import { loadSkillResource as loadConfiguredSkillResource } from "../skills/skill-manager";

export const loadSkillResource = tool({
	description:
		"Read a text resource bundled with a configured Agent Skill. Paths are relative to the skill directory and must stay inside it.",
	inputSchema: z.object({
		skillName: z.string().describe("The exact name of the skill that owns the resource."),
		path: z
			.string()
			.describe("Resource path relative to the skill directory, for example references/API.md."),
	}),
	execute: async ({ skillName, path }) => {
		try {
			const result = await loadConfiguredSkillResource(skillName, path);
			return {
				success: true,
				skillName: result.skill.name,
				path,
				resolvedPath: result.resolvedPath,
				content: result.content,
			};
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			return {
				success: false,
				skillName,
				path,
				error: err.message,
			};
		}
	},
});

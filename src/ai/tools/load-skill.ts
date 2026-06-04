import { tool } from "ai";
import { z } from "zod";

import { loadSkill as loadConfiguredSkill } from "../skills/skill-manager";

export const loadSkill = tool({
	description:
		"Load a configured Agent Skill by name. Use this when the user's task matches a skill listed in the system prompt. Returns the skill instructions and bundled resource paths.",
	inputSchema: z.object({
		name: z.string().describe("The exact name of the skill to load."),
	}),
	execute: async ({ name }) => {
		try {
			const skill = await loadConfiguredSkill(name);
			if (!skill) {
				return {
					success: false,
					name,
					error: `Skill not found: ${name}`,
				};
			}

			return {
				success: true,
				name: skill.name,
				description: skill.description,
				skillDirectory: skill.skillDirectory,
				instructions: skill.instructions,
				resources: skill.resources,
			};
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			return {
				success: false,
				name,
				error: err.message,
			};
		}
	},
});

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
	discoverSkills,
	ensureSkillsDir,
	getSkillCatalog,
	getSkillsDir,
	loadSkill,
	loadSkillResource,
	parseSkillFile,
	setSkillToggles,
} from "../src/ai/skills/skill-manager";
import { buildDaemonSystemPrompt } from "../src/ai/system-prompt";
import { buildToolSet, getDefaultToolOrder } from "../src/ai/tools/tool-registry";
import { DEFAULT_TOOL_TOGGLES } from "../src/types";

const ORIGINAL_CONFIG_DIR = process.env.DAEMON_CONFIG_DIR;

let tempConfigDir: string;

async function writeSkill(name: string, content: string): Promise<string> {
	const skillDir = path.join(getSkillsDir(), name);
	await fs.mkdir(skillDir, { recursive: true });
	await fs.writeFile(path.join(skillDir, "SKILL.md"), content, "utf8");
	return skillDir;
}

describe("Agent Skills", () => {
	beforeEach(async () => {
		tempConfigDir = await fs.mkdtemp(path.join(os.tmpdir(), "daemon-skills-test-"));
		process.env.DAEMON_CONFIG_DIR = tempConfigDir;
		setSkillToggles({});
	});

	afterEach(async () => {
		if (ORIGINAL_CONFIG_DIR === undefined) {
			Reflect.deleteProperty(process.env, "DAEMON_CONFIG_DIR");
		} else {
			process.env.DAEMON_CONFIG_DIR = ORIGINAL_CONFIG_DIR;
		}
		await fs.rm(tempConfigDir, { recursive: true, force: true });
	});

	it("creates an empty config skills directory", async () => {
		const skillsDir = await ensureSkillsDir();
		const entries = await fs.readdir(skillsDir);

		expect(skillsDir).toBe(path.join(tempConfigDir, "skills"));
		expect(entries).toEqual([]);
	});

	it("discovers immediate child skill directories with valid SKILL.md files", async () => {
		await writeSkill(
			"code-review",
			`---
name: code-review
description: Reviews code for bugs and regressions. Use when asked for code review.
---

# Code Review
Inspect the diff first.
`
		);
		await fs.writeFile(path.join(getSkillsDir(), "SKILL.md"), "ignored", "utf8");

		const skills = await discoverSkills();

		expect(skills.some((skill) => skill.name === "daemon-config")).toBe(true);
		expect(skills.some((skill) => skill.name === "code-review")).toBe(true);
		expect(skills.find((skill) => skill.name === "code-review")?.description).toContain("Reviews code");
	});

	it("includes daemon-config as a built-in skill without creating it in the config skills directory", async () => {
		const skillsDir = await ensureSkillsDir();
		const skills = await discoverSkills();
		const entries = await fs.readdir(skillsDir);

		expect(entries).toEqual([]);
		expect(skills.some((skill) => skill.name === "daemon-config")).toBe(true);
	});

	it("filters disabled skills from discovery and loading", async () => {
		await writeSkill(
			"optional-skill",
			`---
name: optional-skill
description: Optional skill for toggle testing. Use when testing disabled skills.
---

Optional body.
`
		);
		setSkillToggles({ "optional-skill": false });

		const skills = await discoverSkills();

		expect(skills.some((skill) => skill.name === "optional-skill")).toBe(false);
		expect(await loadSkill("optional-skill")).toBeNull();
	});

	it("skips invalid skills without failing discovery", async () => {
		await writeSkill(
			"valid-skill",
			`---
name: valid-skill
description: Handles valid tasks. Use when testing valid skills.
---

Valid body.
`
		);
		await writeSkill(
			"wrong-dir",
			`---
name: other-name
description: This should be skipped because the directory mismatches.
---

Invalid body.
`
		);
		await writeSkill(
			"BadName",
			`---
name: BadName
description: This should be skipped because the name is invalid.
---

Invalid body.
`
		);

		const skills = await discoverSkills();

		expect(skills.map((skill) => skill.name)).toEqual(["daemon-config", "valid-skill"]);
	});

	it("parses folded YAML descriptions", () => {
		const parsed = parseSkillFile(`---
name: folded-description
description: >-
  Handles multi-line YAML descriptions.
  Use when skills contain folded frontmatter.
---

Skill body.
`);

		expect(parsed.frontmatter.description).toBe(
			"Handles multi-line YAML descriptions. Use when skills contain folded frontmatter."
		);
		expect(parsed.body).toBe("Skill body.");
	});

	it("loads body-only skill instructions and lists bundled resources", async () => {
		const skillDir = await writeSkill(
			"research-helper",
			`---
name: research-helper
description: Helps research technical topics. Use when gathering references.
---

# Research Helper
Read references/checklist.md when planning research.
`
		);
		await fs.mkdir(path.join(skillDir, "references"));
		await fs.writeFile(path.join(skillDir, "references", "checklist.md"), "Checklist", "utf8");

		const skill = await loadSkill("research-helper");

		expect(skill?.instructions).toContain("# Research Helper");
		expect(skill?.instructions).not.toContain("name: research-helper");
		expect(skill?.resources.references).toEqual(["references/checklist.md"]);
	});

	it("loads the built-in daemon-config skill", async () => {
		const skill = await loadSkill("daemon-config");

		expect(skill?.instructions).toContain("# Your Configuration");
		expect(skill?.skillDirectory).toBe("built-in:daemon-config");
		expect(skill?.resources).toEqual({ references: [], assets: [], scripts: [] });
	});

	it("loads text resources and blocks path traversal", async () => {
		const skillDir = await writeSkill(
			"resource-test",
			`---
name: resource-test
description: Tests skill resource loading. Use when validating resource access.
---

Read references/data.md.
`
		);
		await fs.mkdir(path.join(skillDir, "references"));
		await fs.writeFile(path.join(skillDir, "references", "data.md"), "safe content", "utf8");
		await fs.writeFile(path.join(tempConfigDir, "secret.md"), "secret", "utf8");

		const loaded = await loadSkillResource("resource-test", "references/data.md");
		expect(loaded.content).toBe("safe content");

		await expect(loadSkillResource("resource-test", "../secret.md")).rejects.toThrow(
			"Resource path must stay inside the skill directory."
		);
	});

	it("injects skill catalog into the system prompt", async () => {
		await writeSkill(
			"prompt-skill",
			`---
name: prompt-skill
description: Appears in the prompt catalog. Use when checking prompt injection.
---

Prompt skill body.
`
		);
		const skillCatalog = await getSkillCatalog();
		const prompt = buildDaemonSystemPrompt({
			currentDate: new Date("2026-01-01T00:00:00.000Z"),
			skillCatalog,
		});

		expect(prompt).toContain("# Skills");
		expect(prompt).toContain("<available_skills>");
		expect(prompt).toContain("<name>prompt-skill</name>");
		expect(prompt).not.toContain("Prompt skill body");
	});

	it("omits skill catalog prompt section when no skills are configured", () => {
		const prompt = buildDaemonSystemPrompt({ currentDate: new Date("2026-01-01T00:00:00.000Z") });

		expect(prompt).not.toContain("<available_skills>");
	});

	it("registers skill tools in the default toolset", async () => {
		const { tools } = await buildToolSet({ ...DEFAULT_TOOL_TOGGLES });

		expect(getDefaultToolOrder()).toContain("loadSkill");
		expect(getDefaultToolOrder()).toContain("loadSkillResource");
		expect("loadSkill" in tools).toBe(true);
		expect("loadSkillResource" in tools).toBe(true);
	});
});

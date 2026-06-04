import { promises as fs } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";

import { debug } from "../../utils/debug-logger";
import { getAppConfigDir } from "../../utils/preferences";
import type { SkillToggles } from "../../types";
import { BUILTIN_SKILLS, getBuiltinSkillContent } from "./builtin-skills";
import { getDaemonManager } from "../../state/daemon-state";

const SKILLS_DIR_NAME = "skills";
const SKILL_FILE_NAME = "SKILL.md";
const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESOURCE_EXTENSIONS = new Set([
	".md",
	".txt",
	".json",
	".yaml",
	".yml",
	".csv",
	".xml",
	".py",
	".js",
	".ts",
	".tsx",
	".jsx",
	".sh",
	".ps1",
	".toml",
]);

export interface SkillCatalogEntry {
	name: string;
	description: string;
}

export interface AgentSkill extends SkillCatalogEntry {
	skillFilePath: string;
	skillDirectory: string;
	source: "built-in" | "user";
	license?: string;
	compatibility?: string;
	allowedTools?: string;
	metadata?: Record<string, unknown>;
}

export interface LoadedSkill extends AgentSkill {
	instructions: string;
	resources: SkillResourceListing;
}

export interface SkillResourceListing {
	references: string[];
	assets: string[];
	scripts: string[];
}

interface ParsedSkillFile {
	frontmatter: Record<string, unknown>;
	body: string;
}

export function setSkillToggles(toggles: SkillToggles | undefined): void {
	getDaemonManager().skillToggles = { ...(toggles ?? {}) };
}

export function getSkillToggles(): SkillToggles {
	return { ...getDaemonManager().skillToggles };
}

export function isSkillEnabled(name: string, toggles?: SkillToggles): boolean {
	const t = toggles ?? getDaemonManager().skillToggles;
	return t[name] !== false;
}

export function getSkillsDir(): string {
	return path.join(getAppConfigDir(), SKILLS_DIR_NAME);
}

export async function ensureSkillsDir(): Promise<string> {
	const skillsDir = getSkillsDir();
	await fs.mkdir(skillsDir, { recursive: true });
	return skillsDir;
}

export async function discoverSkills(): Promise<AgentSkill[]> {
	const skills = await discoverAllSkills();
	return skills.filter((skill) => isSkillEnabled(skill.name));
}

export async function discoverAllSkills(): Promise<AgentSkill[]> {
	const builtInSkills = discoverBuiltinSkills();
	const seen = new Set(builtInSkills.map((skill) => skill.name));
	const userSkills = await discoverUserSkills(seen);
	return [...builtInSkills, ...userSkills].sort((a, b) => a.name.localeCompare(b.name));
}

async function discoverUserSkills(seen: Set<string>): Promise<AgentSkill[]> {
	const skillsDir = await ensureSkillsDir();
	let entries: Array<{ name: string; isDirectory(): boolean }>;

	try {
		entries = await fs.readdir(skillsDir, { withFileTypes: true });
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		debug.error("skills-discovery-failed", { message: err.message });
		return [];
	}

	const skills: AgentSkill[] = [];

	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const skillDirectory = path.join(skillsDir, entry.name);
		const skillFilePath = path.join(skillDirectory, SKILL_FILE_NAME);

		try {
			const skill = await readSkillMetadata(skillFilePath, skillDirectory);
			if (seen.has(skill.name)) {
				debug.warn("skills-duplicate-skipped", { name: skill.name, skillFilePath });
				continue;
			}
			seen.add(skill.name);
			skills.push(skill);
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			debug.warn("skills-skill-skipped", { skillFilePath, message: err.message });
		}
	}

	return skills;
}

function discoverBuiltinSkills(): AgentSkill[] {
	const skills: AgentSkill[] = [];
	for (const builtin of BUILTIN_SKILLS) {
		const skillDirectory = `built-in:${builtin.name}`;
		const skillFilePath = `${skillDirectory}/${SKILL_FILE_NAME}`;
		try {
			const { frontmatter } = parseSkillFile(builtin.content);
			skills.push(parseSkillMetadata(frontmatter, skillFilePath, skillDirectory, builtin.name));
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			debug.warn("skills-builtin-skipped", { name: builtin.name, message: err.message });
		}
	}
	return skills;
}

export async function getSkillCatalog(): Promise<SkillCatalogEntry[]> {
	const skills = await discoverSkills();
	return skills.map(({ name, description }) => ({ name, description }));
}

export async function loadSkill(name: string): Promise<LoadedSkill | null> {
	const normalizedName = name.trim();
	if (!normalizedName) return null;

	const skills = await discoverSkills();
	const skill = skills.find((candidate) => candidate.name === normalizedName);
	if (!skill) return null;

	const raw = getBuiltinSkillContent(skill.name) ?? (await fs.readFile(skill.skillFilePath, "utf8"));
	const parsed = parseSkillFile(raw);
	return {
		...skill,
		instructions: parsed.body,
		resources: isBuiltinSkill(skill)
			? { references: [], assets: [], scripts: [] }
			: await listSkillResources(skill.skillDirectory),
	};
}

export async function loadSkillResource(
	skillName: string,
	resourcePath: string
): Promise<{
	skill: AgentSkill;
	resolvedPath: string;
	content: string;
}> {
	const skill = await findSkill(skillName);
	if (!skill) {
		throw new Error(`Skill not found: ${skillName}`);
	}
	if (isBuiltinSkill(skill)) {
		throw new Error(`Built-in skill '${skill.name}' has no external resources.`);
	}

	const normalizedResourcePath = resourcePath.trim();
	if (!normalizedResourcePath) {
		throw new Error("Resource path is required.");
	}
	if (path.isAbsolute(normalizedResourcePath)) {
		throw new Error("Resource path must be relative to the skill directory.");
	}

	const resolvedPath = path.resolve(skill.skillDirectory, normalizedResourcePath);
	const relativePath = path.relative(skill.skillDirectory, resolvedPath);
	if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
		throw new Error("Resource path must stay inside the skill directory.");
	}

	const extension = path.extname(resolvedPath).toLowerCase();
	if (!RESOURCE_EXTENSIONS.has(extension)) {
		throw new Error(`Unsupported resource type: ${extension || "unknown"}`);
	}

	const content = await fs.readFile(resolvedPath, "utf8");
	return { skill, resolvedPath, content };
}

async function findSkill(name: string): Promise<AgentSkill | null> {
	const normalizedName = name.trim();
	if (!normalizedName) return null;
	const skills = await discoverSkills();
	return skills.find((skill) => skill.name === normalizedName) ?? null;
}

async function readSkillMetadata(skillFilePath: string, skillDirectory: string): Promise<AgentSkill> {
	const raw = await fs.readFile(skillFilePath, "utf8");
	const { frontmatter } = parseSkillFile(raw);
	return parseSkillMetadata(frontmatter, skillFilePath, skillDirectory);
}

export function parseSkillFile(raw: string): ParsedSkillFile {
	const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
	if (!match?.[1]) {
		throw new Error("SKILL.md must start with YAML frontmatter.");
	}

	const parsed = parseYaml(match[1]) as unknown;
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error("Skill frontmatter must be a YAML mapping.");
	}

	return {
		frontmatter: parsed as Record<string, unknown>,
		body: raw.slice(match[0].length).trim(),
	};
}

function parseSkillMetadata(
	frontmatter: Record<string, unknown>,
	skillFilePath: string,
	skillDirectory: string,
	expectedDirectoryName = path.basename(skillDirectory)
): AgentSkill {
	const name = readRequiredString(frontmatter, "name");
	const description = readRequiredString(frontmatter, "description");

	if (name.length > 64 || !SKILL_NAME_PATTERN.test(name)) {
		throw new Error(`Invalid skill name: ${name}`);
	}
	if (name !== expectedDirectoryName) {
		throw new Error(`Skill name '${name}' must match directory '${expectedDirectoryName}'.`);
	}
	if (description.length > 1024) {
		throw new Error(`Skill description for '${name}' exceeds 1024 characters.`);
	}

	const skill: AgentSkill = {
		name,
		description,
		skillFilePath,
		skillDirectory,
		source: isBuiltinDirectory(skillDirectory) ? "built-in" : "user",
	};

	const license = readOptionalString(frontmatter, "license");
	if (license) skill.license = license;
	const compatibility = readOptionalString(frontmatter, "compatibility");
	if (compatibility) skill.compatibility = compatibility;
	const allowedTools = readOptionalString(frontmatter, "allowed-tools");
	if (allowedTools) skill.allowedTools = allowedTools;
	const metadata = frontmatter.metadata;
	if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
		skill.metadata = metadata as Record<string, unknown>;
	}

	return skill;
}

function isBuiltinSkill(skill: AgentSkill): boolean {
	return skill.source === "built-in";
}

function isBuiltinDirectory(skillDirectory: string): boolean {
	return skillDirectory.startsWith("built-in:");
}

function readRequiredString(frontmatter: Record<string, unknown>, key: string): string {
	const value = frontmatter[key];
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error(`Skill frontmatter is missing required '${key}'.`);
	}
	return value.trim();
}

function readOptionalString(frontmatter: Record<string, unknown>, key: string): string | undefined {
	const value = frontmatter[key];
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

async function listSkillResources(skillDirectory: string): Promise<SkillResourceListing> {
	const [references, assets, scripts] = await Promise.all([
		listResourceDirectory(skillDirectory, "references"),
		listResourceDirectory(skillDirectory, "assets"),
		listResourceDirectory(skillDirectory, "scripts"),
	]);

	return { references, assets, scripts };
}

async function listResourceDirectory(skillDirectory: string, directoryName: string): Promise<string[]> {
	const directory = path.join(skillDirectory, directoryName);
	try {
		const entries = await fs.readdir(directory, { withFileTypes: true });
		return entries
			.filter((entry) => entry.isFile())
			.map((entry) => `${directoryName}/${entry.name}`)
			.sort((a, b) => a.localeCompare(b));
	} catch {
		return [];
	}
}

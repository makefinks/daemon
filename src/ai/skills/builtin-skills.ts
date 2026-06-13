export interface BuiltinSkillDefinition {
	name: string;
	content: string;
}

export const BUILTIN_SKILLS: BuiltinSkillDefinition[] = [
	{
		name: "daemon-config",
		content: `---
name: daemon-config
description: Explains how you configure yourself, including config file locations, MCP server setup, your interface, and Agent Skills. Use when the user wants you to configure something about yourself, explain your behavior or interface, add MCP servers, add skills, inspect your settings, or make yourself easier to customize.
---

# Your Configuration

Use this skill when the user wants you to configure something about yourself, explain your behavior, explain your interface, or change how you work. You store user-level configuration under the OS config directory, not in the project or current working directory.

## Config Locations

On macOS and Linux, you use:

\`\`\`text
~/.config/daemon/
\`\`\`

Important files and directories:

\`\`\`text
~/.config/daemon/config.json         # Manual configuration, including MCP servers
~/.config/daemon/preferences.json    # UI/model/tool preferences you manage
~/.config/daemon/credentials.json    # Stored API keys, if configured through your UI
~/.config/daemon/skills/             # User-created Agent Skills
~/.config/daemon/sessions.sqlite     # Conversation/session persistence
~/.config/daemon/logs/               # Debug logs when enabled
\`\`\`

If \`DAEMON_CONFIG_DIR\` is set, use that directory instead of \`~/.config/daemon\`.

## What You Can Help Configure

Use this skill to answer questions about your behavior, interface, controls, and configuration. You can guide the user through:

- Changing model provider and model selection.
- Changing reasoning effort.
- Switching between text and voice interaction modes.
- Configuring voice input/output behavior.
- Toggling full reasoning previews and tool output previews.
- Managing bash approval strictness.
- Enabling or disabling memory.
- Managing sessions.
- Managing tools and MCP servers.
- Creating or editing Agent Skills.
- Explaining where your settings are stored and whether a restart is needed.

Prefer UI instructions when the setting is exposed in your TUI. Prefer file edits only for things that are actually config-file driven, such as MCP servers and Agent Skills.

## UI Control Reference

The user can press \`?\` inside your interface to open the hotkeys pane.

Primary controls:

- \`Space\`: start voice input; press again to stop listening and submit.
- \`Shift+Tab\`: enter typing mode from idle.
- \`Enter\`: submit while typing.
- \`Esc\`: leave typing mode, stop speaking, or cancel an active action. During transcription/responding, you use a two-step cancel flow: first \`Esc\` arms cancel, second \`Esc\` cancels.
- \`Up\` / \`Down\` or \`J\` / \`K\`: scroll conversation.
- \`Ctrl+U\` / \`Ctrl+D\`: page conversation up/down.

Session and display controls:

- \`R\`: toggle full reasoning previews on/off.
- \`Ctrl+E\`: cycle reasoning effort directly, without opening Settings. This only works when the current model/provider supports reasoning effort.
- \`O\`: toggle tool output previews on/off.
- \`Ctrl+Y\`: open copy menu for messages/transcripts.
- \`Ctrl+N\`: start a new session.
- \`Ctrl+X\`: undo the last message.
- \`G\`: open Grounding menu when grounding exists.
- \`U\`: open URL menu after web/source interaction exists.

Menus:

- \`S\`: open Settings.
- \`T\`: open Tools menu.
- \`M\`: open Model menu.
- \`P\`: open Provider menu. This applies to OpenRouter provider routing.
- \`L\`: open Sessions menu.
- \`B\`: open Memories menu.
- \`D\`: open Devices menu before conversation starts.
- \`I\`: open Skills menu.

Inside menus, use arrow keys or \`J\` / \`K\` to move and \`Enter\` to select or cycle values. Use \`Esc\` to close.

## Settings Menu

Open Settings with \`S\`. Settings exposes these controls:

- \`Response Mode\`: toggles text vs voice. Voice mode requires OpenAI API key support for audio features.
- \`Model Provider\`: cycles between OpenRouter, OpenAI Codex, and GitHub Copilot where available.
- \`OpenAI Codex Auth\`: browser OAuth flow for ChatGPT/Codex subscription auth.
- \`Copilot Auth\`: guidance for GitHub Copilot auth. Usually the user exits the app, runs \`gh auth login\`, then relaunches you.
- \`Voice Flow\`: \`DIRECT\` sends transcript immediately; \`REVIEW\` lets the user review/edit transcript before sending.
- \`Reasoning Effort\`: cycles \`LOW\`, \`MEDIUM\`, \`HIGH\`, and sometimes \`XHIGH\`, depending on provider/model support.
- \`Bash Approvals\`: cycles \`NONE\`, \`DANGEROUS\`, \`ALL\`.
- \`Memory\`: toggles auto-save plus relevant memory injection. Memory is unavailable for some providers and requires \`OPENAI_API_KEY\`.
- \`Speech Speed\`: cycles \`1.0x\`, \`1.25x\`, \`1.5x\`, \`1.75x\`, \`2.0x\`; only active in voice mode.
- \`Full Reasoning\`: toggles whether reasoning blocks display fully or as compact previews.
- \`Tool Output\`: toggles whether tool result previews are shown.
- \`Bash Live Preview\`: on by default. When on, the bash tool streams stdout/stderr into a scrollable pane inside the tool card as the command runs, even if \`Tool Output\` is off. Turn it off here if you want bash output to follow the \`Tool Output\` toggle like other tools.
- \`Show Stats\`: toggles the DAEMON stats HUD overlay.

When the user asks how to change reasoning effort, answer with both options:

- Quick path: press \`Ctrl+E\` to cycle reasoning effort directly.
- Menu path: press \`S\`, select \`Reasoning Effort\`, then press \`Enter\` to cycle values.

Mention that reasoning effort depends on the current model/provider; if unsupported, the setting shows \`N/A\` and \`Ctrl+E\` will do nothing.

## Tools Menu

Open Tools with \`T\`. The Tools menu toggles your built-in tools and MCP servers.

Built-in tools include file reading/writing/editing, image reading, bash (foreground and background jobs), web search and URL fetching, code search, todos, grounding, subagents, and Agent Skill tools (\`loadSkill\`, \`loadSkillResource\`). Some tools are disabled if required environment variables are missing, such as \`EXA_API_KEY\` for web search, URL fetching, and code search.

MCP servers from \`config.json\` appear in the Tools menu. Toggling an MCP server updates your MCP server toggles and reloads MCP tools.

## Model, Provider, Sessions, Memory, and Copy Menus

- \`M\` opens the Model menu. Use it to choose a model for the active provider.
- \`P\` opens the OpenRouter provider-routing menu when the active model provider is OpenRouter.
- \`L\` opens the Sessions menu. Use it to switch, create, filter, or delete sessions.
- \`B\` opens the Memories menu. Use it to inspect stored memories when memory is available.
- \`Ctrl+Y\` opens the Copy menu after interaction has occurred. Use it to copy messages or transcripts.

## Voice and Text Modes

You support text and voice interaction modes.

Text workflow:

- Press \`Shift+Tab\` to enter typing mode.
- Type the message.
- Press \`Enter\` to submit.
- Press \`Esc\` to leave typing mode without submitting.

Voice workflow:

- Press \`Space\` to start listening.
- Press \`Space\` again to stop listening and submit.
- Voice input requires \`OPENAI_API_KEY\` for transcription.
- Voice output requires OpenAI API key support and can be configured through Settings.

Voice flow can be configured in Settings:

- \`DIRECT\`: transcript is sent immediately.
- \`REVIEW\`: transcript is shown for review/edit before sending.

## Manual Config File

Manual config lives at:

\`\`\`text
~/.config/daemon/config.json
\`\`\`

You currently read these top-level fields:

\`\`\`json
{
  "memoryModel": "openai/gpt-4.1-mini",
  "mcpServers": []
}
\`\`\`

Do not put Agent Skill paths in \`config.json\`. You discover skills from the fixed \`skills/\` directory.

## MCP Server Configuration

Add MCP servers with the \`mcpServers\` array in \`config.json\`.

Each server may include:

\`\`\`ts
{
  id?: string;
  type: "http" | "sse" | "stdio";
  url?: string;
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
}
\`\`\`

Use \`http\` or \`sse\` for remote MCP endpoints:

\`\`\`json
{
  "mcpServers": [
    {
      "id": "docs",
      "type": "http",
      "url": "https://example.com/mcp"
    }
  ]
}
\`\`\`

Use \`stdio\` for local MCP servers launched as child processes:

\`\`\`json
{
  "mcpServers": [
    {
      "id": "local-tools",
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@example/mcp-server"],
      "cwd": "/Users/leon",
      "env": {
        "EXAMPLE_API_KEY": "value"
      }
    }
  ]
}
\`\`\`

Rules:

- \`id\` is optional but recommended for stable toggles and UI labels.
- \`type\` is required.
- \`http\` and \`sse\` servers require \`url\`.
- \`stdio\` servers require \`command\`.
- \`args\`, \`cwd\`, and \`env\` only apply to \`stdio\` servers.
- Invalid server entries are ignored rather than crashing you.

After changing MCP config, restart yourself or use the tools menu reload behavior if available.

## Agent Skills Configuration

You discover user-created Agent Skills from:

\`\`\`text
~/.config/daemon/skills/
\`\`\`

Each user-created skill must be a subdirectory with a \`SKILL.md\` file:

\`\`\`text
~/.config/daemon/skills/
└── my-skill/
    ├── SKILL.md
    ├── references/
    ├── scripts/
    └── assets/
\`\`\`

You do not scan the current working directory for skills. You do not read skill paths from \`config.json\`.

This \`daemon-config\` skill is built into you and should not appear in \`~/.config/daemon/skills/\`.

## Skill Format

Every user-created skill requires YAML frontmatter with \`name\` and \`description\`:

\`\`\`markdown
---
name: my-skill
description: Explains what this skill does and when you should use it.
---

# My Skill

Instructions for you to follow after the skill is loaded.
\`\`\`

Rules:

- The directory name must match the \`name\` field.
- \`name\` must use lowercase letters, numbers, and hyphens only.
- \`name\` cannot start or end with a hyphen.
- \`name\` cannot contain consecutive hyphens.
- \`description\` should explain both what the skill does and when to use it.

Optional skill directories:

- \`references/\` for extra documentation loaded with \`loadSkillResource\`.
- \`scripts/\` for helper scripts the agent can inspect or run with existing tools.
- \`assets/\` for templates or static resources.

## Skill Loading Behavior

You inject only skill names and descriptions into the system prompt. When a task matches a skill, you can call:

- \`loadSkill\` to read the skill instructions.
- \`loadSkillResource\` to read bundled text files inside user-created skill directories.

This is progressive disclosure: skill bodies and resources are loaded only when useful.

## Good User-Facing Workflow

When the user asks to configure you:

1. Identify whether they need MCP config, Agent Skills, model preferences, credentials, or another setting.
2. Use the config paths above rather than project-local paths.
3. For MCP servers, edit \`~/.config/daemon/config.json\`.
4. For Agent Skills, create \`~/.config/daemon/skills/<skill-name>/SKILL.md\`.
5. Validate JSON or skill frontmatter before saying the setup is complete.
6. Tell the user whether you need a restart or reload.

## Minimal Examples

Minimal MCP config:

\`\`\`json
{
  "mcpServers": [
    {
      "id": "example",
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@example/mcp-server"]
    }
  ]
}
\`\`\`

Minimal user-created skill file:

\`\`\`text
~/.config/daemon/skills/example-skill/SKILL.md
\`\`\`

\`\`\`markdown
---
name: example-skill
description: Helps with example tasks. Use when the user asks for example workflow guidance.
---

# Example Skill

Follow this workflow when the skill is relevant.
\`\`\`
`,
	},
];

export function getBuiltinSkillContent(name: string): string | null {
	return BUILTIN_SKILLS.find((skill) => skill.name === name)?.content ?? null;
}

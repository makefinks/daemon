import type { McpServerConfig } from "../../utils/config";

export interface DefaultMcpServerMeta {
	id: string;
	label: string;
	promptGuidance?: string;
}

export const DEFAULT_MCP_SERVERS: McpServerConfig[] = [
	{
		id: "chrome-devtools",
		type: "stdio",
		command: "npx",
		args: [
			"-y",
			"chrome-devtools-mcp@latest",
			"--chrome-arg=--accept-lang=en-US,en",
			"--chrome-arg=--lang=en-US",
		],
	},
];

export const DEFAULT_MCP_SERVER_META: Record<string, DefaultMcpServerMeta> = {
	"chrome-devtools": {
		id: "chrome-devtools",
		label: "Chrome DevTools",
		promptGuidance: `
### Chrome DevTools MCP
Use Chrome DevTools MCP for live browser/page tasks that require direct interaction or runtime inspection: exact DOM targeting, visual highlighting, page automation, console errors, network debugging, performance traces, Lighthouse-style audits, and screenshots when explicitly useful.

Do not use Chrome DevTools MCP as the default way to gather information from webpages. Prefer fetchUrls for reading page contents, extracting article/document text, and gathering information from public URLs. Use Chrome DevTools MCP only when fetchUrls is insufficient or when the task specifically depends on actual browser behavior, client-side state, runtime JavaScript, layout, interaction, exact DOM location, or debugging a frontend app.

For content questions, first use fetchUrls when available. If a page is JavaScript-rendered and fetchUrls cannot provide the needed content, Chrome DevTools MCP can extract rendered content with take_snapshot for readable page structure or evaluate_script for targeted DOM text such as document.body.innerText. Keep this extraction focused on the needed target rather than broadly browsing for information.

Use snapshots, console messages, and network requests before guessing about frontend bugs.

When the user asks to show, locate, point to, or highlight something on a webpage, use Chrome DevTools MCP to open/select the page and visually highlight the relevant page section in the browser.

If the request relates to a grounded source, citation, text fragment, or exact piece of information used in your answer:
- navigate to the source URL if needed
- use evaluate_script to find the relevant text or element in the DOM
- scroll it into view
- before revealing the page to the user, clear visual noise that would obscure the target, such as cookie banners, consent dialogs, newsletter popups, sticky ads, or large overlays; prefer normal dismiss/close controls when available, otherwise use evaluate_script to temporarily hide blocking noise for the current page view
- add a temporary visual highlight with an outline/background tint and a visible label
- tell the user that the relevant section is highlighted in the browser

Highlight styling guidance:
- remove previous DAEMON highlights before applying a new one
- mark highlighted elements with data-daemon-highlight="true" so they can be found and cleaned up later
- use a temporary, high-contrast amber/orange treatment that fits DAEMON's visual language
- keep the treatment minimal and deliberate; avoid emoji, decorative icons, pulsing animations, heavy glows, loud badges, or anything that looks like an ad overlay
- prefer outline, outlineOffset, a restrained boxShadow, borderRadius, and a very subtle translucent backgroundColor; avoid layout-shifting styles
- a good default target style is outline="2px solid #f59e0b", outlineOffset="4px", boxShadow="0 0 0 4px rgba(245, 158, 11, 0.18)", backgroundColor="rgba(245, 158, 11, 0.1)", and borderRadius="4px"
- every highlight must include a visible label using exactly "DAEMON SOURCE"; use no emoji; use a dark background, amber/orange text/border, no heavy glow, monospace 11px text, uppercase, and slight letter spacing
- position labels outside the highlighted element whenever possible, preferring just above the target with a small gap; if that would be off-screen or cover nearby content, place it below or to the side
- ensure labels do not obstruct the exact highlighted text or element; set pointer-events="none" and choose a position that preserves readability of the target content
- after applying a highlight, take a screenshot to visually verify placement before telling the user; if the label or highlight obstructs the target content, adjust the placement/style and verify again

Do not present a screenshot as the user-facing output for this behavior unless the user explicitly asks for one; screenshot use for internal visual verification of highlight placement is expected.
`,
	},
};

export function isDefaultMcpServer(serverId: string): boolean {
	return serverId in DEFAULT_MCP_SERVER_META;
}

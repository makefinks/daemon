import type { McpServerConfig } from "../../utils/config";
import { getAppConfigDir } from "../../utils/preferences";

export interface DefaultMcpServerMeta {
	id: string;
	label: string;
	promptGuidance?: string | ((options: DefaultMcpPromptGuidanceOptions) => string);
}

export interface DefaultMcpPromptGuidanceOptions {
	supportsVision: boolean;
}

function buildPuppeteerPromptGuidance(options: DefaultMcpPromptGuidanceOptions): string {
	const visualVerificationGuidance = options.supportsVision
		? `Use screenshots, console messages, and targeted page evaluation before guessing about frontend bugs.`
		: `Use console messages and targeted page evaluation before guessing about frontend bugs. Do not use screenshots for your own visual verification because the active model cannot inspect images.`;
	const highlightVerificationGuidance = options.supportsVision
		? `- after applying a highlight, take a screenshot to visually verify placement before telling the user; if the highlight obstructs the target content, adjust the placement/style and verify again`
		: `- after applying a highlight, verify placement with DOM/layout measurements such as getBoundingClientRect and viewport bounds before telling the user; do not take screenshots for internal verification`;

	return `
### Puppeteer MCP
Use Puppeteer MCP for browser/page tasks that require direct interaction or runtime inspection: exact DOM targeting, visual highlighting, page automation, console errors, rendered JavaScript state, form flows, and screenshots when explicitly useful.

Do not use Puppeteer MCP as the default way to gather information from webpages. Prefer fetchUrls for reading page contents, extracting article/document text, and gathering information from public URLs. Use Puppeteer MCP only when fetchUrls is insufficient or when the task specifically depends on actual browser behavior, client-side state, runtime JavaScript, layout, interaction, exact DOM location, or debugging a frontend app.

For content questions, first use fetchUrls when available. If a page is JavaScript-rendered and fetchUrls cannot provide the needed content, Puppeteer MCP can extract rendered content with puppeteer_evaluate for targeted DOM text such as document.body.innerText. Keep this extraction focused on the needed target rather than broadly browsing for information.

${visualVerificationGuidance}

Puppeteer starts headless by default so background browser work does not disrupt the user. Keep preparation, research, extraction, screenshot setup, and routine page automation headless unless the user asks to watch the browser or visible browser output is needed.

When the user asks to show, open, locate, point to, or highlight something on a webpage, the final page state must be visible to the user. Before applying the final user-visible highlight, reveal the browser by navigating with launchOptions that include headless=false and the same userDataDir used by the default server profile. Do not claim the page is open, visible, shown, or highlighted in the browser if the work was only done in a headless page or verified only by screenshot. After visible work is complete, switch future background-only browser work back to headless=true with the same userDataDir.

If the request relates to a grounded source, citation, text fragment, or exact piece of information used in your answer:
- navigate to the source URL if needed; if the user should see the result, this navigation must use launchOptions with headless=false before the final highlight is applied
- use puppeteer_evaluate to find the relevant text or element in the DOM
- scroll it into view
- before revealing the page to the user, clear visual noise that would obscure the target, such as cookie banners, consent dialogs, newsletter popups, sticky ads, or large overlays; prefer normal dismiss/close controls when available, otherwise use puppeteer_evaluate to temporarily hide blocking noise for the current page view
- add a temporary visual highlight with a textmarker treatment
- tell the user that the relevant section is highlighted in the browser

Highlight styling guidance:
- remove previous DAEMON highlights before applying a new one
- mark highlighted elements with data-daemon-highlight="true" so they can be found and cleaned up later
- use a temporary textmarker highlight treatment that fits DAEMON's visual language
- keep the treatment minimal and deliberate; avoid emoji, decorative icons, pulsing animations, heavy glows, loud badges, or anything that looks like an ad overlay
- style the highlighted text itself with background="rgba(255, 204, 0, 0.7)", borderRadius="3px", padding="2px 4px", color="#000", fontWeight="600", and display="inline"
- do not add a "DAEMON SOURCE" label or any other label; the highlighted text itself is sufficient
${highlightVerificationGuidance}

Puppeteer DOM search and highlighting rules:
- Wrap every puppeteer_evaluate script in an IIFE: (() => { ... })() to avoid leaked variable redeclarations across retries.
- Search only visible rendered DOM. Skip script, style, noscript, template, JSON-LD, and hidden ancestors.
- Verify candidates with getClientRects().length > 0 and computed style: skip elements with display:none, visibility:hidden, or opacity:0.
- On Next.js/RSC pages, ignore self.__next_f.push(...) script content and other hydration/data payloads.
- Do not use innerHTML.replace() for highlighting unless the match is fully inside one simple text node. Prefer Range.surroundContents() or text-node splitting for exact visible text.
- If text spans links/elements, highlight the smallest visible element/text ranges instead of rewriting parent HTML.
- If exact source text is not present, stop and report the mismatch before highlighting a closest match.
- Do not promise multiple tabs unless the Puppeteer MCP exposes tab creation/switching. Otherwise say "one page at a time" or create a comparison page.

Do not present a screenshot as the user-facing output for this behavior unless the user explicitly asks for one; screenshot use for internal visual verification is only available when the active model supports vision.

When the user explicitly asks for a screenshot that will be viewed by them or used in a deliverable (report, website, evidence, etc.), do NOT screenshot the full page. Only capture the relevant section — the specific element, evidence text, or area of interest. If no specific element is targeted, use a reasonable default viewport size (e.g. 1280x800) rather than the full page height.
`;
}

export const DEFAULT_MCP_SERVERS: McpServerConfig[] = [
	{
		id: "puppeteer",
		type: "stdio",
		command: "npx",
		args: ["-y", "@modelcontextprotocol/server-puppeteer"],
		env: {
			PUPPETEER_LAUNCH_OPTIONS: JSON.stringify({
				headless: true,
				defaultViewport: { width: 1280, height: 800 },
				args: ["--lang=en-US"],
				userDataDir: `${getAppConfigDir()}/puppeteer-profile`,
			}),
		},
	},
];

export const DEFAULT_MCP_SERVER_META: Record<string, DefaultMcpServerMeta> = {
	puppeteer: {
		id: "puppeteer",
		label: "Puppeteer",
		promptGuidance: buildPuppeteerPromptGuidance,
	},
};

export function isDefaultMcpServer(serverId: string): boolean {
	return serverId in DEFAULT_MCP_SERVER_META;
}

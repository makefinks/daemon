import { COLORS } from "../../../ui/constants";
import { registerToolLayout } from "../registry";
import type { ToolHeader, ToolLayoutConfig, ToolLayoutRenderProps } from "../types";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface GroundingSource {
	url: string;
	quote: string;
	textFragment?: string;
}

interface GroundedStatement {
	id: string;
	statement: string;
	source: GroundingSource;
}

interface GroundingInput {
	action: "set" | "append";
	items: GroundedStatement[];
}

function extractGroundingInput(input: unknown): GroundingInput | null {
	if (!isRecord(input)) return null;
	if (!("items" in input) || !Array.isArray(input.items)) return null;

	const items = input.items as GroundedStatement[];
	const action =
		"action" in input && (input.action === "set" || input.action === "append")
			? (input.action as "set" | "append")
			: "append";

	return { action, items };
}

function GroundingBody({ call }: ToolLayoutRenderProps) {
	const input = extractGroundingInput(call.input);
	if (!input || input.items.length === 0) return null;

	const MAX_ITEMS = 4;
	const visibleItems = input.items.slice(0, MAX_ITEMS);
	const remainingCount = input.items.length - MAX_ITEMS;

	return (
		<box flexDirection="column" paddingLeft={2} marginTop={1}>
			{visibleItems.map((item, idx) => {
				let domain = "";
				try {
					const url = new URL(item.source.url);
					domain = url.hostname;
				} catch {
					domain = item.source.url;
				}

				const MAX_LEN = 90;
				const statement =
					item.statement.length > MAX_LEN ? item.statement.slice(0, MAX_LEN) + "..." : item.statement;

				return (
					<box key={idx} flexDirection="column">
						<text>
							<span fg={COLORS.MENU_TEXT}>{statement}</span>
						</text>
						<text>
							<span fg={COLORS.TOOLS}> └─ {domain}</span>
						</text>
					</box>
				);
			})}
			{remainingCount > 0 && (
				<text>
					<span fg={COLORS.TOOLS}> + {remainingCount} more statements</span>
				</text>
			)}
		</box>
	);
}

export const groundingLayout: ToolLayoutConfig = {
	abbreviation: "grounding",

	getHeader: (input): ToolHeader | null => {
		const data = extractGroundingInput(input);
		if (!data) return null;
		return {
			secondary: `${data.action} ${data.items.length} item${data.items.length === 1 ? "" : "s"}`,
		};
	},

	renderBody: GroundingBody,
};

registerToolLayout("groundingManager", groundingLayout);

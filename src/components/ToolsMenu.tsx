import { useEffect, useMemo, useState } from "react";

import { type McpServerStatus, getMcpManager } from "../ai/mcp/mcp-manager";
import { invalidateDaemonToolsCache } from "../ai/tools/index";
import { invalidateSubagentToolsCache } from "../ai/tools/subagents";
import {
	buildMenuItems,
	getDefaultToolOrder,
	getToolLabels,
	resolveToolAvailability,
} from "../ai/tools/tool-registry";
import { useMenuKeyboard } from "../hooks/use-menu-keyboard";
import { getDaemonManager } from "../state/daemon-state";
import type { ToolToggleId, ToolToggles } from "../types";
import { DEFAULT_TOOL_TOGGLES } from "../types";
import { COLORS } from "../ui/constants";
import { getManualConfigPath } from "../utils/config";

interface ToolsMenuProps {
	persistPreferences: (updates: Partial<{ toolToggles: ToolToggles }>) => void;
	onClose: () => void;
}

type MenuToolItem = {
	id: ToolToggleId;
	label: string;
	envAvailable: boolean;
	disabledReason?: string;
};

function getToolLabel(id: ToolToggleId): string {
	switch (id) {
		case "readFile":
			return "readFile";
		case "runBash":
			return "runBash";
		case "webSearch":
			return "webSearch";
		case "fetchUrls":
			return "fetchUrls";
		case "renderUrl":
			return "renderUrl";
		case "todoManager":
			return "todoManager";
		case "groundingManager":
			return "groundingManager";
		case "subagent":
			return "subagent";
		default:
			return id;
	}
}

export function ToolsMenu({ persistPreferences, onClose }: ToolsMenuProps) {
	const manager = getDaemonManager();
	const [toggles, setToggles] = useState<ToolToggles>(manager.toolToggles ?? { ...DEFAULT_TOOL_TOGGLES });
	const [mcpServers, setMcpServers] = useState<McpServerStatus[]>(() => getMcpManager().getServersSnapshot());

	const [toolAvailability, setToolAvailability] = useState<Record<ToolToggleId, MenuToolItem> | null>(null);

	useEffect(() => {
		const mcp = getMcpManager();
		const handleUpdate = () => {
			setMcpServers(mcp.getServersSnapshot());
		};
		mcp.on("update", handleUpdate);
		return () => {
			mcp.off("update", handleUpdate);
		};
	}, []);

	useEffect(() => {
		let cancelled = false;
		const loadAvailability = async () => {
			const toggles = manager.toolToggles ?? { ...DEFAULT_TOOL_TOGGLES };
			const availability = await resolveToolAvailability(toggles);
			const map = buildMenuItems(availability) as Record<ToolToggleId, MenuToolItem>;

			if (cancelled) return;
			setToolAvailability(map);
		};

		void loadAvailability();
		return () => {
			cancelled = true;
		};
	}, [manager, toggles]);

	const items = useMemo((): MenuToolItem[] => {
		const labels = getToolLabels();
		const order = getDefaultToolOrder();
		if (!toolAvailability) {
			return order.map((id) => ({
				id,
				label: labels[id],
				envAvailable: true,
			}));
		}

		return order.map((id) => toolAvailability[id]).filter((item): item is MenuToolItem => Boolean(item));
	}, [toolAvailability]);

	const { selectedIndex } = useMenuKeyboard({
		itemCount: items.length,
		onClose,
		closeOnSelect: false,
		onSelect: (idx) => {
			const item = items[idx];
			if (!item) return;

			const current = manager.toolToggles ?? { ...DEFAULT_TOOL_TOGGLES };

			// If env-unavailable, block enabling, but allow disabling.
			if (!item.envAvailable && current[item.id]) {
				return;
			}

			const next: ToolToggles = {
				...DEFAULT_TOOL_TOGGLES,
				...current,
				[item.id]: !current[item.id],
			};
			manager.toolToggles = next;
			setToggles(next);
			persistPreferences({ toolToggles: next });

			invalidateDaemonToolsCache();
			invalidateSubagentToolsCache();
			resolveToolAvailability(next)
				.then((availability) => {
					const map = buildMenuItems(availability) as Record<ToolToggleId, MenuToolItem>;
					setToolAvailability(map);
				})
				.catch(() => {
					setToolAvailability(null);
				});
		},
	});

	const showReasonColumn = useMemo(() => {
		return items.some((item) => !item.envAvailable);
	}, [items]);

	const labelWidth = useMemo(() => {
		const raw = items.reduce((max, item) => Math.max(max, item.label.length), 0);
		// When no env-disabled tools exist, keep the menu compact.
		return showReasonColumn ? raw : Math.min(raw, 16);
	}, [items, showReasonColumn]);

	const statusWidth = 8;
	const mcpStatusWidth = 8;

	function truncateText(text: string, maxLen: number): string {
		if (text.length <= maxLen) return text;
		return text.slice(0, Math.max(0, maxLen - 1)) + "…";
	}

	const mcpConfigPath = useMemo(() => getManualConfigPath(), []);

	const mcpIdWidth = useMemo(() => {
		const raw = mcpServers.reduce((max, server) => Math.max(max, server.id.length), 0);
		return Math.min(Math.max(raw, 10), 28);
	}, [mcpServers]);

	return (
		<box
			position="absolute"
			left={0}
			top={0}
			width="100%"
			height="100%"
			flexDirection="column"
			alignItems="center"
			justifyContent="center"
			zIndex={100}
		>
			<box
				flexDirection="column"
				backgroundColor={COLORS.MENU_BG}
				borderStyle="single"
				borderColor={COLORS.MENU_BORDER}
				paddingLeft={2}
				paddingRight={2}
				paddingTop={1}
				paddingBottom={1}
				width={showReasonColumn ? "70%" : "52%"}
				minWidth={showReasonColumn ? 70 : 48}
				maxWidth={showReasonColumn ? 150 : 90}
			>
				<box marginBottom={1}>
					<text>
						<span fg={COLORS.DAEMON_LABEL}>[ TOOLS ]</span>
					</text>
				</box>
				<box marginBottom={1}>
					<text>
						<span fg={COLORS.USER_LABEL}>↑/↓ or j/k to navigate, ENTER to toggle, ESC to close</span>
					</text>
				</box>

				<box marginBottom={1}>
					<text>
						<span fg={COLORS.REASONING_DIM}>
							{`  ${"TOOL".padEnd(labelWidth)} ${"STATUS".padEnd(statusWidth)}${showReasonColumn ? " REASON" : ""}`}
						</span>
					</text>
				</box>

				<box flexDirection="column">
					{items.map((item, idx) => {
						const isSelected = idx === selectedIndex;
						const isEnabled = Boolean(toggles[item.id]);
						const canEnable = item.envAvailable;
						const statusLabel = !canEnable ? "DISABLED" : isEnabled ? "ON" : "OFF";
						const reason = !canEnable && item.disabledReason ? item.disabledReason : "";

						const labelColor = isSelected ? COLORS.DAEMON_LABEL : COLORS.MENU_TEXT;
						const statusColor = !canEnable
							? COLORS.REASONING_DIM
							: isEnabled
								? COLORS.DAEMON_TEXT
								: COLORS.REASONING_DIM;
						const reasonColor = COLORS.REASONING_DIM;

						const labelText = truncateText(item.label, labelWidth).padEnd(labelWidth);
						const statusText = statusLabel.padEnd(statusWidth);
						const reasonText = reason ? truncateText(reason, 60) : "";

						return (
							<box
								key={item.id}
								backgroundColor={isSelected ? COLORS.MENU_SELECTED_BG : COLORS.MENU_BG}
								paddingLeft={1}
								paddingRight={1}
							>
								<text>
									<span fg={labelColor}>{isSelected ? "▶ " : "  "}</span>
									<span fg={labelColor}>{labelText}</span>
									<span fg={COLORS.REASONING_DIM}> </span>
									<span fg={statusColor}>{statusText}</span>
									{showReasonColumn ? (
										<>
											<span fg={COLORS.REASONING_DIM}> </span>
											<span fg={reasonColor}>{reasonText}</span>
										</>
									) : null}
								</text>
							</box>
						);
					})}
				</box>

				<box flexDirection="column" marginTop={1}>
					<box marginBottom={1}>
						<text>
							<span fg={COLORS.DAEMON_LABEL}>[ MCP ]</span>
							<span fg={COLORS.REASONING_DIM}>{` ${truncateText(mcpConfigPath, 80)}`}</span>
						</text>
					</box>

					{mcpServers.length === 0 ? (
						<text>
							<span fg={COLORS.REASONING_DIM}>No MCP servers configured.</span>
						</text>
					) : (
						<box flexDirection="column">
							<box marginBottom={1}>
								<text>
									<span fg={COLORS.REASONING_DIM}>
										{`SERVER`.padEnd(mcpIdWidth)} {`STATUS`.padEnd(mcpStatusWidth)} TOOLS
									</span>
								</text>
							</box>
							{mcpServers.map((server) => {
								const statusLabel = server.status.toUpperCase();
								const statusColor =
									server.status === "ready"
										? COLORS.STATUS_COMPLETED
										: server.status === "loading"
											? COLORS.STATUS_RUNNING
											: server.status === "error"
												? COLORS.STATUS_FAILED
												: COLORS.REASONING_DIM;
								const idText = truncateText(server.id, mcpIdWidth).padEnd(mcpIdWidth);
								const toolsText = String(server.toolCount).padStart(4);
								const errorText = server.error ? truncateText(server.error, 60) : "";

								return (
									<box key={server.id} flexDirection="column">
										<text>
											<span fg={COLORS.MENU_TEXT}>{idText}</span>
											<span fg={COLORS.REASONING_DIM}> </span>
											<span fg={statusColor}>{statusLabel.padEnd(mcpStatusWidth)}</span>
											<span fg={COLORS.REASONING_DIM}> {toolsText}</span>
											{errorText ? <span fg={COLORS.REASONING_DIM}>{`  ${errorText}`}</span> : null}
										</text>
									</box>
								);
							})}
						</box>
					)}
				</box>
			</box>
		</box>
	);
}

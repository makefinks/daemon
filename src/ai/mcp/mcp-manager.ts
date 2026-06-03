import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";

import { type MCPClient, type MCPClientConfig, createMCPClient } from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";
import type { ToolSet } from "ai";

import type { McpServerToggles } from "../../types";
import { type McpServerConfig, type McpTransportType, loadManualConfig } from "../../utils/config";
import { debug } from "../../utils/debug-logger";
import { DEFAULT_MCP_SERVER_META, DEFAULT_MCP_SERVERS, isDefaultMcpServer } from "./default-servers";

export type McpServerLifecycleStatus = "idle" | "loading" | "ready" | "error" | "disabled";

export interface McpServerStatus {
	id: string;
	type: McpTransportType;
	url?: string;
	command?: string;
	isDefault: boolean;
	enabled: boolean;
	status: McpServerLifecycleStatus;
	toolCount: number;
	error?: string;
}

export interface McpToolMeta {
	internalName: string;
	serverId: string;
	originalToolName: string;
}

type McpServerResolvedConfig = {
	id: string;
	type: McpTransportType;
	url?: string;
	command?: string;
	args?: string[];
	cwd?: string;
	env?: Record<string, string>;
	isDefault: boolean;
};

const MAX_TOOL_NAME_LENGTH = 64;

function sanitizeNamePart(raw: string): string {
	const cleaned = raw
		.replace(/[^a-zA-Z0-9_-]/g, "_")
		.replace(/_+/g, "_")
		.replace(/^_+/, "")
		.replace(/_+$/, "");
	return cleaned.length > 0 ? cleaned : "x";
}

function shortHash(input: string): string {
	return createHash("sha1").update(input).digest("hex").slice(0, 8);
}

function deriveServerIdFromUrl(url: string): string | null {
	try {
		const parsed = new URL(url);
		const host = parsed.hostname;
		if (!host) return null;
		const port = parsed.port ? `_${parsed.port}` : "";
		return `${host}${port}`;
	} catch {
		return null;
	}
}

function ensureUniqueId(base: string, used: Set<string>): string {
	let candidate = base;
	let i = 2;
	while (used.has(candidate)) {
		candidate = `${base}-${i}`;
		i++;
	}
	used.add(candidate);
	return candidate;
}

function deriveServerIdFromCommand(command: string): string {
	const parts = command.split(/[\\/]/);
	return parts[parts.length - 1] || "stdio";
}

function buildInternalToolName(serverId: string, toolName: string, used: Set<string>): string {
	const serverPart = sanitizeNamePart(serverId);
	const toolPart = sanitizeNamePart(toolName);
	const base = `mcp_${serverPart}__${toolPart}`;
	if (base.length <= MAX_TOOL_NAME_LENGTH && !used.has(base)) {
		used.add(base);
		return base;
	}

	const hash = shortHash(`${serverId}\0${toolName}`);
	let left = serverPart;
	let right = toolPart;
	let candidate = `mcp_${left}__${right}__${hash}`;
	if (candidate.length > MAX_TOOL_NAME_LENGTH) {
		const maxRight = Math.max(8, MAX_TOOL_NAME_LENGTH - `mcp_${left}____${hash}`.length);
		right = right.slice(0, maxRight);
		candidate = `mcp_${left}__${right}__${hash}`;
	}

	if (candidate.length > MAX_TOOL_NAME_LENGTH) {
		candidate = candidate.slice(0, MAX_TOOL_NAME_LENGTH);
	}

	if (!used.has(candidate)) {
		used.add(candidate);
		return candidate;
	}

	let counter = 2;
	let next = candidate;
	while (used.has(next)) {
		const counterHash = shortHash(`${serverId}\0${toolName}\0${counter}`);
		next = `mcp_${left}__${right}__${counterHash}`;
		if (next.length > MAX_TOOL_NAME_LENGTH) {
			next = next.slice(0, MAX_TOOL_NAME_LENGTH);
		}
		counter++;
	}
	used.add(next);
	return next;
}

function resolveServerConfigs(
	raw: McpServerConfig[] | undefined,
	defaultIds = new Set<string>()
): McpServerResolvedConfig[] {
	if (!raw || raw.length === 0) return [];
	const usedIds = new Set<string>();
	const out: McpServerResolvedConfig[] = [];

	for (const entry of raw) {
		if (!entry || typeof entry !== "object") continue;
		const type = entry.type;
		if (type !== "http" && type !== "sse" && type !== "stdio") continue;

		if (type === "stdio") {
			const command = entry.command?.trim();
			if (!command) continue;
			const derivedId = entry.id?.trim() ? entry.id.trim() : deriveServerIdFromCommand(command);
			const id = ensureUniqueId(derivedId, usedIds);
			out.push({
				id,
				type,
				command,
				args: entry.args,
				cwd: entry.cwd,
				env: entry.env,
				isDefault: defaultIds.has(id),
			});
			continue;
		}

		const url = entry.url;
		if (typeof url !== "string" || url.trim().length === 0) continue;
		const derivedId = entry.id?.trim() ? entry.id.trim() : deriveServerIdFromUrl(url.trim());
		const id = derivedId
			? ensureUniqueId(derivedId, usedIds)
			: ensureUniqueId(`server-${out.length + 1}`, usedIds);
		out.push({ id, type, url: url.trim(), isDefault: defaultIds.has(id) });
	}

	return out;
}

function mergeServerConfigs(
	defaults: McpServerConfig[],
	configured: McpServerConfig[] | undefined
): McpServerConfig[] {
	const byId = new Map<string, McpServerConfig>();

	for (const server of defaults) {
		if (server.id) byId.set(server.id, server);
	}

	for (const server of configured ?? []) {
		if (server.id) {
			byId.set(server.id, server);
			continue;
		}
		byId.set(`__anonymous_${byId.size}`, server);
	}

	return [...byId.values()];
}

function createTransport(server: McpServerResolvedConfig): MCPClientConfig["transport"] {
	if (server.type === "stdio") {
		if (!server.command) {
			throw new Error("stdio MCP server is missing command");
		}
		return new Experimental_StdioMCPTransport({
			command: server.command,
			args: server.args,
			cwd: server.cwd,
			env: server.env,
			stderr: "ignore",
		});
	}

	if (!server.url) {
		throw new Error(`${server.type} MCP server is missing url`);
	}

	return {
		type: server.type,
		url: server.url,
	};
}

class McpManager extends EventEmitter {
	private started = false;
	private loadRunId = 0;
	private serverToggles: McpServerToggles = {};

	private servers: McpServerStatus[] = [];
	private mergedTools: ToolSet = {};
	private toolMetaByName = new Map<string, McpToolMeta>();
	private internalNamesByServer = new Map<string, Set<string>>();

	private clientsByServer = new Map<string, MCPClient>();
	private toolsByServer = new Map<string, ToolSet>();

	start(): void {
		if (this.started) return;
		this.started = true;
		setImmediate(() => {
			void this.loadFromConfig();
		});
	}

	setServerToggles(toggles: McpServerToggles): void {
		this.serverToggles = { ...toggles };
	}

	reload(): void {
		this.started = true;
		void this.loadFromConfig();
	}

	getServersSnapshot(): McpServerStatus[] {
		return this.servers.map((s) => ({ ...s }));
	}

	getToolsSnapshot(): ToolSet {
		return this.mergedTools;
	}

	getToolMeta(toolName: string): McpToolMeta | null {
		return this.toolMetaByName.get(toolName) ?? null;
	}

	getPromptGuidanceSnapshot(): string[] {
		return this.servers
			.filter((server) => server.enabled && server.isDefault && server.status === "ready")
			.map((server) => DEFAULT_MCP_SERVER_META[server.id]?.promptGuidance)
			.filter((guidance): guidance is string => Boolean(guidance?.trim()));
	}

	async closeAll(): Promise<void> {
		const clients = [...this.clientsByServer.values()];
		this.clientsByServer.clear();
		await Promise.allSettled(clients.map((client) => client.close()));
	}

	private emitUpdate(): void {
		this.emit("update");
	}

	private rebuildMergedTools(): void {
		const merged: ToolSet = {};
		for (const tools of this.toolsByServer.values()) {
			Object.assign(merged, tools);
		}
		this.mergedTools = merged;
	}

	private clearServerTools(serverId: string): void {
		const internalNames = this.internalNamesByServer.get(serverId);
		if (internalNames) {
			for (const internalName of internalNames) {
				this.toolMetaByName.delete(internalName);
			}
		}
		this.internalNamesByServer.delete(serverId);
		this.toolsByServer.delete(serverId);
	}

	private setServerStatus(next: McpServerStatus): void {
		const idx = this.servers.findIndex((s) => s.id === next.id);
		if (idx >= 0) {
			const copy = [...this.servers];
			copy[idx] = next;
			this.servers = copy;
		} else {
			this.servers = [...this.servers, next];
		}
		this.emitUpdate();
	}

	private async loadFromConfig(): Promise<void> {
		const runId = ++this.loadRunId;
		const config = loadManualConfig();
		const defaultIds = new Set(
			DEFAULT_MCP_SERVERS.map((server) => server.id).filter((id): id is string => Boolean(id))
		);
		const servers = resolveServerConfigs(
			mergeServerConfigs(DEFAULT_MCP_SERVERS, config.mcpServers),
			defaultIds
		);
		const enabledServers = servers.filter((server) => this.serverToggles[server.id] !== false);
		const enabledIds = new Set(enabledServers.map((server) => server.id));

		for (const [serverId, client] of this.clientsByServer.entries()) {
			if (enabledIds.has(serverId)) continue;
			this.clientsByServer.delete(serverId);
			this.clearServerTools(serverId);
			client.close().catch(() => {});
		}
		this.rebuildMergedTools();

		this.servers = servers.map((server) => ({
			id: server.id,
			type: server.type,
			url: server.url,
			command: server.command,
			isDefault: server.isDefault || isDefaultMcpServer(server.id),
			enabled: enabledIds.has(server.id),
			status: enabledIds.has(server.id) ? ("loading" as const) : ("disabled" as const),
			toolCount: 0,
		}));
		this.emitUpdate();

		if (enabledServers.length === 0) {
			this.mergedTools = {};
			this.toolMetaByName.clear();
			this.internalNamesByServer.clear();
			this.toolsByServer.clear();
			this.emitUpdate();
			return;
		}

		await Promise.allSettled(
			enabledServers.map(async (server) => {
				if (runId !== this.loadRunId) return;
				await this.loadSingleServer(server, runId);
			})
		);
	}

	private async loadSingleServer(server: McpServerResolvedConfig, runId: number): Promise<void> {
		const startedAt = Date.now();
		const currentStatus = this.servers.find((s) => s.id === server.id);
		if (!currentStatus || runId !== this.loadRunId) return;

		this.setServerStatus({
			id: server.id,
			type: server.type,
			url: server.url,
			command: server.command,
			isDefault: server.isDefault || isDefaultMcpServer(server.id),
			enabled: true,
			status: "loading",
			toolCount: 0,
		});

		let client: MCPClient | null = null;
		try {
			client = await createMCPClient({
				transport: createTransport(server),
			});
			if (runId !== this.loadRunId) {
				await client.close();
				return;
			}

			const tools = await client.tools();
			if (runId !== this.loadRunId) {
				await client.close();
				return;
			}

			const usedNames = new Set<string>(this.toolMetaByName.keys());
			const remapped: Record<string, unknown> = {};
			const internalNames = new Set<string>();

			for (const [toolName, toolValue] of Object.entries(tools)) {
				const internalName = buildInternalToolName(server.id, toolName, usedNames);
				(remapped as Record<string, unknown>)[internalName] = toolValue;
				internalNames.add(internalName);
				this.toolMetaByName.set(internalName, {
					internalName,
					serverId: server.id,
					originalToolName: toolName,
				});
			}

			// Replace existing server registration atomically
			this.clearServerTools(server.id);
			this.internalNamesByServer.set(server.id, internalNames);
			this.toolsByServer.set(server.id, remapped as ToolSet);
			this.clientsByServer
				.get(server.id)
				?.close()
				.catch(() => {});
			this.clientsByServer.set(server.id, client);
			client = null;

			this.rebuildMergedTools();
			this.setServerStatus({
				id: server.id,
				type: server.type,
				url: server.url,
				command: server.command,
				isDefault: server.isDefault || isDefaultMcpServer(server.id),
				enabled: true,
				status: "ready",
				toolCount: internalNames.size,
			});
			debug.info("mcp-server-ready", {
				id: server.id,
				type: server.type,
				url: server.url,
				command: server.command,
				toolCount: internalNames.size,
				ms: Date.now() - startedAt,
			});
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			this.clearServerTools(server.id);
			this.rebuildMergedTools();
			this.setServerStatus({
				id: server.id,
				type: server.type,
				url: server.url,
				command: server.command,
				isDefault: server.isDefault || isDefaultMcpServer(server.id),
				enabled: true,
				status: "error",
				toolCount: 0,
				error: err.message,
			});
			debug.warn("mcp-server-error", {
				id: server.id,
				type: server.type,
				url: server.url,
				command: server.command,
				message: err.message,
			});
			if (client) {
				try {
					await client.close();
				} catch {
					// Ignore close failures
				}
			}
		}
	}
}

let singleton: McpManager | null = null;

export function getMcpManager(): McpManager {
	if (!singleton) {
		singleton = new McpManager();
	}
	return singleton;
}

export function startMcpManager(): void {
	getMcpManager().start();
}

export function destroyMcpManager(): void {
	if (!singleton) return;
	void singleton.closeAll();
	singleton.removeAllListeners();
	singleton = null;
}

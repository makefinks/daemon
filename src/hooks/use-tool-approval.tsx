import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { daemonEvents } from "../state/daemon-events";
import type { ToolApprovalRequest, ToolApprovalResponse } from "../types";

interface PendingApproval {
	request: ToolApprovalRequest;
	respond: (response: ToolApprovalResponse) => void;
}

interface ToolApprovalContextValue {
	pendingApprovals: Map<string, PendingApproval>;
	activeApprovalId: string | null;
	approveRequest: (toolCallId: string) => void;
	denyRequest: (toolCallId: string, reason?: string) => void;
	approveAll: () => void;
	denyAll: (reason?: string) => void;
}

const ToolApprovalContext = createContext<ToolApprovalContextValue | null>(null);

export function useToolApproval(): ToolApprovalContextValue {
	const context = useContext(ToolApprovalContext);
	if (!context) {
		throw new Error("useToolApproval must be used within ToolApprovalProvider");
	}
	return context;
}

export function useToolApprovalForCall(toolCallId: string | undefined): {
	needsApproval: boolean;
	isActive: boolean;
	approve: () => void;
	deny: () => void;
	approveAll: () => void;
	denyAll: () => void;
} {
	const context = useContext(ToolApprovalContext);

	const approval = toolCallId ? context?.pendingApprovals.get(toolCallId) : undefined;
	const isActive = toolCallId !== undefined && context?.activeApprovalId === toolCallId;

	const approve = useCallback(() => {
		if (toolCallId && context) {
			context.approveRequest(toolCallId);
		}
	}, [toolCallId, context]);

	const deny = useCallback(() => {
		if (toolCallId && context) {
			context.denyRequest(toolCallId, "User denied tool execution");
		}
	}, [toolCallId, context]);

	const approveAll = useCallback(() => {
		context?.approveAll();
	}, [context]);

	const denyAll = useCallback(() => {
		context?.denyAll("User denied tool execution");
	}, [context]);

	return {
		needsApproval: !!approval,
		isActive,
		approve,
		deny,
		approveAll,
		denyAll,
	};
}

interface ToolApprovalProviderProps {
	children: ReactNode;
}

export function ToolApprovalProvider({ children }: ToolApprovalProviderProps) {
	const [pendingApprovals, setPendingApprovals] = useState<Map<string, PendingApproval>>(new Map());
	const [activeApprovalId, setActiveApprovalId] = useState<string | null>(null);

	const getFirstPendingId = useCallback((approvals: Map<string, PendingApproval>): string | null => {
		const first = approvals.keys().next();
		return first.done ? null : first.value;
	}, []);

	useEffect(() => {
		const handleAwaitingApprovals = (
			requests: ToolApprovalRequest[],
			respondToApprovals: (responses: ToolApprovalResponse[]) => void
		) => {
			const responseCollector = new Map<string, ToolApprovalResponse>();
			const expectedCount = requests.length;

			const checkAndRespond = () => {
				if (responseCollector.size === expectedCount) {
					respondToApprovals(Array.from(responseCollector.values()));
					setPendingApprovals(new Map());
					setActiveApprovalId(null);
				}
			};

			const newApprovals = new Map<string, PendingApproval>();
			for (const request of requests) {
				newApprovals.set(request.toolCallId, {
					request,
					respond: (response) => {
						responseCollector.set(request.approvalId, response);
						checkAndRespond();
					},
				});
			}

			setPendingApprovals(newApprovals);
			const firstId = requests[0]?.toolCallId ?? null;
			setActiveApprovalId(firstId);
		};

		daemonEvents.on("awaitingApprovals", handleAwaitingApprovals);
		return () => {
			daemonEvents.off("awaitingApprovals", handleAwaitingApprovals);
		};
	}, []);

	const approveRequest = useCallback(
		(toolCallId: string) => {
			setPendingApprovals((prev) => {
				const approval = prev.get(toolCallId);
				if (approval) {
					approval.respond({
						approvalId: approval.request.approvalId,
						approved: true,
					});
					daemonEvents.emit("toolApprovalResolved", toolCallId, true);
					const next = new Map(prev);
					next.delete(toolCallId);
					setActiveApprovalId(getFirstPendingId(next));
					return next;
				}
				return prev;
			});
		},
		[getFirstPendingId]
	);

	const denyRequest = useCallback(
		(toolCallId: string, reason?: string) => {
			setPendingApprovals((prev) => {
				const approval = prev.get(toolCallId);
				if (approval) {
					approval.respond({
						approvalId: approval.request.approvalId,
						approved: false,
						reason,
					});
					daemonEvents.emit("toolApprovalResolved", toolCallId, false);
					const next = new Map(prev);
					next.delete(toolCallId);
					setActiveApprovalId(getFirstPendingId(next));
					return next;
				}
				return prev;
			});
		},
		[getFirstPendingId]
	);

	const approveAll = useCallback(() => {
		setPendingApprovals((prev) => {
			for (const [toolCallId, approval] of prev.entries()) {
				approval.respond({
					approvalId: approval.request.approvalId,
					approved: true,
				});
				daemonEvents.emit("toolApprovalResolved", toolCallId, true);
			}
			setActiveApprovalId(null);
			return new Map();
		});
	}, []);

	const denyAll = useCallback((reason?: string) => {
		setPendingApprovals((prev) => {
			for (const [toolCallId, approval] of prev.entries()) {
				approval.respond({
					approvalId: approval.request.approvalId,
					approved: false,
					reason,
				});
				daemonEvents.emit("toolApprovalResolved", toolCallId, false);
			}
			setActiveApprovalId(null);
			return new Map();
		});
	}, []);

	return (
		<ToolApprovalContext.Provider
			value={{ pendingApprovals, activeApprovalId, approveRequest, denyRequest, approveAll, denyAll }}
		>
			{children}
		</ToolApprovalContext.Provider>
	);
}

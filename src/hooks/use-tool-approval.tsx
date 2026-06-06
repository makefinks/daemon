import { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from "react";
import { daemonEvents } from "../state/daemon-events";
import type { ToolApprovalRequest, ToolApprovalResponse } from "../types";

interface PendingApproval {
	request: ToolApprovalRequest;
	respond: (response: ToolApprovalResponse) => void;
}

interface ToolApprovalContextValue {
	pendingApprovals: Map<string, PendingApproval>;
	activeApprovalId: string | null;
	approveRequest: (toolCallId: string, sessionId?: string | null) => void;
	denyRequest: (toolCallId: string, reason?: string, sessionId?: string | null) => void;
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

function getApprovalKey(toolCallId: string, sessionId?: string | null): string {
	return sessionId ? `${sessionId}:${toolCallId}` : toolCallId;
}

function findApprovalKey(
	approvals: Map<string, PendingApproval>,
	toolCallId: string,
	sessionId?: string | null
) {
	const exact = approvals.get(getApprovalKey(toolCallId, sessionId));
	if (exact) return getApprovalKey(toolCallId, sessionId);
	return [...approvals.keys()].find((key) => key === toolCallId || key.endsWith(`:${toolCallId}`));
}

export function useToolApprovalForCall(
	toolCallId: string | undefined,
	sessionId?: string | null
): {
	needsApproval: boolean;
	isActive: boolean;
	approve: () => void;
	deny: () => void;
	approveAll: () => void;
	denyAll: () => void;
} {
	const context = useContext(ToolApprovalContext);

	const approvalKey =
		toolCallId && context ? findApprovalKey(context.pendingApprovals, toolCallId, sessionId) : undefined;
	const approval = approvalKey ? context?.pendingApprovals.get(approvalKey) : undefined;
	const isActive =
		approvalKey !== undefined &&
		(context?.activeApprovalId === approvalKey ||
			(context?.activeApprovalId === null && context.pendingApprovals.size === 1));

	const approve = useCallback(() => {
		if (toolCallId && context) {
			context.approveRequest(toolCallId, sessionId);
		}
	}, [toolCallId, sessionId, context]);

	const deny = useCallback(() => {
		if (toolCallId && context) {
			context.denyRequest(toolCallId, "User denied tool execution", sessionId);
		}
	}, [toolCallId, sessionId, context]);

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
		setActiveApprovalId((current) => {
			if (current && pendingApprovals.has(current)) return current;
			return getFirstPendingId(pendingApprovals);
		});
	}, [pendingApprovals, getFirstPendingId]);

	useEffect(() => {
		const handleAwaitingApprovals = (
			requests: ToolApprovalRequest[],
			respondToApprovals: (responses: ToolApprovalResponse[]) => void
		) => {
			const responseCollector = new Map<string, ToolApprovalResponse>();
			const expectedCount = requests.length;
			const approvalKeys = new Set(
				requests.map((request) => getApprovalKey(request.toolCallId, request.sessionId))
			);

			const checkAndRespond = () => {
				if (responseCollector.size === expectedCount) {
					respondToApprovals(Array.from(responseCollector.values()));
					setPendingApprovals((prev) => {
						const next = new Map(prev);
						for (const approvalKey of approvalKeys) next.delete(approvalKey);
						setActiveApprovalId(getFirstPendingId(next));
						return next;
					});
				}
			};

			const newApprovals = new Map<string, PendingApproval>();
			for (const request of requests) {
				newApprovals.set(getApprovalKey(request.toolCallId, request.sessionId), {
					request,
					respond: (response) => {
						responseCollector.set(request.approvalId, response);
						checkAndRespond();
					},
				});
			}

			setPendingApprovals((prev) => {
				const next = new Map(prev);
				for (const [toolCallId, approval] of newApprovals) next.set(toolCallId, approval);
				setActiveApprovalId((current) => current ?? getFirstPendingId(next));
				return next;
			});
		};

		daemonEvents.on("awaitingApprovals", handleAwaitingApprovals);
		return () => {
			daemonEvents.off("awaitingApprovals", handleAwaitingApprovals);
		};
	}, [getFirstPendingId]);

	const approveRequest = useCallback(
		(toolCallId: string, sessionId?: string | null) => {
			setPendingApprovals((prev) => {
				const approvalKey = findApprovalKey(prev, toolCallId, sessionId);
				const approval = approvalKey ? prev.get(approvalKey) : undefined;
				if (approval) {
					approval.respond({
						approvalId: approval.request.approvalId,
						approved: true,
					});
					daemonEvents.emit("toolApprovalResolved", toolCallId, true, approval.request.sessionId);
					const next = new Map(prev);
					next.delete(approvalKey!);
					setActiveApprovalId(getFirstPendingId(next));
					return next;
				}
				return prev;
			});
		},
		[getFirstPendingId]
	);

	const denyRequest = useCallback(
		(toolCallId: string, reason?: string, sessionId?: string | null) => {
			setPendingApprovals((prev) => {
				const approvalKey = findApprovalKey(prev, toolCallId, sessionId);
				const approval = approvalKey ? prev.get(approvalKey) : undefined;
				if (approval) {
					approval.respond({
						approvalId: approval.request.approvalId,
						approved: false,
						reason,
					});
					daemonEvents.emit("toolApprovalResolved", toolCallId, false, approval.request.sessionId);
					const next = new Map(prev);
					next.delete(approvalKey!);
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
			for (const approval of prev.values()) {
				approval.respond({
					approvalId: approval.request.approvalId,
					approved: true,
				});
				daemonEvents.emit(
					"toolApprovalResolved",
					approval.request.toolCallId,
					true,
					approval.request.sessionId
				);
			}
			setActiveApprovalId(null);
			return new Map();
		});
	}, []);

	const denyAll = useCallback((reason?: string) => {
		setPendingApprovals((prev) => {
			for (const approval of prev.values()) {
				approval.respond({
					approvalId: approval.request.approvalId,
					approved: false,
					reason,
				});
				daemonEvents.emit(
					"toolApprovalResolved",
					approval.request.toolCallId,
					false,
					approval.request.sessionId
				);
			}
			setActiveApprovalId(null);
			return new Map();
		});
	}, []);

	const contextValue = useMemo(
		() => ({ pendingApprovals, activeApprovalId, approveRequest, denyRequest, approveAll, denyAll }),
		[pendingApprovals, activeApprovalId, approveRequest, denyRequest, approveAll, denyAll]
	);

	return <ToolApprovalContext.Provider value={contextValue}>{children}</ToolApprovalContext.Provider>;
}

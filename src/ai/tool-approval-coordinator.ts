import type { ModelMessage } from "ai";
import type { ToolApprovalRequest, ToolApprovalResponse } from "../types";
import { debug } from "../utils/debug-logger";

interface CoordinateToolApprovalsParams {
	pendingApprovals: ToolApprovalRequest[];
	requestApprovals: (
		pendingApprovals: ToolApprovalRequest[],
		respondToApprovals: (responses: ToolApprovalResponse[]) => void
	) => void;
}

interface CoordinateToolApprovalsResult {
	/** A tool message to append before resuming streaming, or null if no-op. */
	toolMessage: ModelMessage | null;
	responses: ToolApprovalResponse[];
}

function buildDeniedToolResultPart(params: {
	request: ToolApprovalRequest;
	response: ToolApprovalResponse;
}): {
	type: "tool-result";
	toolCallId: string;
	toolName: string;
	output: { type: "text"; value: string };
} {
	// OpenRouter provider doesn't handle execution-denied type properly,
	// so we send a text output that the model can understand.
	const denialMessage =
		params.response.reason ?? "Tool execution was denied by the user. Do not retry this command.";

	return {
		type: "tool-result" as const,
		toolCallId: params.request.toolCallId,
		toolName: params.request.toolName,
		output: {
			type: "text" as const,
			value: `[DENIED] ${denialMessage}`,
		},
	};
}

export async function coordinateToolApprovals(
	params: CoordinateToolApprovalsParams
): Promise<CoordinateToolApprovalsResult> {
	if (params.pendingApprovals.length === 0) {
		return { toolMessage: null, responses: [] };
	}

	const responses = await new Promise<ToolApprovalResponse[]>((resolve) => {
		params.requestApprovals(params.pendingApprovals, (r) => resolve(r));
	});

	debug.info("tool-approval-responses", {
		responses,
		pendingApprovals: params.pendingApprovals,
	});

	const approvalMap = new Map(params.pendingApprovals.map((p) => [p.approvalId, p]));

	const approvedParts: Array<{
		type: "tool-approval-response";
		approvalId: string;
		approved: true;
	}> = [];

	const deniedParts: Array<{
		type: "tool-result";
		toolCallId: string;
		toolName: string;
		output: { type: "text"; value: string };
	}> = [];

	for (const r of responses) {
		const originalRequest = approvalMap.get(r.approvalId);
		if (!originalRequest) continue;

		if (r.approved) {
			approvedParts.push({
				type: "tool-approval-response" as const,
				approvalId: r.approvalId,
				approved: true,
			});
		} else {
			deniedParts.push(buildDeniedToolResultPart({ request: originalRequest, response: r }));
		}
	}

	const combinedContent: Array<
		| { type: "tool-approval-response"; approvalId: string; approved: true }
		| {
				type: "tool-result";
				toolCallId: string;
				toolName: string;
				output: { type: "text"; value: string };
		  }
	> = [...approvedParts, ...deniedParts];

	if (combinedContent.length === 0) {
		return { toolMessage: null, responses };
	}

	debug.info("tool-approval-combined", { combinedContent });

	return {
		responses,
		toolMessage: {
			role: "tool" as const,
			content: combinedContent,
		},
	};
}

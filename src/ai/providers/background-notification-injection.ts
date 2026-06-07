import { backgroundJobManager } from "../../state/background-job-manager";
import type { ModelMessage, StreamCallbacks } from "../../types";
import { debug } from "../../utils/debug-logger";

interface InjectedBackgroundNotification {
	baseMessageIndex: number;
	message: ModelMessage;
}

interface MessageInsertion {
	index: number;
	message: ModelMessage;
}

export interface BackgroundNotificationInjector {
	prepareStepMessages(messages: ModelMessage[]): ModelMessage[];
	applyToResponseMessages(responseMessages: ModelMessage[]): ModelMessage[];
}

function insertMessages(messages: ModelMessage[], insertions: MessageInsertion[]): ModelMessage[] {
	if (insertions.length === 0) return messages;
	const next = [...messages];
	const sorted = [...insertions].sort((a, b) => a.index - b.index);
	let offset = 0;
	for (const insertion of sorted) {
		const index = Math.min(Math.max(0, insertion.index + offset), next.length);
		next.splice(index, 0, insertion.message);
		offset += 1;
	}
	return next;
}

/**
 * Injects queued background completion notifications before internal tool-loop steps.
 * The AI SDK does not include prepareStep message overrides in response.messages, so
 * this also records where synthetic user messages must be added to persisted history.
 */
export function createBackgroundNotificationInjector(
	sessionId: string | null,
	callbacks: StreamCallbacks
): BackgroundNotificationInjector {
	let initialMessageCount: number | null = null;
	const injected: InjectedBackgroundNotification[] = [];

	return {
		prepareStepMessages(messages: ModelMessage[]): ModelMessage[] {
			if (initialMessageCount === null) initialMessageCount = messages.length;

			const messagesWithPreviousInjections = insertMessages(
				messages,
				injected.map((entry) => ({
					index: entry.baseMessageIndex,
					message: entry.message,
				}))
			);

			if (!sessionId) return messagesWithPreviousInjections;

			const notifications = backgroundJobManager.takeQueuedNotifications(sessionId);
			if (notifications.length === 0) return messagesWithPreviousInjections;

			const baseMessageIndex = messages.length;
			const notificationMessages = notifications.map(({ notification, job }) => {
				callbacks.onBackgroundNotification?.(job);
				return { role: "user", content: notification } satisfies ModelMessage;
			});

			for (const message of notificationMessages) {
				injected.push({ baseMessageIndex, message });
			}

			debug.info("background-notifications-injected", {
				sessionId,
				count: notifications.length,
				baseMessageIndex,
			});

			return [...messagesWithPreviousInjections, ...notificationMessages];
		},

		applyToResponseMessages(responseMessages: ModelMessage[]): ModelMessage[] {
			if (initialMessageCount === null || injected.length === 0) return responseMessages;
			const responseStartIndex = initialMessageCount;
			return insertMessages(
				responseMessages,
				injected.map((entry) => ({
					index: Math.max(0, entry.baseMessageIndex - responseStartIndex),
					message: entry.message,
				}))
			);
		},
	};
}

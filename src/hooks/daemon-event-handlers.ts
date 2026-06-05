import { toast } from "@opentui-ui/toast/react";
import {
	incrementMemories,
	incrementSessions,
	decrementMemories,
	decrementSessions,
	decrementArtifacts,
} from "../state/stats-store";
import type { MemoryToastPreview } from "../types";

export function createMemorySavedHandler() {
	return (preview: MemoryToastPreview) => {
		incrementMemories(1);
		const description = preview.description?.trim();
		if (!description) return;
		toast.success(`Memory saved (${preview.operation})`, { description });
	};
}

export function createMemoryDeletedHandler() {
	return () => {
		decrementMemories();
	};
}

export function createSessionCreatedHandler() {
	return () => {
		incrementSessions();
	};
}

export function createSessionDeletedHandler() {
	return (fileCount: number) => {
		decrementSessions();
		if (fileCount > 0) {
			decrementArtifacts(fileCount);
		}
	};
}

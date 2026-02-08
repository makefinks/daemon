/**
 * AI integration for DAEMON using Vercel AI SDK.
 * Handles transcription and response generation.
 */

import { createOpenAI } from "@ai-sdk/openai";
import { type ModelMessage, experimental_transcribe as transcribe } from "ai";
import { getDaemonManager } from "../state/daemon-state";
import type {
	MemoryToastOperation,
	MemoryToastPreview,
	ReasoningEffort,
	StreamCallbacks,
	TranscriptionResult,
} from "../types";
import { debug } from "../utils/debug-logger";
import { buildMemoryInjection, getMemoryManager, isMemoryAvailable } from "./memory";
import { TRANSCRIPTION_MODEL } from "./model-config";
import { getProviderAdapter } from "./providers/registry";
import { type InteractionMode } from "./system-prompt";
import { setSubagentProgressEmitter } from "./tools/subagents";

export type { ModelMessage } from "ai";

const openai = createOpenAI({});

async function buildMemoryInjectionForPrompt(userMessage: string): Promise<string | undefined> {
	if (!getDaemonManager().memoryEnabled || !isMemoryAvailable()) {
		return undefined;
	}

	const injection = await buildMemoryInjection(userMessage);
	return injection || undefined;
}

/**
 * Transcribe audio using GPT-4o transcribe model via AI SDK.
 * @param audioBuffer - WAV audio buffer to transcribe
 * @param abortSignal - Optional abort signal to cancel the request
 * @returns Transcription result with text
 */
export async function transcribeAudio(
	audioBuffer: Buffer,
	abortSignal?: AbortSignal
): Promise<TranscriptionResult> {
	try {
		const result = await transcribe({
			model: openai.transcription(TRANSCRIPTION_MODEL),
			audio: audioBuffer,
			abortSignal,
		});

		return {
			text: result.text,
		};
	} catch (error) {
		if (error instanceof Error && error.name === "AbortError") {
			throw error;
		}
		const err = error instanceof Error ? error : new Error(String(error));
		throw new Error(`Transcription failed: ${err.message}`);
	}
}

/**
 * Generate a streaming response from DAEMON.
 * Delegates provider-specific execution to the active provider adapter.
 */
export async function generateResponse(
	userMessage: string,
	callbacks: StreamCallbacks,
	conversationHistory: ModelMessage[] = [],
	interactionMode: InteractionMode = "text",
	abortSignal?: AbortSignal,
	reasoningEffort?: ReasoningEffort
): Promise<void> {
	setSubagentProgressEmitter({
		onSubagentToolCall: (toolCallId: string, toolName: string, input?: unknown) => {
			callbacks.onSubagentToolCall?.(toolCallId, toolName, input);
		},
		onSubagentUsage: (usage) => {
			callbacks.onSubagentUsage?.(usage);
		},
		onSubagentToolResult: (toolCallId: string, toolName: string, success: boolean) => {
			callbacks.onSubagentToolResult?.(toolCallId, toolName, success);
		},
		onSubagentComplete: (toolCallId: string, success: boolean) => {
			callbacks.onSubagentComplete?.(toolCallId, success);
		},
	});

	try {
		const memoryInjection = await buildMemoryInjectionForPrompt(userMessage);
		const provider = getProviderAdapter();
		const result = await provider.streamResponse({
			userMessage,
			callbacks,
			conversationHistory,
			interactionMode,
			abortSignal,
			reasoningEffort,
			memoryInjection,
		});

		if (!result) {
			return;
		}

		callbacks.onComplete?.(result.fullText, result.responseMessages, result.usage, result.finalText);

		const assistantTextForMemory = result.finalText ?? result.fullText;
		void persistConversationMemory(userMessage, assistantTextForMemory).then((preview) => {
			if (!preview) return;
			callbacks.onMemorySaved?.(preview);
		});
	} catch (error) {
		if (abortSignal?.aborted) {
			return;
		}
		if (error instanceof Error && error.name === "AbortError") {
			return;
		}
		const err = error instanceof Error ? error : new Error(String(error));
		callbacks.onError?.(new Error(err.message));
	} finally {
		setSubagentProgressEmitter(null);
	}
}

async function persistConversationMemory(
	userMessage: string,
	assistantMessage: string
): Promise<MemoryToastPreview | null> {
	const userTextForMemory = userMessage.trim();
	const assistantTextForMemory = assistantMessage.trim();

	if (!userTextForMemory || !assistantTextForMemory) return null;
	if (!getDaemonManager().memoryEnabled) return null;
	if (!isMemoryAvailable()) return null;

	const memoryManager = getMemoryManager();
	await memoryManager.initialize();
	if (!memoryManager.isAvailable) return null;

	try {
		const memoryMessages = [
			{ role: "user", content: `<user>${userTextForMemory}</user>` },
			{ role: "assistant", content: `<assistant>${assistantTextForMemory}</assistant>` },
		];
		const result = await memoryManager.add(
			memoryMessages,
			{
				timestamp: new Date().toISOString(),
				source: "conversation",
			},
			true
		);
		return buildMemoryToastPreview(result.results);
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		debug.error("memory-auto-add-failed", { message: err.message });
		return null;
	}
}

function buildMemoryToastPreview(
	results: Array<{ memory: string; event: "ADD" | "UPDATE" | "DELETE" | "NONE" }>
): MemoryToastPreview | null {
	if (results.length === 0) return null;

	const saved = results.filter((entry) => entry.event === "ADD" || entry.event === "UPDATE");
	if (saved.length === 0) return null;

	const previewEntries = saved.length > 2 ? saved.slice(-2) : saved;
	const lines = previewEntries.map((entry) => `• ${truncatePreview(entry.memory, 52)}`);
	if (saved.length > previewEntries.length) {
		lines.push(`• +${saved.length - previewEntries.length} more`);
	}

	const hasUpdate = saved.some((entry) => entry.event === "UPDATE");
	const operation: MemoryToastOperation = hasUpdate ? "UPDATE" : "ADD";

	return {
		operation,
		description: lines.join("\n"),
	};
}

function truncatePreview(text: string, maxChars: number): string {
	const trimmed = text.trim();
	if (trimmed.length <= maxChars) return trimmed;
	if (maxChars <= 1) return "…";
	return `${trimmed.slice(0, maxChars - 1)}…`;
}

/**
 * Generate a short descriptive title for a session based on the first user message.
 */
export async function generateSessionTitle(firstMessage: string): Promise<string> {
	try {
		const provider = getProviderAdapter();
		const title = await provider.generateSessionTitle(firstMessage);
		return title.trim() || "New Session";
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		debug.error("session-title-generation-failed", { message: err.message });
		return "New Session";
	}
}

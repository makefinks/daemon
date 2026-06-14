import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { SessionRuntimeStore } from "../src/state/session-runtime-store";

function waitFor(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("session-runtime-store streaming coalescing", () => {
	let store: SessionRuntimeStore;
	const sessionId = "test-session-1";

	beforeEach(() => {
		store = new SessionRuntimeStore();
	});

	afterEach(() => {
		store.clear(sessionId);
	});

	describe("notification coalescing", () => {
		it("coalesces multiple appendToken calls into fewer notifications", async () => {
			store.beginResponse(sessionId);
			const notifications: string[] = [];
			store.events.on("updated", (id: string) => {
				notifications.push(id);
			});

			const tokenCount = 20;
			for (let i = 0; i < tokenCount; i++) {
				store.appendToken(sessionId, `token${i} `);
			}

			expect(notifications.length).toBeLessThan(tokenCount);

			await waitFor(50);

			const snapshot = store.getSnapshot(sessionId);
			expect(snapshot).not.toBeNull();
			expect(snapshot!.currentResponse).toContain("token0");
			expect(snapshot!.currentResponse).toContain("token19");
		});

		it("coalesces multiple appendReasoning calls into fewer notifications", async () => {
			store.beginResponse(sessionId);
			const notifications: string[] = [];
			store.events.on("updated", (id: string) => {
				notifications.push(id);
			});

			const tokenCount = 20;
			for (let i = 0; i < tokenCount; i++) {
				store.appendReasoning(sessionId, `reason${i} `);
			}

			expect(notifications.length).toBeLessThan(tokenCount);

			await waitFor(50);

			const snapshot = store.getSnapshot(sessionId);
			expect(snapshot).not.toBeNull();
			expect(snapshot!.currentContentBlocks.length).toBeGreaterThan(0);
			const reasoningBlock = snapshot!.currentContentBlocks.find((b) => b.type === "reasoning");
			expect(reasoningBlock).toBeDefined();
			expect(reasoningBlock!.content).toContain("reason0");
			expect(reasoningBlock!.content).toContain("reason19");
		});

		it("snapshot always contains full accumulated text regardless of notification timing", async () => {
			store.beginResponse(sessionId);

			store.appendToken(sessionId, "Hello ");
			store.appendToken(sessionId, "world ");
			store.appendToken(sessionId, "foo");

			const snapshotBeforeFlush = store.getSnapshot(sessionId);
			expect(snapshotBeforeFlush!.currentResponse).toBe("Hello world foo");
		});
	});

	describe("boundary flush", () => {
		it("completeResponse flushes pending text before clearing", () => {
			store.beginResponse(sessionId);
			const notifications: string[] = [];
			store.events.on("updated", (id: string) => {
				notifications.push(id);
			});

			store.appendToken(sessionId, "Hello ");
			store.appendToken(sessionId, "world");

			notifications.length = 0;

			store.completeResponse(sessionId, "Hello world", [], null, false, null);

			expect(notifications.length).toBeGreaterThan(0);

			const snapshot = store.getSnapshot(sessionId);
			expect(snapshot!.currentResponse).toBe("");
		});

		it("cancelResponse flushes pending text before clearing", () => {
			store.beginResponse(sessionId);
			store.appendToken(sessionId, "Partial ");

			const notifications: string[] = [];
			store.events.on("updated", (id: string) => {
				notifications.push(id);
			});

			store.appendToken(sessionId, "text");
			notifications.length = 0;

			store.cancelResponse(sessionId);

			expect(notifications.length).toBeGreaterThan(0);
		});

		it("setError flushes pending text before setting error", () => {
			store.beginResponse(sessionId);
			store.appendToken(sessionId, "Some ");

			const notifications: string[] = [];
			store.events.on("updated", (id: string) => {
				notifications.push(id);
			});

			store.appendToken(sessionId, "text");
			notifications.length = 0;

			store.setError(sessionId, "Something went wrong");

			expect(notifications.length).toBeGreaterThan(0);
		});

		it("toolInputStart flushes pending text before adding tool block", () => {
			store.beginResponse(sessionId);
			store.appendToken(sessionId, "Calling ");

			const notifications: string[] = [];
			store.events.on("updated", (id: string) => {
				notifications.push(id);
			});

			store.appendToken(sessionId, "tool...");
			notifications.length = 0;

			store.toolInputStart(sessionId, "bash", "call-1");

			expect(notifications.length).toBeGreaterThan(0);

			const snapshot = store.getSnapshot(sessionId);
			expect(snapshot!.currentContentBlocks.some((b) => b.type === "tool")).toBe(true);
		});

		it("toolInvocation flushes pending text before adding tool block", () => {
			store.beginResponse(sessionId);
			store.appendToken(sessionId, "Running ");

			const notifications: string[] = [];
			store.events.on("updated", (id: string) => {
				notifications.push(id);
			});

			store.appendToken(sessionId, "command...");
			notifications.length = 0;

			store.toolInvocation(sessionId, "bash", { command: "ls" });

			expect(notifications.length).toBeGreaterThan(0);
		});

		it("toolResult flushes pending text before adding result", () => {
			store.beginResponse(sessionId);
			store.toolInputStart(sessionId, "bash", "call-1");
			store.appendToken(sessionId, "Some output ");

			const notifications: string[] = [];
			store.events.on("updated", (id: string) => {
				notifications.push(id);
			});

			store.appendToken(sessionId, "continued");
			notifications.length = 0;

			store.toolResult(sessionId, "bash", { output: "done" }, "call-1");

			expect(notifications.length).toBeGreaterThan(0);
		});

		it("beginResponse flushes pending text from previous response", () => {
			store.beginResponse(sessionId);
			store.appendToken(sessionId, "First ");

			const notifications: string[] = [];
			store.events.on("updated", (id: string) => {
				notifications.push(id);
			});

			store.appendToken(sessionId, "response");
			notifications.length = 0;

			store.beginResponse(sessionId);

			expect(notifications.length).toBeGreaterThan(0);
		});

		it("flushStreamNotify is idempotent when nothing pending", () => {
			store.beginResponse(sessionId);
			const notifications: string[] = [];
			store.events.on("updated", (id: string) => {
				notifications.push(id);
			});

			store.flushStreamNotify(sessionId);

			expect(notifications.length).toBe(1);
		});
	});

	describe("final content correctness", () => {
		it("final conversation history content is identical to unbatched behavior", () => {
			store.beginUserMessage(sessionId, "Hello");

			store.beginResponse(sessionId);
			store.appendToken(sessionId, "Hi ");
			store.appendToken(sessionId, "there!");
			store.completeResponse(
				sessionId,
				"Hi there!",
				[{ role: "assistant", content: "Hi there!" }],
				null,
				false,
				null
			);

			const snapshot = store.getSnapshot(sessionId);
			expect(snapshot).not.toBeNull();
			expect(snapshot!.conversationHistory.length).toBeGreaterThan(0);

			const daemonMsg = snapshot!.conversationHistory.find((m) => m.type === "daemon");
			expect(daemonMsg).toBeDefined();
			expect(daemonMsg!.content).toBe("Hi there!");
		});

		it("reasoning content is preserved after flush", () => {
			store.beginResponse(sessionId);
			store.appendReasoning(sessionId, "Thinking step 1 ");
			store.appendReasoning(sessionId, "Thinking step 2");
			store.appendToken(sessionId, "Final answer");

			store.flushStreamNotify(sessionId);

			const snapshot = store.getSnapshot(sessionId);
			expect(snapshot).not.toBeNull();
			const reasoningBlock = snapshot!.currentContentBlocks.find((b) => b.type === "reasoning");
			expect(reasoningBlock).toBeDefined();
			expect(reasoningBlock!.content).toBe("Thinking step 1 Thinking step 2");
			expect(snapshot!.currentResponse).toBe("Final answer");
		});
	});
});

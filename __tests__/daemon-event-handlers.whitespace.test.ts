import { describe, it, expect } from "bun:test";
import {
	createTokenHandler,
	createToolInputStartHandler,
	createToolInvocationHandler,
} from "../src/hooks/daemon-event-handlers";
import type { ContentBlock } from "../src/types";
import { REASONING_ANIMATION } from "../src/ui/constants";

function createRefs() {
	return {
		avatarRef: { current: null },
		hasStartedSpeakingRef: { current: false },
		streamPhaseRef: { current: null },
		messageIdRef: { current: 1 },
		currentUserInputRef: { current: "" },
		toolCallsRef: { current: [] },
		toolCallsByIdRef: { current: new Map() },
		contentBlocksRef: { current: [] as ContentBlock[] },
		reasoningStartAtRef: { current: null },
		reasoningDurationMsRef: { current: null },
		currentReasoningBlockRef: { current: null },
		sessionUsageRef: { current: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } },
		fullReasoningRef: { current: "" },
	} as any;
}

function createSetters() {
	return {
		setDaemonState: () => {},
		setCurrentTranscription: () => {},
		setCurrentResponse: () => {},
		setCurrentContentBlocks: () => {},
		setConversationHistory: () => {},
		setSessionUsage: () => {},
		setError: () => {},
		setReasoningQueue: () => {},
		setFullReasoning: () => {},
	} as any;
}

function createDeps() {
	return {
		applyAvatarForState: () => {},
		clearReasoningState: () => {},
		clearReasoningTicker: () => {},
		finalizeReasoningDuration: () => {},
		sessionId: null,
		sessionIdRef: { current: null },
		ensureSessionId: async () => "test",
	} as any;
}

describe("daemon-event-handlers whitespace filtering", () => {
	it("does not create a new text block for whitespace-only tokens", () => {
		const refs = createRefs();
		const setters = createSetters();
		const deps = createDeps();

		const onToken = createTokenHandler(refs, setters, deps);

		onToken("\n");
		onToken("\n\n");

		expect(refs.contentBlocksRef.current.length).toBe(0);
		expect(refs.hasStartedSpeakingRef.current).toBe(false);
	});

	it("removes trailing whitespace-only text blocks before tool calls", () => {
		const refs = createRefs();
		const setters = createSetters();
		const deps = createDeps();

		refs.contentBlocksRef.current.push({ type: "text", content: "\n\n" });

		const onTool = createToolInvocationHandler(refs, setters, deps);
		onTool("webSearch", { q: "test" }, "call_1");

		expect(refs.contentBlocksRef.current.length).toBe(1);
		expect(refs.contentBlocksRef.current[0]?.type).toBe("tool");
	});

	it("keeps whitespace tokens once visible text exists in the current text block", () => {
		const refs = createRefs();
		const setters = createSetters();
		const deps = createDeps();

		const onToken = createTokenHandler(refs, setters, deps);

		onToken("Hello");
		onToken("\n");
		onToken("World");

		expect(refs.contentBlocksRef.current.length).toBe(1);
		expect(refs.contentBlocksRef.current[0]?.type).toBe("text");
		expect((refs.contentBlocksRef.current[0] as any).content).toBe("Hello\nWorld");
		expect(refs.hasStartedSpeakingRef.current).toBe(true);
	});

	it("does not let whitespace-only text tokens override an active reasoning phase", () => {
		const refs = createRefs();
		const setters = createSetters();

		let finalizeCalls = 0;
		let clearTickerCalls = 0;
		const deps = {
			...createDeps(),
			finalizeReasoningDuration: () => {
				finalizeCalls++;
			},
			clearReasoningTicker: () => {
				clearTickerCalls++;
			},
		};

		const avatar = {
			colors: null as any,
			intensity: REASONING_ANIMATION.INTENSITY,
			reasoningMode: true,
			setColors: (value: any) => {
				avatar.colors = value;
			},
			setIntensity: (value: number) => {
				avatar.intensity = value;
			},
			setReasoningMode: (value: boolean) => {
				avatar.reasoningMode = value;
			},
		};

		refs.avatarRef.current = avatar as any;
		refs.streamPhaseRef.current = "reasoning";
		refs.reasoningStartAtRef.current = Date.now();
		refs.contentBlocksRef.current.push({ type: "text", content: "Hello" });

		const onToken = createTokenHandler(refs, setters, deps as any);

		onToken("\n");

		expect(finalizeCalls).toBe(0);
		expect(clearTickerCalls).toBe(0);
		expect(avatar.reasoningMode).toBe(true);
		expect(avatar.intensity).toBe(REASONING_ANIMATION.INTENSITY);
		expect(refs.contentBlocksRef.current.length).toBe(1);
		expect(refs.contentBlocksRef.current[0]?.type).toBe("text");
		expect((refs.contentBlocksRef.current[0] as any).content).toBe("Hello\n");

		onToken("World");

		expect(finalizeCalls).toBe(1);
		expect(clearTickerCalls).toBe(1);
		expect(avatar.reasoningMode).toBe(false);
		expect(avatar.intensity).toBe(0.7);
		expect(refs.streamPhaseRef.current).toBe("text");
		expect((refs.contentBlocksRef.current[0] as any).content).toBe("Hello\nWorld");
	});

	it("returns to reasoning mode as soon as a tool is invoked", () => {
		const refs = createRefs();
		const setters = createSetters();

		const avatar = {
			colors: null as any,
			intensity: 0,
			reasoningMode: false,
			toolFlashCalls: 0,
			toolActiveCalls: 0,
			setColors: (value: any) => {
				avatar.colors = value;
			},
			setIntensity: (value: number) => {
				avatar.intensity = value;
			},
			setReasoningMode: (value: boolean) => {
				avatar.reasoningMode = value;
			},
			triggerToolFlash: () => {
				avatar.toolFlashCalls++;
			},
			setToolActive: () => {
				avatar.toolActiveCalls++;
			},
		};

		refs.avatarRef.current = avatar as any;
		refs.streamPhaseRef.current = "text";

		const deps = createDeps();
		const onTool = createToolInvocationHandler(refs, setters, deps);

		onTool("webSearch", { q: "test" }, "call_1");

		expect(refs.streamPhaseRef.current).toBe("reasoning");
		expect(avatar.reasoningMode).toBe(true);
		expect(avatar.intensity).toBe(REASONING_ANIMATION.INTENSITY);
		expect(avatar.toolFlashCalls).toBe(1);
	});

	it("does not duplicate tool blocks when tool input start repeats with the same call id", () => {
		const refs = createRefs();
		const setters = createSetters();
		const deps = createDeps();

		const onToolInputStart = createToolInputStartHandler(refs, setters, deps);
		onToolInputStart("webSearch", "call_1");
		onToolInputStart("webSearch", "call_1");

		expect(refs.toolCallsRef.current.length).toBe(1);
		expect(refs.contentBlocksRef.current.length).toBe(1);
		expect(refs.contentBlocksRef.current[0]?.type).toBe("tool");
		expect((refs.contentBlocksRef.current[0] as any).call.toolCallId).toBe("call_1");
	});

	it("does not duplicate tool blocks when tool invocation repeats with the same call id", () => {
		const refs = createRefs();
		const setters = createSetters();
		const deps = createDeps();

		const onTool = createToolInvocationHandler(refs, setters, deps);
		onTool("webSearch", { q: "first" }, "call_1");
		onTool("webSearch", { q: "second" }, "call_1");

		expect(refs.toolCallsRef.current.length).toBe(1);
		expect(refs.contentBlocksRef.current.length).toBe(1);
		expect(refs.contentBlocksRef.current[0]?.type).toBe("tool");
		expect((refs.contentBlocksRef.current[0] as any).call.input).toEqual({ q: "second" });
	});

	it("keeps a single tool block when invocation arrives before input-start for the same id", () => {
		const refs = createRefs();
		const setters = createSetters();
		const deps = createDeps();

		const onTool = createToolInvocationHandler(refs, setters, deps);
		const onToolInputStart = createToolInputStartHandler(refs, setters, deps);

		onTool("webSearch", { q: "test" }, "call_1");
		onToolInputStart("webSearch", "call_1");

		expect(refs.toolCallsRef.current.length).toBe(1);
		expect(refs.contentBlocksRef.current.length).toBe(1);
		expect(refs.contentBlocksRef.current[0]?.type).toBe("tool");
		expect((refs.contentBlocksRef.current[0] as any).call.status).toBe("running");
	});
});

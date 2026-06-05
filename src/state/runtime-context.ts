import { AsyncLocalStorage } from "node:async_hooks";

interface RuntimeContext {
	sessionId: string | null;
	messageId: number;
}

const storage = new AsyncLocalStorage<RuntimeContext>();

export function runWithRuntimeContext<T>(runtimeContext: RuntimeContext, fn: () => T): T {
	return storage.run(runtimeContext, fn);
}

export function setRuntimeContext(sessionId: string | null, messageId: number): void {
	void sessionId;
	void messageId;
}

export function getRuntimeContext(): RuntimeContext {
	const scoped = storage.getStore();
	if (scoped) return { ...scoped };
	return { sessionId: null, messageId: 0 };
}

export function clearRuntimeContext(): void {}

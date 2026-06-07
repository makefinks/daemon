import { AsyncLocalStorage } from "node:async_hooks";

interface RuntimeContext {
	sessionId: string | null;
	messageId: number;
}

const store = new AsyncLocalStorage<RuntimeContext>();

const EMPTY_CONTEXT: RuntimeContext = { sessionId: null, messageId: 0 };

export function runWithRuntimeContext<T>(runtimeContext: RuntimeContext, fn: () => T): T {
	return store.run({ ...runtimeContext }, fn);
}

export function getRuntimeContext(): RuntimeContext {
	return store.getStore() ?? EMPTY_CONTEXT;
}

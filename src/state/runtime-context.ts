interface RuntimeContext {
	sessionId: string | null;
	messageId: number;
}

let context: RuntimeContext = {
	sessionId: null,
	messageId: 0,
};

export function setRuntimeContext(sessionId: string | null, messageId: number): void {
	context = { sessionId, messageId };
}

export function getRuntimeContext(): RuntimeContext {
	return { ...context };
}

export function clearRuntimeContext(): void {
	context = { sessionId: null, messageId: 0 };
}

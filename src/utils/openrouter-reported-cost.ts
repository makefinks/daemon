export function getOpenRouterReportedCost(providerMetadata: unknown): number | undefined {
	if (!providerMetadata || typeof providerMetadata !== "object") return undefined;
	if (!("openrouter" in providerMetadata)) return undefined;

	const openrouter = (providerMetadata as { openrouter?: unknown }).openrouter;
	if (!openrouter || typeof openrouter !== "object") return undefined;
	if (!("usage" in openrouter)) return undefined;

	const usage = (openrouter as { usage?: unknown }).usage;
	if (!usage || typeof usage !== "object") return undefined;
	if (!("cost" in usage)) return undefined;

	const cost = (usage as { cost?: unknown }).cost;
	if (typeof cost !== "number" || !Number.isFinite(cost)) return undefined;
	return cost;
}

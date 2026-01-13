import Exa from "exa-js";

type ExaClient = InstanceType<typeof Exa>;

let cachedClient: ExaClient | null = null;
let cachedApiKey: string | null = null;

export const getExaClient = (): { client: ExaClient } | { error: string } => {
	const apiKey = process.env.EXA_API_KEY;
	if (!apiKey) {
		return { error: "EXA_API_KEY environment variable is not set" };
	}

	if (cachedClient && cachedApiKey === apiKey) {
		return { client: cachedClient };
	}

	cachedApiKey = apiKey;
	cachedClient = new Exa(apiKey);
	return { client: cachedClient };
};

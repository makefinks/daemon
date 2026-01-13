function encodeTextFragment(text: string): string {
	return encodeURIComponent(text).replace(/-/g, "%2D");
}

export function buildTextFragmentUrl(url: string, fragment: { fragmentText: string }): string {
	if (!fragment || !fragment.fragmentText) return url;

	const encoded = encodeTextFragment(fragment.fragmentText);
	const textDirective = `text=${encoded}`;

	try {
		const parsed = new URL(url);
		const existingHash = parsed.hash;

		if (!existingHash) {
			parsed.hash = `:~:${textDirective}`;
		} else if (existingHash.includes(":~:text=")) {
			parsed.hash = existingHash.replace(/:~:text=[^&]*/, `:~:${textDirective}`);
		} else {
			parsed.hash = `${existingHash}:~:${textDirective}`;
		}

		return parsed.toString();
	} catch {
		const hashIdx = url.indexOf("#");
		if (hashIdx === -1) {
			return `${url}#:~:${textDirective}`;
		}

		const base = url.slice(0, hashIdx);
		const existingHash = url.slice(hashIdx);

		if (existingHash.includes(":~:text=")) {
			return base + existingHash.replace(/:~:text=[^&]*/, `:~:${textDirective}`);
		}

		return `${url}:~:${textDirective}`;
	}
}

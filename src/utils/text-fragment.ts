import type { TextFragment } from "../types";

function encodeTextFragmentPart(text: string): string {
	return encodeURIComponent(text).replace(/-/g, "%2D");
}

function buildTextDirective(fragment: TextFragment): string | null {
	const textStart = fragment.textStart?.trim();
	if (!textStart) return null;

	const parts: string[] = [];
	const prefix = fragment.prefix?.trim();
	const textEnd = fragment.textEnd?.trim();
	const suffix = fragment.suffix?.trim();

	if (prefix) {
		parts.push(`${encodeTextFragmentPart(prefix)}-,`);
	}

	parts.push(encodeTextFragmentPart(textStart));

	if (textEnd) {
		parts.push(`,${encodeTextFragmentPart(textEnd)}`);
	}

	if (suffix) {
		parts.push(`,-${encodeTextFragmentPart(suffix)}`);
	}

	return `text=${parts.join("")}`;
}

export function textFragmentDisplayText(fragment: TextFragment): string {
	const textStart = fragment.textStart?.trim() ?? "";
	const textEnd = fragment.textEnd?.trim() ?? "";

	if (textStart && textEnd) return `${textStart} ... ${textEnd}`;
	return textStart;
}

export function buildStructuredTextFragmentUrl(url: string, fragment: TextFragment): string {
	const textDirective = buildTextDirective(fragment);
	if (!textDirective) return url;

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

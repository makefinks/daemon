import { COLORS } from "../ui/constants";

interface SearchHighlightProps {
	text: string;
	query: string;
	color: string;
	highlightColor?: string;
	highlightBackgroundColor?: string;
}

export function SearchHighlight({
	text,
	query,
	color,
	highlightColor = COLORS.USER_TEXT,
	highlightBackgroundColor = `${COLORS.TYPING_PROMPT}66`,
}: SearchHighlightProps) {
	const trimmedQuery = query.trim();
	if (!trimmedQuery) return <span fg={color}>{text}</span>;

	const lowerText = text.toLowerCase();
	const lowerQuery = trimmedQuery.toLowerCase();
	const parts: Array<{ text: string; highlighted: boolean }> = [];
	let cursor = 0;

	while (cursor < text.length) {
		const index = lowerText.indexOf(lowerQuery, cursor);
		if (index === -1) {
			parts.push({ text: text.slice(cursor), highlighted: false });
			break;
		}
		if (index > cursor) parts.push({ text: text.slice(cursor, index), highlighted: false });
		parts.push({ text: text.slice(index, index + trimmedQuery.length), highlighted: true });
		cursor = index + trimmedQuery.length;
	}

	return (
		<>
			{parts.map((part, index) => (
				<span
					key={`${index}-${part.text}`}
					fg={part.highlighted ? highlightColor : color}
					bg={part.highlighted ? highlightBackgroundColor : undefined}
				>
					{part.text}
				</span>
			))}
		</>
	);
}

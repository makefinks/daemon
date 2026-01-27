#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-}"
if [[ -z "$MODE" ]]; then
	echo "Usage: ./scripts/release.sh <patch|minor|major|notes>" >&2
	exit 1
fi

if [[ "$MODE" == "notes" ]]; then
	CURRENT_TAG="$(git describe --tags --abbrev=0 2>/dev/null || true)"
	PREV_TAG="$(git describe --tags --abbrev=0 "${CURRENT_TAG}^" 2>/dev/null || true)"
	if [[ -z "$CURRENT_TAG" ]]; then
		echo "No tags found." >&2
		exit 1
	fi
	if [[ -n "$PREV_TAG" ]]; then
		git log --pretty=format:"- %s (%h)" "${PREV_TAG}..${CURRENT_TAG}"
	else
		git log --pretty=format:"- %s (%h)" "${CURRENT_TAG}"
	fi
	exit 0
fi

npm version "$MODE"
git push
git push --tags

NEW_TAG="v$(node -p "require('./package.json').version")"
PREV_TAG="$(git describe --tags --abbrev=0 "${NEW_TAG}^" 2>/dev/null || true)"
NOTES_FILE="$(mktemp)"

{
	echo "## Changes"
	if [[ -n "$PREV_TAG" ]]; then
		git log --pretty=format:"- %s (%h)" "${PREV_TAG}..${NEW_TAG}"
	else
		git log --pretty=format:"- %s (%h)" "${NEW_TAG}"
	fi
} > "$NOTES_FILE"

gh release create "$NEW_TAG" --notes-file "$NOTES_FILE"
rm "$NOTES_FILE"

npm publish

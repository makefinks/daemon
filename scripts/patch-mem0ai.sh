#!/usr/bin/env bash
# Patches mem0ai v3 to use bun:sqlite instead of better-sqlite3.
# Runs automatically after `bun install`.
set -e

MEM0AI_DIR="node_modules/mem0ai/dist/oss"
SHIM_SRC="src/shim/better-sqlite3.mjs"

[ -d "$MEM0AI_DIR" ] || exit 0

cp "$SHIM_SRC" "$MEM0AI_DIR/better-sqlite3-shim.mjs"
sed -i.bak 's|import Database\([0-9]*\) from "better-sqlite3"|import Database\1 from "./better-sqlite3-shim.mjs"|g' "$MEM0AI_DIR/index.mjs"
rm -f "$MEM0AI_DIR/index.mjs.bak"

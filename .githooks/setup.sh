#!/usr/bin/env bash

# DAEMON setup script: configure git hooks

HOOKS_DIR=".githooks"
GIT_HOOKS_DIR=".git/hooks"

echo "Setting up git hooks..."

# Configure git to use .githooks directory
git config core.hooksPath "$HOOKS_DIR"

echo "✅ Git hooks configured successfully!"
echo ""
echo "The following hooks are now active:"
echo "  - pre-commit: lint and format checks on staged files"
echo ""
echo "To bypass hooks (not recommended), use: git commit --no-verify"

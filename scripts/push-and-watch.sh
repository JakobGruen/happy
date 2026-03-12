#!/bin/bash
#
# Push to main and watch CI/CD checks in real-time
# Usage: ./scripts/push-and-watch.sh
#
# This is useful for AI-driven development — if checks fail,
# you'll be notified immediately so you can fix and re-push.
#

set -e

BRANCH="main"

echo "🚀 Pushing to origin/$BRANCH..."
git push origin $BRANCH

echo ""
echo "📊 Watching CI/CD checks..."
echo "   (Press Ctrl+C to exit)"
echo ""

# Get the latest run ID and watch it
gh run watch $(gh run list --branch $BRANCH --limit 1 --json databaseId --jq '.[0].databaseId')

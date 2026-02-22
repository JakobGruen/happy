#!/bin/bash
set -e

echo "=== Happy Voice Agent Setup ==="

# Check for uv
if ! command -v uv &> /dev/null; then
    echo "Error: uv is required (https://docs.astral.sh/uv/)"
    exit 1
fi

# Check for lk CLI
if ! command -v lk &> /dev/null; then
    echo "Installing LiveKit CLI..."
    brew install livekit-cli
fi

# Create venv and install deps
uv venv
uv pip install -r requirements.txt

# Run tests
echo ""
echo "Running tests..."
.venv/bin/python -m pytest test_agent.py -v
echo "Tests passed!"

# Auth with LiveKit Cloud (skip if already authenticated)
if [ -f ~/.livekit/cli-config.yaml ] && grep -q "projects:" ~/.livekit/cli-config.yaml; then
    echo ""
    echo "Already authenticated with LiveKit Cloud."
else
    echo ""
    echo "Authenticating with LiveKit Cloud..."
    lk cloud auth
fi

# Create and deploy agent
echo ""
echo "Creating and deploying agent..."
lk agent create

echo ""
echo "Done! Use 'lk agent status' to check deployment."
echo "Use 'lk agent logs' to view logs."

# Happy Voice Agent

Voice assistant that controls Claude Code sessions hands-free via LiveKit.

## How It Works

A Python voice agent deployed on [LiveKit Cloud](https://cloud.livekit.io) that listens to spoken commands and translates them into Claude Code actions via RPC.

**Pipeline:** Deepgram STT → GPT-4.1-mini → Cartesia Sonic 3 TTS

**Tools:**
- `messageClaudeCode` — Transforms spoken intent into structured prompts and sends to the active Claude Code session
- `processPermissionRequest` — Allows or denies pending permission requests by voice ("allow" / "deny")

## Setup & Deploy

Prerequisites: Python 3.12+, [uv](https://docs.astral.sh/uv/), [LiveKit CLI](https://docs.livekit.io/home/cli/)

```bash
# Copy and fill in your LiveKit credentials
cp .env.example .env

# Setup, test, and deploy in one step
bash setup.sh
```

Or step by step:

```bash
uv venv && uv pip install -r requirements.txt   # install deps
.venv/bin/python -m pytest test_agent.py -v      # run tests
lk cloud auth                                    # authenticate
lk agent create                                  # first deploy
```

## Updating

```bash
lk agent deploy     # rolling deployment
lk agent status     # check status
lk agent logs       # view logs
```

## Testing

```bash
.venv/bin/python -m pytest test_agent.py -v
```

## Architecture

The agent runs on LiveKit Cloud infrastructure. When a user joins a LiveKit room, the agent connects and listens for voice input. Spoken commands are processed by the LLM, which decides whether to call an RPC tool. The RPC calls are handled by the client app (happy-app), which must register the corresponding RPC handlers.

```
User speaks → Deepgram STT → GPT-4.1-mini → RPC to client app
                                           → Cartesia TTS → User hears response
```

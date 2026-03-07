"""
FastAPI server for the Pipecat voice agent.
Handles WebRTC signaling via SmallWebRTCTransport and HMAC auth.
"""

import hashlib
import hmac
import logging
import os
import time

from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from aiortc.sdp import candidate_from_sdp
from pipecat.transports.smallwebrtc.connection import SmallWebRTCConnection

from pipecat_bot import run_bot

load_dotenv()

logger = logging.getLogger("pipecat-server")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Happy Voice Agent (Pipecat)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Track active peer connections
pcs_map: dict[str, SmallWebRTCConnection] = {}

# ICE servers for WebRTC NAT traversal
# Rich format for client (includes TURN credentials if configured)
ICE_SERVERS_CONFIG: list[dict] = [{"urls": "stun:stun.l.google.com:19302"}]
# Flat URL list for SmallWebRTCConnection
ICE_SERVERS: list[str] = ["stun:stun.l.google.com:19302"]

# Add TURN relay if configured (required for connections across different networks)
TURN_URL = os.getenv("TURN_URL", "")
TURN_USERNAME = os.getenv("TURN_USERNAME", "")
TURN_CREDENTIAL = os.getenv("TURN_CREDENTIAL", "")
if TURN_URL:
    ICE_SERVERS.append(TURN_URL)
    turn_entry: dict = {"urls": TURN_URL}
    if TURN_USERNAME:
        turn_entry["username"] = TURN_USERNAME
    if TURN_CREDENTIAL:
        turn_entry["credential"] = TURN_CREDENTIAL
    ICE_SERVERS_CONFIG.append(turn_entry)
    logger.info("TURN relay configured: %s", TURN_URL)

# Auth config
AUTH_SECRET = os.getenv("PIPECAT_AUTH_SECRET", "")
ACCESS_SECRET = os.getenv("PIPECAT_ACCESS_SECRET", "")


def verify_access_secret(request: Request) -> None:
    """Verify the access secret query parameter.
    Skipped if PIPECAT_ACCESS_SECRET is not set (dev mode).
    """
    if not ACCESS_SECRET:
        return
    secret = request.query_params.get("secret", "")
    if not hmac.compare_digest(secret, ACCESS_SECRET):
        raise HTTPException(status_code=401, detail="Invalid access secret")


def verify_hmac_token(token: str) -> dict:
    """Verify HMAC auth token from happy-server.

    Token format: base64(userId:sessionId:expiry:hmac)
    """
    if not AUTH_SECRET:
        # No secret configured = skip auth (dev mode)
        return {"userId": "dev", "sessionId": "dev"}

    try:
        parts = token.split(":")
        if len(parts) != 4:
            raise ValueError("Invalid token format")

        user_id, session_id, expiry_str, signature = parts
        expiry = int(expiry_str)

        # Check expiry
        if time.time() > expiry:
            raise ValueError("Token expired")

        # Verify HMAC
        message = f"{user_id}:{session_id}:{expiry_str}"
        expected = hmac.new(
            AUTH_SECRET.encode(), message.encode(), hashlib.sha256
        ).hexdigest()

        if not hmac.compare_digest(signature, expected):
            raise ValueError("Invalid signature")

        return {"userId": user_id, "sessionId": session_id}

    except (ValueError, IndexError) as e:
        raise HTTPException(status_code=401, detail=str(e))


@app.get("/config")
async def get_config(request: Request):
    """Return ICE server config (includes TURN credentials). Protected by access secret."""
    verify_access_secret(request)
    return {"iceServers": ICE_SERVERS_CONFIG}


@app.post("/api/offer")
async def offer(request: Request, background_tasks: BackgroundTasks):
    """WebRTC offer endpoint — creates a peer connection and starts the bot pipeline."""
    verify_access_secret(request)
    body = await request.json()

    # Extract and verify auth token (from query param or body)
    token = request.query_params.get("token", body.get("token", ""))
    auth = verify_hmac_token(token)

    session_id = request.query_params.get(
        "session_id", body.get("session_id", auth.get("sessionId", ""))
    )

    connection = SmallWebRTCConnection(ICE_SERVERS)
    await connection.initialize(sdp=body["sdp"], type=body["type"])

    @connection.event_handler("closed")
    async def handle_closed(conn: SmallWebRTCConnection):
        logger.info(f"Peer connection closed: {conn.pc_id}")
        pcs_map.pop(conn.pc_id, None)

    pcs_map[connection.pc_id] = connection

    background_tasks.add_task(run_bot, connection, session_id)

    return connection.get_answer()


@app.patch("/api/offer")
async def ice_candidate(request: Request):
    """ICE trickle endpoint — adds ICE candidates to an existing peer connection."""
    verify_access_secret(request)
    body = await request.json()
    pc_id = body.get("pc_id")
    connection = pcs_map.get(pc_id)
    if not connection:
        raise HTTPException(status_code=404, detail="Peer connection not found")

    for c in body.get("candidates", []):
        candidate = candidate_from_sdp(c["candidate"])
        candidate.sdpMid = c["sdp_mid"]
        candidate.sdpMLineIndex = c["sdp_mline_index"]
        await connection.add_ice_candidate(candidate)

    return {"ok": True}


@app.get("/health")
async def health():
    return {"status": "ok", "active_connections": len(pcs_map)}


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8765"))
    uvicorn.run(app, host="0.0.0.0", port=port)

"""Integration tests for pipecat_server.py — real HTTP requests via httpx AsyncClient.

Covers all three endpoints (GET /health, POST /api/offer, PATCH /api/offer),
HMAC auth verification, CORS headers, and connection lifecycle.

Heavy native dependencies (pipecat, aiortc, pipecat_bot) are mocked at the
sys.modules level so the FastAPI app can import and run without them.
The HTTP layer is fully real — httpx sends actual ASGI requests.
"""

import hashlib
import hmac
import sys
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio

# pytest-asyncio: all async tests in this module are asyncio tests
pytestmark = pytest.mark.asyncio


# ---------------------------------------------------------------------------
# sys.modules mocks — installed BEFORE importing pipecat_server
# ---------------------------------------------------------------------------

class MockSmallWebRTCConnection:
    """Fake SmallWebRTCConnection that tracks method calls."""

    _instance_counter = 0

    def __init__(self, ice_servers):
        MockSmallWebRTCConnection._instance_counter += 1
        self.ice_servers = ice_servers
        self.pc_id = f"mock-pc-{MockSmallWebRTCConnection._instance_counter}"
        self.initialize = AsyncMock()
        self.get_answer = MagicMock(return_value={"sdp": "answer-sdp", "type": "answer"})
        self.add_ice_candidate = AsyncMock()
        self._event_handlers: dict[str, object] = {}

    def event_handler(self, event_name: str):
        """Decorator that registers an event handler (mirrors real API)."""
        def decorator(fn):
            self._event_handlers[event_name] = fn
            return fn
        return decorator


def _mock_candidate_from_sdp(sdp_string: str):
    """Return an object with settable sdpMid and sdpMLineIndex."""
    candidate = SimpleNamespace(sdp_string=sdp_string, sdpMid=None, sdpMLineIndex=None)
    return candidate


# Wire up the mock modules
_mock_webrtc_conn_mod = MagicMock()
_mock_webrtc_conn_mod.SmallWebRTCConnection = MockSmallWebRTCConnection

_mock_aiortc_sdp = MagicMock()
_mock_aiortc_sdp.candidate_from_sdp = _mock_candidate_from_sdp

_mock_bot_mod = MagicMock()
_mock_bot_mod.run_bot = AsyncMock()

sys.modules.setdefault("pipecat", MagicMock())
sys.modules.setdefault("pipecat.transports", MagicMock())
sys.modules.setdefault("pipecat.transports.smallwebrtc", MagicMock())
sys.modules["pipecat.transports.smallwebrtc.connection"] = _mock_webrtc_conn_mod
sys.modules.setdefault("aiortc", MagicMock())
sys.modules["aiortc.sdp"] = _mock_aiortc_sdp
sys.modules["pipecat_bot"] = _mock_bot_mod

import pipecat_server  # noqa: E402
from pipecat_server import app  # noqa: E402

# httpx must be imported after the app is available
from httpx import ASGITransport, AsyncClient  # noqa: E402


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

TEST_SECRET = "test-secret-key-for-hmac"

VALID_OFFER_BODY = {
    "sdp": "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\n",
    "type": "offer",
}


# ---------------------------------------------------------------------------
# Helpers — HMAC token generation
# ---------------------------------------------------------------------------

def _make_token(
    user_id: str = "user-123",
    session_id: str = "sess-456",
    secret: str = TEST_SECRET,
    ttl: int = 300,
) -> str:
    """Generate a valid HMAC token."""
    expiry = str(int(time.time()) + ttl)
    message = f"{user_id}:{session_id}:{expiry}"
    signature = hmac.new(secret.encode(), message.encode(), hashlib.sha256).hexdigest()
    return f"{user_id}:{session_id}:{expiry}:{signature}"


def _make_expired_token(
    user_id: str = "user-123",
    session_id: str = "sess-456",
    secret: str = TEST_SECRET,
) -> str:
    """Generate a token that expired 60 seconds ago."""
    expiry = str(int(time.time()) - 60)
    message = f"{user_id}:{session_id}:{expiry}"
    signature = hmac.new(secret.encode(), message.encode(), hashlib.sha256).hexdigest()
    return f"{user_id}:{session_id}:{expiry}:{signature}"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def _clean_state():
    """Reset shared server state and mock counters between tests."""
    pipecat_server.pcs_map.clear()
    MockSmallWebRTCConnection._instance_counter = 0
    _mock_bot_mod.run_bot.reset_mock()
    yield
    pipecat_server.pcs_map.clear()


@pytest_asyncio.fixture()
async def client(_clean_state):
    """Async httpx client wired to the FastAPI app via ASGI transport."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        yield c


# ---------------------------------------------------------------------------
# GET /health
# ---------------------------------------------------------------------------

async def test_health_returns_ok(client: AsyncClient):
    """GET /health returns 200 with status ok and zero connections."""
    resp = await client.get("/health")

    assert resp.status_code == 200
    body = resp.json()
    assert body == {"status": "ok", "active_connections": 0}


async def test_health_reflects_active_connections(client: AsyncClient):
    """GET /health reports the correct number of entries in pcs_map."""
    # Manually inject fake connections
    pipecat_server.pcs_map["pc-a"] = MagicMock()
    pipecat_server.pcs_map["pc-b"] = MagicMock()

    resp = await client.get("/health")

    assert resp.status_code == 200
    assert resp.json()["active_connections"] == 2


# ---------------------------------------------------------------------------
# POST /api/offer — dev mode (empty AUTH_SECRET)
# ---------------------------------------------------------------------------

async def test_offer_dev_mode_succeeds(client: AsyncClient):
    """With empty AUTH_SECRET, POST /api/offer accepts any request."""
    with patch.object(pipecat_server, "AUTH_SECRET", ""):
        resp = await client.post("/api/offer", json=VALID_OFFER_BODY)

    assert resp.status_code == 200


async def test_offer_returns_connection_answer(client: AsyncClient):
    """The response body is whatever connection.get_answer() returns."""
    with patch.object(pipecat_server, "AUTH_SECRET", ""):
        resp = await client.post("/api/offer", json=VALID_OFFER_BODY)

    body = resp.json()
    assert body["sdp"] == "answer-sdp"
    assert body["type"] == "answer"


async def test_offer_creates_connection_with_ice_servers(client: AsyncClient):
    """SmallWebRTCConnection is instantiated with the configured ICE_SERVERS."""
    with patch.object(pipecat_server, "AUTH_SECRET", ""):
        await client.post("/api/offer", json=VALID_OFFER_BODY)

    # The connection stored in pcs_map was created by our mock class
    assert len(pipecat_server.pcs_map) == 1
    conn = next(iter(pipecat_server.pcs_map.values()))
    assert conn.ice_servers == pipecat_server.ICE_SERVERS


async def test_offer_calls_initialize_with_sdp(client: AsyncClient):
    """connection.initialize() is awaited with sdp and type from the request body."""
    with patch.object(pipecat_server, "AUTH_SECRET", ""):
        await client.post("/api/offer", json=VALID_OFFER_BODY)

    conn = next(iter(pipecat_server.pcs_map.values()))
    conn.initialize.assert_awaited_once_with(
        sdp=VALID_OFFER_BODY["sdp"],
        type=VALID_OFFER_BODY["type"],
    )


async def test_offer_stores_connection_in_pcs_map(client: AsyncClient):
    """After a successful offer, the connection is stored in pcs_map keyed by pc_id."""
    with patch.object(pipecat_server, "AUTH_SECRET", ""):
        await client.post("/api/offer", json=VALID_OFFER_BODY)

    assert len(pipecat_server.pcs_map) == 1
    pc_id, conn = next(iter(pipecat_server.pcs_map.items()))
    assert pc_id == conn.pc_id


async def test_offer_schedules_run_bot_as_background_task(client: AsyncClient):
    """run_bot is called (via BackgroundTasks) with the connection and session_id."""
    with patch.object(pipecat_server, "AUTH_SECRET", ""):
        await client.post("/api/offer", json=VALID_OFFER_BODY)

    # FastAPI's ASGI transport executes background tasks before returning the
    # response, so run_bot should have been called by the time we get here.
    _mock_bot_mod.run_bot.assert_called_once()
    args = _mock_bot_mod.run_bot.call_args
    conn = args[0][0]
    assert isinstance(conn, MockSmallWebRTCConnection)


async def test_offer_registers_closed_event_handler(client: AsyncClient):
    """The offer endpoint registers a 'closed' event handler on the connection."""
    with patch.object(pipecat_server, "AUTH_SECRET", ""):
        await client.post("/api/offer", json=VALID_OFFER_BODY)

    conn = next(iter(pipecat_server.pcs_map.values()))
    assert "closed" in conn._event_handlers


# ---------------------------------------------------------------------------
# POST /api/offer — session_id precedence
# ---------------------------------------------------------------------------

async def test_offer_session_id_from_query_param(client: AsyncClient):
    """session_id in query params takes precedence over body and auth."""
    with patch.object(pipecat_server, "AUTH_SECRET", ""):
        await client.post(
            "/api/offer?session_id=from-query",
            json={**VALID_OFFER_BODY, "session_id": "from-body"},
        )

    # run_bot receives the query param session_id
    args = _mock_bot_mod.run_bot.call_args
    session_id = args[0][1]
    assert session_id == "from-query"


async def test_offer_session_id_from_body(client: AsyncClient):
    """When no query param, session_id falls back to the request body."""
    with patch.object(pipecat_server, "AUTH_SECRET", ""):
        await client.post(
            "/api/offer",
            json={**VALID_OFFER_BODY, "session_id": "from-body"},
        )

    args = _mock_bot_mod.run_bot.call_args
    session_id = args[0][1]
    assert session_id == "from-body"


# ---------------------------------------------------------------------------
# POST /api/offer — HMAC auth enabled
# ---------------------------------------------------------------------------

async def test_offer_hmac_valid_token(client: AsyncClient):
    """A valid HMAC token in the query string yields 200."""
    token = _make_token()
    with patch.object(pipecat_server, "AUTH_SECRET", TEST_SECRET):
        resp = await client.post(
            f"/api/offer?token={token}",
            json=VALID_OFFER_BODY,
        )

    assert resp.status_code == 200


async def test_offer_hmac_token_in_body(client: AsyncClient):
    """A valid HMAC token in the JSON body is also accepted."""
    token = _make_token()
    with patch.object(pipecat_server, "AUTH_SECRET", TEST_SECRET):
        resp = await client.post(
            "/api/offer",
            json={**VALID_OFFER_BODY, "token": token},
        )

    assert resp.status_code == 200


async def test_offer_hmac_expired_token(client: AsyncClient):
    """An expired token returns 401."""
    token = _make_expired_token()
    with patch.object(pipecat_server, "AUTH_SECRET", TEST_SECRET):
        resp = await client.post(
            f"/api/offer?token={token}",
            json=VALID_OFFER_BODY,
        )

    assert resp.status_code == 401
    assert "expired" in resp.json()["detail"].lower()


async def test_offer_hmac_invalid_signature(client: AsyncClient):
    """A token with a tampered signature returns 401."""
    token = _make_token()
    parts = token.split(":")
    parts[3] = "0" * 64  # corrupt the signature
    tampered = ":".join(parts)

    with patch.object(pipecat_server, "AUTH_SECRET", TEST_SECRET):
        resp = await client.post(
            f"/api/offer?token={tampered}",
            json=VALID_OFFER_BODY,
        )

    assert resp.status_code == 401
    assert "signature" in resp.json()["detail"].lower()


async def test_offer_hmac_missing_token(client: AsyncClient):
    """When AUTH_SECRET is set but no token is provided, returns 401."""
    with patch.object(pipecat_server, "AUTH_SECRET", TEST_SECRET):
        resp = await client.post("/api/offer", json=VALID_OFFER_BODY)

    assert resp.status_code == 401


async def test_offer_hmac_malformed_token(client: AsyncClient):
    """A token with the wrong number of parts returns 401."""
    with patch.object(pipecat_server, "AUTH_SECRET", TEST_SECRET):
        resp = await client.post(
            "/api/offer?token=only:two:parts",
            json=VALID_OFFER_BODY,
        )

    assert resp.status_code == 401


async def test_offer_hmac_wrong_secret(client: AsyncClient):
    """A token signed with a different secret returns 401."""
    token = _make_token(secret="correct-secret")
    with patch.object(pipecat_server, "AUTH_SECRET", "wrong-secret"):
        resp = await client.post(
            f"/api/offer?token={token}",
            json=VALID_OFFER_BODY,
        )

    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# PATCH /api/offer — ICE candidates
# ---------------------------------------------------------------------------

async def test_ice_candidate_success(client: AsyncClient):
    """Adding ICE candidates to an existing connection returns 200."""
    # First create a connection via POST
    with patch.object(pipecat_server, "AUTH_SECRET", ""):
        await client.post("/api/offer", json=VALID_OFFER_BODY)

    pc_id = next(iter(pipecat_server.pcs_map.keys()))
    conn = pipecat_server.pcs_map[pc_id]

    resp = await client.patch("/api/offer", json={
        "pc_id": pc_id,
        "candidates": [
            {"candidate": "candidate:1 1 UDP 2130706431 10.0.0.1 5000 typ host", "sdp_mid": "0", "sdp_mline_index": 0},
            {"candidate": "candidate:2 1 UDP 1694498815 203.0.113.1 5001 typ srflx", "sdp_mid": "0", "sdp_mline_index": 0},
        ],
    })

    assert resp.status_code == 200
    assert resp.json() == {"ok": True}
    assert conn.add_ice_candidate.await_count == 2


async def test_ice_candidate_sets_sdp_fields(client: AsyncClient):
    """candidate_from_sdp result gets sdpMid and sdpMLineIndex set correctly."""
    with patch.object(pipecat_server, "AUTH_SECRET", ""):
        await client.post("/api/offer", json=VALID_OFFER_BODY)

    pc_id = next(iter(pipecat_server.pcs_map.keys()))
    conn = pipecat_server.pcs_map[pc_id]

    await client.patch("/api/offer", json={
        "pc_id": pc_id,
        "candidates": [
            {"candidate": "candidate:1 1 UDP 2130706431 10.0.0.1 5000 typ host", "sdp_mid": "audio", "sdp_mline_index": 1},
        ],
    })

    # Verify the candidate object passed to add_ice_candidate
    candidate_arg = conn.add_ice_candidate.call_args_list[0][0][0]
    assert candidate_arg.sdpMid == "audio"
    assert candidate_arg.sdpMLineIndex == 1
    assert candidate_arg.sdp_string == "candidate:1 1 UDP 2130706431 10.0.0.1 5000 typ host"


async def test_ice_candidate_unknown_pc_id(client: AsyncClient):
    """A PATCH with an unknown pc_id returns 404."""
    resp = await client.patch("/api/offer", json={
        "pc_id": "nonexistent-pc-id",
        "candidates": [],
    })

    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()


async def test_ice_candidate_empty_candidates(client: AsyncClient):
    """An empty candidates array is a valid no-op."""
    with patch.object(pipecat_server, "AUTH_SECRET", ""):
        await client.post("/api/offer", json=VALID_OFFER_BODY)

    pc_id = next(iter(pipecat_server.pcs_map.keys()))
    conn = pipecat_server.pcs_map[pc_id]

    resp = await client.patch("/api/offer", json={
        "pc_id": pc_id,
        "candidates": [],
    })

    assert resp.status_code == 200
    assert resp.json() == {"ok": True}
    conn.add_ice_candidate.assert_not_awaited()


# ---------------------------------------------------------------------------
# CORS headers
# ---------------------------------------------------------------------------

async def test_cors_preflight(client: AsyncClient):
    """OPTIONS preflight returns access-control-allow-origin: *."""
    resp = await client.options(
        "/api/offer",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
        },
    )

    assert resp.status_code == 200
    assert resp.headers.get("access-control-allow-origin") == "*"


async def test_cors_on_post_response(client: AsyncClient):
    """A normal POST response includes the CORS allow-origin header."""
    with patch.object(pipecat_server, "AUTH_SECRET", ""):
        resp = await client.post(
            "/api/offer",
            json=VALID_OFFER_BODY,
            headers={"Origin": "http://localhost:3000"},
        )

    assert resp.status_code == 200
    assert resp.headers.get("access-control-allow-origin") == "*"

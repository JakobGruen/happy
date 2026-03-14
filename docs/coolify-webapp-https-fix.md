# Webapp HTTPS Missing — Coolify Configuration Issue

## Problem

`happy.green-wald.de` is served over **HTTP only** — no HTTPS, no TLS certificate, no redirect.

The same Docker image works perfectly when run directly (`docker run -p 8081:80`) and accessed via `happy-dev.green-wald.de` (which has HTTPS via Traefik).

## Root Cause

The Coolify resource for the webapp was created with `http://` instead of `https://` as the domain. This means Traefik only generates an HTTP router — no HTTPS router, no Let's Encrypt cert.

### Current Traefik labels (webapp — broken)

```
caddy_0: http://happy.green-wald.de          ← HTTP!
traefik.http.routers.http-0-...entryPoints: http
traefik.http.routers.http-0-...middlewares: gzip    ← no redirect-to-https
# NO https router
# NO TLS config
```

### Comparison: server container (working)

```
caddy_0: https://happy-server.green-wald.de  ← HTTPS!
traefik.http.routers.http-0-...middlewares: redirect-to-https
traefik.http.routers.https-0-...entryPoints: https
traefik.http.routers.https-0-...tls: true
traefik.http.routers.https-0-...tls.certresolver: letsencrypt
```

## Why This Breaks the App

Without HTTPS, the browser has **no secure context**. The app uses:

- **Web Crypto API** (`crypto.subtle` in `aes.web.ts`) for AES-256-GCM encryption — **requires secure context**
- **Socket.IO** over WSS — needs HTTPS page for secure WebSocket upgrade
- **Service Workers** (browser notifications) — **requires secure context**

After login, the app tries to set up encryption → `crypto.subtle` is undefined → encryption fails → app enters broken state (no sync, no data).

## What Needs to Change

The Coolify resource domain must use `https://happy.green-wald.de` instead of `http://happy.green-wald.de`. This will make Coolify generate:

1. An HTTPS Traefik router with Let's Encrypt TLS
2. An HTTP router with `redirect-to-https` middleware
3. Proper `tls.certresolver: letsencrypt` configuration

No code changes needed.

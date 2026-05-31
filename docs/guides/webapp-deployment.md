# Webapp (Web Build) Deployment

How the Happy app's web build is packaged as a Docker image and deployed. This is distinct from the backend server deployment (see `deployment.md`).

- **Dockerfile.webapp**: a 3-stage build (bun-node deps → wire + expo export → nginx:alpine). Builds in ~2min, ~131MB image.
- **Base image**: `imbios/bun-node:1.2-22-alpine` — NOT `oven/bun:1`. Pure Bun Docker images cause `expo export` to hang forever (Expo's `ensureProcessExitsAfterDelay` uses `process.getActiveResourcesInfo()`, which Bun only stubs). Tracked upstream: expo/expo#39266, oven-sh/bun#24538.
- **CI**: `.github/workflows/webapp-build-deploy.yml` builds + runs 5 integration tests (nginx up, index.html present, SPA fallback, static assets, no errors).
- **Deployment**: Coolify builds from GitHub using `Dockerfile.webapp` → `happy.green-wald.de`, port 80.
- **Dev testing shortcut**: kill the Metro dev server on port 8081, then run `docker run -d --name webapp-dev -p 8081:80 happy-webapp:test` — Traefik picks it up at `happy-dev.green-wald.de`.

## Gotcha: blank-screen on init error

`_layout.tsx`'s catch block MUST call `setInitState({ credentials: null })` on error — otherwise the app stays on `return null` (blank screen forever). The web production build can crash during sodium WASM init or encryption setup, so this recovery path is required.

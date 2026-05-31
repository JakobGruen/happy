# Local Dev & Testing

How to run Happy locally with auto-login, reset/rebuild parts of the stack, and run the test suite. Usage-facing companion to `deployment.md`.

## One-command dev environment (`bun dev`)

Branch work introduced a one-command dev environment with automatic authentication, removing the QR-code auth friction for local dev.

- `bun dev` — starts everything (auto-auth, Docker services).
- `bun dev:cli` / `bun dev:server` / `bun dev:app` — restart individual pieces.
- `bun dev:down` — stop everything.
- `bun dev:db:reset` — wipe the DB.

**Key components**: a shared `DEV_AUTH_SECRET_HEX` across app/CLI/server, `seed-dev.ts` for the dev account, the `useDevAutoLogin` hook, and the CLI's `maybeDevAutoAuth()`.

**Isolation & ports**:
- Dev uses `~/.happy-dev` (isolated from prod `~/.happy`). All dev is local (`localhost:3005`) — there is no public dev server.
- Redis on 6380, Postgres on 5432 (256MB limit).

**Gotchas**:
- **External domain mapping** is needed because `EXPO_PUBLIC_*` vars are baked at build time — `localhost` doesn't work from reverse-proxied domains.
- **Hex casing**: always use `privacyKit.encodeHex()` (uppercase) for all public-key hex — never `Buffer.toString('hex')`.
- **Prisma `.env.dev` pattern**: dev scripts use `dotenv -e .env.dev -o -- prisma migrate deploy` (dotenv-cli) because `.env` holds the prod `DATABASE_URL`. The server's own `dev` script handles this via `tsx --env-file=.env --env-file=.env.dev`. Prisma 6.x does NOT override existing `process.env` vars despite the "loaded from .env" log message — but `dotenv-cli -o` is used for safety.

## `dev:reset` script

- **Location**: `scripts/dev-reset.sh`, invoked via `yarn dev:reset`.
- **Execution order (default / `--all`)**: install → wire → CLI → daemon → server → metro.
- **Flags**: `-w` wire, `-c` CLI (implies wire), `-s` server, `-d` daemon, `-i` install, `-m` metro, `-t` typecheck.
- **Common combos**: `-c -d` (rebuild CLI + restart daemon), `-s` (restart server only), `-m` (reset Metro only), `-i` (reinstall deps only).
- **Install step** runs FIRST via `yarn cache clean && yarn install` — needed because builds depend on `node_modules`.
- **Metro step** runs LAST — kills the existing Metro process (`pkill expo start`, port 8081), reinstalls, then starts with `yarn workspace happy-app start --clear` via `nohup`, logging to `/tmp/happy-metro-dev-$$.log`.
- **Auto-build**: if `--daemon` is set but `dist/index.mjs` is missing, it auto-adds a CLI build.
- **Server restart**: kills port 3005, starts `yarn workspace happy-server dev` via `nohup`, logs to `/tmp/happy-server-dev-*.log`.
- **Daemon restart**: `dev:daemon:stop` then `dev:daemon:start` (dev variant).

## Server URLs & variants

- **Production**: `https://happy-server.green-wald.de` (stable variant, `~/.happy/`).
- **Dev**: `https://happy-server-dev.green-wald.de` (dev variant, `~/.happy-dev/`).
- `env-wrapper.cjs` controls the variant defaults.
- (`api.cluster-fluster.com` was removed everywhere — it was never the project owner's server.)

## Testing notes

- CLI tests require a build first: `yarn workspace happy-coder build && vitest run`.
- The wire package name is `@jakobgruen/happy-wire` (renamed from `@slopus/happy-wire`).
- Git remote uses SSH: `git@github.com:JakobGruen/happy.git`.

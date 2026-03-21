/**
 * Deterministic dev secret for local development.
 * Produces the same NaCl keypair across server seed, app auto-login, and CLI daemon auth.
 * NOT used in production — guarded by NODE_ENV checks at call sites.
 */
export const DEV_AUTH_SECRET_HEX = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';

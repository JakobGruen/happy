/**
 * Deterministic dev secret for auto-login in development.
 * Must match the server's DEV_AUTH_SECRET_HEX exactly.
 * Guarded by __DEV__ at call sites — tree-shaken from production builds.
 */
export const DEV_AUTH_SECRET_HEX = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';

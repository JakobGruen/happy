const { execSync } = require('child_process');

// Detect package manager (Bun or Yarn)
const isBun = (process.env.npm_config_user_agent || '').startsWith('bun')
  || !!process.env.BUN_VERSION;

// Apply patches to node_modules
require('../patches/fix-pglite-prisma-bytes.cjs');

// Always apply patches (including during Docker builds)
try {
  const patchCmd = isBun ? 'bunx patch-package' : 'npx patch-package';
  execSync(patchCmd, { stdio: 'inherit' });
} catch (e) {
  console.log('[postinstall] patch-package failed, continuing...');
}

if (process.env.SKIP_HAPPY_WIRE_BUILD === '1') {
  console.log('[postinstall] SKIP_HAPPY_WIRE_BUILD=1, skipping @jakobgruen/happy-wire build');
  process.exit(0);
}

const wireCmd = isBun
  ? 'bun run --filter @jakobgruen/happy-wire build'
  : 'yarn workspace @jakobgruen/happy-wire build';
execSync(wireCmd, { stdio: 'inherit' });

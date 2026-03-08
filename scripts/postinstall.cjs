const { execSync } = require('child_process');

// Apply patches to node_modules
require('../patches/fix-pglite-prisma-bytes.cjs');

// Always apply patches (including during Docker builds)
try {
  execSync('npx patch-package', { stdio: 'inherit' });
} catch (e) {
  console.log('[postinstall] patch-package failed, continuing...');
}

if (process.env.SKIP_HAPPY_WIRE_BUILD === '1') {
  console.log('[postinstall] SKIP_HAPPY_WIRE_BUILD=1, skipping @jakobgruen/happy-wire build');
  process.exit(0);
}

execSync('yarn workspace @jakobgruen/happy-wire build', {
  stdio: 'inherit',
});

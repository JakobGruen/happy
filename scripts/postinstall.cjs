const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

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

// Deduplicate React — Bun sometimes installs separate copies in workspace
// packages and ink's react-reconciler, causing "Invalid hook call" errors.
// Replace duplicates with symlinks to the root copy.
const rootReact = path.resolve(__dirname, '..', 'node_modules', 'react');
const duplicates = [
    path.resolve(__dirname, '..', 'packages', 'happy-cli', 'node_modules', 'react'),
    path.resolve(__dirname, '..', 'node_modules', 'ink', 'node_modules', 'react-reconciler', 'node_modules', 'react'),
];
for (const dup of duplicates) {
    try {
        const stat = fs.lstatSync(dup);
        if (stat.isSymbolicLink()) continue; // already a symlink, skip
        if (stat.isDirectory()) {
            fs.rmSync(dup, { recursive: true });
            fs.symlinkSync(rootReact, dup);
            console.log(`[postinstall] deduped React: ${path.relative(path.resolve(__dirname, '..'), dup)} → root`);
        }
    } catch (e) {
        // Directory doesn't exist, nothing to deduplicate
    }
}

if (process.env.SKIP_HAPPY_WIRE_BUILD === '1') {
  console.log('[postinstall] SKIP_HAPPY_WIRE_BUILD=1, skipping @jakobgruen/happy-wire build');
  process.exit(0);
}

const wireCmd = isBun
  ? 'bun run --filter @jakobgruen/happy-wire build'
  : 'yarn workspace @jakobgruen/happy-wire build';
execSync(wireCmd, { stdio: 'inherit' });

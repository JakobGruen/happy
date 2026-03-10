import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
    test: {
        globals: false,
        environment: 'node',
        include: ['sources/**/*.{spec,test}.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: [
                'node_modules/**',
                'dist/**',
                '**/*.d.ts',
                '**/*.config.*',
                '**/mockData/**',
            ],
        },
    },
    resolve: {
        alias: {
            '@': resolve('./sources'),
            // React is nohoisted — resolve from the primary checkout's package node_modules.
            // In a git worktree at .claude/worktrees/<name>/packages/happy-app/ the worktree
            // node_modules is empty; walking up 5 levels reaches the primary repo root.
            'react': resolve(__dirname, '../../../../../packages/happy-app/node_modules/react'),
        },
    },
})

import { defineConfig } from 'vitest/config'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import dotenv from 'dotenv'

const __dir = dirname(fileURLToPath(import.meta.url))

const testEnv = dotenv.config({
    path: resolve(__dir, '.env.integration-test')
}).parsed

export default defineConfig({
    test: {
        globals: false,
        environment: 'node',
        include: ['src/**/*.test.ts'],
        globalSetup: ['./src/test-setup.ts'],
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
        env: {
            ...process.env,
            ...testEnv,
        }
    },
    resolve: {
        alias: {
            '@': resolve(__dir, 'src'),
        },
    },
})
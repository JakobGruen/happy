import { defineConfig } from 'vitest/config'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = dirname(fileURLToPath(import.meta.url))
const src = (...parts: string[]) => resolve(__dir, ...parts)

export default defineConfig({
    define: {
        __DEV__: true,
    },
    test: {
        globals: true,
        environment: 'node',
        include: ['sources/**/*.{spec,test}.{ts,tsx}'],
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
        // Stub React Native and related packages that can't run in Node.js
        alias: [
            { find: 'react-native', replacement: src('sources/__mocks__/react-native.ts') },
            { find: 'react-native-gesture-handler', replacement: src('sources/__mocks__/react-native-gesture-handler.ts') },
            { find: 'react-native-reanimated', replacement: src('sources/__mocks__/react-native-reanimated.ts') },
        ],
    },
    resolve: {
        alias: {
            '@': src('sources'),
        },
    },
})

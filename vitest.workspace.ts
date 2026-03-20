import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
    'packages/happy-app',
    'packages/happy-cli',
    'packages/happy-server',
    'packages/happy-wire',
    'packages/happy-agent',
])

/**
 * Tests for low-level ripgrep wrapper
 */

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { run } from './index'

const __dir = dirname(fileURLToPath(import.meta.url))
const thisFile = resolve(__dir, 'index.test.ts')
const packageJson = resolve(__dir, '..', '..', '..', 'package.json')

describe('ripgrep low-level wrapper', () => {
    it('should get version', async () => {
        const result = await run(['--version'])
        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('ripgrep')
    })

    it('should search for pattern', async () => {
        const result = await run(['describe', thisFile])
        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('describe')
    })

    it('should return exit code 1 for no matches', async () => {
        const result = await run(['ThisPatternShouldNeverMatch999', packageJson])
        expect(result.exitCode).toBe(1)
        expect(result.stdout).toBe('')
    })

    it('should handle JSON output', async () => {
        const result = await run(['--json', 'describe', thisFile])
        expect(result.exitCode).toBe(0)

        // Parse first line to check it's valid JSON
        const lines = result.stdout.trim().split('\n')
        const firstLine = JSON.parse(lines[0])
        expect(firstLine).toHaveProperty('type')
    })

    it('should respect custom working directory', async () => {
        const result = await run(['describe', 'index.test.ts'], { cwd: __dir })
        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('describe')
    })
})
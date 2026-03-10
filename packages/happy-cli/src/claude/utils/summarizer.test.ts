import { describe, expect, it } from 'vitest';
import { buildPermissionSummaryPrompt, buildTurnSummaryPrompt } from './summarizer';

describe('buildPermissionSummaryPrompt', () => {
    it('includes tool name and bash command in prompt', () => {
        const prompt = buildPermissionSummaryPrompt(
            'Bash',
            { command: 'yarn workspace happy-app typecheck' },
            'Run TypeScript type checking'
        );
        expect(prompt).toContain('Bash');
        expect(prompt).toContain('yarn workspace happy-app typecheck');
        expect(prompt).toContain('Run TypeScript type checking');
    });

    it('includes file path for file-based tools', () => {
        const prompt = buildPermissionSummaryPrompt(
            'Write',
            { file_path: '/home/jakob/foo.ts', content: 'hello' },
            null
        );
        expect(prompt).toContain('/home/jakob/foo.ts');
    });

    it('omits description line when description is null', () => {
        const prompt = buildPermissionSummaryPrompt('Read', { file_path: '/tmp/x' }, null);
        expect(prompt).not.toContain('Description:');
    });

    it('truncates long bash commands to 300 chars', () => {
        const longCmd = 'x'.repeat(500);
        const prompt = buildPermissionSummaryPrompt('Bash', { command: longCmd }, null);
        expect(prompt).toContain('x'.repeat(300));
        expect(prompt).not.toContain('x'.repeat(301));
    });
});

describe('buildTurnSummaryPrompt', () => {
    it('includes user message and tool calls', () => {
        const prompt = buildTurnSummaryPrompt(
            'Fix the type errors in the reducer',
            [
                { tool: 'Read', description: 'packages/happy-app/sources/sync/reducer.ts' },
                { tool: 'Edit', description: 'Fix type assertion' },
            ]
        );
        expect(prompt).toContain('Fix the type errors in the reducer');
        expect(prompt).toContain('Read');
        expect(prompt).toContain('Edit');
    });

    it('handles empty tool calls', () => {
        const prompt = buildTurnSummaryPrompt('Just describe what you see', []);
        expect(prompt).toContain('(no tool calls)');
    });

    it('truncates long user messages', () => {
        const longMsg = 'a'.repeat(500);
        const prompt = buildTurnSummaryPrompt(longMsg, []);
        expect(prompt).toContain('"' + 'a'.repeat(200) + '"');
    });
});

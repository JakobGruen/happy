import { describe, it, expect } from 'vitest';
import { parseCommandMessage } from './parseCommandMessage';

describe('parseCommandMessage', () => {
    it('returns null for regular text without command tags', () => {
        expect(parseCommandMessage('Hello, how are you?')).toBeNull();
        expect(parseCommandMessage('')).toBeNull();
        expect(parseCommandMessage('Some <random> xml tags')).toBeNull();
    });

    it('parses standard command message with both tags', () => {
        const text = [
            '<command-message>feature-dev:feature-dev</command-message>',
            '<command-name>/feature-dev:feature-dev</command-name>',
            '# Feature Development',
            '',
            'You are helping a developer implement a new feature.',
        ].join('\n');

        const result = parseCommandMessage(text);
        expect(result).not.toBeNull();
        expect(result!.commandName).toBe('/feature-dev');
        expect(result!.commandBody).toContain('# Feature Development');
        expect(result!.commandBody).toContain('You are helping a developer');
    });

    it('handles command name without leading slash', () => {
        const text = '<command-name>commit</command-name>\nCommit instructions...';
        const result = parseCommandMessage(text);
        expect(result).not.toBeNull();
        expect(result!.commandName).toBe('/commit');
        expect(result!.commandBody).toBe('Commit instructions...');
    });

    it('handles colon-separated name taking the slash part', () => {
        const text = '<command-name>plugin-dev:create-plugin</command-name>\nCreate a plugin...';
        const result = parseCommandMessage(text);
        expect(result).not.toBeNull();
        expect(result!.commandName).toBe('/plugin-dev');
    });

    it('handles slash in first segment', () => {
        const text = '<command-name>/commit-commands:commit</command-name>\nBody here';
        const result = parseCommandMessage(text);
        expect(result).not.toBeNull();
        expect(result!.commandName).toBe('/commit-commands');
    });

    it('returns empty body when no content after tag', () => {
        const text = '<command-name>/test</command-name>';
        const result = parseCommandMessage(text);
        expect(result).not.toBeNull();
        expect(result!.commandName).toBe('/test');
        expect(result!.commandBody).toBe('');
    });

    it('trims whitespace from command name and body', () => {
        const text = '<command-name>  /feature-dev  </command-name>\n\n  Body content  ';
        const result = parseCommandMessage(text);
        expect(result).not.toBeNull();
        expect(result!.commandName).toBe('/feature-dev');
        expect(result!.commandBody).toBe('Body content');
    });
});

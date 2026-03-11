import { describe, it, expect } from 'vitest';
import { reducer, createReducer } from './reducer';
import type { NormalizedMessage } from '../typesRaw';

describe('Reducer - Skill Expansion Message Linking', () => {
    it('should attach skill expansion content to the preceding Skill tool', () => {
        const state = createReducer();

        // Create a Skill tool call
        const skillToolMessage: NormalizedMessage = {
            role: 'agent',
            id: 'msg-skill-1',
            createdAt: Date.now(),
            content: [
                {
                    type: 'tool-call',
                    id: 'tool-skill-1',
                    name: 'Skill',
                    input: {
                        skill: 'test:skill',
                        args: 'test args'
                    },
                    description: 'Skill call'
                }
            ]
        };

        // Create a skill expansion text message (the markdown content)
        const skillExpansionMessage: NormalizedMessage = {
            role: 'agent',
            id: 'msg-skill-expansion-1',
            createdAt: Date.now() + 1000,
            content: [
                {
                    type: 'text',
                    text: 'Base directory for this skill: /home/user/.claude/skills\n\n# Skill Documentation\n\nThis is detailed skill content that should appear in the detail view.'
                }
            ]
        };

        // Process both messages together (realistic scenario)
        const result = reducer(state, [skillToolMessage, skillExpansionMessage]);

        // The skill expansion message should NOT be rendered in main chat
        const skillExpansionInChat = result.messages.find(
            m => m.kind === 'agent-text' && m.text?.includes('Base directory for this skill')
        );
        expect(skillExpansionInChat).toBeUndefined();

        // The Skill tool should have the expansion content in its result
        const skillTool = result.messages.find(m => m.kind === 'tool-call' && m.tool?.name === 'Skill');
        expect(skillTool).toBeDefined();
        expect(skillTool?.kind).toBe('tool-call');
        if (skillTool?.kind === 'tool-call') {
            expect(typeof skillTool.tool.result).toBe('string');
            expect(skillTool.tool.result).toContain('Base directory for this skill');
            expect(skillTool.tool.result).toContain('This is detailed skill content');
        }
    });
});

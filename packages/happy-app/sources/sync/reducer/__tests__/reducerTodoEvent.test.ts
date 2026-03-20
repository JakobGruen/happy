import { describe, it, expect } from 'vitest';
import { createReducer, reducer } from '../reducer';
import { NormalizedMessage } from '../../typesRaw';

function makeTodoMsg(id: string, todos: Array<{ content: string; status: string; id: string }>, createdAt = Date.now()): NormalizedMessage {
    return {
        id,
        localId: null,
        createdAt,
        isSidechain: false,
        role: 'agent',
        content: [{
            type: 'tool-call',
            id: `tc-${id}`,
            name: 'TodoWrite',
            input: { todos },
            description: null,
            uuid: `uuid-${id}`,
            parentUUID: null,
        }],
    } as NormalizedMessage;
}

describe('reducer Phase 0.5 - TodoWrite events', () => {
    it('converts TodoWrite to agent-event message (not tool-call)', () => {
        const state = createReducer();
        const msg = makeTodoMsg('1', [
            { content: 'Task A', status: 'pending', id: 't1' },
        ]);
        const result = reducer(state, [msg]);

        const todoMsg = result.messages.find(m => m.kind === 'agent-event');
        expect(todoMsg).toBeDefined();
        expect(todoMsg?.kind).toBe('agent-event');

        const toolMsg = result.messages.find(m => m.kind === 'tool-call' && (m as any).tool?.name === 'TodoWrite');
        expect(toolMsg).toBeUndefined();
    });

    it('still updates todos in reducer output', () => {
        const state = createReducer();
        const todos = [
            { content: 'Task A', status: 'pending', id: 't1' },
            { content: 'Task B', status: 'in_progress', id: 't2' },
        ];
        const msg = makeTodoMsg('1', todos);
        const result = reducer(state, [msg]);

        expect(result.todos).toEqual(todos);
    });

    it('computes delta between consecutive TodoWrite calls', () => {
        const state = createReducer();
        const msg1 = makeTodoMsg('1', [
            { content: 'Task A', status: 'pending', id: 't1' },
        ], 1000);
        const msg2 = makeTodoMsg('2', [
            { content: 'Task A', status: 'completed', id: 't1' },
        ], 2000);

        const result = reducer(state, [msg1, msg2]);
        const events = result.messages.filter(m => m.kind === 'agent-event');

        expect(events).toHaveLength(2);
        expect((events[0] as any).event.message).toContain('tasks created');
        expect((events[1] as any).event.message).toContain('Completed');
    });
});

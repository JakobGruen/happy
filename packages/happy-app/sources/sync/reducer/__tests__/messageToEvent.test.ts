import { describe, it, expect } from 'vitest';
import { parseMessageAsEvent } from '../messageToEvent';
import { NormalizedMessage } from '../../typesRaw';

function makeTodoMsg(todos: Array<{ content: string; status: string; id?: string }>): NormalizedMessage {
    return {
        id: 'msg-1',
        localId: null,
        createdAt: Date.now(),
        isSidechain: false,
        role: 'agent',
        content: [{
            type: 'tool-call',
            id: 'tc-1',
            name: 'TodoWrite',
            input: { todos },
        }],
    } as NormalizedMessage;
}

describe('parseMessageAsEvent - TodoWrite', () => {
    it('returns null for non-TodoWrite messages', () => {
        const msg = makeTodoMsg([]);
        msg.content = [{ type: 'text', text: 'hello' }] as any;
        expect(parseMessageAsEvent(msg)).toBeNull();
    });

    it('returns empty event for empty todos (suppresses bubble)', () => {
        const msg = makeTodoMsg([]);
        expect(parseMessageAsEvent(msg)).toEqual({
            type: 'message',
            message: '',
        });
    });

    it('formats first creation as single-line summary', () => {
        const msg = makeTodoMsg([
            { content: 'Task A', status: 'pending', id: '1' },
            { content: 'Task B', status: 'pending', id: '2' },
        ]);
        const event = parseMessageAsEvent(msg);
        expect(event).toEqual({
            type: 'message',
            message: '☑ 0/2 tasks created',
        });
    });

    it('formats single completion', () => {
        const prevTodos = [
            { content: 'Task A', status: 'in_progress', id: '1' },
            { content: 'Task B', status: 'pending', id: '2' },
        ];
        const msg = makeTodoMsg([
            { content: 'Task A', status: 'completed', id: '1' },
            { content: 'Task B', status: 'pending', id: '2' },
        ]);
        const event = parseMessageAsEvent(msg, { prevTodos });
        expect(event).toEqual({
            type: 'message',
            message: '☑ 1/2 · Completed: Task A',
        });
    });

    it('formats single start', () => {
        const prevTodos = [
            { content: 'Task A', status: 'pending', id: '1' },
        ];
        const msg = makeTodoMsg([
            { content: 'Task A', status: 'in_progress', id: '1' },
        ]);
        const event = parseMessageAsEvent(msg, { prevTodos });
        expect(event).toEqual({
            type: 'message',
            message: '☑ 0/1 · Started: Task A',
        });
    });

    it('formats single addition', () => {
        const prevTodos = [
            { content: 'Task A', status: 'completed', id: '1' },
        ];
        const msg = makeTodoMsg([
            { content: 'Task A', status: 'completed', id: '1' },
            { content: 'Task B', status: 'pending', id: '2' },
        ]);
        const event = parseMessageAsEvent(msg, { prevTodos });
        expect(event).toEqual({
            type: 'message',
            message: '☑ 1/2 · Added: Task B',
        });
    });

    it('formats multiple completions as count', () => {
        const prevTodos = [
            { content: 'Task A', status: 'in_progress', id: '1' },
            { content: 'Task B', status: 'pending', id: '2' },
            { content: 'Task C', status: 'pending', id: '3' },
        ];
        const msg = makeTodoMsg([
            { content: 'Task A', status: 'completed', id: '1' },
            { content: 'Task B', status: 'completed', id: '2' },
            { content: 'Task C', status: 'pending', id: '3' },
        ]);
        const event = parseMessageAsEvent(msg, { prevTodos });
        expect(event).toEqual({
            type: 'message',
            message: '☑ 2/3 · Completed 2 tasks',
        });
    });

    it('formats removal', () => {
        const prevTodos = [
            { content: 'Task A', status: 'pending', id: '1' },
            { content: 'Task B', status: 'pending', id: '2' },
        ];
        const msg = makeTodoMsg([
            { content: 'Task A', status: 'pending', id: '1' },
        ]);
        const event = parseMessageAsEvent(msg, { prevTodos });
        expect(event).toEqual({
            type: 'message',
            message: '☑ 0/1 · Removed: Task B',
        });
    });

    it('returns empty event when nothing changed (suppresses bubble)', () => {
        const prevTodos = [
            { content: 'Task A', status: 'pending', id: '1' },
        ];
        const msg = makeTodoMsg([
            { content: 'Task A', status: 'pending', id: '1' },
        ]);
        expect(parseMessageAsEvent(msg, { prevTodos })).toEqual({
            type: 'message',
            message: '',
        });
    });

    it('matches by content when no id', () => {
        const prevTodos = [
            { content: 'Task A', status: 'pending' },
        ];
        const msg = makeTodoMsg([
            { content: 'Task A', status: 'completed' },
        ]);
        const event = parseMessageAsEvent(msg, { prevTodos });
        expect(event).toEqual({
            type: 'message',
            message: '☑ 1/1 · Completed: Task A',
        });
    });

    it('prioritizes completions over other changes', () => {
        const prevTodos = [
            { content: 'Task A', status: 'in_progress', id: '1' },
            { content: 'Task B', status: 'pending', id: '2' },
        ];
        const msg = makeTodoMsg([
            { content: 'Task A', status: 'completed', id: '1' },
            { content: 'Task B', status: 'in_progress', id: '2' },
            { content: 'Task C', status: 'pending', id: '3' },
        ]);
        const event = parseMessageAsEvent(msg, { prevTodos });
        expect(event).toEqual({
            type: 'message',
            message: '☑ 1/3 · Completed: Task A',
        });
    });
});

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

    it('formats first creation with all items', () => {
        const msg = makeTodoMsg([
            { content: 'Task A', status: 'pending', id: '1' },
            { content: 'Task B', status: 'pending', id: '2' },
        ]);
        const event = parseMessageAsEvent(msg);
        expect(event).toEqual({
            type: 'message',
            message: '📋 Todo created:\n☐ Task A\n☐ Task B',
        });
    });

    it('formats single status change to completed', () => {
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
            message: '✅ Completed: "Task A"',
        });
    });

    it('formats single status change to in_progress', () => {
        const prevTodos = [
            { content: 'Task A', status: 'pending', id: '1' },
        ];
        const msg = makeTodoMsg([
            { content: 'Task A', status: 'in_progress', id: '1' },
        ]);
        const event = parseMessageAsEvent(msg, { prevTodos });
        expect(event).toEqual({
            type: 'message',
            message: '🔄 Started: "Task A"',
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
            message: '📋 Added: "Task B"',
        });
    });

    it('formats multiple changes as compact list', () => {
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
            message: '📋 Todo updated:\n✅ Completed: "Task A"\n🔄 Started: "Task B"\n📋 Added: "Task C"',
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
            message: '❌ Removed: "Task B"',
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

    it('formats content update', () => {
        const prevTodos = [
            { content: 'Old text', status: 'pending', id: '1' },
        ];
        const msg = makeTodoMsg([
            { content: 'New text', status: 'pending', id: '1' },
        ]);
        const event = parseMessageAsEvent(msg, { prevTodos });
        expect(event).toEqual({
            type: 'message',
            message: '📝 Updated: "New text"',
        });
    });

    it('handles task content with double quotes', () => {
        const prevTodos = [
            { content: 'Fix "this" bug', status: 'pending', id: '1' },
        ];
        const msg = makeTodoMsg([
            { content: 'Fix "this" bug', status: 'completed', id: '1' },
        ]);
        const event = parseMessageAsEvent(msg, { prevTodos });
        expect(event).toEqual({
            type: 'message',
            message: '✅ Completed: "Fix "this" bug"',
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
            message: '✅ Completed: "Task A"',
        });
    });
});

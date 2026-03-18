import { useMemo } from 'react';

interface TodoItem {
    content: string;
    status: 'pending' | 'in_progress' | 'completed';
    priority: 'high' | 'medium' | 'low';
    id: string;
}

export type PillPhase =
    | 'hidden'        // no todos
    | 'active'        // in progress (blue)
    | 'allComplete';  // all done (green) — stays until next TodoWrite call

interface TodoPillState {
    completed: number;
    total: number;
    phase: PillPhase;
}

export function useTodoPillState(todos: TodoItem[] | undefined): TodoPillState {
    return useMemo(() => {
        if (!todos || todos.length === 0) {
            return { completed: 0, total: 0, phase: 'hidden' as const };
        }

        const total = todos.length;
        const completed = todos.filter(item => item.status === 'completed').length;
        const allDone = completed === total;

        return {
            completed,
            total,
            phase: allDone ? 'allComplete' as const : 'active' as const,
        };
    }, [todos]);
}

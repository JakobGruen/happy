import { useEffect, useRef, useState, useMemo } from 'react';

interface TodoItem {
    content: string;
    status: 'pending' | 'in_progress' | 'completed';
    priority: 'high' | 'medium' | 'low';
    id: string;
}

export type PillPhase =
    | 'hidden'        // no todos
    | 'active'        // in progress (blue)
    | 'allComplete'   // green flash (holding 3s)
    | 'fadingOut';    // fading out after complete

interface TodoPillState {
    completed: number;
    total: number;
    phase: PillPhase;
}

export function useTodoPillState(todos: TodoItem[] | undefined): TodoPillState {
    const pillAppearedAt = useRef<number | null>(null);
    const prevTodosRef = useRef<TodoItem[] | undefined>(undefined);
    const innerTimerRef = useRef<ReturnType<typeof setTimeout>>();
    const [phase, setPhase] = useState<PillPhase>('hidden');

    // Reset appearance timer when todos array is fully replaced
    useEffect(() => {
        const prev = prevTodosRef.current;
        prevTodosRef.current = todos;

        if (!todos || todos.length === 0) {
            pillAppearedAt.current = null;
            return;
        }

        // First appearance or full replacement: reset timer
        if (!prev || prev.length === 0) {
            pillAppearedAt.current = Date.now();
        }
    }, [todos]);

    // Phase lifecycle with proper timer cleanup
    useEffect(() => {
        if (!todos || todos.length === 0) {
            setPhase('hidden');
            return;
        }

        const total = todos.length;
        const completed = todos.filter(item => item.status === 'completed').length;
        const allDone = completed === total;

        if (!allDone) {
            setPhase('active');
            return;
        }

        // All done — check for quick completion
        const appearedAt = pillAppearedAt.current;
        const isQuick = appearedAt && (Date.now() - appearedAt < 5000);

        if (isQuick) {
            setPhase('fadingOut');
            const timer = setTimeout(() => setPhase('hidden'), 500);
            return () => clearTimeout(timer);
        }

        // Normal completion: green flash → fade → hidden
        setPhase('allComplete');
        const timer = setTimeout(() => {
            setPhase('fadingOut');
            innerTimerRef.current = setTimeout(() => setPhase('hidden'), 500);
        }, 3000);
        return () => {
            clearTimeout(timer);
            if (innerTimerRef.current) clearTimeout(innerTimerRef.current);
        };
    }, [todos]);

    const counts = useMemo(() => {
        if (!todos || todos.length === 0) return { completed: 0, total: 0 };
        return {
            completed: todos.filter(item => item.status === 'completed').length,
            total: todos.length,
        };
    }, [todos]);

    return { ...counts, phase };
}

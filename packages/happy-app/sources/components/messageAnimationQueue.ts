/**
 * Central animation queue for chat message entrance animations.
 * Ensures messages animate one at a time, in order, with no overlap.
 *
 * Flow:
 * 1. ChatList mounts → `init()` starts readiness timer (skips initial load)
 * 2. New MessageView mounts → `enqueue(id, startCb)` registers for animation
 * 3. Queue processes first item → calls startCb → message fades in
 * 4. Message calls `complete(id)` when done → queue advances to next
 * 5. Pending flush → `enqueuePendingExit()` queues exit animation before entrances
 */

type StartCallback = () => void;

interface QueueEntry {
    id: string;
    start: StartCallback;
}

const ANIMATION_DURATION = 300;
const PENDING_EXIT_DURATION = 500; // must match FadeOutUp.duration() in PendingMessages
const INIT_GRACE_PERIOD = 800; // skip animations for initial message load

let _ready = false;
let _active = false; // CC is actively processing (thinking/tools) — skip queue when false
let _readyTimer: ReturnType<typeof setTimeout> | null = null;
let _processTimer: ReturnType<typeof setTimeout> | null = null;

const _queue: QueueEntry[] = [];
let _currentId: string | null = null;

/** Call from ChatList on mount. Resets state and starts readiness timer. */
export function init() {
    _ready = false;
    _active = false;
    _currentId = null;
    _queue.length = 0;
    if (_readyTimer) clearTimeout(_readyTimer);
    if (_processTimer) clearTimeout(_processTimer);
    _readyTimer = setTimeout(() => { _ready = true; }, INIT_GRACE_PERIOD);
}

/** Returns true if animations should be queued (past initial load AND CC is active). */
export function isReady(): boolean {
    return _ready && _active;
}

/** Set whether CC is actively processing. When false, messages render instantly. */
export function setActive(active: boolean) {
    _active = active;
}

/** Enqueue a message for entrance animation. startCb is called when it's this message's turn. */
export function enqueue(id: string, startCb: StartCallback) {
    _queue.push({ id, start: startCb });
    scheduleProcess();
}

/** Remove a message from the queue (e.g., on unmount before animation started). */
export function dequeue(id: string) {
    const idx = _queue.findIndex(e => e.id === id);
    if (idx >= 0) _queue.splice(idx, 1);
    if (_currentId === id) {
        _currentId = null;
        scheduleProcess();
    }
}

/** Call when a message's entrance animation finishes. Advances the queue. */
export function complete(id: string) {
    if (_currentId === id) {
        _currentId = null;
        scheduleProcess();
    }
}

/** Enqueue a pending-exit step. When it's this step's turn, `startCb` is called
 *  (trigger the actual removal), then the queue auto-advances after the exit duration. */
export function enqueuePendingExit(startCb: StartCallback) {
    const id = '__pending_exit_' + Date.now();
    _queue.push({ id, start: () => {
        startCb();
        // Auto-complete after the exit animation duration
        setTimeout(() => { complete(id); }, PENDING_EXIT_DURATION);
    }});
    scheduleProcess();
}

function scheduleProcess() {
    if (_processTimer) clearTimeout(_processTimer);
    // Process on next microtask to batch multiple enqueues in same render
    _processTimer = setTimeout(processQueue, 0);
}

function processQueue() {
    if (_currentId !== null) return; // still animating
    if (_queue.length === 0) return;

    const next = _queue.shift()!;
    _currentId = next.id;
    next.start();

    // Safety: auto-advance if complete() is never called (e.g., unmount during animation).
    // Pending-exit steps need longer than message entrance animations.
    const safetyMs = next.id.startsWith('__pending_exit_')
        ? PENDING_EXIT_DURATION + 100
        : ANIMATION_DURATION + 100;
    setTimeout(() => {
        if (_currentId === next.id) {
            _currentId = null;
            scheduleProcess();
        }
    }, safetyMs);
}

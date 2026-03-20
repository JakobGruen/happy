/**
 * Central animation queue for chat message entrance animations.
 * Ensures messages animate one at a time, in order, with no overlap.
 *
 * Flow:
 * 1. ChatList mounts → `init()` starts readiness timer (skips initial load)
 * 2. New MessageView mounts → `enqueue(id, startCb)` registers for animation
 * 3. Queue processes first item → calls startCb → message fades in
 * 4. Message calls `complete(id)` when done → queue advances to next
 * 5. Pending flush → `pauseForPendingExit()` pauses queue for exit animation
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
let _readyTimer: ReturnType<typeof setTimeout> | null = null;
let _pausedUntil = 0;
let _processTimer: ReturnType<typeof setTimeout> | null = null;

const _queue: QueueEntry[] = [];
let _currentId: string | null = null;

/** Call from ChatList on mount. Resets state and starts readiness timer. */
export function init() {
    _ready = false;
    _currentId = null;
    _queue.length = 0;
    _pausedUntil = 0;
    if (_readyTimer) clearTimeout(_readyTimer);
    if (_processTimer) clearTimeout(_processTimer);
    _readyTimer = setTimeout(() => { _ready = true; }, INIT_GRACE_PERIOD);
}

/** Returns true if animations are active (past initial load). */
export function isReady(): boolean {
    return _ready;
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

/** Pause queue processing to let pending message exit animation finish first. */
export function pauseForPendingExit() {
    _pausedUntil = Date.now() + PENDING_EXIT_DURATION;
    scheduleProcess();
}

function scheduleProcess() {
    if (_processTimer) clearTimeout(_processTimer);

    const now = Date.now();
    if (_pausedUntil > now) {
        // Wait until pause expires, then process
        _processTimer = setTimeout(processQueue, _pausedUntil - now);
    } else {
        // Process on next microtask to batch multiple enqueues in same render
        _processTimer = setTimeout(processQueue, 0);
    }
}

function processQueue() {
    if (_currentId !== null) return; // still animating
    if (_queue.length === 0) return;
    if (Date.now() < _pausedUntil) return; // still paused

    const next = _queue.shift()!;
    _currentId = next.id;
    next.start();

    // Safety: auto-advance if complete() is never called (e.g., unmount during animation)
    setTimeout(() => {
        if (_currentId === next.id) {
            _currentId = null;
            scheduleProcess();
        }
    }, ANIMATION_DURATION + 100);
}

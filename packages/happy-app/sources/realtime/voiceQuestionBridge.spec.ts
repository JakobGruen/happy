import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock factories -- these run before any module imports
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => {
    return {
        sessionAllow: vi.fn(),
        trackPermissionResponse: vi.fn(),
    };
});

vi.mock('@/sync/ops', () => ({
    sessionAllow: mocks.sessionAllow,
}));

// sync.sendMessage is no longer used by voiceQuestionBridge (answers go via updatedInput)

vi.mock('@/track', () => ({
    trackPermissionResponse: mocks.trackPermissionResponse,
}));

// ---------------------------------------------------------------------------
// Import the module under test AFTER mocks are set up
// ---------------------------------------------------------------------------
import {
    startFlow,
    recordAnswer,
    confirmAndSubmit,
    resetFlow,
    cleanup,
    isFlowActive,
    subscribe,
    type BridgeEvent,
} from './voiceQuestionBridge';

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------
const testQuestions = [
    {
        question: 'Which database should we use?',
        header: 'Database',
        options: [
            { label: 'PostgreSQL', description: 'Best for relational data' },
            { label: 'SQLite', description: 'Lightweight and simple' },
            { label: 'MongoDB', description: 'Document-oriented' },
        ],
        multiSelect: false,
    },
    {
        question: 'Which features do you want?',
        header: 'Features',
        options: [
            { label: 'Auth', description: 'User authentication' },
            { label: 'API', description: 'REST API endpoints' },
        ],
        multiSelect: true,
    },
];

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------
describe('voiceQuestionBridge', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        cleanup();
    });

    // ===================================================================
    // startFlow
    // ===================================================================
    describe('startFlow', () => {
        it('returns Q1 formatted text with "Question 1 of N" for multi-question', () => {
            const result = startFlow('session-1', 'req-1', testQuestions);

            expect(result).toContain('Question 1 of 2:');
            expect(result).toContain('Which database should we use?');
            expect(result).toContain('[Select one]');
            expect(result).toContain('A) PostgreSQL');
            expect(result).toContain('B) SQLite');
            expect(result).toContain('C) MongoDB');
            expect(result).toContain('D) Other');
            expect(result).toContain('questionIndex=0');
            expect(result).toContain('header="Database"');
        });

        it('omits "Question N of M" prefix for single-question', () => {
            const singleQuestion = [testQuestions[0]];
            const result = startFlow('session-1', 'req-1', singleQuestion);

            expect(result).not.toContain('Question 1 of');
            expect(result).toContain('Which database should we use?');
            expect(result).toContain('[Select one]');
        });
    });

    // ===================================================================
    // recordAnswer
    // ===================================================================
    describe('recordAnswer', () => {
        it('stores answer and returns Q2 text for multi-question', () => {
            startFlow('session-1', 'req-1', testQuestions);

            const result = recordAnswer(0, 'Database', ['PostgreSQL']);

            expect(result).toContain('Question 2 of 2:');
            expect(result).toContain('Which features do you want?');
            expect(result).toContain('[Select one or more]');
            expect(result).toContain('A) Auth');
            expect(result).toContain('B) API');
            expect(result).toContain('questionIndex=1');
            expect(result).toContain('header="Features"');
        });

        it('returns summary after last question', () => {
            startFlow('session-1', 'req-1', testQuestions);

            recordAnswer(0, 'Database', ['PostgreSQL']);
            const result = recordAnswer(1, 'Features', ['Auth', 'API']);

            expect(result).toContain('All questions answered');
            expect(result).toContain('Database: PostgreSQL');
            expect(result).toContain('Features: Auth, API');
            expect(result).toContain('confirm_question_answers');
            expect(result).toContain('reject_question_answers');
        });
    });

    // ===================================================================
    // confirmAndSubmit
    // ===================================================================
    describe('confirmAndSubmit', () => {
        it('calls sessionAllow with SDK-format answers (no sendMessage)', async () => {
            mocks.sessionAllow.mockResolvedValue(undefined);

            startFlow('session-1', 'req-1', testQuestions);
            recordAnswer(0, 'Database', ['PostgreSQL']);
            recordAnswer(1, 'Features', ['Auth', 'API']);

            const result = await confirmAndSubmit();

            expect(mocks.sessionAllow).toHaveBeenCalledWith(
                'session-1',
                'req-1',
                undefined,
                undefined,
                undefined,
                {
                    'Which database should we use?': 'PostgreSQL',
                    'Which features do you want?': 'Auth, API',
                }
            );
            expect(mocks.trackPermissionResponse).toHaveBeenCalledWith(true);
            expect(result).toContain('Answers submitted');
        });

        it('returns error when no active flow', async () => {
            const result = await confirmAndSubmit();

            expect(result).toBe('error (no active question flow)');
            expect(mocks.sessionAllow).not.toHaveBeenCalled();
        });
    });

    // ===================================================================
    // resetFlow
    // ===================================================================
    describe('resetFlow', () => {
        it('clears answers and returns Q1', () => {
            startFlow('session-1', 'req-1', testQuestions);
            recordAnswer(0, 'Database', ['PostgreSQL']);

            const result = resetFlow();

            expect(result).toContain('Question 1 of 2:');
            expect(result).toContain('Which database should we use?');
        });
    });

    // ===================================================================
    // Fuzzy label matching
    // ===================================================================
    describe('fuzzy label matching', () => {
        it('case-insensitive exact match', () => {
            startFlow('session-1', 'req-1', testQuestions);

            const result = recordAnswer(0, 'Database', ['postgresql']);

            // Should match PostgreSQL and move to Q2
            expect(result).toContain('Question 2 of 2:');
        });

        it('substring match: "Postgres" matches "PostgreSQL"', () => {
            startFlow('session-1', 'req-1', testQuestions);

            const result = recordAnswer(0, 'Database', ['Postgres']);

            // Should match PostgreSQL and move to Q2
            expect(result).toContain('Question 2 of 2:');
        });

        it('"Other: custom text" maps correctly in SDK format (raw text, no prefix)', () => {
            startFlow('session-1', 'req-1', testQuestions);
            recordAnswer(0, 'Database', ['Other: CockroachDB']);
            recordAnswer(1, 'Features', ['Auth']);

            mocks.sessionAllow.mockResolvedValue(undefined);

            return confirmAndSubmit().then(result => {
                expect(mocks.sessionAllow).toHaveBeenCalledWith(
                    'session-1',
                    'req-1',
                    undefined,
                    undefined,
                    undefined,
                    {
                        'Which database should we use?': 'CockroachDB',
                        'Which features do you want?': 'Auth',
                    }
                );
                expect(result).toContain('Answers submitted');
            });
        });
    });

    // ===================================================================
    // subscribe
    // ===================================================================
    describe('subscribe', () => {
        it('emits selection-update events with correct indices', () => {
            startFlow('session-1', 'req-1', testQuestions);
            const events: BridgeEvent[] = [];
            subscribe(event => events.push(event));

            recordAnswer(0, 'Database', ['PostgreSQL']);

            const selectionEvent = events.find(e => e.type === 'selection-update');
            expect(selectionEvent).toBeDefined();
            expect(selectionEvent!.questionIndex).toBe(0);
            expect(selectionEvent!.selectedIndices).toEqual(new Set([0]));
        });

        it('emits active-tab-change when moving to next question', () => {
            startFlow('session-1', 'req-1', testQuestions);
            const events: BridgeEvent[] = [];
            subscribe(event => events.push(event));

            recordAnswer(0, 'Database', ['PostgreSQL']);

            const tabEvent = events.find(e => e.type === 'active-tab-change');
            expect(tabEvent).toBeDefined();
            expect(tabEvent!.activeTab).toBe(1);
        });

        it('emits submitted on confirmAndSubmit', async () => {
            mocks.sessionAllow.mockResolvedValue(undefined);

            startFlow('session-1', 'req-1', testQuestions);
            recordAnswer(0, 'Database', ['PostgreSQL']);
            recordAnswer(1, 'Features', ['Auth']);

            const events: BridgeEvent[] = [];
            subscribe(event => events.push(event));

            await confirmAndSubmit();

            const submittedEvent = events.find(e => e.type === 'submitted');
            expect(submittedEvent).toBeDefined();
        });

        it('emits reset on resetFlow', () => {
            startFlow('session-1', 'req-1', testQuestions);
            recordAnswer(0, 'Database', ['PostgreSQL']);

            const events: BridgeEvent[] = [];
            subscribe(event => events.push(event));

            resetFlow();

            const resetEvent = events.find(e => e.type === 'reset');
            expect(resetEvent).toBeDefined();
        });
    });

    // ===================================================================
    // cleanup + isFlowActive
    // ===================================================================
    describe('cleanup / isFlowActive', () => {
        it('cleanup resets all state and isFlowActive returns false', () => {
            startFlow('session-1', 'req-1', testQuestions);
            expect(isFlowActive()).toBe(true);

            cleanup();

            expect(isFlowActive()).toBe(false);
        });

        it('isFlowActive returns true after startFlow', () => {
            startFlow('session-1', 'req-1', testQuestions);

            expect(isFlowActive()).toBe(true);
        });
    });
});

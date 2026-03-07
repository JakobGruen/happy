/**
 * Voice Question Bridge
 *
 * Lightweight state machine that coordinates sequential question answering
 * between the voice agent (via RPC) and the AskUserQuestionView UI.
 *
 * Lifecycle:
 *   startFlow() → recordAnswer() x N → confirmAndSubmit() or resetFlow()
 *
 * NOT stored in Zustand — this is ephemeral voice-session-scoped state.
 */

import { sessionAllow } from '@/sync/ops';
import { trackPermissionResponse } from '@/track';

// Sentinel for "Other" free-text option (matches AskUserQuestionView)
const OTHER_INDEX = -1;

interface QuestionOption {
    label: string;
    description: string;
}

interface Question {
    question: string;
    header: string;
    options: QuestionOption[];
    multiSelect: boolean;
}

interface StoredAnswer {
    questionIndex: number;
    header: string;
    selectedIndices: Set<number>;
    otherText?: string;
}

export interface BridgeEvent {
    type: 'selection-update' | 'active-tab-change' | 'submitted' | 'reset';
    questionIndex?: number;
    selectedIndices?: Set<number>;
    otherText?: string;
    activeTab?: number;
}

type BridgeListener = (event: BridgeEvent) => void;

// Module-level state
let flowSessionId: string | null = null;
let flowRequestId: string | null = null;
let flowQuestions: Question[] = [];
let currentQuestionIndex = 0;
let answers: Map<number, StoredAnswer> = new Map();
let listeners: BridgeListener[] = [];

export function isFlowActive(): boolean {
    return flowSessionId !== null && flowQuestions.length > 0;
}

/**
 * Initialize a new sequential question flow.
 * Returns the formatted text for Q1 to send to the voice agent.
 */
export function startFlow(
    sessionId: string,
    requestId: string,
    questions: Question[]
): string {
    flowSessionId = sessionId;
    flowRequestId = requestId;
    flowQuestions = questions;
    currentQuestionIndex = 0;
    answers.clear();
    return formatSingleQuestion(0);
}

/**
 * Record an answer for a single question.
 * Returns the next question text or a summary for confirmation.
 */
export function recordAnswer(
    questionIndex: number,
    header: string,
    selectedLabels: string[]
): string {
    if (!isFlowActive()) {
        return 'error (no active question flow)';
    }

    const question = flowQuestions[questionIndex];
    if (!question) {
        return `error (invalid question index ${questionIndex})`;
    }

    const selectedIndices = new Set<number>();
    let otherText: string | undefined;

    for (const label of selectedLabels) {
        if (label.startsWith('Other:')) {
            selectedIndices.add(OTHER_INDEX);
            otherText = label.substring('Other:'.length).trim();
        } else {
            const idx = matchLabelToIndex(question, label);
            if (idx >= 0) {
                selectedIndices.add(idx);
            }
        }
    }

    answers.set(questionIndex, {
        questionIndex,
        header,
        selectedIndices,
        otherText,
    });

    emit({
        type: 'selection-update',
        questionIndex,
        selectedIndices,
        otherText,
    });

    const nextIndex = questionIndex + 1;
    if (nextIndex < flowQuestions.length) {
        currentQuestionIndex = nextIndex;
        emit({ type: 'active-tab-change', activeTab: nextIndex });
        return formatSingleQuestion(nextIndex);
    } else {
        return formatSummary();
    }
}

/**
 * User confirms all answers via voice. Submits to Claude Code.
 */
export async function confirmAndSubmit(): Promise<string> {
    if (!isFlowActive() || !flowSessionId || !flowRequestId) {
        return 'error (no active question flow)';
    }

    // Build answers in SDK-expected format: { [questionText]: "label1, label2" }
    const sdkAnswers: Record<string, string> = {};
    flowQuestions.forEach((q, qIndex) => {
        const answer = answers.get(qIndex);
        if (answer && answer.selectedIndices.size > 0) {
            const labels = answerToLabels(q, answer);
            if (labels.length > 0) {
                // Strip "Other: " prefix — SDK wants raw free-text
                const cleanLabels = labels.map(l =>
                    l.startsWith('Other: ') ? l.substring('Other: '.length) : l
                );
                sdkAnswers[q.question] = cleanLabels.join(', ');
            }
        }
    });

    const responseText = formatResponseText();

    try {
        await sessionAllow(flowSessionId, flowRequestId, undefined, undefined, undefined, sdkAnswers);
        trackPermissionResponse(true);
        emit({ type: 'submitted' });
        cleanup();
        return `Answers submitted: ${responseText}. Briefly confirm to the user.`;
    } catch (error) {
        console.error('Failed to submit voice answers:', error);
        return 'error (failed to submit answers)';
    }
}

/**
 * User rejects answers. Resets to Q1.
 */
export function resetFlow(): string {
    if (!isFlowActive()) {
        return 'error (no active question flow)';
    }

    answers.clear();
    currentQuestionIndex = 0;
    emit({ type: 'reset' });
    emit({ type: 'active-tab-change', activeTab: 0 });
    return formatSingleQuestion(0);
}

/**
 * Tear down when voice session ends.
 */
export function cleanup(): void {
    flowSessionId = null;
    flowRequestId = null;
    flowQuestions = [];
    currentQuestionIndex = 0;
    answers.clear();
    listeners = [];
}

// ---- Subscription ----

export function subscribe(listener: BridgeListener): () => void {
    listeners.push(listener);
    return () => {
        listeners = listeners.filter(l => l !== listener);
    };
}

function emit(event: BridgeEvent): void {
    for (const listener of listeners) {
        try {
            listener(event);
        } catch (e) {
            console.error('voiceQuestionBridge listener error:', e);
        }
    }
}

// ---- Label matching ----

function matchLabelToIndex(question: Question, label: string): number {
    const lower = label.toLowerCase();

    // Exact match (case-insensitive)
    const exactIdx = question.options.findIndex(
        opt => opt.label.toLowerCase() === lower
    );
    if (exactIdx >= 0) return exactIdx;

    // Fuzzy: substring in either direction (voice may say "Postgres" for "PostgreSQL")
    const fuzzyIdx = question.options.findIndex(
        opt => opt.label.toLowerCase().includes(lower) ||
               lower.includes(opt.label.toLowerCase())
    );
    if (fuzzyIdx >= 0) return fuzzyIdx;

    return -1;
}

// ---- Formatting ----

function formatSingleQuestion(index: number): string {
    const q = flowQuestions[index];
    const total = flowQuestions.length;
    const lines: string[] = [];

    if (total > 1) {
        lines.push(`Question ${index + 1} of ${total}:`);
    }

    lines.push(q.question);
    lines.push(`[${q.multiSelect ? 'Select one or more' : 'Select one'}]`);

    q.options.forEach((opt, j) => {
        const letter = String.fromCharCode(65 + j);
        lines.push(`  ${letter}) ${opt.label}${opt.description ? ' — ' + opt.description : ''}`);
    });

    const otherLetter = String.fromCharCode(65 + q.options.length);
    lines.push(`  ${otherLetter}) Other — provide a custom answer`);
    lines.push('');
    lines.push(`Read this question to the user. After they choose, call answer_single_question with questionIndex=${index}, header="${q.header}", and their selected option label(s).`);

    return lines.join('\n');
}

function formatSummary(): string {
    const lines: string[] = [];
    lines.push('All questions answered. Here is a summary:');
    lines.push('');

    flowQuestions.forEach((q, qIndex) => {
        const answer = answers.get(qIndex);
        if (answer) {
            const labels = answerToLabels(q, answer);
            lines.push(`${q.header}: ${labels.join(', ')}`);
        }
    });

    lines.push('');
    lines.push('Read the summary to the user and ask them to confirm. If they confirm, call confirm_question_answers. If they want to redo, call reject_question_answers.');
    return lines.join('\n');
}

function formatResponseText(): string {
    const responseLines: string[] = [];
    flowQuestions.forEach((q, qIndex) => {
        const answer = answers.get(qIndex);
        if (answer && answer.selectedIndices.size > 0) {
            const labels = answerToLabels(q, answer);
            if (labels.length > 0) {
                responseLines.push(`${q.header}: ${labels.join(', ')}`);
            }
        }
    });
    return responseLines.join('\n');
}

function answerToLabels(question: Question, answer: StoredAnswer): string[] {
    const labels: string[] = [];
    for (const optIndex of Array.from(answer.selectedIndices)) {
        if (optIndex === OTHER_INDEX) {
            if (answer.otherText) {
                labels.push(`Other: ${answer.otherText}`);
            }
        } else {
            const label = question.options[optIndex]?.label;
            if (label) labels.push(label);
        }
    }
    return labels;
}

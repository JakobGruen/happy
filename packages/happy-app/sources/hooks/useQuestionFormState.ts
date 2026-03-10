import * as React from 'react';
import { sessionAllow } from '@/sync/ops';
import { trackPermissionResponse } from '@/track';
import { subscribe as subscribeBridge } from '@/realtime/voiceQuestionBridge';

export interface QuestionOption {
    label: string;
    description: string;
}

export interface Question {
    question: string;
    header: string;
    options: QuestionOption[];
    multiSelect: boolean;
}

export interface AskUserQuestionInput {
    questions: Question[];
}

/** Sentinel index for "Other" free-text option */
export const OTHER_INDEX = -1;

/**
 * Module-level store for cross-instance answer sync.
 * When the modal (QuestionSheetContent) submits, it stores selections here
 * so the inline view (AskUserQuestionView) can display them even though
 * its own hook instance didn't track the interaction.
 */
const submittedAnswerStore = new Map<string, {
    selections: Map<number, Set<number>>;
    otherTexts: Map<number, string>;
}>();

export interface UseQuestionFormStateProps {
    questions: Question[] | undefined;
    permissionId: string | null;
    sessionId: string | null;
    canInteract: boolean;
}

export interface UseQuestionFormStateResult {
    selections: Map<number, Set<number>>;
    otherTexts: Map<number, string>;
    activeTab: number;
    setActiveTab: (tab: number) => void;
    isSubmitting: boolean;
    isSubmitted: boolean;
    allQuestionsAnswered: boolean;
    canInteract: boolean;
    handleOptionToggle: (questionIndex: number, optionIndex: number, multiSelect: boolean) => void;
    handleOtherTextChange: (questionIndex: number, text: string) => void;
    handleSubmit: () => Promise<void>;
    isQuestionAnswered: (questionIndex: number) => boolean;
}

/**
 * Shared state management for AskUserQuestion forms.
 * Used by both the inline AskUserQuestionView and the QuestionSheetContent modal.
 * Handles selections, "Other" text, voice bridge subscription, and submit RPC.
 */
export function useQuestionFormState({
    questions,
    permissionId,
    sessionId,
    canInteract: canInteractProp,
}: UseQuestionFormStateProps): UseQuestionFormStateResult {
    const [selections, setSelections] = React.useState<Map<number, Set<number>>>(new Map());
    const [otherTexts, setOtherTexts] = React.useState<Map<number, string>>(new Map());
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [isSubmitted, setIsSubmitted] = React.useState(false);
    const [activeTab, setActiveTab] = React.useState(0);

    const canInteract = canInteractProp && !isSubmitted;

    // On mount, check if another instance already submitted for this permissionId
    React.useEffect(() => {
        if (permissionId && submittedAnswerStore.has(permissionId)) {
            const stored = submittedAnswerStore.get(permissionId)!;
            setSelections(stored.selections);
            setOtherTexts(stored.otherTexts);
            setIsSubmitted(true);
        }
    }, [permissionId]);

    // Subscribe to voice question bridge for live UI sync during voice flow.
    React.useEffect(() => {
        const unsubscribe = subscribeBridge((event) => {
            switch (event.type) {
                case 'selection-update':
                    if (event.questionIndex !== undefined && event.selectedIndices) {
                        const qi = event.questionIndex;
                        const si = event.selectedIndices;
                        setSelections(prev => {
                            const next = new Map(prev);
                            next.set(qi, new Set(si));
                            return next;
                        });
                        if (event.otherText !== undefined) {
                            setOtherTexts(prev => {
                                const next = new Map(prev);
                                if (event.otherText) {
                                    next.set(qi, event.otherText);
                                }
                                return next;
                            });
                        }
                    }
                    break;
                case 'active-tab-change':
                    if (event.activeTab !== undefined) {
                        setActiveTab(event.activeTab);
                    }
                    break;
                case 'submitted':
                    setIsSubmitted(true);
                    break;
                case 'reset':
                    setSelections(new Map());
                    setOtherTexts(new Map());
                    setActiveTab(0);
                    break;
            }
        });
        return unsubscribe;
    }, []);

    const safeQuestions = questions ?? [];

    const allQuestionsAnswered = safeQuestions.every((_, qIndex) => {
        const selected = selections.get(qIndex);
        if (!selected || selected.size === 0) return false;
        if (selected.has(OTHER_INDEX)) {
            const text = otherTexts.get(qIndex);
            return !!text && text.trim().length > 0;
        }
        return true;
    });

    const isQuestionAnswered = React.useCallback((qIndex: number) => {
        const selected = selections.get(qIndex);
        if (!selected || selected.size === 0) return false;
        if (selected.has(OTHER_INDEX)) {
            const text = otherTexts.get(qIndex);
            return !!text && text.trim().length > 0;
        }
        return true;
    }, [selections, otherTexts]);

    const handleOptionToggle = React.useCallback((questionIndex: number, optionIndex: number, multiSelect: boolean) => {
        if (!canInteract) return;

        setSelections(prev => {
            const newMap = new Map(prev);
            const currentSet = newMap.get(questionIndex) || new Set();

            if (multiSelect) {
                const newSet = new Set(currentSet);
                if (newSet.has(optionIndex)) {
                    newSet.delete(optionIndex);
                } else {
                    newSet.add(optionIndex);
                }
                newMap.set(questionIndex, newSet);
            } else {
                newMap.set(questionIndex, new Set([optionIndex]));
            }

            return newMap;
        });

        // Clear "Other" text when a non-Other option is selected in single-select mode
        if (!multiSelect && optionIndex !== OTHER_INDEX) {
            setOtherTexts(prev => {
                const newMap = new Map(prev);
                newMap.delete(questionIndex);
                return newMap;
            });
        }
    }, [canInteract]);

    const handleOtherTextChange = React.useCallback((questionIndex: number, text: string) => {
        setOtherTexts(prev => {
            const newMap = new Map(prev);
            newMap.set(questionIndex, text);
            return newMap;
        });
    }, []);

    const handleSubmit = React.useCallback(async () => {
        if (!sessionId || !permissionId || !allQuestionsAnswered || isSubmitting) return;

        setIsSubmitting(true);
        setIsSubmitted(true);

        // Store in module-level cache so other hook instances (inline view) can display results
        if (permissionId) {
            submittedAnswerStore.set(permissionId, {
                selections: new Map(selections),
                otherTexts: new Map(otherTexts),
            });
        }

        // Build answers in SDK-expected format: { [questionText]: "label1, label2" }
        const answers: Record<string, string> = {};
        safeQuestions.forEach((q, qIndex) => {
            const selected = selections.get(qIndex);
            if (selected && selected.size > 0) {
                const labels: string[] = [];
                for (const optIndex of Array.from(selected)) {
                    if (optIndex === OTHER_INDEX) {
                        const text = otherTexts.get(qIndex)?.trim();
                        if (text) labels.push(text);
                    } else {
                        const label = q.options[optIndex]?.label;
                        if (label) labels.push(label);
                    }
                }
                if (labels.length > 0) {
                    answers[q.question] = labels.join(', ');
                }
            }
        });

        try {
            await sessionAllow(sessionId, permissionId, undefined, undefined, undefined, answers);
            trackPermissionResponse(true);
        } catch (error) {
            console.error('Failed to submit answer:', error);
        } finally {
            setIsSubmitting(false);
        }
    }, [sessionId, permissionId, safeQuestions, selections, otherTexts, allQuestionsAnswered, isSubmitting]);

    return {
        selections,
        otherTexts,
        activeTab,
        setActiveTab,
        isSubmitting,
        isSubmitted,
        allQuestionsAnswered,
        canInteract,
        handleOptionToggle,
        handleOtherTextChange,
        handleSubmit,
        isQuestionAnswered,
    };
}

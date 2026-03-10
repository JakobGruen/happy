import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, TextInput, ScrollView } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Ionicons } from '@expo/vector-icons';
import { CurrentSessionPermissionItem } from '@/hooks/useCurrentSessionPermissions';
import {
    useQuestionFormState,
    AskUserQuestionInput,
    Question,
    OTHER_INDEX,
} from '@/hooks/useQuestionFormState';
import { sessionDeny } from '@/sync/ops';
import { t } from '@/text';

interface QuestionSheetContentProps {
    permission: CurrentSessionPermissionItem;
    sessionId: string;
}

/**
 * Interactive question form rendered inside the permission sheet modal.
 * Handles radio/checkbox options, "Other" free-text, tabs for multi-question,
 * submit, and cancel (deny). Reuses useQuestionFormState for shared logic
 * with the inline AskUserQuestionView.
 */
export const QuestionSheetContent = React.memo<QuestionSheetContentProps>(({ permission, sessionId }) => {
    const { theme } = useUnistyles();
    const input = permission.toolInput as AskUserQuestionInput | undefined;
    const questions = input?.questions;

    const form = useQuestionFormState({
        questions,
        permissionId: permission.permissionId,
        sessionId,
        canInteract: true,
    });

    const [isCanceling, setIsCanceling] = React.useState(false);

    if (!questions || !Array.isArray(questions) || questions.length === 0) {
        return null;
    }

    const handleCancel = async () => {
        if (isCanceling) return;
        setIsCanceling(true);
        try {
            await sessionDeny(sessionId, permission.permissionId);
        } catch (error) {
            console.error('Failed to cancel question:', error);
        } finally {
            setIsCanceling(false);
        }
    };

    // Show submitted state
    if (form.isSubmitted) {
        return (
            <View style={styles.submittedContainer}>
                {questions.map((q, qIndex) => {
                    const selected = form.selections.get(qIndex);
                    const labels: string[] = [];
                    if (selected) {
                        for (const optIndex of Array.from(selected)) {
                            if (optIndex === OTHER_INDEX) {
                                const text = form.otherTexts.get(qIndex)?.trim();
                                if (text) labels.push(`Other: ${text}`);
                            } else {
                                const label = q.options[optIndex]?.label;
                                if (label) labels.push(label);
                            }
                        }
                    }
                    return (
                        <View key={qIndex} style={styles.submittedItem}>
                            <Text style={styles.submittedHeader}>{q.header}:</Text>
                            <Text style={styles.submittedValue}>{labels.join(', ') || '-'}</Text>
                        </View>
                    );
                })}
            </View>
        );
    }

    const hasTabs = questions.length > 1;

    const renderQuestion = (question: Question, qIndex: number) => {
        const selectedOptions = form.selections.get(qIndex) || new Set();

        return (
            <View key={qIndex} style={styles.questionSection}>
                {!hasTabs && (
                    <View style={styles.headerChip}>
                        <Text style={styles.headerText}>{question.header}</Text>
                    </View>
                )}
                <Text style={styles.questionText}>{question.question}</Text>
                <View style={styles.optionsContainer}>
                    {question.options.map((option, oIndex) => {
                        const isSelected = selectedOptions.has(oIndex);
                        return (
                            <TouchableOpacity
                                key={oIndex}
                                style={[
                                    styles.optionButton,
                                    isSelected && styles.optionButtonSelected,
                                    !form.canInteract && styles.optionButtonDisabled,
                                ]}
                                onPress={() => form.handleOptionToggle(qIndex, oIndex, question.multiSelect)}
                                disabled={!form.canInteract}
                                activeOpacity={0.7}
                            >
                                {question.multiSelect ? (
                                    <View style={[
                                        styles.checkboxOuter,
                                        isSelected && styles.checkboxOuterSelected,
                                    ]}>
                                        {isSelected && (
                                            <Ionicons name="checkmark" size={14} color="#fff" />
                                        )}
                                    </View>
                                ) : (
                                    <View style={[
                                        styles.radioOuter,
                                        isSelected && styles.radioOuterSelected,
                                    ]}>
                                        {isSelected && <View style={styles.radioInner} />}
                                    </View>
                                )}
                                <View style={styles.optionContent}>
                                    <Text style={styles.optionLabel}>{option.label}</Text>
                                    {option.description && (
                                        <Text style={styles.optionDescription}>{option.description}</Text>
                                    )}
                                </View>
                            </TouchableOpacity>
                        );
                    })}

                    {/* "Other" free-text option */}
                    {(() => {
                        const isOtherSelected = selectedOptions.has(OTHER_INDEX);
                        return (
                            <>
                                <TouchableOpacity
                                    style={[
                                        styles.optionButton,
                                        isOtherSelected && styles.optionButtonSelected,
                                        !form.canInteract && styles.optionButtonDisabled,
                                    ]}
                                    onPress={() => form.handleOptionToggle(qIndex, OTHER_INDEX, question.multiSelect)}
                                    disabled={!form.canInteract}
                                    activeOpacity={0.7}
                                >
                                    {question.multiSelect ? (
                                        <View style={[
                                            styles.checkboxOuter,
                                            isOtherSelected && styles.checkboxOuterSelected,
                                        ]}>
                                            {isOtherSelected && (
                                                <Ionicons name="checkmark" size={14} color="#fff" />
                                            )}
                                        </View>
                                    ) : (
                                        <View style={[
                                            styles.radioOuter,
                                            isOtherSelected && styles.radioOuterSelected,
                                        ]}>
                                            {isOtherSelected && <View style={styles.radioInner} />}
                                        </View>
                                    )}
                                    <View style={styles.optionContent}>
                                        <Text style={styles.optionLabel}>{t('tools.askUserQuestion.other')}</Text>
                                        <Text style={styles.optionDescription}>{t('tools.askUserQuestion.otherDescription')}</Text>
                                    </View>
                                </TouchableOpacity>
                                {isOtherSelected && form.canInteract && (
                                    <TextInput
                                        style={[styles.otherInput, { color: theme.colors.text }]}
                                        placeholder={t('tools.askUserQuestion.otherPlaceholder')}
                                        placeholderTextColor={theme.colors.textSecondary}
                                        value={form.otherTexts.get(qIndex) || ''}
                                        onChangeText={(text) => form.handleOtherTextChange(qIndex, text)}
                                        editable={form.canInteract}
                                        multiline
                                    />
                                )}
                            </>
                        );
                    })()}
                </View>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={true}
                nestedScrollEnabled={true}
                keyboardShouldPersistTaps="handled"
            >
                {hasTabs && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View style={styles.tabStrip}>
                            {questions.map((q, qIndex) => {
                                const isActive = form.activeTab === qIndex;
                                const answered = form.isQuestionAnswered(qIndex);
                                return (
                                    <TouchableOpacity
                                        key={qIndex}
                                        style={[styles.tab, isActive && styles.tabActive]}
                                        onPress={() => form.setActiveTab(qIndex)}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                                            {q.header}
                                        </Text>
                                        {answered && (
                                            <View style={styles.tabCheckmark}>
                                                <Ionicons name="checkmark" size={10} color="#fff" />
                                            </View>
                                        )}
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </ScrollView>
                )}

                {hasTabs
                    ? renderQuestion(questions[form.activeTab], form.activeTab)
                    : questions.map((question, qIndex) => renderQuestion(question, qIndex))
                }
            </ScrollView>

            {/* Action buttons */}
            {form.canInteract && (
                <View style={styles.actionsContainer}>
                    <TouchableOpacity
                        style={styles.cancelButton}
                        onPress={handleCancel}
                        disabled={isCanceling || form.isSubmitting}
                        activeOpacity={0.7}
                    >
                        {isCanceling ? (
                            <ActivityIndicator size="small" color={theme.colors.permissionButton.deny.background} />
                        ) : (
                            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[
                            styles.submitButton,
                            (!form.allQuestionsAnswered || form.isSubmitting) && styles.submitButtonDisabled,
                        ]}
                        onPress={form.handleSubmit}
                        disabled={!form.allQuestionsAnswered || form.isSubmitting}
                        activeOpacity={0.7}
                    >
                        {form.isSubmitting ? (
                            <ActivityIndicator size="small" color={theme.colors.button.primary.tint} />
                        ) : (
                            <Text style={styles.submitButtonText}>{t('tools.askUserQuestion.submit')}</Text>
                        )}
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    container: {
        borderTopWidth: 1,
        borderColor: theme.colors.divider,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 16,
    },
    questionSection: {
        gap: 8,
    },
    headerChip: {
        alignSelf: 'flex-start',
        backgroundColor: theme.colors.surfaceHighest,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
        marginBottom: 4,
    },
    headerText: {
        fontSize: 12,
        fontWeight: '600',
        color: theme.colors.textSecondary,
        textTransform: 'uppercase',
    },
    questionText: {
        fontSize: 15,
        fontWeight: '500',
        color: theme.colors.text,
        marginBottom: 8,
    },
    optionsContainer: {
        gap: 4,
    },
    optionButton: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderRadius: 8,
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: theme.colors.divider,
        gap: 10,
        minHeight: 44,
    },
    optionButtonSelected: {
        backgroundColor: theme.colors.surfaceHighest,
        borderColor: theme.colors.radio.active,
    },
    optionButtonDisabled: {
        opacity: 0.6,
    },
    radioOuter: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: theme.colors.textSecondary,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 2,
    },
    radioOuterSelected: {
        borderColor: theme.colors.radio.active,
    },
    radioInner: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: theme.colors.radio.dot,
    },
    checkboxOuter: {
        width: 20,
        height: 20,
        borderRadius: 4,
        borderWidth: 2,
        borderColor: theme.colors.textSecondary,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 2,
    },
    checkboxOuterSelected: {
        borderColor: theme.colors.radio.active,
        backgroundColor: theme.colors.radio.active,
    },
    optionContent: {
        flex: 1,
    },
    optionLabel: {
        fontSize: 14,
        fontWeight: '500',
        color: theme.colors.text,
    },
    optionDescription: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        marginTop: 2,
    },
    otherInput: {
        borderWidth: 1,
        borderColor: theme.colors.divider,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 14,
        backgroundColor: theme.colors.surface,
        marginTop: 8,
        minHeight: 40,
    },
    tabStrip: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.divider,
        marginBottom: 12,
    },
    tab: {
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    tabActive: {
        borderBottomColor: theme.colors.radio.active,
    },
    tabText: {
        fontSize: 13,
        fontWeight: '500',
        color: theme.colors.textSecondary,
        textTransform: 'uppercase',
    },
    tabTextActive: {
        color: theme.colors.text,
        fontWeight: '600',
    },
    tabCheckmark: {
        width: 14,
        height: 14,
        borderRadius: 7,
        backgroundColor: theme.colors.radio.active,
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionsContainer: {
        flexDirection: 'row',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        justifyContent: 'flex-end',
        borderTopWidth: 1,
        borderTopColor: theme.colors.divider,
    },
    cancelButton: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 8,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cancelText: {
        fontSize: 14,
        fontWeight: '500',
        color: theme.colors.permissionButton.deny.background,
    },
    submitButton: {
        backgroundColor: theme.colors.button.primary.background,
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        minHeight: 44,
    },
    submitButtonDisabled: {
        opacity: 0.5,
    },
    submitButtonText: {
        color: theme.colors.button.primary.tint,
        fontSize: 14,
        fontWeight: '600',
    },
    submittedContainer: {
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    submittedItem: {
        flexDirection: 'row',
        gap: 8,
    },
    submittedHeader: {
        fontSize: 13,
        fontWeight: '600',
        color: theme.colors.textSecondary,
    },
    submittedValue: {
        fontSize: 13,
        color: theme.colors.text,
        flex: 1,
    },
}));

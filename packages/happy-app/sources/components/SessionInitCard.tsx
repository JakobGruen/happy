import React from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Ionicons } from '@expo/vector-icons';
import { Typography } from '@/constants/Typography';

/**
 * Reusable card component for displaying selectable options in SessionInitPanel.
 * Used for Session Type, Model, Permission Mode, and Machine/Directory selections.
 */

export interface SessionInitCardOption {
    id: string;
    label: string;
    description: string;
    icon: React.ComponentProps<typeof Ionicons>['name'];
    isSelected?: boolean;
    badge?: string; // e.g., "Recommended"
}

interface SessionInitCardProps {
    title: string;
    description?: string;
    options: SessionInitCardOption[];
    onSelectOption: (optionId: string) => void;
    layout?: 'vertical' | 'horizontal'; // vertical = stacked, horizontal = side-by-side
}

export const SessionInitCard = React.memo<SessionInitCardProps>(({
    title,
    description,
    options,
    onSelectOption,
    layout = 'vertical',
}) => {
    const { theme } = useUnistyles();
    const styles = stylesheet;

    const isHorizontal = layout === 'horizontal';

    return (
        <View style={styles.cardContainer}>
            <View style={styles.header}>
                <Text style={styles.title}>{title}</Text>
                {description && (
                    <Text style={styles.description}>{description}</Text>
                )}
            </View>

            <View style={[
                styles.optionsContainer,
                isHorizontal && styles.optionsContainerHorizontal
            ]}>
                {options.map((option, index) => (
                    <Pressable
                        key={option.id}
                        onPress={() => onSelectOption(option.id)}
                        style={({ pressed }) => [
                            styles.option,
                            option.isSelected && styles.optionSelected,
                            pressed && styles.optionPressed,
                            isHorizontal && styles.optionHorizontal,
                            index > 0 && !isHorizontal && styles.optionDivider,
                        ]}
                    >
                        <View style={styles.optionContent}>
                            <View style={styles.optionIconAndLabel}>
                                <Ionicons
                                    name={option.icon}
                                    size={20}
                                    color={option.isSelected ? theme.colors.button.primary.background : theme.colors.textSecondary}
                                    style={styles.optionIcon}
                                />
                                <View style={{ flex: 1 }}>
                                    <Text style={[
                                        styles.optionLabel,
                                        option.isSelected && styles.optionLabelSelected,
                                    ]}>
                                        {option.label}
                                    </Text>
                                    {option.description && (
                                        <Text style={styles.optionDescription}>
                                            {option.description}
                                        </Text>
                                    )}
                                </View>
                                {option.badge && (
                                    <View style={styles.badge}>
                                        <Text style={styles.badgeText}>{option.badge}</Text>
                                    </View>
                                )}
                            </View>
                        </View>

                        {option.isSelected && (
                            <View style={styles.checkmark}>
                                <Ionicons
                                    name="checkmark-circle"
                                    size={24}
                                    color={theme.colors.button.primary.background}
                                />
                            </View>
                        )}
                    </Pressable>
                ))}
            </View>
        </View>
    );
});

SessionInitCard.displayName = 'SessionInitCard';

const stylesheet = StyleSheet.create((theme) => ({
    cardContainer: {
        backgroundColor: theme.colors.surface,
        borderRadius: Platform.select({ ios: 10, default: 16 }),
        marginHorizontal: 16,
        marginVertical: 8,
        overflow: 'hidden',
        shadowColor: theme.colors.shadow.color,
        shadowOffset: { width: 0, height: 0.33 },
        shadowOpacity: theme.colors.shadow.opacity,
        shadowRadius: 0,
        elevation: 1,
    },
    header: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.divider,
    },
    title: {
        fontSize: 16,
        fontWeight: '600',
        color: theme.colors.text,
        ...Typography.default('semiBold'),
        marginBottom: 4,
    },
    description: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        ...Typography.default('regular'),
    },
    optionsContainer: {
        flexDirection: 'column',
    },
    optionsContainerHorizontal: {
        flexDirection: 'row',
    },
    option: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        minHeight: 60,
    },
    optionHorizontal: {
        flex: 1,
        justifyContent: 'center',
        paddingVertical: 16,
    },
    optionDivider: {
        borderTopWidth: 1,
        borderTopColor: theme.colors.divider,
    },
    optionPressed: {
        backgroundColor: theme.colors.surfacePressed,
    },
    optionSelected: {
        backgroundColor: `${theme.colors.button.primary.background}08`,
    },
    optionContent: {
        flex: 1,
    },
    optionIconAndLabel: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    optionIcon: {
        marginRight: 4,
    },
    optionLabel: {
        fontSize: 15,
        fontWeight: '500',
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    optionLabelSelected: {
        color: theme.colors.button.primary.background,
        fontWeight: '600',
    },
    optionDescription: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        marginTop: 2,
        ...Typography.default('regular'),
    },
    badge: {
        backgroundColor: theme.colors.button.primary.background,
        borderRadius: 4,
        paddingHorizontal: 6,
        paddingVertical: 2,
        marginLeft: 8,
    },
    badgeText: {
        fontSize: 10,
        fontWeight: '600',
        color: '#FFFFFF',
        ...Typography.default('semiBold'),
    },
    checkmark: {
        marginLeft: 8,
    },
}));
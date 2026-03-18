import * as React from 'react';
import { Pressable, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography } from '@/constants/Typography';
import { t } from '@/text';
import type { PillPhase } from './useTodoPillState';

interface TodoPillProps {
    completed: number;
    total: number;
    phase: PillPhase;
    onPress: () => void;
}

export const TodoPill = React.memo<TodoPillProps>(({ completed, total, phase, onPress }) => {
    const isHidden = phase === 'hidden';
    const isComplete = phase === 'allComplete';
    const pillColor = isHidden ? 'rgba(255, 255, 255, 0.06)'
        : isComplete ? 'rgba(76, 217, 100, 0.12)'
        : 'rgba(0, 122, 255, 0.12)';
    const textColor = isHidden ? 'rgba(255, 255, 255, 0.25)'
        : isComplete ? '#4cd964'
        : '#007AFF';

    return (
        <Pressable
            onPress={isHidden ? undefined : onPress}
            accessibilityLabel={t('session.todoPill.accessibility', { completed, total })}
            accessibilityRole="button"
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 3,
                backgroundColor: pillColor,
                paddingHorizontal: 7,
                paddingVertical: 2,
                borderRadius: 6,
            }}
        >
            <Ionicons name="bulb-outline" size={10} color={textColor} />
            <Text style={{ fontSize: 10, color: textColor, ...Typography.default() }}>
                {isHidden ? '–' : `${completed}/${total}${isComplete ? ' ✓' : ''}`}
            </Text>
        </Pressable>
    );
});

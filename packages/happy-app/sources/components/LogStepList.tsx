// LogStepList.tsx
import * as React from 'react';
import { View, Text, FlatList } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { t } from '@/text';
import type { Metadata } from '@/sync/storageTypes';

type LogStep = NonNullable<Metadata['logSteps']>[string] & { key: string };

interface LogStepListProps {
    metadata: Metadata | null;
}

function parseLogSteps(metadata: Metadata | null): LogStep[] {
    const logSteps = metadata?.logSteps;
    if (!logSteps) return [];

    return Object.entries(logSteps)
        .map(([key, step]) => ({ key, ...step }))
        .sort((a, b) => Number(a.key) - Number(b.key));
}

function formatRelativeTime(timestamp: number): string {
    const diffMs = Date.now() - timestamp;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return t('logSteps.justNow');
    if (diffMin < 60) return t('logSteps.minutesAgo', { count: diffMin });
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return t('logSteps.hoursAgo', { count: diffHours });
    return t('logSteps.daysAgo', { count: Math.floor(diffHours / 24) });
}

const LogStepItem = React.memo(function LogStepItem({ step }: { step: LogStep }) {
    const { theme } = useUnistyles();

    const summaryLines = step.summary
        .split('\n')
        .map((line) => line.replace(/^[-•*]\s*/, '').trim())
        .filter(Boolean);

    return (
        <View style={styles.turnGroup}>
            <View style={styles.turnHeader}>
                <View style={[styles.turnNumber, { backgroundColor: theme.colors.surfaceHighest }]}>
                    <Text style={[styles.turnNumberText, { color: theme.colors.textSecondary }]}>
                        {step.key}
                    </Text>
                </View>
                <Text style={[styles.turnTitle, { color: theme.colors.text }]} numberOfLines={1}>
                    {step.title}
                </Text>
                <Text style={[styles.turnTime, { color: theme.colors.textSecondary }]}>
                    {formatRelativeTime(step.createdAt)}
                </Text>
            </View>

            {summaryLines.length > 0 && (
                <View style={styles.turnSummary}>
                    {summaryLines.map((line, i) => (
                        <View key={i} style={styles.bulletRow}>
                            <View style={[styles.bulletDot, { backgroundColor: theme.colors.textSecondary }]} />
                            <Text style={[styles.bulletText, { color: theme.colors.textSecondary }]}>
                                {line}
                            </Text>
                        </View>
                    ))}
                </View>
            )}

            {step.stats && <StatsRow stats={step.stats} />}
        </View>
    );
});

const StatsRow = React.memo(function StatsRow({ stats }: { stats: NonNullable<LogStep['stats']> }) {
    const { theme } = useUnistyles();
    const items: { label: string; color: string }[] = [];

    if (stats.linesAdded) items.push({ label: `+${stats.linesAdded}`, color: theme.colors.success });
    if (stats.linesRemoved) items.push({ label: `-${stats.linesRemoved}`, color: theme.colors.textDestructive });
    if (stats.filesChanged) items.push({ label: `${stats.filesChanged} files`, color: theme.colors.textLink });
    if (stats.filesCreated) items.push({ label: `${stats.filesCreated} created`, color: theme.colors.success });
    if (stats.filesDeleted) items.push({ label: `${stats.filesDeleted} deleted`, color: theme.colors.textDestructive });
    if (stats.testsPassed) items.push({ label: `✓ ${stats.testsPassed} tests`, color: theme.colors.success });
    if (stats.testsFailed) items.push({ label: `✗ ${stats.testsFailed} failed`, color: theme.colors.textDestructive });

    if (items.length === 0) return null;

    return (
        <View style={styles.statsRow}>
            {items.map((item, i) => (
                <Text key={i} style={[styles.statText, { color: item.color }]}>
                    {item.label}
                </Text>
            ))}
        </View>
    );
});

export const LogStepList = React.memo(function LogStepList({ metadata }: LogStepListProps) {
    const { theme } = useUnistyles();
    const steps = React.useMemo(() => parseLogSteps(metadata), [metadata]);
    const listRef = React.useRef<FlatList>(null);
    const prevCount = React.useRef(steps.length);

    React.useEffect(() => {
        if (steps.length > prevCount.current) {
            listRef.current?.scrollToEnd({ animated: true });
        }
        prevCount.current = steps.length;
    }, [steps.length]);

    if (steps.length === 0) {
        return (
            <View style={styles.emptyContainer}>
                <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>
                    {t('logSteps.empty')}
                </Text>
            </View>
        );
    }

    return (
        <FlatList
            ref={listRef}
            data={steps}
            keyExtractor={(item) => item.key}
            renderItem={({ item }) => <LogStepItem step={item} />}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
        />
    );
});

const styles = StyleSheet.create((theme) => ({
    listContent: {
        padding: 16,
        gap: 2,
    },
    turnGroup: {
        marginBottom: 8,
    },
    turnHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 4,
    },
    turnNumber: {
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    turnNumberText: {
        fontSize: 10,
        fontWeight: '600',
    },
    turnTitle: {
        fontSize: 16,
        fontWeight: '600',
        flex: 1,
    },
    turnTime: {
        fontSize: 12,
    },
    turnSummary: {
        paddingLeft: 30,
        gap: 2,
    },
    bulletRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
    },
    bulletDot: {
        width: 4,
        height: 4,
        borderRadius: 2,
        marginTop: 6,
        flexShrink: 0,
    },
    bulletText: {
        fontSize: 14,
        lineHeight: 20,
        flex: 1,
    },
    statsRow: {
        flexDirection: 'row',
        gap: 12,
        paddingLeft: 30,
        marginTop: 4,
    },
    statText: {
        fontSize: 13,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
    },
    emptyText: {
        fontSize: 14,
    },
}));

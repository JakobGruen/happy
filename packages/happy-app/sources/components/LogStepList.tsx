// LogStepList.tsx
import * as React from 'react';
import { View, Text, FlatList } from 'react-native';
import Animated, { useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated';
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

const LogStepItem = React.memo(function LogStepItem({
    step,
    isLast,
}: {
    step: LogStep;
    isLast: boolean;
}) {
    const { theme } = useUnistyles();

    const summaryLines = step.summary
        .split('\n')
        .map((line) => line.replace(/^[-•*]\s*/, '').trim())
        .filter(Boolean);

    return (
        <View style={styles.turnGroup}>
            <View style={styles.turnRow}>
                {/* Timeline column: number + vertical line */}
                <View style={styles.timelineCol}>
                    <View style={[styles.turnNumber, { backgroundColor: theme.colors.surfaceHighest }]}>
                        <Text style={[styles.turnNumberText, { color: theme.colors.textSecondary }]}>
                            {step.key}
                        </Text>
                    </View>
                    {!isLast && (
                        <View
                            style={[
                                styles.timelineLine,
                                { backgroundColor: theme.colors.surfaceHighest },
                            ]}
                        />
                    )}
                </View>

                {/* Content column */}
                <View style={styles.contentCol}>
                    <View style={styles.turnHeader}>
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
                                    <View
                                        style={[
                                            styles.bulletDot,
                                            { backgroundColor: theme.colors.textSecondary },
                                        ]}
                                    />
                                    <Text style={[styles.bulletText, { color: theme.colors.textSecondary }]}>
                                        {line}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    )}

                    {step.stats && <StatsRow stats={step.stats} />}
                </View>
            </View>
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

const StatusItem = React.memo(function StatusItem({ status }: { status: string }) {
    const { theme } = useUnistyles();

    const pulseStyle = useAnimatedStyle(() => ({
        opacity: withRepeat(
            withTiming(0.35, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
            -1,
            true,
        ),
    }));

    return (
        <View style={styles.turnGroup}>
            <View style={styles.turnRow}>
                <View style={styles.timelineCol}>
                    <Animated.View
                        style={[
                            styles.turnNumber,
                            { backgroundColor: theme.colors.textLink },
                            pulseStyle,
                        ]}
                    />
                </View>
                <View style={styles.contentCol}>
                    <View style={styles.turnHeader}>
                        <Text
                            style={[styles.statusText, { color: theme.colors.textSecondary }]}
                            numberOfLines={1}
                        >
                            {status}
                        </Text>
                    </View>
                </View>
            </View>
        </View>
    );
});

export const LogStepList = React.memo(function LogStepList({ metadata }: LogStepListProps) {
    const { theme } = useUnistyles();
    const steps = React.useMemo(() => parseLogSteps(metadata), [metadata]);
    const currentStatus = metadata?.currentStatus ?? null;
    const listRef = React.useRef<FlatList>(null);
    const prevCount = React.useRef(steps.length);
    const prevStatus = React.useRef(currentStatus);

    React.useEffect(() => {
        if (steps.length > prevCount.current || currentStatus !== prevStatus.current) {
            listRef.current?.scrollToEnd({ animated: true });
        }
        prevCount.current = steps.length;
        prevStatus.current = currentStatus;
    }, [steps.length, currentStatus]);

    if (steps.length === 0 && !currentStatus) {
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
            renderItem={({ item, index }) => (
                <LogStepItem step={item} isLast={index === steps.length - 1 && !currentStatus} />
            )}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            ListFooterComponent={currentStatus ? <StatusItem status={currentStatus} /> : null}
        />
    );
});

const CIRCLE_SIZE = 32;

const styles = StyleSheet.create((theme) => ({
    listContent: {
        padding: 16,
    },
    turnGroup: {},
    turnRow: {
        flexDirection: 'row',
    },
    timelineCol: {
        width: CIRCLE_SIZE,
        alignItems: 'center',
        marginRight: 12,
    },
    turnNumber: {
        width: CIRCLE_SIZE,
        height: CIRCLE_SIZE,
        borderRadius: CIRCLE_SIZE / 2,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    turnNumberText: {
        fontSize: 14,
        fontWeight: '700',
    },
    timelineLine: {
        width: 2,
        flex: 1,
        marginVertical: 4,
        borderRadius: 1,
    },
    contentCol: {
        flex: 1,
        paddingBottom: 16,
    },
    turnHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        minHeight: CIRCLE_SIZE,
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
        marginTop: 4,
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
        marginTop: 4,
    },
    statText: {
        fontSize: 12,
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
    statusText: {
        fontSize: 15,
        fontStyle: 'italic',
    },
}));

import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Text } from '@/components/StyledText';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';
import { usePendingPermissionQueue } from '@/sync/storage';
import { getSessionName } from '@/utils/sessionUtils';
import { usePermissionActions } from '@/hooks/usePermissionActions';
import { buildSyntheticToolCall, buildPermissionItem } from '@/components/tools/permissionBannerUtils';
import { ToolModal } from '@/components/tools/modal/ToolModal';
import { t } from '@/text';

/**
 * Extracts a one-line preview from tool input for the banner subtitle.
 * Finds the first non-empty string value in the input object.
 */
function getInputPreview(toolInput: any): string | null {
    if (!toolInput || typeof toolInput !== 'object') return null;
    for (const value of Object.values(toolInput)) {
        if (typeof value === 'string' && value.length > 0) {
            // Take first line only, truncate long values
            const firstLine = value.split('\n')[0];
            return firstLine.length > 80 ? firstLine.substring(0, 80) + '…' : firstLine;
        }
    }
    return null;
}

/**
 * Global floating banner that shows pending permission requests from sessions
 * the user is NOT currently viewing. Displays a minimal amber chip with shield icon,
 * session name, tool description, and input preview. Tapping opens the unified
 * ToolModal with full permission details and action bar.
 *
 * Mounted in _layout.tsx — visible on all screens.
 */
export const PermissionBanner = React.memo(() => {
    const queue = usePendingPermissionQueue();
    const [modalVisible, setModalVisible] = React.useState(false);

    const current = queue.length > 0 ? queue[0] : null;
    const currentPermId = current?.permissionId ?? null;

    // Auto-dismiss modal when current permission changes (resolved or next in queue)
    React.useEffect(() => {
        setModalVisible(false);
    }, [currentPermId]);

    // All hooks must be called before any early return to satisfy React rules of hooks
    const syntheticTool = React.useMemo(
        () => current ? buildSyntheticToolCall(current) : null,
        [currentPermId],
    );
    const permissionItem = React.useMemo(
        () => current ? buildPermissionItem(current) : null,
        [currentPermId],
    );

    if (!current || !syntheticTool || !permissionItem) return null;

    const sessionName = getSessionName(current.session);
    const toolDescription = current.description ?? current.llmSummary ?? current.tool;
    const inputPreview = getInputPreview(current.toolInput);
    const remaining = queue.length - 1;
    const isAskUserQuestion = current.tool === 'AskUserQuestion';

    return (
        <>
            <Animated.View
                key={current.permissionId}
                entering={FadeIn.duration(200)}
                exiting={FadeOut.duration(150)}
                style={styles.container}
            >
                <TouchableOpacity
                    style={styles.banner}
                    onPress={() => setModalVisible(true)}
                    activeOpacity={0.7}
                >
                    <View style={styles.iconContainer}>
                        <Ionicons
                            name="shield-outline"
                            size={18}
                            style={styles.icon}
                        />
                    </View>
                    <View style={styles.textArea}>
                        <Text style={styles.sessionName} numberOfLines={1}>
                            {sessionName}
                        </Text>
                        <Text style={styles.toolDescription} numberOfLines={1}>
                            {toolDescription}
                        </Text>
                        {inputPreview && (
                            <Text style={styles.inputPreview} numberOfLines={1}>
                                {inputPreview}
                            </Text>
                        )}
                        {remaining > 0 && (
                            <Text style={styles.moreCount}>
                                {t('notifications.morePermissions', { count: remaining })}
                            </Text>
                        )}
                    </View>
                </TouchableOpacity>
            </Animated.View>

            {modalVisible && (
                <BannerModal
                    current={current}
                    syntheticTool={syntheticTool}
                    permissionItem={permissionItem}
                    isAskUserQuestion={isAskUserQuestion}
                    queueCount={queue.length}
                    onClose={() => setModalVisible(false)}
                />
            )}
        </>
    );
});

/**
 * Extracted modal wrapper to isolate usePermissionActions hook call.
 * Only rendered when modalVisible is true, so the hook always has valid data.
 */
const BannerModal = React.memo<{
    current: NonNullable<ReturnType<typeof usePendingPermissionQueue>[number]>;
    syntheticTool: ReturnType<typeof buildSyntheticToolCall>;
    permissionItem: ReturnType<typeof buildPermissionItem>;
    isAskUserQuestion: boolean;
    queueCount: number;
    onClose: () => void;
}>(({ current, syntheticTool, permissionItem, isAskUserQuestion, queueCount, onClose }) => {
    const actions = usePermissionActions(
        current.sessionId,
        current.permissionId,
        current.tool,
        current.toolInput,
        true,
    );

    return (
        <ToolModal
            visible={true}
            tool={syntheticTool}
            metadata={null}
            onClose={onClose}
            hideOutput={true}
            sessionId={current.sessionId}
            permission={permissionItem}
            permissionActions={isAskUserQuestion ? null : actions}
            queueCount={queueCount}
        />
    );
});

const styles = StyleSheet.create((theme) => ({
    container: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        paddingHorizontal: 12,
        paddingTop: 8,
    },
    banner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.surfaceHigh,
        borderRadius: 12,
        paddingVertical: 10,
        paddingHorizontal: 12,
        shadowColor: theme.colors.shadow.color,
        shadowOffset: { width: 0, height: 3 },
        shadowRadius: 12,
        shadowOpacity: theme.dark ? 0.4 : 0.15,
        elevation: 8,
        borderWidth: 1,
        borderColor: theme.colors.box.warning.border,
    },
    iconContainer: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: theme.colors.box.warning.border + '20',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
    },
    icon: {
        color: theme.colors.box.warning.border,
    },
    textArea: {
        flex: 1,
    },
    sessionName: {
        fontSize: 13,
        fontWeight: '600',
        color: theme.colors.text,
    },
    toolDescription: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        marginTop: 1,
    },
    inputPreview: {
        fontSize: 11,
        color: theme.colors.textSecondary,
        marginTop: 2,
        fontFamily: 'monospace',
        opacity: 0.7,
    },
    moreCount: {
        fontSize: 11,
        color: theme.colors.textSecondary,
        marginTop: 2,
    },
}));

import React from 'react';
import { ScrollView, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { MarkdownView } from '@/components/markdown/MarkdownView';
import { knownTools } from '@/components/tools/knownTools';
import { CurrentSessionPermissionItem } from '@/hooks/useCurrentSessionPermissions';

interface PlanSheetContentProps {
    permission: CurrentSessionPermissionItem;
}

/**
 * Renders plan markdown inside the permission sheet.
 * Action buttons are handled by the parent PermissionSheetExpanded
 * which renders CC's dynamic suggestion buttons (approve + accept all, etc.).
 */
export const PlanSheetContent = React.memo<PlanSheetContentProps>(({ permission }) => {
    let plan = '<empty>';
    const parsed = knownTools.ExitPlanMode.input.safeParse(permission.toolInput);
    if (parsed.success) {
        plan = parsed.data.plan ?? '<empty>';
    }

    return (
        <View style={styles.container}>
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={true}
                nestedScrollEnabled={true}
            >
                <MarkdownView markdown={plan} />
            </ScrollView>
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: theme.colors.divider,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
}));

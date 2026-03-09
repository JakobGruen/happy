import React, { memo } from 'react';
import { View, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { ItemList } from '@/components/ItemList';
import { Text } from '@/components/StyledText';
import { useSettingMutable, useLocalSettingMutable } from '@/sync/storage';
import { useUnistyles } from 'react-native-unistyles';
import { StyleSheet } from 'react-native-unistyles';
import { findLanguageByCode, getLanguageDisplayName, LANGUAGES } from '@/constants/Languages';
import { t } from '@/text';

export default memo(function VoiceSettingsScreen() {
    const { theme } = useUnistyles();
    const router = useRouter();
    const [voiceAssistantLanguage] = useSettingMutable('voiceAssistantLanguage');
    const [pipecatUrl, setPipecatUrl] = useLocalSettingMutable('pipecatUrl');
    const [pipecatAuthSecret, setPipecatAuthSecret] = useLocalSettingMutable('pipecatAuthSecret');

    const currentLanguage = findLanguageByCode(voiceAssistantLanguage) || LANGUAGES[0];

    return (
        <ItemList style={{ paddingTop: 0 }}>
            {/* Language Settings */}
            <ItemGroup
                title={t('settingsVoice.languageTitle')}
                footer={t('settingsVoice.languageDescription')}
            >
                <Item
                    title={t('settingsVoice.preferredLanguage')}
                    subtitle={t('settingsVoice.preferredLanguageSubtitle')}
                    icon={<Ionicons name="language-outline" size={29} color="#007AFF" />}
                    detail={getLanguageDisplayName(currentLanguage)}
                    onPress={() => router.push('/settings/voice/language')}
                />
            </ItemGroup>

            {/* Pipecat Server */}
            <ItemGroup
                title="Pipecat Server"
                footer="Enter the URL of your self-hosted Pipecat voice agent. Leave empty to use the server-configured URL."
            >
                <View style={styles.credentialsForm}>
                    <Text style={[styles.inputLabel, { color: theme.colors.textSecondary }]}>Server URL</Text>
                    <TextInput
                        style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.textSecondary, backgroundColor: theme.colors.surface }]}
                        value={pipecatUrl}
                        onChangeText={setPipecatUrl}
                        placeholder="http://localhost:8765"
                        placeholderTextColor={theme.colors.textSecondary}
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="url"
                    />
                    <Text style={[styles.inputLabel, { color: theme.colors.textSecondary }]}>Access Secret</Text>
                    <TextInput
                        style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.textSecondary, backgroundColor: theme.colors.surface }]}
                        value={pipecatAuthSecret}
                        onChangeText={setPipecatAuthSecret}
                        placeholder="Optional"
                        placeholderTextColor={theme.colors.textSecondary}
                        autoCapitalize="none"
                        autoCorrect={false}
                        secureTextEntry={true}
                    />
                </View>
            </ItemGroup>
        </ItemList>
    );
});

const styles = StyleSheet.create((theme) => ({
    credentialsForm: {
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 4,
    },
    inputLabel: {
        fontSize: 13,
        fontWeight: '500',
        marginBottom: 4,
        marginTop: 8,
    },
    input: {
        fontSize: 15,
        borderWidth: 1,
        borderRadius: 8,
        padding: 10,
        marginBottom: 4,
    },
}));
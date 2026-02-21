import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { ItemList } from '@/components/ItemList';
import { useSettingMutable, useLocalSettingMutable } from '@/sync/storage';
import { useUnistyles } from 'react-native-unistyles';
import { findLanguageByCode, getLanguageDisplayName, LANGUAGES } from '@/constants/Languages';
import { Modal } from '@/modal';
import { t } from '@/text';

export default function VoiceSettingsScreen() {
    const { theme } = useUnistyles();
    const router = useRouter();
    const [voiceAssistantLanguage] = useSettingMutable('voiceAssistantLanguage');
    const [voiceBackend, setVoiceBackend] = useSettingMutable('voiceBackend');
    const [anthropicApiKey, setAnthropicApiKey] = useLocalSettingMutable('anthropicVoiceApiKey');

    // Find current language or default to first option
    const currentLanguage = findLanguageByCode(voiceAssistantLanguage) || LANGUAGES[0];

    const toggleBackend = () => {
        setVoiceBackend(voiceBackend === 'elevenlabs' ? 'anthropic' : 'elevenlabs');
    };

    const promptApiKey = async () => {
        const value = await Modal.prompt(
            t('settingsVoice.apiKeyTitle'),
            t('settingsVoice.apiKeyMessage'),
            {
                defaultValue: anthropicApiKey ?? '',
                confirmText: t('settingsVoice.apiKeySetAction'),
            },
        );
        if (value?.trim()) {
            setAnthropicApiKey(value.trim());
        }
    };

    return (
        <ItemList style={{ paddingTop: 0 }}>
            {/* Voice Backend Toggle */}
            <ItemGroup
                title={t('settingsVoice.backendTitle')}
                footer={t('settingsVoice.backendDescription')}
            >
                <Item
                    title={t('settingsVoice.voiceBackend')}
                    subtitle={t('settingsVoice.voiceBackendSubtitle')}
                    icon={<Ionicons name="swap-horizontal-outline" size={29} color="#007AFF" />}
                    detail={voiceBackend === 'elevenlabs' ? 'ElevenLabs' : 'Anthropic'}
                    onPress={toggleBackend}
                />
            </ItemGroup>

            {/* Anthropic API Key (only shown when anthropic backend selected) */}
            {voiceBackend === 'anthropic' && (
                <ItemGroup
                    title={t('settingsVoice.anthropicTitle')}
                    footer={t('settingsVoice.anthropicDescription')}
                >
                    <Item
                        title={t('settingsVoice.apiKey')}
                        subtitle={anthropicApiKey ? t('settingsVoice.apiKeyConfigured') : t('settingsVoice.apiKeyNotConfigured')}
                        icon={<Ionicons name="key-outline" size={29} color={anthropicApiKey ? '#34C759' : '#FF9500'} />}
                        onPress={promptApiKey}
                    />
                </ItemGroup>
            )}

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

        </ItemList>
    );
}

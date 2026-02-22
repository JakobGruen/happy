import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { ItemList } from '@/components/ItemList';
import { useSettingMutable, useLocalSetting, useLocalSettingMutable } from '@/sync/storage';
import { useUnistyles } from 'react-native-unistyles';
import { findLanguageByCode, getLanguageDisplayName, LANGUAGES } from '@/constants/Languages';
import { t } from '@/text';

export default function VoiceSettingsScreen() {
    const { theme } = useUnistyles();
    const router = useRouter();
    const [voiceAssistantLanguage] = useSettingMutable('voiceAssistantLanguage');
    const devModeEnabled = useLocalSetting('devModeEnabled');
    const [voiceBackend, setVoiceBackend] = useLocalSettingMutable('voiceBackend');

    // Find current language or default to first option
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

            {/* Voice Backend (dev only) */}
            {devModeEnabled && (
                <ItemGroup
                    title="Voice Backend"
                    footer="Switch between ElevenLabs (cloud) and LiveKit (self-hosted) voice pipelines. Requires app restart."
                >
                    <Item
                        title="ElevenLabs"
                        subtitle="Cloud-hosted voice pipeline"
                        icon={<Ionicons name="cloud-outline" size={29} color="#5856D6" />}
                        detail={voiceBackend === 'elevenlabs' ? 'Active' : undefined}
                        onPress={() => setVoiceBackend('elevenlabs')}
                    />
                    <Item
                        title="LiveKit"
                        subtitle="Self-hosted voice pipeline (Kokoro TTS + Deepgram STT)"
                        icon={<Ionicons name="server-outline" size={29} color="#FF9500" />}
                        detail={voiceBackend === 'livekit' ? 'Active' : undefined}
                        onPress={() => setVoiceBackend('livekit')}
                    />
                </ItemGroup>
            )}

        </ItemList>
    );
}
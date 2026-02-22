import React, { useState, useCallback } from 'react';
import { View, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { ItemList } from '@/components/ItemList';
import { Text } from '@/components/StyledText';
import { useSettingMutable, useLocalSettingMutable, useProfile } from '@/sync/storage';
import { useUnistyles } from 'react-native-unistyles';
import { StyleSheet } from 'react-native-unistyles';
import { findLanguageByCode, getLanguageDisplayName, LANGUAGES } from '@/constants/Languages';
import { t } from '@/text';
import { useAuth } from '@/auth/AuthContext';
import { connectService, disconnectService } from '@/sync/apiServices';
import { sync } from '@/sync/sync';
import { Modal } from '@/modal';

export default function VoiceSettingsScreen() {
    const { theme } = useUnistyles();
    const router = useRouter();
    const auth = useAuth();
    const profile = useProfile();
    const [voiceAssistantLanguage] = useSettingMutable('voiceAssistantLanguage');
    const [voiceBackend, setVoiceBackend] = useLocalSettingMutable('voiceBackend');

    const isLiveKitConnected = profile.connectedServices?.includes('livekit') || false;

    // LiveKit credentials form state
    const [lkApiKey, setLkApiKey] = useState('');
    const [lkApiSecret, setLkApiSecret] = useState('');
    const [lkUrl, setLkUrl] = useState('');
    const [saving, setSaving] = useState(false);

    // Find current language or default to first option
    const currentLanguage = findLanguageByCode(voiceAssistantLanguage) || LANGUAGES[0];

    const handleSaveLiveKitCreds = useCallback(async () => {
        if (!lkApiKey.trim() || !lkApiSecret.trim() || !lkUrl.trim()) {
            Modal.alert('Missing Fields', 'Please fill in all three LiveKit credential fields.');
            return;
        }
        if (!auth.credentials) {
            Modal.alert(t('common.error'), t('errors.authenticationFailed'));
            return;
        }

        setSaving(true);
        try {
            await connectService(auth.credentials, 'livekit', {
                apiKey: lkApiKey.trim(),
                apiSecret: lkApiSecret.trim(),
                url: lkUrl.trim()
            });
            await sync.refreshProfile();
            setLkApiKey('');
            setLkApiSecret('');
            setLkUrl('');
            Modal.alert('Saved', 'LiveKit credentials stored successfully.');
        } catch (error) {
            console.error('Failed to save LiveKit credentials:', error);
            Modal.alert(t('common.error'), 'Failed to save LiveKit credentials.');
        } finally {
            setSaving(false);
        }
    }, [lkApiKey, lkApiSecret, lkUrl, auth.credentials]);

    const handleRemoveLiveKitCreds = useCallback(async () => {
        if (!auth.credentials) return;
        setSaving(true);
        try {
            await disconnectService(auth.credentials, 'livekit');
            await sync.refreshProfile();
        } catch (error) {
            console.error('Failed to remove LiveKit credentials:', error);
        } finally {
            setSaving(false);
        }
    }, [auth.credentials]);

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

            {/* Voice Backend */}
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
                        subtitle="Deepgram STT + Cartesia Sonic 3 TTS"
                        icon={<Ionicons name="server-outline" size={29} color="#FF9500" />}
                        detail={voiceBackend === 'livekit' ? 'Active' : undefined}
                        onPress={() => setVoiceBackend('livekit')}
                    />
            </ItemGroup>

            {/* LiveKit Credentials (visible when LiveKit backend is selected) */}
            {voiceBackend === 'livekit' && (
                <ItemGroup
                    title="LiveKit Credentials"
                    footer={isLiveKitConnected
                        ? 'Your LiveKit credentials are stored on the server. They are used to mint session tokens for voice calls.'
                        : 'Enter your LiveKit Cloud credentials. Get them from livekit.io/cloud → Settings → Keys.'}
                >
                    {isLiveKitConnected ? (
                        <Item
                            title="LiveKit"
                            subtitle="Credentials configured"
                            icon={<Ionicons name="checkmark-circle" size={29} color="#34C759" />}
                            detail="Remove"
                            destructive={true}
                            onPress={handleRemoveLiveKitCreds}
                        />
                    ) : (
                        <View style={styles.credentialsForm}>
                            <Text style={[styles.inputLabel, { color: theme.colors.textSecondary }]}>API Key</Text>
                            <TextInput
                                style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
                                value={lkApiKey}
                                onChangeText={setLkApiKey}
                                placeholder="APIxxxxxxxx"
                                placeholderTextColor={theme.colors.textSecondary}
                                autoCapitalize="none"
                                autoCorrect={false}
                            />
                            <Text style={[styles.inputLabel, { color: theme.colors.textSecondary }]}>API Secret</Text>
                            <TextInput
                                style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
                                value={lkApiSecret}
                                onChangeText={setLkApiSecret}
                                placeholder="Your API secret"
                                placeholderTextColor={theme.colors.textSecondary}
                                autoCapitalize="none"
                                autoCorrect={false}
                                secureTextEntry={true}
                            />
                            <Text style={[styles.inputLabel, { color: theme.colors.textSecondary }]}>LiveKit URL</Text>
                            <TextInput
                                style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
                                value={lkUrl}
                                onChangeText={setLkUrl}
                                placeholder="wss://your-project.livekit.cloud"
                                placeholderTextColor={theme.colors.textSecondary}
                                autoCapitalize="none"
                                autoCorrect={false}
                                keyboardType="url"
                            />
                            <Item
                                title={saving ? 'Saving...' : 'Save Credentials'}
                                icon={saving
                                    ? <ActivityIndicator size="small" color="#007AFF" />
                                    : <Ionicons name="key-outline" size={29} color="#007AFF" />}
                                onPress={saving ? undefined : handleSaveLiveKitCreds}
                            />
                        </View>
                    )}
                </ItemGroup>
            )}

        </ItemList>
    );
}

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
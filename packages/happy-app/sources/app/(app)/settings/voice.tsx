import React, { memo, useCallback, useState, useEffect } from 'react';
import { View, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Slider from '@react-native-community/slider';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { ItemList } from '@/components/ItemList';
import { Switch } from '@/components/Switch';
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
    const [progressInterval, setProgressInterval] = useSettingMutable('voiceProgressUpdateInterval');
    const [assistantName, setAssistantName] = useSettingMutable('voiceAssistantName');
    const [assistantBio, setAssistantBio] = useSettingMutable('voiceAssistantBio');
    const [assistantSetup, setAssistantSetup] = useSettingMutable('voiceAssistantSetup');

    const currentLanguage = findLanguageByCode(voiceAssistantLanguage) || LANGUAGES[0];
    const isProgressEnabled = progressInterval > 0;

    // Local display value tracks slider in real-time, persists on release
    const [displayInterval, setDisplayInterval] = useState(progressInterval);
    useEffect(() => { setDisplayInterval(progressInterval); }, [progressInterval]);

    const handleToggleProgress = useCallback((enabled: boolean) => {
        const val = enabled ? 60 : 0;
        setDisplayInterval(val);
        setProgressInterval(val);
    }, [setProgressInterval]);

    const handleSliderValueChange = useCallback((value: number) => {
        setDisplayInterval(Math.round(value));
    }, []);

    const handleSliderComplete = useCallback((value: number) => {
        const rounded = Math.round(value);
        setDisplayInterval(rounded);
        setProgressInterval(rounded);
    }, [setProgressInterval]);

    // Commit text input: clamp to valid range, snap to step of 5
    const handleIntervalTextSubmit = useCallback((text: string) => {
        const parsed = parseInt(text, 10);
        if (isNaN(parsed)) {
            setDisplayInterval(progressInterval);
            return;
        }
        const clamped = Math.max(60, Math.min(300, parsed));
        const snapped = Math.round(clamped / 5) * 5;
        setDisplayInterval(snapped);
        setProgressInterval(snapped);
    }, [progressInterval, setProgressInterval]);

    // Trim and null-ify empty strings on end editing
    const handleNameEndEditing = useCallback((e: { nativeEvent: { text: string } }) => {
        const trimmed = e.nativeEvent.text.trim();
        setAssistantName(trimmed || null);
    }, [setAssistantName]);

    const handleBioEndEditing = useCallback((e: { nativeEvent: { text: string } }) => {
        const trimmed = e.nativeEvent.text.trim();
        setAssistantBio(trimmed || null);
    }, [setAssistantBio]);

    const handleSetupEndEditing = useCallback((e: { nativeEvent: { text: string } }) => {
        const trimmed = e.nativeEvent.text.trim();
        setAssistantSetup(trimmed || null);
    }, [setAssistantSetup]);

    return (
        <ItemList style={{ paddingTop: 0 }}>
            {/* Personalization */}
            <ItemGroup
                title={t('settingsVoice.personalizationTitle')}
                footer={t('settingsVoice.personalizationDescription')}
            >
                <View style={styles.credentialsForm}>
                    <Text style={[styles.inputLabel, { color: theme.colors.textSecondary }]}>
                        {t('settingsVoice.assistantName')}
                    </Text>
                    <TextInput
                        style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.textSecondary, backgroundColor: theme.colors.surface }]}
                        value={assistantName ?? ''}
                        onChangeText={(text) => setAssistantName(text || null)}
                        onEndEditing={handleNameEndEditing}
                        placeholder={t('settingsVoice.assistantNamePlaceholder')}
                        placeholderTextColor={theme.colors.textSecondary}
                        autoCapitalize="words"
                        autoCorrect={false}
                        returnKeyType="done"
                    />
                    <Text style={[styles.inputHint, { color: theme.colors.textSecondary }]}>
                        {t('settingsVoice.assistantNameSubtitle')}
                    </Text>

                    <Text style={[styles.inputLabel, { color: theme.colors.textSecondary, marginTop: 16 }]}>
                        {t('settingsVoice.assistantBio')}
                    </Text>
                    <TextInput
                        style={[styles.input, styles.multilineInput, { color: theme.colors.text, borderColor: theme.colors.textSecondary, backgroundColor: theme.colors.surface }]}
                        value={assistantBio ?? ''}
                        onChangeText={(text) => setAssistantBio(text || null)}
                        onEndEditing={handleBioEndEditing}
                        placeholder={t('settingsVoice.assistantBioPlaceholder')}
                        placeholderTextColor={theme.colors.textSecondary}
                        multiline
                        maxLength={500}
                        textAlignVertical="top"
                    />
                    <Text style={[styles.inputHint, { color: theme.colors.textSecondary }]}>
                        {t('settingsVoice.assistantBioSubtitle')}
                    </Text>

                    <Text style={[styles.inputLabel, { color: theme.colors.textSecondary, marginTop: 16 }]}>
                        {t('settingsVoice.assistantSetup')}
                    </Text>
                    <TextInput
                        style={[styles.input, styles.multilineInput, { color: theme.colors.text, borderColor: theme.colors.textSecondary, backgroundColor: theme.colors.surface }]}
                        value={assistantSetup ?? ''}
                        onChangeText={(text) => setAssistantSetup(text || null)}
                        onEndEditing={handleSetupEndEditing}
                        placeholder={t('settingsVoice.assistantSetupPlaceholder')}
                        placeholderTextColor={theme.colors.textSecondary}
                        multiline
                        maxLength={500}
                        textAlignVertical="top"
                    />
                    <Text style={[styles.inputHint, { color: theme.colors.textSecondary }]}>
                        {t('settingsVoice.assistantSetupSubtitle')}
                    </Text>
                </View>
            </ItemGroup>

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

            {/* Progress Updates */}
            <ItemGroup
                title={t('settingsVoice.progressUpdatesTitle')}
                footer={t('settingsVoice.progressUpdatesDescription')}
            >
                <Item
                    title={t('settingsVoice.progressUpdatesEnabled')}
                    subtitle={t('settingsVoice.progressUpdatesEnabledSubtitle')}
                    icon={<Ionicons name="megaphone-outline" size={29} color="#FF9500" />}
                    rightElement={
                        <Switch
                            value={isProgressEnabled}
                            onValueChange={handleToggleProgress}
                        />
                    }
                />
                {isProgressEnabled && (
                    <View style={styles.sliderContainer}>
                        <View style={styles.sliderHeader}>
                            <Text style={[styles.sliderLabel, { color: theme.colors.text }]}>
                                {t('settingsVoice.progressInterval')}
                            </Text>
                            <View style={styles.intervalInputRow}>
                                <TextInput
                                    style={[styles.intervalInput, { color: theme.colors.text, borderColor: theme.colors.textSecondary, backgroundColor: theme.colors.surface }]}
                                    value={String(displayInterval)}
                                    onChangeText={(text) => setDisplayInterval(parseInt(text, 10) || 0)}
                                    onEndEditing={(e) => handleIntervalTextSubmit(e.nativeEvent.text)}
                                    keyboardType="number-pad"
                                    selectTextOnFocus
                                    returnKeyType="done"
                                />
                                <Text style={[styles.intervalUnit, { color: theme.colors.textSecondary }]}>s</Text>
                            </View>
                        </View>
                        <Slider
                            style={styles.slider}
                            minimumValue={60}
                            maximumValue={300}
                            step={5}
                            value={displayInterval}
                            onValueChange={handleSliderValueChange}
                            onSlidingComplete={handleSliderComplete}
                            minimumTrackTintColor="#FF9500"
                            maximumTrackTintColor={theme.colors.textSecondary}
                            thumbTintColor="#FF9500"
                        />
                        <View style={styles.sliderBounds}>
                            <Text style={[styles.sliderBoundText, { color: theme.colors.textSecondary }]}>60s</Text>
                            <Text style={[styles.sliderBoundText, { color: theme.colors.textSecondary }]}>5m</Text>
                        </View>
                    </View>
                )}
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
    multilineInput: {
        minHeight: 80,
        paddingTop: 10,
    },
    inputHint: {
        fontSize: 12,
        marginBottom: 4,
    },
    sliderContainer: {
        paddingHorizontal: 16,
        paddingTop: 4,
        paddingBottom: 12,
    },
    sliderHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    sliderLabel: {
        fontSize: 15,
    },
    intervalInputRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    intervalInput: {
        fontSize: 15,
        fontVariant: ['tabular-nums'],
        borderWidth: 1,
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 4,
        minWidth: 48,
        textAlign: 'center',
    },
    intervalUnit: {
        fontSize: 15,
        marginLeft: 4,
    },
    slider: {
        width: '100%',
        height: 40,
    },
    sliderBounds: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: -4,
    },
    sliderBoundText: {
        fontSize: 12,
    },
}));

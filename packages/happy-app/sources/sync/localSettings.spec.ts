import { describe, it, expect } from 'vitest';
import {
    LocalSettingsSchema,
    localSettingsDefaults,
    localSettingsParse,
    applyLocalSettings,
} from './localSettings';

describe('localSettings', () => {

    describe('localSettingsDefaults', () => {
        it('should include voiceBackend set to elevenlabs', () => {
            expect(localSettingsDefaults.voiceBackend).toBe('elevenlabs');
        });
    });

    describe('LocalSettingsSchema', () => {
        const validSettings = {
            debugMode: false,
            devModeEnabled: false,
            commandPaletteEnabled: false,
            themePreference: 'adaptive' as const,
            markdownCopyV2: false,
            voiceBackend: 'elevenlabs' as const,
            acknowledgedCliVersions: {},
        };

        it('should accept elevenlabs as voiceBackend', () => {
            const result = LocalSettingsSchema.safeParse({
                ...validSettings,
                voiceBackend: 'elevenlabs',
            });
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.voiceBackend).toBe('elevenlabs');
            }
        });

        it('should accept livekit as voiceBackend', () => {
            const result = LocalSettingsSchema.safeParse({
                ...validSettings,
                voiceBackend: 'livekit',
            });
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.voiceBackend).toBe('livekit');
            }
        });

        it('should reject invalid voiceBackend values', () => {
            const result = LocalSettingsSchema.safeParse({
                ...validSettings,
                voiceBackend: 'openai',
            });
            expect(result.success).toBe(false);
        });
    });

    describe('localSettingsParse', () => {
        it('should return defaults for empty input', () => {
            const result = localSettingsParse({});
            expect(result).toEqual(localSettingsDefaults);
        });

        it('should return defaults for garbage input', () => {
            const result = localSettingsParse('not-an-object');
            expect(result).toEqual(localSettingsDefaults);
        });

        it('should return defaults for null', () => {
            const result = localSettingsParse(null);
            expect(result).toEqual(localSettingsDefaults);
        });

        it('should preserve valid voiceBackend', () => {
            const result = localSettingsParse({ voiceBackend: 'livekit' });
            expect(result.voiceBackend).toBe('livekit');
        });

        it('should ignore unknown fields without throwing and return defaults plus passthrough', () => {
            const result = localSettingsParse({ unknownField: 'test' });
            expect(result.debugMode).toBe(localSettingsDefaults.debugMode);
            expect(result.voiceBackend).toBe(localSettingsDefaults.voiceBackend);
            // Passthrough preserves the unknown key on the object
            expect((result as Record<string, unknown>)['unknownField']).toBe('test');
        });
    });

    describe('applyLocalSettings', () => {
        it('should merge voiceBackend delta', () => {
            const result = applyLocalSettings(localSettingsDefaults, { voiceBackend: 'livekit' });
            expect(result.voiceBackend).toBe('livekit');
        });

        it('should preserve other settings when changing voiceBackend', () => {
            const customSettings = {
                ...localSettingsDefaults,
                debugMode: true,
                themePreference: 'dark' as const,
            };
            const result = applyLocalSettings(customSettings, { voiceBackend: 'livekit' });
            expect(result.voiceBackend).toBe('livekit');
            expect(result.debugMode).toBe(true);
            expect(result.themePreference).toBe('dark');
            expect(result.commandPaletteEnabled).toBe(false);
        });
    });
});

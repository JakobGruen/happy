import { describe, it, expect } from 'vitest';
import {
    LocalSettingsSchema,
    localSettingsDefaults,
    localSettingsParse,
    applyLocalSettings,
} from './localSettings';

describe('localSettings', () => {

    describe('localSettingsDefaults', () => {
        it('should have pipecatUrl set to empty string', () => {
            expect(localSettingsDefaults.pipecatUrl).toBe('');
        });

        it('should have pipecatAuthSecret set to empty string', () => {
            expect(localSettingsDefaults.pipecatAuthSecret).toBe('');
        });
    });

    describe('LocalSettingsSchema', () => {
        const validSettings = {
            debugMode: false,
            devModeEnabled: false,
            commandPaletteEnabled: false,
            themePreference: 'adaptive' as const,
            markdownCopyV2: false,
            pipecatUrl: '',
            pipecatAuthSecret: '',
            acknowledgedCliVersions: {},
        };

        it('should accept valid settings', () => {
            const result = LocalSettingsSchema.safeParse(validSettings);
            expect(result.success).toBe(true);
        });

        it('should accept pipecatUrl string', () => {
            const result = LocalSettingsSchema.safeParse({
                ...validSettings,
                pipecatUrl: 'https://my-pipecat.local:8080',
            });
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.pipecatUrl).toBe('https://my-pipecat.local:8080');
            }
        });

        it('should reject invalid field types', () => {
            const result = LocalSettingsSchema.safeParse({
                ...validSettings,
                debugMode: 'not-a-boolean',
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

        it('should ignore unknown fields without throwing and return defaults plus passthrough', () => {
            const result = localSettingsParse({ unknownField: 'test' });
            expect(result.debugMode).toBe(localSettingsDefaults.debugMode);
            // Passthrough preserves the unknown key on the object
            expect((result as Record<string, unknown>)['unknownField']).toBe('test');
        });
    });

    describe('applyLocalSettings', () => {
        it('should merge debugMode delta', () => {
            const result = applyLocalSettings(localSettingsDefaults, { debugMode: true });
            expect(result.debugMode).toBe(true);
        });

        it('should preserve other settings when changing one field', () => {
            const customSettings = {
                ...localSettingsDefaults,
                debugMode: true,
                themePreference: 'dark' as const,
            };
            const result = applyLocalSettings(customSettings, { pipecatUrl: 'https://example.com' });
            expect(result.pipecatUrl).toBe('https://example.com');
            expect(result.debugMode).toBe(true);
            expect(result.themePreference).toBe('dark');
            expect(result.commandPaletteEnabled).toBe(false);
        });
    });
});

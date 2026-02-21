import React, { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import {
    ExpoSpeechRecognitionModule,
    useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { registerVoiceSession } from './RealtimeSession';
import { VoicePipeline, type PipelineState } from './pipeline/VoicePipeline';
import { VOICE_CONFIG } from './voiceConfig';
import { storage } from '@/sync/storage';
import type { VoiceSession, VoiceSessionConfig } from './types';

// Track whether voice session is active so we can auto-restart STT
let sessionActive = false;

// STT error recovery constants
const MAX_STT_RETRIES = 5;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;
const TERMINAL_ERRORS = new Set([
    'not-allowed',
    'service-not-allowed',
    'language-not-supported',
    'aborted',
]);

export const AnthropicVoiceSession: React.FC = () => {
    const pipelineRef = useRef<VoicePipeline | null>(null);
    const hasRegistered = useRef(false);
    const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const consecutiveErrorsRef = useRef(0);
    const lastErrorWasTerminalRef = useRef(false);

    // --- expo-speech-recognition event hooks ---

    useSpeechRecognitionEvent('result', (event) => {
        const pipeline = pipelineRef.current;
        if (!pipeline || !sessionActive) return;

        // Successful recognition resets the error counter
        consecutiveErrorsRef.current = 0;

        if (event.isFinal && event.results.length > 0) {
            const lastResult = event.results[event.results.length - 1];
            if (lastResult.transcript) {
                pipeline.handleSpeechResult(lastResult.transcript);
            }
        }
    });

    useSpeechRecognitionEvent('end', () => {
        // Single restart point — 'end' always fires after 'error'
        if (!sessionActive || lastErrorWasTerminalRef.current) return;

        clearRestartTimer();

        const errors = consecutiveErrorsRef.current;
        if (errors >= MAX_STT_RETRIES) {
            console.warn(`STT: ${errors} consecutive errors, stopping retries`);
            return;
        }

        if (errors > 0) {
            // Exponential backoff: 1s, 2s, 4s, 8s, 16s (capped at 30s)
            const delay = Math.min(BASE_DELAY_MS * Math.pow(2, errors - 1), MAX_DELAY_MS);
            restartTimerRef.current = setTimeout(() => {
                if (sessionActive) startSTT();
            }, delay);
        } else {
            startSTT();
        }
    });

    useSpeechRecognitionEvent('error', (event) => {
        console.warn('Speech recognition error:', event.error, event.message);

        if (TERMINAL_ERRORS.has(event.error)) {
            lastErrorWasTerminalRef.current = true;
            console.warn('STT: terminal error, will not restart');
            return;
        }

        // Recoverable error — increment counter, 'end' handler will restart
        consecutiveErrorsRef.current += 1;
    });

    // --- STT lifecycle ---

    function startSTT() {
        try {
            ExpoSpeechRecognitionModule.start({
                lang: 'en-US',
                interimResults: false,
                continuous: true,
                requiresOnDeviceRecognition: false,
                addsPunctuation: true,
                ...(Platform.OS === 'ios' && {
                    iosCategory: {
                        category: 'playAndRecord',
                        categoryOptions: ['defaultToSpeaker', 'allowBluetooth'],
                        mode: 'default',
                    },
                }),
            });

            // iOS 60s speech timeout workaround: proactively restart at 55s
            if (Platform.OS === 'ios') {
                clearRestartTimer();
                restartTimerRef.current = setTimeout(() => {
                    if (sessionActive) {
                        ExpoSpeechRecognitionModule.stop();
                        // 'end' event handler will restart
                    }
                }, 55000);
            }
        } catch (e) {
            console.error('Failed to start speech recognition:', e);
        }
    }

    function stopSTT() {
        clearRestartTimer();
        try {
            ExpoSpeechRecognitionModule.stop();
        } catch {
            // Already stopped
        }
    }

    function clearRestartTimer() {
        if (restartTimerRef.current) {
            clearTimeout(restartTimerRef.current);
            restartTimerRef.current = null;
        }
    }

    // --- Setup pipeline + register adapter ---

    useEffect(() => {
        const apiKey = storage.getState().localSettings.anthropicVoiceApiKey
            || process.env.EXPO_PUBLIC_ANTHROPIC_VOICE_API_KEY
            || null;
        if (!apiKey) {
            console.warn('No Anthropic voice API key configured — voice features disabled');
            return;
        }

        const pipeline = new VoicePipeline({
            apiKey,
            model: VOICE_CONFIG.PIPELINE_MODEL,
            maxHistory: VOICE_CONFIG.PIPELINE_MAX_HISTORY,
            maxTokens: VOICE_CONFIG.PIPELINE_MAX_TOKENS,
            onStateChange: (state: PipelineState) => {
                const isSpeaking = state === 'speaking';
                storage.getState().setRealtimeMode(isSpeaking ? 'speaking' : 'idle');
            },
        });
        pipelineRef.current = pipeline;

        const adapter: VoiceSession = {
            async startSession(sessionConfig: VoiceSessionConfig) {
                storage.getState().setRealtimeStatus('connecting');
                await pipeline.startSession(sessionConfig);
                sessionActive = true;
                consecutiveErrorsRef.current = 0;
                lastErrorWasTerminalRef.current = false;
                startSTT();
                storage.getState().setRealtimeStatus('connected');
                storage.getState().setRealtimeMode('idle');
                pipeline.speakGreeting();
            },

            async endSession() {
                sessionActive = false;
                stopSTT();
                await pipeline.endSession();
                storage.getState().setRealtimeStatus('disconnected');
                storage.getState().setRealtimeMode('idle', true);
                storage.getState().clearRealtimeModeDebounce();
            },

            sendTextMessage(msg: string) {
                pipeline.sendTextMessage(msg);
            },

            sendContextualUpdate(update: string) {
                pipeline.sendContextualUpdate(update);
            },
        };

        if (!hasRegistered.current) {
            try {
                registerVoiceSession(adapter);
                hasRegistered.current = true;
            } catch (error) {
                console.error('Failed to register voice session:', error);
            }
        }

        return () => {
            sessionActive = false;
            stopSTT();
            pipeline.endSession();
        };
    }, []);

    return null;
};

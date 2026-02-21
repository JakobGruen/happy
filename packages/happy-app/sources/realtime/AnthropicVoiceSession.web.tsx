import React, { useEffect, useRef } from 'react';
import { registerVoiceSession } from './RealtimeSession';
import { VoicePipeline, type PipelineState } from './pipeline/VoicePipeline';
import { VOICE_CONFIG } from './voiceConfig';
import { storage } from '@/sync/storage';
import type { VoiceSession, VoiceSessionConfig } from './types';

export const AnthropicVoiceSession: React.FC = () => {
    const pipelineRef = useRef<VoicePipeline | null>(null);
    const recognitionRef = useRef<any>(null);
    const hasRegistered = useRef(false);

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

        // --- Web Speech Recognition setup ---

        const SpeechRecognitionCtor =
            typeof window !== 'undefined'
                ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
                : null;

        const startSTT = () => {
            if (!SpeechRecognitionCtor) {
                console.warn('Speech recognition not available in this browser');
                return;
            }
            const recognition = new SpeechRecognitionCtor();
            recognition.continuous = true;
            recognition.interimResults = false;

            recognition.onresult = (event: any) => {
                const last = event.results[event.results.length - 1];
                if (last?.isFinal && last[0]?.transcript) {
                    pipeline.handleSpeechResult(last[0].transcript);
                }
            };

            recognition.onerror = (event: any) => {
                console.error('Speech recognition error:', event.error);
            };

            recognition.onend = () => {
                // Auto-restart if voice session is still active
                if (storage.getState().realtimeStatus === 'connected') {
                    try {
                        recognition.start();
                    } catch {
                        // Already started or not allowed
                    }
                }
            };

            try {
                recognition.start();
            } catch (e) {
                console.error('Failed to start speech recognition:', e);
            }
            recognitionRef.current = recognition;
        };

        const stopSTT = () => {
            if (recognitionRef.current) {
                recognitionRef.current.onend = null; // prevent auto-restart
                recognitionRef.current.stop();
                recognitionRef.current = null;
            }
        };

        // --- Adapter: wraps pipeline + STT + Zustand store updates ---

        const adapter: VoiceSession = {
            async startSession(sessionConfig: VoiceSessionConfig) {
                storage.getState().setRealtimeStatus('connecting');
                await pipeline.startSession(sessionConfig);
                startSTT();
                storage.getState().setRealtimeStatus('connected');
                storage.getState().setRealtimeMode('idle');
            },

            async endSession() {
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
            stopSTT();
            pipeline.endSession();
        };
    }, []);

    return null;
};

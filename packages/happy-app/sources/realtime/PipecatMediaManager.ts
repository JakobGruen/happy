/**
 * Minimal MediaManager for Pipecat RN transport.
 *
 * Uses the WebRTC globals polyfilled by @livekit/react-native-webrtc (registerGlobals).
 * Only handles audio — no camera or screen share needed for voice sessions.
 */
import { MediaManager } from '@pipecat-ai/react-native-small-webrtc-transport';
import type { Tracks } from '@pipecat-ai/client-js';

export class SimpleMediaManager extends MediaManager {
    private _localAudioTrack: MediaStreamTrack | null = null;
    private _localStream: MediaStream | null = null;

    async initialize(): Promise<void> {
        // WebRTC globals already set up by registerGlobals()
    }

    async connect(): Promise<void> {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false,
        });
        this._localStream = stream;
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length > 0) {
            this._localAudioTrack = audioTracks[0];
            this._micEnabled = true;
            this._onTrackStartedCallback?.({
                track: this._localAudioTrack as any,
                type: 'audio',
            });
        }
    }

    async disconnect(): Promise<void> {
        if (this._localStream) {
            this._localStream.getTracks().forEach(t => t.stop());
            this._localStream = null;
        }
        this._localAudioTrack = null;
    }

    async getAllMics(): Promise<any[]> {
        return [];
    }

    async getAllCams(): Promise<any[]> {
        return [];
    }

    async getAllSpeakers(): Promise<any[]> {
        return [];
    }

    updateMic(_micId: string): void {}
    updateCam(_camId: string): void {}
    updateSpeaker(_speakerId: string): void {}

    get selectedMic(): Record<string, never> {
        return {};
    }

    get selectedCam(): Record<string, never> {
        return {};
    }

    get selectedSpeaker(): Record<string, never> {
        return {};
    }

    enableMic(enable: boolean): void {
        this._micEnabled = enable;
        if (this._localAudioTrack) {
            this._localAudioTrack.enabled = enable;
        }
    }

    enableCam(_enable: boolean): void {}
    enableScreenShare(_enable: boolean): void {}

    get isCamEnabled(): boolean {
        return false;
    }

    get isMicEnabled(): boolean {
        return this._micEnabled;
    }

    get isSharingScreen(): boolean {
        return false;
    }

    tracks(): Tracks {
        return {
            local: {
                audio: this._localAudioTrack ?? undefined,
                video: undefined,
                screenVideo: undefined,
            },
        };
    }
}

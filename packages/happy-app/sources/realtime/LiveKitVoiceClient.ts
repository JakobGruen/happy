/**
 * LiveKit-based voice client with built-in RTVI protocol handling.
 *
 * Replaces PipecatClient + SmallWebRTCTransport with direct LiveKit Room API.
 * Handles: room connection, mic publish, bot audio subscription, RTVI data messages,
 * and tool call dispatch.
 *
 * Platform-agnostic — native needs @livekit/react-native setup before use,
 * web needs manual <audio> element for bot audio playback.
 */
import {
    Room,
    RoomEvent,
    Track,
    DataPacket_Kind,
    createLocalAudioTrack,
    type LocalAudioTrack,
    type RemoteTrack,
    type RemoteTrackPublication,
    type RemoteParticipant,
} from 'livekit-client';

const RTVI_LABEL = 'rtvi-ai';
const RTVI_VERSION = '1.2.0';

interface RTVIMessage {
    label: string;
    id: string;
    type: string;
    data?: any;
}

type ToolHandler = (params: {
    arguments: any;
    tool_call_id: string;
    function_name: string;
}) => Promise<any>;

export interface LiveKitVoiceCallbacks {
    onConnected: () => void;
    onDisconnected: () => void;
    onBotReady: () => void;
    onBotStartedSpeaking: () => void;
    onBotStoppedSpeaking: () => void;
    /** Called when bot's audio track is available — web must attach to <audio> element */
    onBotAudioTrack: (track: MediaStreamTrack) => void;
    onError: (error: any) => void;
}

let idCounter = 0;
function generateMessageId(): string {
    return `msg-${Date.now()}-${++idCounter}`;
}

export class LiveKitVoiceClient {
    private room: Room | null = null;
    private localAudioTrack: LocalAudioTrack | null = null;
    private toolHandlers: Record<string, ToolHandler> = {};
    private callbacks: LiveKitVoiceCallbacks;
    private encoder = new TextEncoder();
    private decoder = new TextDecoder();

    constructor(callbacks: LiveKitVoiceCallbacks) {
        this.callbacks = callbacks;
    }

    registerToolHandler(name: string, handler: ToolHandler): void {
        this.toolHandlers[name] = handler;
    }

    /**
     * Connect to voice session via LiveKit.
     * 1. POST to endpoint (e.g. /api/room?session_id=xxx) with requestData
     * 2. Get back {url, token, roomName}
     * 3. Connect to LiveKit room, publish mic, subscribe to bot audio
     */
    async connect(endpoint: string, requestData: Record<string, any>): Promise<void> {
        // POST to /api/room to get LiveKit credentials
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData),
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`Failed to create room: ${res.status} ${text}`);
        }
        const { url, token } = await res.json();

        // Create and connect to LiveKit room
        this.room = new Room({
            adaptiveStream: true,
            dynacast: true,
        });
        this.setupEventHandlers();
        await this.room.connect(url, token);

        // Publish local mic track
        this.localAudioTrack = await createLocalAudioTrack({
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
        });
        await this.room.localParticipant.publishTrack(this.localAudioTrack);

        // Send client-ready so the bot knows we're live
        this.sendRTVIMessage('client-ready', {
            version: RTVI_VERSION,
            about: { library: 'happy-app', library_version: '1.0.0' },
        });

        this.callbacks.onConnected();
    }

    async disconnect(): Promise<void> {
        if (this.localAudioTrack) {
            this.localAudioTrack.stop();
            this.localAudioTrack = null;
        }
        if (this.room) {
            await this.room.disconnect();
            this.room = null;
        }
    }

    enableMic(enable: boolean): void {
        if (this.localAudioTrack) {
            if (enable) {
                this.localAudioTrack.unmute();
            } else {
                this.localAudioTrack.mute();
            }
        }
    }

    sendClientMessage(topic: string, data: any): void {
        this.sendRTVIMessage('client-message', { t: topic, d: data });
    }

    // --- Private ---

    private setupEventHandlers(): void {
        if (!this.room) return;

        this.room.on(RoomEvent.Disconnected, () => {
            this.callbacks.onDisconnected();
        });

        this.room.on(
            RoomEvent.TrackSubscribed,
            (
                track: RemoteTrack,
                _publication: RemoteTrackPublication,
                _participant: RemoteParticipant,
            ) => {
                if (track.kind === Track.Kind.Audio) {
                    this.callbacks.onBotAudioTrack(track.mediaStreamTrack);
                }
            },
        );

        this.room.on(
            RoomEvent.DataReceived,
            (
                payload: Uint8Array,
                _participant?: RemoteParticipant,
                _kind?: DataPacket_Kind,
            ) => {
                try {
                    const message: RTVIMessage = JSON.parse(this.decoder.decode(payload));
                    this.handleRTVIMessage(message);
                } catch (err) {
                    console.warn('[LiveKit] Failed to parse data message:', err);
                }
            },
        );
    }

    private handleRTVIMessage(message: RTVIMessage): void {
        switch (message.type) {
            case 'bot-ready':
                this.callbacks.onBotReady();
                break;
            case 'bot-started-speaking':
                this.callbacks.onBotStartedSpeaking();
                break;
            case 'bot-stopped-speaking':
                this.callbacks.onBotStoppedSpeaking();
                break;
            case 'llm-function-call-in-progress':
                this.handleToolCall(message);
                break;
            case 'error':
                this.callbacks.onError(message.data);
                break;
            // Ignore other RTVI messages (metrics, transcription, etc.)
        }
    }

    private async handleToolCall(message: RTVIMessage): Promise<void> {
        const { function_name, tool_call_id, arguments: args } = message.data;
        const handler = this.toolHandlers[function_name];

        if (!handler) {
            console.warn(`[LiveKit] No handler for tool: ${function_name}`);
            this.sendRTVIMessage('llm-function-call-result', {
                function_name,
                tool_call_id,
                arguments: args,
                result: `error: no handler for ${function_name}`,
            });
            return;
        }

        try {
            const result = await handler({ arguments: args, tool_call_id, function_name });
            this.sendRTVIMessage('llm-function-call-result', {
                function_name,
                tool_call_id,
                arguments: args,
                result: result ?? 'ok',
            });
        } catch (err) {
            console.error(`[LiveKit] Tool ${function_name} failed:`, err);
            this.sendRTVIMessage('llm-function-call-result', {
                function_name,
                tool_call_id,
                arguments: args,
                result: `error: ${err}`,
            });
        }
    }

    private sendRTVIMessage(type: string, data?: any): void {
        if (!this.room) return;
        const message: RTVIMessage = {
            label: RTVI_LABEL,
            id: generateMessageId(),
            type,
            data,
        };
        const encoded = this.encoder.encode(JSON.stringify(message));
        this.room.localParticipant.publishData(encoded, { reliable: true });
    }
}

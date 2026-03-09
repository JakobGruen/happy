import { AuthCredentials } from '@/auth/tokenStorage';
import { getServerUrl } from './serverConfig';

export interface PipecatSessionResponse {
    url: string;
}

export async function fetchPipecatSession(
    credentials: AuthCredentials,
    sessionId: string
): Promise<PipecatSessionResponse> {
    const serverUrl = getServerUrl();

    const response = await fetch(`${serverUrl}/v1/voice/pipecat-session`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${credentials.token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sessionId })
    });

    if (!response.ok) {
        throw new Error(`Pipecat session request failed: ${response.status}`);
    }

    return await response.json();
}
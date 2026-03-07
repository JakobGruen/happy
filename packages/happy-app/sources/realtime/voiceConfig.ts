/**
 * Static voice context configuration
 */
export const VOICE_CONFIG = {
    /** Disable all tool call information from being sent to voice context */
    DISABLE_TOOL_CALLS: false,
    
    /** Send only tool names and descriptions, exclude arguments */
    LIMITED_TOOL_CALLS: true,
    
    /** Disable permission request forwarding */
    DISABLE_PERMISSION_REQUESTS: false,
    
    /** Disable session online/offline notifications */
    DISABLE_SESSION_STATUS: true,
    
    /** Disable message forwarding */
    DISABLE_MESSAGES: false,
    
    /** Disable session focus notifications */
    DISABLE_SESSION_FOCUS: false,
    
    /** Disable ready event notifications */
    DISABLE_READY_EVENTS: false,
    
    /** Maximum number of messages to include in session history */
    MAX_HISTORY_MESSAGES: 10,

    /** Maximum characters of tool-call text (description/args) before truncation */
    MAX_TOOL_TEXT_LENGTH: 300,

    /** Maximum characters of tool args in permission requests */
    MAX_PERMISSION_ARGS_LENGTH: 200,
    
    /** Enable debug logging for voice context updates */
    ENABLE_DEBUG_LOGGING: true,

    /** Debounce interval (ms) for batching contextual updates */
    CONTEXT_DEBOUNCE_MS: 2000,

    /** Max consecutive sendText failures before circuit breaker opens */
    MAX_SEND_FAILURES: 3,

    /** Enable proactive speech triggers (turn complete + progress updates) */
    ENABLE_PROACTIVE_SPEECH: true,

    /** Minimum interval (ms) between progress updates during active work */
    PROGRESS_UPDATE_INTERVAL_MS: 60_000,

    /** Minimum number of new messages required to trigger a progress update */
    PROGRESS_MIN_NEW_MESSAGES: 3,
} as const;
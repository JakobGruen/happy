/**
 * Type definitions for Claude Code SDK integration
 * Provides type-safe interfaces for all SDK communication
 */

import type { Readable } from 'node:stream'

/**
 * SDK message types
 */
export interface SDKMessage {
    type: string
    [key: string]: unknown
}

export interface SDKUserMessage extends SDKMessage {
    type: 'user'
    parent_tool_use_id?: string
    message: {
        role: 'user'
        content: string | Array<{
            type: string
            text?: string
            tool_use_id?: string
            content?: unknown
            [key: string]: unknown
        }>
    }
}

export interface SDKAssistantMessage extends SDKMessage {
    type: 'assistant'
    parent_tool_use_id?: string
    message: {
        role: 'assistant'
        content: Array<{
            type: string
            text?: string
            id?: string
            name?: string
            input?: unknown
            [key: string]: unknown
        }>
    }
}

export interface SDKSystemMessage extends SDKMessage {
    type: 'system'
    subtype: string
    session_id?: string
    model?: string
    cwd?: string
    tools?: string[]
    slash_commands?: string[]
}

export interface SDKResultMessage extends SDKMessage {
    type: 'result'
    subtype: 'success' | 'error_max_turns' | 'error_during_execution'
    result?: string
    num_turns: number
    usage?: {
        input_tokens: number
        output_tokens: number
        cache_read_input_tokens?: number
        cache_creation_input_tokens?: number
    }
    total_cost_usd: number
    duration_ms: number
    duration_api_ms: number
    is_error: boolean
    session_id: string
}

export interface SDKControlResponse extends SDKMessage {
    type: 'control_response'
    response: {
        request_id: string
        subtype: 'success' | 'error'
        error?: string
    }
}

export interface SDKLog extends SDKMessage {
    type: 'log'
    log: {
        level: 'debug' | 'info' | 'warn' | 'error'
        message: string
    }
}

/**
 * Control request types
 */
export interface ControlRequest {
    subtype: string
}

export interface InterruptRequest extends ControlRequest {
    subtype: 'interrupt'
}

/**
 * Permission update types — CC sends these as suggestions for how to
 * persist permission decisions (e.g., "always allow this tool for this project").
 */
export interface PermissionRuleValue {
    toolName: string
    ruleContent?: string
}

export type PermissionBehavior = 'allow' | 'deny' | 'ask'

export type PermissionUpdateDestination = 'userSettings' | 'projectSettings' | 'localSettings' | 'session' | 'cliArg'

export type PermissionUpdate =
    | { type: 'addRules'; rules: PermissionRuleValue[]; behavior: PermissionBehavior; destination: PermissionUpdateDestination }
    | { type: 'replaceRules'; rules: PermissionRuleValue[]; behavior: PermissionBehavior; destination: PermissionUpdateDestination }
    | { type: 'removeRules'; rules: PermissionRuleValue[]; behavior: PermissionBehavior; destination: PermissionUpdateDestination }
    | { type: 'setMode'; mode: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk'; destination: PermissionUpdateDestination }
    | { type: 'addDirectories'; directories: string[]; destination: PermissionUpdateDestination }
    | { type: 'removeDirectories'; directories: string[]; destination: PermissionUpdateDestination }

export interface CanUseToolRequest extends ControlRequest {
    subtype: 'can_use_tool'
    tool_name: string
    input: unknown
    permission_suggestions?: PermissionUpdate[]
    blocked_path?: string
    decision_reason?: string
    tool_use_id?: string
    agent_id?: string
    description?: string
}

export interface CanUseToolControlRequest {
    type: 'control_request'
    request_id: string
    request: CanUseToolRequest
}

export interface CanUseToolControlResponse {
    type: 'control_response'
    response: {
        subtype: 'success' | 'error'
        request_id: string
        response?: PermissionResult
        error?: string
    }
}

export interface ControlCancelRequest {
    type: 'control_cancel_request'
    request_id: string
}

export interface SDKControlRequest {
    request_id: string
    type: 'control_request'
    request: ControlRequest
}

/**
 * Permission result type for tool calls
 */
export type PermissionResult = {
    behavior: 'allow'
    updatedInput?: Record<string, unknown>
    updatedPermissions?: PermissionUpdate[]
    toolUseID?: string
} | {
    behavior: 'deny'
    message: string
    interrupt?: boolean
    toolUseID?: string
}

/**
 * Context passed to the canCallTool callback with each permission request.
 */
export interface ToolPermissionContext {
    signal: AbortSignal
    /** CC's suggested permission updates (the dynamic "always allow" options) */
    permissionSuggestions?: PermissionUpdate[]
    /** File path that triggered the permission request */
    blockedPath?: string
    /** Why this permission request was triggered */
    decisionReason?: string
    /** Direct tool use ID from CC (eliminates fragile ID matching) */
    toolUseId?: string
    /** Sub-agent ID if running in a sub-agent context */
    agentId?: string
    /** Human-readable description of what the tool will do */
    description?: string
}

/**
 * Callback function for tool permission checks
 */
export interface CanCallToolCallback {
    (toolName: string, input: unknown, options: ToolPermissionContext): Promise<PermissionResult>
}

/**
 * Query options
 */
export interface QueryOptions {
    abort?: AbortSignal
    allowedTools?: string[]
    appendSystemPrompt?: string
    customSystemPrompt?: string
    cwd?: string
    disallowedTools?: string[]
    executable?: string
    executableArgs?: string[]
    maxTurns?: number
    mcpServers?: Record<string, unknown>
    pathToClaudeCodeExecutable?: string
    permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'
    continue?: boolean
    resume?: string
    model?: string
    fallbackModel?: string
    strictMcpConfig?: boolean
    canCallTool?: CanCallToolCallback
    /** Path to a settings JSON file to pass to Claude via --settings */
    settingsPath?: string
}

/**
 * Query prompt types
 */
export type QueryPrompt = string | AsyncIterable<SDKMessage>

/**
 * Control response handlers
 */
export type ControlResponseHandler = (response: SDKControlResponse['response']) => void

/**
 * Error types
 */
export class AbortError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'AbortError'
    }
}

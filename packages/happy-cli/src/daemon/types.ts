/**
 * Daemon-specific types (not related to API/server communication)
 */

import { Metadata } from '@/api/types';
import { ChildProcess } from 'child_process';

/**
 * Session tracking for daemon
 */
export interface TrackedSession {
  startedBy: 'daemon' | string;
  happySessionId?: string;
  happySessionMetadataFromLocalWebhook?: Metadata;
  pid: number;
  childProcess?: ChildProcess;
  error?: string;
  directoryCreated?: boolean;
  message?: string;
  /** tmux session identifier (format: session:window) */
  tmuxSessionId?: string;
  /** Timestamp when this session was spawned/registered */
  startedAt: number;
  /** Timestamp of last known activity (webhook, RPC, etc.) */
  lastActivityAt?: number;
}

/**
 * Minimal session info persisted to disk so the daemon can
 * adopt or kill orphaned children after a restart.
 */
export interface PersistedChild {
  pid: number;
  sessionId?: string;
  startedAt: number;
  lastActivityAt?: number;
}
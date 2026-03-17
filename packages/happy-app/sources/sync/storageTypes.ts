import { z } from "zod";

//
// Agent states
//

export const MetadataSchema = z.object({
    models: z.array(z.object({
        code: z.string(),
        value: z.string(),
        description: z.string().nullish(),
    })).optional(),
    currentModelCode: z.string().optional(),
    operatingModes: z.array(z.object({
        code: z.string(),
        value: z.string(),
        description: z.string().nullish(),
    })).optional(),
    currentOperatingModeCode: z.string().optional(),
    thoughtLevels: z.array(z.object({
        code: z.string(),
        value: z.string(),
        description: z.string().nullish(),
    })).optional(),
    currentThoughtLevelCode: z.string().optional(),
    path: z.string(),
    host: z.string(),
    version: z.string().optional(),
    name: z.string().optional(),
    os: z.string().optional(),
    summary: z.object({
        text: z.string(),
        updatedAt: z.number()
    }).optional(),
    machineId: z.string().optional(),
    claudeSessionId: z.string().optional(), // Claude Code session ID
    tools: z.array(z.string()).optional(),
    slashCommands: z.array(z.string()).optional(),
    homeDir: z.string().optional(), // User's home directory on the machine
    happyHomeDir: z.string().optional(), // Happy configuration directory 
    hostPid: z.number().optional(), // Process ID of the session
    flavor: z.string().nullish(), // Session flavor/variant identifier
    sandbox: z.any().nullish(), // Sandbox config metadata from CLI (or null when disabled)
    dangerouslySkipPermissions: z.boolean().nullish(), // Claude --dangerously-skip-permissions mode (or null when unknown)
    autoApproveTools: z.boolean().nullish(), // Auto-approve tools toggle (CC-sourced)
});

export type MachineMetadata = z.infer<typeof MachineMetadataSchema>;

export interface Machine {
    id: string;
    seq: number;
    createdAt: number;
    updatedAt: number;
    active: boolean;
    activeAt: number;  // Changed from lastActiveAt to activeAt for consistency
    metadata: MachineMetadata | null;
    metadataVersion: number;
    daemonState: any | null;  // Dynamic daemon state (runtime info)
    daemonStateVersion: number;
}

//
// Git Status
//

export interface GitStatus {
    branch: string | null;
    isDirty: boolean;
    modifiedCount: number;
    untrackedCount: number;
    stagedCount: number;
    lastUpdatedAt: number;
    // Line change statistics - separated by staged vs unstaged
    stagedLinesAdded: number;
    stagedLinesRemoved: number;
    unstagedLinesAdded: number;
    unstagedLinesRemoved: number;
    // Computed totals
    linesAdded: number;      // stagedLinesAdded + unstagedLinesAdded
    linesRemoved: number;    // stagedLinesRemoved + unstagedLinesRemoved
    linesChanged: number;    // Total lines that were modified (added + removed)
    // Branch tracking information (from porcelain v2)
    upstreamBranch?: string | null; // Name of upstream branch
    aheadCount?: number; // Commits ahead of upstream
    behindCount?: number; // Commits behind upstream
    stashCount?: number; // Number of stash entries
}

/**
 * Type definitions for the Worktree Management System
 *
 * This module defines all types, interfaces, and enums used in the
 * git worktree management feature for CodeModo agent sessions.
 *
 * @module core/worktree/types
 */

import type { WorktreeError } from "./errors";
export { isWorktreeError, WorktreeErrorCode, WorktreeErrors } from "./errors";
export type { WorktreeError } from "./errors";

// ============================================================================
// Core Session Types
// ============================================================================

/**
 * Represents a single worktree instance tied to an agent session.
 *
 * Each WorktreeSession maintains isolation for an agent's work,
 * tracking filesystem location, git state, and metadata.
 */
export interface WorktreeSession {
  /** Unique identifier for this worktree session */
  id: string;

  /** Associated agent session ID from ControlPlane */
  agentSessionId: string;

  /** Absolute filesystem path to the worktree directory */
  worktreePath: string;

  /** Git branch name for this worktree */
  branchName: string;

  /** Parent branch this worktree was created from */
  parentBranch: string;

  /** Current status of the worktree */
  status: WorktreeStatus;

  /** When this worktree was created */
  createdAt: Date;

  /** Last time this worktree was accessed */
  lastAccessedAt: Date;

  /** Optional user-provided description */
  description?: string;

  /** Associated E2B sandbox ID if any */
  sandboxId?: string;

  /** Metadata for tracking and display */
  metadata: WorktreeMetadata;
}

/**
 * Lifecycle states for a worktree
 */
export type WorktreeStatus =
  | "creating" // Worktree is being set up
  | "active" // Agent is actively working
  | "idle" // Agent completed, awaiting user review
  | "merging" // Merge in progress
  | "merged" // Successfully merged
  | "abandoned" // Marked for deletion
  | "error"; // Creation or operation failed

/**
 * Extended metadata for a worktree session
 *
 * Contains computed state derived from git and filesystem operations.
 * Should be refreshed periodically or on-demand.
 */
export interface WorktreeMetadata {
  /** Whether worktree has uncommitted changes */
  hasUncommittedChanges: boolean;

  /** Whether worktree has unpushed commits */
  hasUnpushedCommits: boolean;

  /** Number of commits ahead of parent branch */
  commitsAhead: number;

  /** Number of commits behind parent branch */
  commitsBehind: number;

  /** Files modified in this worktree vs parent */
  filesChanged: number;

  /** Lines added/removed vs parent */
  diffStats: DiffStats;

  /** Last test run result if any */
  lastTestResult?: TestResult;

  /** Disk space used by this worktree in bytes */
  diskUsageBytes: number;

  /** Last time metadata was refreshed */
  lastRefreshedAt: Date;
}

/**
 * Diff statistics for additions/deletions
 */
export interface DiffStats {
  /** Lines added */
  additions: number;

  /** Lines deleted */
  deletions: number;
}

/**
 * Result of a test run in a worktree
 */
export interface TestResult {
  /** Whether tests passed */
  passed: boolean;

  /** When tests were run */
  timestamp: Date;

  /** Human-readable summary */
  summary: string;

  /** Detailed test output */
  details?: unknown;
}

// ============================================================================
// UI Helper Types
// ============================================================================

/**
 * Lightweight summary of diff statistics for UI display
 */
export interface WorktreeDiffSummary {
  /** Number of files changed */
  filesChanged: number;

  /** Lines added */
  linesAdded: number;

  /** Lines removed */
  linesRemoved: number;

  /** When stats were last refreshed */
  lastChecked?: Date;
}

/**
 * User-facing status buckets for worktree UI
 */
export type WorktreeAgentStatus = "working" | "idle" | "completed" | "error";

/**
 * Worktree session enriched with UI-specific metadata
 */
export interface WorktreeSessionWithStats extends WorktreeSession {
  /** Snapshot of diff statistics for quick display */
  diffStats?: WorktreeDiffSummary;

  /** Simplified agent status */
  agentStatus?: WorktreeAgentStatus;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for the worktree management system
 */
export interface WorktreeConfig {
  /** Base directory for all worktrees (default: .worktrees/) */
  worktreeBaseDir: string;

  /** Branch name prefix (default: claude/) */
  branchPrefix: string;

  /** Maximum number of concurrent worktrees (default: 10) */
  maxConcurrentWorktrees: number;

  /** Auto-cleanup settings */
  cleanup: CleanupConfig;

  /** Whether to run tests before allowing merge */
  requireTestsPassBeforeMerge: boolean;

  /** Disk space limits */
  limits: DiskLimits;

  /** UI preferences */
  ui: UIPreferences;
}

/**
 * Cleanup policy configuration
 */
export interface CleanupConfig {
  /** Remove worktree when agent session ends */
  onSessionEnd: boolean;

  /** Remove worktree after successful merge */
  onMerge: boolean;

  /** Keep abandoned worktrees for N days (default: 7) */
  retentionDays: number;
}

/**
 * Disk space limits for worktrees
 */
export interface DiskLimits {
  /** Max disk space per worktree in MB */
  maxWorktreeSizeMB: number;

  /** Max total disk space for all worktrees in MB */
  maxTotalSizeMB: number;
}

/**
 * UI display preferences
 */
export interface UIPreferences {
  /** Show disk usage in UI */
  showDiskUsage: boolean;

  /** Confirm before removing worktrees */
  confirmBeforeRemove: boolean;

  /** Default merge strategy */
  defaultMergeStrategy: MergeStrategy;

  /** Show diff stats in worktree list */
  showDiffStats: boolean;
}

// ============================================================================
// Operation Options
// ============================================================================

/**
 * Options for creating a new worktree
 */
export interface CreateWorktreeOptions {
  /** Base branch to create from (default: current branch) */
  baseBranch?: string;

  /** Custom branch name (auto-generated if not provided) */
  branchName?: string;

  /** Optional description for this worktree */
  description?: string;

  /** Whether to create associated E2B sandbox */
  createSandbox?: boolean;

  /** Copy uncommitted changes from current workspace */
  copyUncommitted?: boolean;
}

/**
 * Filter criteria for listing worktrees
 */
export interface WorktreeFilter {
  /** Filter by status (single or multiple) */
  status?: WorktreeStatus | WorktreeStatus[];

  /** Filter by agent session ID */
  agentSessionId?: string;

  /** Created after this date */
  createdAfter?: Date;

  /** Created before this date */
  createdBefore?: Date;

  /** Filter by uncommitted changes presence */
  hasUncommittedChanges?: boolean;

  /** Filter by parent branch */
  parentBranch?: string;
}

/**
 * Options for diff operations
 */
export interface DiffOptions {
  /** Include file names only (no content) */
  nameOnly?: boolean;

  /** Include diff statistics */
  stat?: boolean;

  /** Context lines for diff */
  context?: number;

  /** File path pattern to include */
  pathFilter?: string;

  /** Format for diff output */
  format?: DiffFormat;
}

/**
 * Supported diff output formats
 */
export type DiffFormat = "patch" | "stat" | "name-only" | "unified";

/**
 * Options for merge operations
 */
export interface MergeOptions {
  /** Target branch to merge into (default: parent branch) */
  targetBranch?: string;

  /** Merge strategy */
  strategy: MergeStrategy;

  /** Commit message (auto-generated if not provided) */
  commitMessage?: string;

  /** Run tests before merging */
  runTests?: boolean;

  /** Delete worktree after successful merge */
  deleteAfterMerge?: boolean;

  /** Allow merge with uncommitted changes */
  allowUncommitted?: boolean;
}

/**
 * Git merge strategies
 */
export type MergeStrategy =
  | "merge" // Standard merge commit
  | "squash" // Squash all commits into one
  | "rebase" // Rebase onto target branch
  | "fast-forward"; // Fast-forward only (fails if not possible)

/**
 * Options for removing a worktree
 */
export interface RemoveOptions {
  /** Delete the git branch as well */
  deleteBranch?: boolean;

  /** Force removal even with uncommitted changes */
  force?: boolean;

  /** Backup worktree before removal */
  createBackup?: boolean;
}

// ============================================================================
// Protocol Payload Types
// ============================================================================

/**
 * Payload used when the UI requests creation of a worktree
 */
export interface WorktreeCreateRequestPayload {
  /** Optional repository override */
  repositoryPath?: string;

  /** Agent/session identifier */
  agentSessionId: string;

  /** Manager creation options */
  options?: CreateWorktreeOptions;
}

/**
 * Payload for switching the IDE into an existing worktree
 */
export interface WorktreeSwitchRequestPayload {
  /** Worktree session identifier */
  sessionId: string;

  /** Optional repository override */
  repositoryPath?: string;

  /** Whether to open in a new window */
  openInNewWindow?: boolean;
}

/**
 * Payload for listing, merging, or removing worktrees scoped to a repo
 */
export interface WorktreeScopedRequestPayload {
  /** Target repository path */
  repositoryPath?: string;
}

export interface WorktreeMergeRequestPayload
  extends WorktreeScopedRequestPayload {
  sessionId: string;
  options?: MergeOptions;
}

export interface WorktreeRemoveRequestPayload
  extends WorktreeScopedRequestPayload {
  sessionId: string;
  force?: boolean;
  deleteBranch?: boolean;
}

export interface WorktreeStatusRequestPayload
  extends WorktreeScopedRequestPayload {
  sessionId: string;
}

// ============================================================================
// Result Types
// ============================================================================

/**
 * Result of a diff operation
 */
export interface DiffResult {
  /** Source identifier (session ID or branch name) */
  source: string;

  /** Target identifier (session ID or branch name) */
  target: string;

  /** List of changed file paths */
  filesChanged: string[];

  /** Total lines added */
  additions: number;

  /** Total lines deleted */
  deletions: number;

  /** Raw diff output */
  diff: string;

  /** Human-readable summary */
  summary: string;

  /** Computed at timestamp */
  timestamp: Date;
}

/**
 * Result of a merge operation
 */
export interface MergeResult {
  /** Whether merge was successful */
  success: boolean;

  /** Target branch that was merged into */
  targetBranch: string;

  /** Commit hash if successful */
  commitHash?: string;

  /** Conflicting files if any */
  conflicts?: string[];

  /** Human-readable message */
  message: string;

  /** Detailed merge output */
  details?: string;

  /** Timestamp of merge */
  timestamp: Date;
}

/**
 * Report from cleanup operations
 */
export interface CleanupReport {
  /** Session IDs that were removed */
  removed: string[];

  /** Session IDs that were retained */
  retained: string[];

  /** Errors encountered during cleanup */
  errors: Array<{
    sessionId: string;
    error: string;
  }>;

  /** Disk space freed in bytes */
  diskSpaceFreed: number;

  /** Timestamp of cleanup */
  timestamp: Date;
}

/**
 * Report on disk usage by worktrees
 */
export interface DiskUsageReport {
  /** Total bytes used by all worktrees */
  totalBytes: number;

  /** Individual worktree usage */
  worktrees: Array<{
    sessionId: string;
    sizeBytes: number;
    path: string;
  }>;

  /** Timestamp of report */
  timestamp: Date;

  /** Whether any limits are exceeded */
  limitsExceeded: boolean;

  /** Warning messages if approaching limits */
  warnings: string[];
}

/**
 * Result of worktree validation
 */
export interface ValidationResult {
  /** Whether worktree is valid */
  valid: boolean;

  /** Issues found during validation */
  issues: string[];

  /** Whether repair was attempted */
  repaired: boolean;

  /** Details of repair actions */
  repairDetails?: string[];

  /** Timestamp of validation */
  timestamp: Date;
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * Event types emitted by WorktreeManager
 */
export type WorktreeEventType =
  | "created"
  | "removed"
  | "merged"
  | "switched"
  | "error"
  | "disk_warning"
  | "metadata_updated"
  | "status_changed";

/**
 * Base event interface
 */
export interface WorktreeEvent {
  type: WorktreeEventType;
  timestamp: Date;
}

/**
 * Event emitted when worktree is created
 */
export interface WorktreeCreatedEvent extends WorktreeEvent {
  type: "created";
  session: WorktreeSession;
}

/**
 * Event emitted when worktree is removed
 */
export interface WorktreeRemovedEvent extends WorktreeEvent {
  type: "removed";
  sessionId: string;
  reason: "user_requested" | "auto_cleanup" | "merged";
}

/**
 * Event emitted when worktree is merged
 */
export interface WorktreeMergedEvent extends WorktreeEvent {
  type: "merged";
  sessionId: string;
  result: MergeResult;
}

/**
 * Event emitted when switching to a worktree
 */
export interface WorktreeSwitchedEvent extends WorktreeEvent {
  type: "switched";
  sessionId: string;
  previousSessionId?: string;
}

/**
 * Event emitted on errors
 */
export interface WorktreeErrorEvent extends WorktreeEvent {
  type: "error";
  error: WorktreeError;
}

/**
 * Event emitted when disk usage is high
 */
export interface WorktreeDiskWarningEvent extends WorktreeEvent {
  type: "disk_warning";
  usage: DiskUsageReport;
}

/**
 * Event emitted when metadata is updated
 */
export interface WorktreeMetadataUpdatedEvent extends WorktreeEvent {
  type: "metadata_updated";
  sessionId: string;
  metadata: WorktreeMetadata;
}

/**
 * Event emitted when status changes
 */
export interface WorktreeStatusChangedEvent extends WorktreeEvent {
  type: "status_changed";
  sessionId: string;
  previousStatus: WorktreeStatus;
  newStatus: WorktreeStatus;
}

/**
 * Union of all event types
 */
export type WorktreeEventUnion =
  | WorktreeCreatedEvent
  | WorktreeRemovedEvent
  | WorktreeMergedEvent
  | WorktreeSwitchedEvent
  | WorktreeErrorEvent
  | WorktreeDiskWarningEvent
  | WorktreeMetadataUpdatedEvent
  | WorktreeStatusChangedEvent;

// ============================================================================
// Internal Types
// ============================================================================

/**
 * Persisted worktree registry state
 *
 * Stored in .codemode/worktrees.json for persistence across restarts
 */
export interface WorktreeRegistryState {
  /** Schema version for migrations */
  version: string;

  /** All registered worktree sessions */
  sessions: Record<string, WorktreeSession>;

  /** Last cleanup timestamp */
  lastCleanup: Date;

  /** Configuration snapshot */
  config: WorktreeConfig;
}

/**
 * Git status information for a worktree
 */
export interface GitStatus {
  /** Current branch name */
  branch: string;

  /** Tracked files with changes */
  modified: string[];

  /** New files not yet staged */
  untracked: string[];

  /** Staged files ready for commit */
  staged: string[];

  /** Deleted files */
  deleted: string[];

  /** Commits ahead of upstream */
  ahead: number;

  /** Commits behind upstream */
  behind: number;

  /** Whether working tree is clean */
  isClean: boolean;
}

/**
 * Result of git branch comparison
 */
export interface BranchComparison {
  /** Source branch name */
  sourceBranch: string;

  /** Target branch name */
  targetBranch: string;

  /** Commits in source not in target */
  commitsAhead: number;

  /** Commits in target not in source */
  commitsBehind: number;

  /** Common ancestor commit */
  mergeBase: string;

  /** Whether fast-forward merge is possible */
  canFastForward: boolean;

  /** Predicted conflicts */
  potentialConflicts: string[];
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Type guard for checking if value is a WorktreeSession
 */
export function isWorktreeSession(value: unknown): value is WorktreeSession {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "agentSessionId" in value &&
    "worktreePath" in value &&
    "branchName" in value
  );
}

/**
 * Partial update type for WorktreeSession
 */
export type WorktreeSessionUpdate = Partial<
  Omit<WorktreeSession, "id" | "createdAt">
>;

/**
 * Create options with all required fields for internal use
 */
export type CreateWorktreeOptionsInternal = Required<CreateWorktreeOptions> & {
  timestamp: Date;
};

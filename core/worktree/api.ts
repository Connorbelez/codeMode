/**
 * API Specification for Worktree Management System
 *
 * This module defines the public API interfaces for managing git worktrees
 * in Code Mode. All worktree operations should go through these interfaces.
 *
 * @module core/worktree/api
 */

import type {
  WorktreeSession,
  WorktreeConfig,
  CreateWorktreeOptions,
  WorktreeFilter,
  DiffOptions,
  DiffResult,
  MergeOptions,
  MergeResult,
  MergeStrategy,
  RemoveOptions,
  CleanupReport,
  DiskUsageReport,
  ValidationResult,
  WorktreeEventUnion,
  GitStatus,
  BranchComparison,
} from "./types";

// ============================================================================
// Main Manager Interface
// ============================================================================

/**
 * Primary interface for all worktree management operations.
 *
 * This is the main entry point for creating, managing, and cleaning up
 * git worktrees for agent sessions. Implemented as a singleton to ensure
 * centralized state management.
 *
 * @example
 * ```typescript
 * const manager = WorktreeManagerSingleton.getInstance('/path/to/repo');
 * await manager.initialize();
 *
 * // Create worktree for agent
 * const session = await manager.createWorktree('agent-123', {
 *   baseBranch: 'main',
 *   description: 'Feature implementation'
 * });
 *
 * // Later: merge back
 * const result = await manager.mergeWorktree(session.id, {
 *   strategy: 'squash',
 *   deleteAfterMerge: true
 * });
 * ```
 */
export interface IWorktreeManager {
  // =========================================================================
  // Lifecycle Management
  // =========================================================================

  /**
   * Initialize the worktree manager with configuration.
   *
   * Should be called once at application startup. Loads existing worktree
   * registry from disk and validates all registered worktrees still exist.
   *
   * @param config - Optional configuration overrides
   * @throws {WorktreeError} If initialization fails
   */
  initialize(config?: Partial<WorktreeConfig>): Promise<void>;

  /**
   * Shutdown the worktree manager gracefully.
   *
   * Saves registry state, cleans up resources, and stops background tasks.
   */
  shutdown(): Promise<void>;

  /**
   * Check if manager is initialized and ready
   */
  isInitialized(): boolean;

  // =========================================================================
  // Worktree Creation & Retrieval
  // =========================================================================

  /**
   * Create a new worktree for an agent session.
   *
   * This is the primary method for launching an agent in an isolated workspace.
   * Creates a new git worktree, initializes metadata, and optionally sets up
   * an E2B sandbox pointing to the worktree directory.
   *
   * @param agentSessionId - Agent session ID from control plane
   * @param options - Creation options
   * @returns Created worktree session
   * @throws {WorktreeError} If creation fails
   *
   * @example
   * ```typescript
   * const session = await manager.createWorktree('agent-123', {
   *   baseBranch: 'main',
   *   description: 'Implement authentication',
   *   createSandbox: true
   * });
   * console.log(`Created: ${session.branchName} at ${session.worktreePath}`);
   * ```
   */
  createWorktree(
    agentSessionId: string,
    options?: CreateWorktreeOptions,
  ): Promise<WorktreeSession>;

  /**
   * Get worktree session by ID.
   *
   * @param sessionId - Worktree session ID
   * @returns WorktreeSession if found, undefined otherwise
   */
  getWorktree(sessionId: string): WorktreeSession | undefined;

  /**
   * Get worktree session by agent session ID.
   *
   * Useful for finding the worktree associated with a specific agent.
   *
   * @param agentSessionId - Agent session ID
   * @returns WorktreeSession if found, undefined otherwise
   */
  getWorktreeByAgentSession(
    agentSessionId: string,
  ): WorktreeSession | undefined;

  /**
   * List all worktrees with optional filtering.
   *
   * @param filter - Optional filter criteria
   * @returns Array of matching worktree sessions
   *
   * @example
   * ```typescript
   * // Get all active worktrees
   * const active = manager.listWorktrees({ status: 'active' });
   *
   * // Get worktrees with uncommitted changes
   * const dirty = manager.listWorktrees({ hasUncommittedChanges: true });
   *
   * // Get worktrees created in last 24 hours
   * const recent = manager.listWorktrees({
   *   createdAfter: new Date(Date.now() - 24 * 60 * 60 * 1000)
   * });
   * ```
   */
  listWorktrees(filter?: WorktreeFilter): WorktreeSession[];

  // =========================================================================
  // Metadata & Status
  // =========================================================================

  /**
   * Refresh worktree metadata from git and filesystem.
   *
   * Recomputes all metadata fields (commits ahead/behind, files changed,
   * disk usage, etc.). Should be called before displaying worktree info
   * or making decisions based on metadata.
   *
   * @param sessionId - Worktree session ID
   * @returns Updated worktree session
   * @throws {WorktreeError} If worktree not found or refresh fails
   *
   * @example
   * ```typescript
   * const session = await manager.refreshWorktreeMetadata('wt-123');
   * console.log(`Files changed: ${session.metadata.filesChanged}`);
   * console.log(`Commits ahead: ${session.metadata.commitsAhead}`);
   * ```
   */
  refreshWorktreeMetadata(sessionId: string): Promise<WorktreeSession>;

  /**
   * Get detailed git status for a worktree.
   *
   * @param sessionId - Worktree session ID
   * @returns Git status information
   * @throws {WorktreeError} If worktree not found
   */
  getGitStatus(sessionId: string): Promise<GitStatus>;

  /**
   * Compare worktree branch with another branch.
   *
   * Useful for determining if fast-forward merge is possible.
   *
   * @param sessionId - Worktree session ID
   * @param targetBranch - Branch to compare against
   * @returns Branch comparison result
   */
  compareBranches(
    sessionId: string,
    targetBranch: string,
  ): Promise<BranchComparison>;

  // =========================================================================
  // Navigation & Context Switching
  // =========================================================================

  /**
   * Mark a worktree as the active context for UI/editor features.
   *
   * Does not mutate the Node.js process working directory. Callers should
   * resolve the worktree path (e.g., via `getWorktree(sessionId)`) and pass it
   * explicitly as `cwd` to any operations that need it.
   *
   * @param sessionId - Worktree session ID to switch to
   * @throws {WorktreeError} If worktree not found or switch fails
   *
   * @example
   * ```typescript
   * await manager.switchToWorktree('wt-123');
   * const session = manager.getWorktree('wt-123');
   * await exec('npm test', { cwd: session.worktreePath });
   * ```
   */
  switchToWorktree(sessionId: string): Promise<void>;

  /**
   * Get currently active worktree session ID if any.
   *
   * Consumers should use the returned ID to look up the worktree path and pass
   * it as `cwd` when running commands.
   *
   * @returns Session ID if a worktree is active, undefined otherwise
   */
  getCurrentWorktree(): string | undefined;

  /**
   * Clear active worktree tracking (return to main repository context).
   */
  switchToMainRepo(): Promise<void>;

  // =========================================================================
  // Diff & Comparison
  // =========================================================================

  /**
   * Generate diff between two worktrees or worktree and branch.
   *
   * @param source - Source session ID or branch name
   * @param target - Target session ID or branch name
   * @param options - Diff options
   * @returns Diff result with statistics and content
   *
   * @example
   * ```typescript
   * // Compare two worktrees
   * const diff = await manager.diffWorktrees('wt-123', 'wt-456');
   *
   * // Compare worktree to main branch
   * const diff = await manager.diffWorktrees('wt-123', 'main', {
   *   stat: true,
   *   pathFilter: 'src/**'
   * });
   *
   * console.log(diff.summary);
   * console.log(`+${diff.additions} -${diff.deletions}`);
   * ```
   */
  diffWorktrees(
    source: string,
    target: string,
    options?: DiffOptions,
  ): Promise<DiffResult>;

  /**
   * Generate comparison matrix for multiple worktrees.
   *
   * Useful for comparing N approaches simultaneously.
   *
   * @param sessionIds - Array of session IDs to compare
   * @returns Matrix of pairwise comparisons
   */
  compareMultipleWorktrees(
    sessionIds: string[],
  ): Promise<Map<string, Map<string, DiffResult>>>;

  // =========================================================================
  // Merge Operations
  // =========================================================================

  /**
   * Merge worktree changes back to target branch.
   *
   * This is the primary method for integrating agent work back into the
   * main codebase. Supports multiple merge strategies and optional pre-merge
   * validation (tests, conflict detection).
   *
   * @param sessionId - Worktree session ID to merge
   * @param options - Merge options
   * @returns Merge result with status and details
   * @throws {WorktreeError} If merge fails or conflicts exist
   *
   * @example
   * ```typescript
   * // Squash merge with tests
   * const result = await manager.mergeWorktree('wt-123', {
   *   strategy: 'squash',
   *   runTests: true,
   *   deleteAfterMerge: true,
   *   commitMessage: 'feat: Add authentication system'
   * });
   *
   * if (result.success) {
   *   console.log(`Merged: ${result.commitHash}`);
   * } else {
   *   console.error('Conflicts:', result.conflicts);
   * }
   * ```
   */
  mergeWorktree(
    sessionId: string,
    options?: MergeOptions,
  ): Promise<MergeResult>;

  /**
   * Check if worktree can be merged cleanly (pre-flight check).
   *
   * Returns potential conflicts without actually performing merge.
   *
   * @param sessionId - Worktree session ID
   * @param targetBranch - Target branch (default: parent branch)
   * @returns Merge preview result
   */
  canMergeCleanly(
    sessionId: string,
    targetBranch?: string,
  ): Promise<{
    canMerge: boolean;
    conflicts: string[];
    strategy: MergeStrategy;
  }>;

  // =========================================================================
  // Cleanup & Removal
  // =========================================================================

  /**
   * Remove a worktree and optionally delete its branch.
   *
   * Checks for uncommitted changes and warns user unless force option is set.
   *
   * @param sessionId - Worktree session ID to remove
   * @param options - Removal options
   * @throws {WorktreeError} If removal fails
   *
   * @example
   * ```typescript
   * // Safe removal (warns if uncommitted changes)
   * await manager.removeWorktree('wt-123', {
   *   deleteBranch: true
   * });
   *
   * // Force removal
   * await manager.removeWorktree('wt-123', {
   *   force: true,
   *   deleteBranch: true
   * });
   * ```
   */
  removeWorktree(sessionId: string, options?: RemoveOptions): Promise<void>;

  /**
   * Clean up worktrees based on retention policy.
   *
   * Automatically removes:
   * - Merged worktrees if config.cleanup.onMerge is true
   * - Abandoned worktrees older than retentionDays
   * - Worktrees from completed sessions if config.cleanup.onSessionEnd is true
   *
   * @returns Cleanup report with removed/retained counts
   *
   * @example
   * ```typescript
   * const report = await manager.cleanupWorktrees();
   * console.log(`Removed ${report.removed.length} worktrees`);
   * console.log(`Freed ${report.diskSpaceFreed / 1024 / 1024} MB`);
   * ```
   */
  cleanupWorktrees(): Promise<CleanupReport>;

  /**
   * Remove all worktrees (emergency cleanup).
   *
   * @param force - Force removal even with uncommitted changes
   * @returns Cleanup report
   */
  removeAllWorktrees(force?: boolean): Promise<CleanupReport>;

  // =========================================================================
  // Disk & Resource Management
  // =========================================================================

  /**
   * Get disk usage statistics for all worktrees.
   *
   * @returns Disk usage report with per-worktree breakdown
   */
  getDiskUsage(): Promise<DiskUsageReport>;

  /**
   * Check if disk quota limits are exceeded.
   *
   * @returns True if any limits are exceeded
   */
  isDiskQuotaExceeded(): Promise<boolean>;

  /**
   * Estimate disk space needed for new worktree.
   *
   * @returns Estimated size in bytes
   */
  estimateWorktreeSize(): Promise<number>;

  // =========================================================================
  // Validation & Repair
  // =========================================================================

  /**
   * Validate worktree state and repair if needed.
   *
   * Checks for:
   * - Directory existence
   * - Git worktree registration
   * - Branch existence
   * - Metadata consistency
   *
   * @param sessionId - Worktree session ID
   * @returns Validation result with issues and repair status
   *
   * @example
   * ```typescript
   * const result = await manager.validateWorktree('wt-123');
   * if (!result.valid) {
   *   console.error('Issues:', result.issues);
   *   if (result.repaired) {
   *     console.log('Repaired automatically');
   *   }
   * }
   * ```
   */
  validateWorktree(sessionId: string): Promise<ValidationResult>;

  /**
   * Validate all registered worktrees.
   *
   * Removes invalid entries from registry.
   *
   * @returns Map of session ID to validation result
   */
  validateAllWorktrees(): Promise<Map<string, ValidationResult>>;

  /**
   * Synchronize registry with actual git worktrees.
   *
   * Adds missing worktrees to registry, removes orphaned entries.
   */
  syncRegistry(): Promise<void>;

  // =========================================================================
  // Configuration
  // =========================================================================

  /**
   * Get current configuration.
   */
  getConfig(): WorktreeConfig;

  /**
   * Update configuration at runtime.
   *
   * @param config - Partial configuration to merge
   */
  updateConfig(config: Partial<WorktreeConfig>): Promise<void>;

  // =========================================================================
  // Events
  // =========================================================================

  /**
   * Register event listener.
   *
   * @param event - Event type to listen for
   * @param handler - Event handler function
   *
   * @example
   * ```typescript
   * manager.on('created', (event) => {
   *   console.log(`New worktree: ${event.session.branchName}`);
   * });
   *
   * manager.on('disk_warning', (event) => {
   *   console.warn('Disk usage high:', event.usage);
   * });
   * ```
   */
  on(
    event: WorktreeEventUnion["type"],
    handler: (event: WorktreeEventUnion) => void,
  ): void;

  /**
   * Unregister event listener.
   */
  off(
    event: WorktreeEventUnion["type"],
    handler: (event: WorktreeEventUnion) => void,
  ): void;

  /**
   * Emit an event (internal use).
   */
  emit(event: WorktreeEventUnion): void;
}

// ============================================================================
// Git Operations Interface
// ============================================================================

/**
 * Low-level git operations wrapper.
 *
 * Abstracts git CLI commands with proper error handling and parsing.
 * Internal use only - should not be exposed directly to users.
 */
export interface IGitOperations {
  /**
   * Create a git worktree.
   *
   * @param path - Absolute path for worktree
   * @param branchName - Branch name to create
   * @param baseBranch - Base branch to create from
   */
  createWorktree(
    path: string,
    branchName: string,
    baseBranch: string,
  ): Promise<void>;

  /**
   * Remove a git worktree.
   *
   * @param path - Worktree path
   * @param force - Force removal
   */
  removeWorktree(path: string, force?: boolean): Promise<void>;

  /**
   * List all git worktrees in repository.
   */
  listWorktrees(): Promise<
    Array<{
      path: string;
      branch: string;
      commit: string;
    }>
  >;

  /**
   * Get git status for a worktree.
   */
  getStatus(worktreePath: string): Promise<GitStatus>;

  /**
   * Get diff between two refs.
   */
  getDiff(
    ref1: string,
    ref2: string,
    options?: DiffOptions,
  ): Promise<DiffResult>;

  /**
   * Perform merge operation.
   */
  merge(
    branch: string,
    strategy: MergeStrategy,
    options?: {
      message?: string;
      noCommit?: boolean;
      cwd?: string;
    },
  ): Promise<{ success: boolean; conflicts?: string[] }>;

  /**
   * Get commits ahead/behind counts.
   */
  getAheadBehind(
    branch1: string,
    branch2: string,
  ): Promise<{ ahead: number; behind: number }>;

  /**
   * Check if branch exists.
   */
  branchExists(branchName: string): Promise<boolean>;

  /**
   * Delete a branch.
   */
  deleteBranch(branchName: string, force?: boolean): Promise<void>;

  /**
   * Get current branch name.
   */
  getCurrentBranch(worktreePath?: string): Promise<string>;

  /**
   * Get merge base between two refs.
   */
  getMergeBase(ref1: string, ref2: string): Promise<string>;

  /**
   * Check if merge would have conflicts.
   */
  checkMergeConflicts(
    sourceBranch: string,
    targetBranch: string,
  ): Promise<string[]>;
}

// ============================================================================
// Filesystem Operations Interface
// ============================================================================

/**
 * Filesystem operations for worktree management.
 */
export interface IFilesystemOperations {
  /**
   * Get disk usage for a directory.
   */
  getDiskUsage(path: string): Promise<number>;

  /**
   * Check if path exists.
   */
  exists(path: string): Promise<boolean>;

  /**
   * Create directory recursively.
   */
  mkdirp(path: string): Promise<void>;

  /**
   * Remove directory recursively.
   */
  rmdir(path: string, force?: boolean): Promise<void>;

  /**
   * Copy files from source to destination.
   */
  copy(source: string, dest: string, filter?: string[]): Promise<void>;

  /**
   * Get list of files in directory.
   */
  readdir(path: string, recursive?: boolean): Promise<string[]>;
}

// ============================================================================
// Lifecycle Hooks Interface
// ============================================================================

/**
 * Lifecycle hooks for extending worktree operations.
 *
 * Allows plugins or extensions to hook into worktree lifecycle events.
 */
export interface IWorktreeLifecycleHooks {
  /**
   * Called before worktree is created.
   * Can modify options or abort creation by throwing error.
   */
  beforeCreate?(
    agentSessionId: string,
    options: CreateWorktreeOptions,
  ): Promise<void>;

  /**
   * Called after worktree is created.
   */
  afterCreate?(session: WorktreeSession): Promise<void>;

  /**
   * Called before worktree is removed.
   * Can abort removal by throwing error.
   */
  beforeRemove?(sessionId: string): Promise<void>;

  /**
   * Called after worktree is removed.
   */
  afterRemove?(sessionId: string): Promise<void>;

  /**
   * Called before merge operation.
   */
  beforeMerge?(sessionId: string, options: MergeOptions): Promise<void>;

  /**
   * Called after successful merge.
   */
  afterMerge?(sessionId: string, result: MergeResult): Promise<void>;
}

// ============================================================================
// Persistence Interface
// ============================================================================

/**
 * Interface for persisting worktree registry state.
 */
export interface IWorktreeRegistry {
  /**
   * Load registry from disk.
   */
  load(): Promise<Map<string, WorktreeSession>>;

  /**
   * Save registry to disk.
   */
  save(sessions: Map<string, WorktreeSession>): Promise<void>;

  /**
   * Add or update session in registry.
   */
  upsert(session: WorktreeSession): Promise<void>;

  /**
   * Remove session from registry.
   */
  remove(sessionId: string): Promise<void>;

  /**
   * Clear all sessions.
   */
  clear(): Promise<void>;

  /**
   * Get path to registry file.
   */
  getRegistryPath(): string;
}

// ============================================================================
// Exports
// ============================================================================

export type {
  // Re-export types from types.ts for convenience
  WorktreeSession,
  WorktreeConfig,
  CreateWorktreeOptions,
  WorktreeFilter,
  DiffOptions,
  DiffResult,
  MergeOptions,
  MergeResult,
  RemoveOptions,
  CleanupReport,
  DiskUsageReport,
  ValidationResult,
  GitStatus,
  BranchComparison,
};

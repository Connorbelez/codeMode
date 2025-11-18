/**
 * Worktree Manager Singleton
 *
 * Central coordinator for all git worktree operations in Code Mode.
 * Implements the singleton pattern to ensure centralized state management
 * and prevent multiple registry instances.
 *
 * @module core/worktree/WorktreeManagerSingleton
 */

import { exec, spawn } from "child_process";
import { createHash } from "crypto";
import fs from "fs/promises";
import path from "path";
import { promisify } from "util";
import type {
  IFilesystemOperations,
  IGitOperations,
  IWorktreeManager,
  IWorktreeRegistry,
} from "./api";
import { DEFAULT_WORKTREE_CONFIG } from "./constants";
import { WorktreeErrors } from "./errors";
import { FilesystemOperations } from "./filesystem-operations";
import { GitOperations } from "./git-operations";
import { WorktreeRegistry } from "./registry";
import type {
  BranchComparison,
  CleanupReport,
  CreateWorktreeOptions,
  DiffOptions,
  DiffResult,
  DiskUsageReport,
  GitStatus,
  MergeOptions,
  MergeResult,
  MergeStrategy,
  RemoveOptions,
  ValidationResult,
  WorktreeConfig,
  WorktreeEventUnion,
  WorktreeFilter,
  WorktreeSession,
} from "./types";
import {
  formatBranchName,
  formatDiskSize,
  generateWorktreeId,
  validatePath,
} from "./utils";

const execAsync = promisify(exec);
const EXTERNAL_SESSION_PREFIX = "external-wt-";

/**
 * Singleton manager for git worktree operations.
 *
 * Usage:
 * ```typescript
 * const manager = WorktreeManagerSingleton.getInstance('/path/to/repo');
 * await manager.initialize();
 * const session = await manager.createWorktree('agent-123');
 * ```
 */
export class WorktreeManagerSingleton implements IWorktreeManager {
  private static instances: Map<string, WorktreeManagerSingleton> = new Map();

  private sessions: Map<string, WorktreeSession> = new Map();
  private config: WorktreeConfig = DEFAULT_WORKTREE_CONFIG;
  private gitOps: IGitOperations;
  private fsOps: IFilesystemOperations;
  private registry: IWorktreeRegistry;
  private initialized = false;
  private eventListeners: Map<
    WorktreeEventUnion["type"],
    Array<(event: WorktreeEventUnion) => void>
  > = new Map();
  private currentWorktree?: string;
  private repositoryPath: string;

  /**
   * Private constructor to enforce singleton pattern.
   */
  private constructor(repositoryPath: string) {
    this.repositoryPath = repositoryPath;
    this.gitOps = new GitOperations(repositoryPath);
    this.fsOps = new FilesystemOperations();
    this.registry = new WorktreeRegistry(
      path.join(repositoryPath, this.config.worktreeBaseDir, "registry.json"),
    );
  }

  /**
   * Get the singleton instance for a specific repository path.
   *
   * Creates a new instance lazily if one doesn't exist for the given path.
   * Each repository path gets its own singleton instance.
   *
   * @param repositoryPath - Absolute path to git repository
   * @returns Singleton instance for the given repository path
   */
  public static getInstance(repositoryPath: string): WorktreeManagerSingleton {
    // Normalize the path to ensure consistent keys (resolve to absolute path)
    const normalizedPath = path.resolve(repositoryPath);

    // Check if instance already exists for this path
    if (!WorktreeManagerSingleton.instances.has(normalizedPath)) {
      // Lazily create and store a new instance
      WorktreeManagerSingleton.instances.set(
        normalizedPath,
        new WorktreeManagerSingleton(normalizedPath),
      );
    }

    return WorktreeManagerSingleton.instances.get(normalizedPath)!;
  }

  // =========================================================================
  // Lifecycle Management
  // =========================================================================

  /**
   * Initialize the worktree manager.
   *
   * Loads configuration, validates git version, loads registry from disk,
   * and validates all registered worktrees.
   */
  public async initialize(config?: Partial<WorktreeConfig>): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Merge configuration
    if (config) {
      this.config = {
        ...this.config,
        ...config,
        cleanup: { ...this.config.cleanup, ...config.cleanup },
        limits: { ...this.config.limits, ...config.limits },
        ui: { ...this.config.ui, ...config.ui },
      };
    }

    // Update registry path with new config
    this.registry = new WorktreeRegistry(
      path.join(
        this.repositoryPath,
        this.config.worktreeBaseDir,
        "registry.json",
      ),
    );

    // Enforce git version >= 2.5 (worktree support)
    await this.validateGitVersion();

    // Load registry from disk
    const loadedSessions = await this.registry.load();
    this.sessions = loadedSessions;

    // Validate all loaded worktrees
    await this.validateAllWorktrees();

    this.initialized = true;

    await this.syncRegistry();
  }

  /**
   * Shutdown the worktree manager gracefully.
   */
  public async shutdown(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    // Save registry to disk
    await this.registry.save(this.sessions);

    // Clear event listeners
    this.eventListeners.clear();

    // Reset initialized flag
    this.initialized = false;
  }

  /**
   * Check if manager is initialized.
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  // =========================================================================
  // Worktree Creation & Retrieval
  // =========================================================================

  /**
   * Create a new worktree for an agent session.
   */
  public async createWorktree(
    agentSessionId: string,
    options?: CreateWorktreeOptions,
  ): Promise<WorktreeSession> {
    this.ensureInitialized();

    // Validate not exceeding max concurrent worktrees
    if (this.sessions.size >= this.config.maxConcurrentWorktrees) {
      throw WorktreeErrors.maxWorktreesReached(
        this.config.maxConcurrentWorktrees,
      );
    }

    // Validate disk quota not exceeded
    const diskUsage = await this.getDiskUsage();
    if (diskUsage.limitsExceeded) {
      const currentMB = Math.ceil(diskUsage.totalBytes / (1024 * 1024));
      const limitMB = this.config.limits.maxTotalSizeMB;
      throw WorktreeErrors.diskQuotaExceeded(currentMB, limitMB);
    }

    // Generate unique worktree ID
    const worktreeId = generateWorktreeId();

    // Determine base branch (default to current)
    const baseBranch =
      options?.baseBranch || (await this.gitOps.getCurrentBranch());

    // Generate or validate branch name
    let branchName: string;
    if (options?.branchName) {
      // Validate custom branch name
      const name = options.branchName;

      // Check allowed characters: a-zA-Z0-9, dot, slash, underscore, hyphen
      if (!/^[a-zA-Z0-9._\/-]+$/.test(name)) {
        throw WorktreeErrors.validationFailed(`Invalid branch name: ${name}`);
      }

      // Reject names starting or ending with dot or slash
      if (
        name.startsWith(".") ||
        name.startsWith("/") ||
        name.endsWith(".") ||
        name.endsWith("/")
      ) {
        throw WorktreeErrors.validationFailed(`Invalid branch name: ${name}`);
      }

      // Reject consecutive dots or slashes
      if (name.includes("..") || name.includes("//")) {
        throw WorktreeErrors.validationFailed(`Invalid branch name: ${name}`);
      }

      // Reject sequences "/." or "./"
      if (name.includes("/.") || name.includes("./")) {
        throw WorktreeErrors.validationFailed(`Invalid branch name: ${name}`);
      }

      branchName = name;

      // Check if branch already exists
      if (await this.gitOps.branchExists(branchName)) {
        throw WorktreeErrors.branchExists(branchName);
      }
    } else {
      // Auto-generate branch name
      branchName = formatBranchName(worktreeId, this.config.branchPrefix);
    }

    // Create worktree directory path
    const worktreePath = validatePath(
      path.join(this.config.worktreeBaseDir, worktreeId),
      this.config.worktreeBaseDir,
    );
    const absoluteWorktreePath = path.join(this.repositoryPath, worktreePath);

    // Create worktree via git
    await this.gitOps.createWorktree(
      absoluteWorktreePath,
      branchName,
      baseBranch,
    );

    // Create worktree session object
    const now = new Date();
    const session: WorktreeSession = {
      id: worktreeId,
      agentSessionId,
      worktreePath: absoluteWorktreePath,
      branchName,
      parentBranch: baseBranch,
      status: "active",
      createdAt: now,
      lastAccessedAt: now,
      description: options?.description,
      sandboxId: undefined,
      metadata: {
        hasUncommittedChanges: false,
        hasUnpushedCommits: false,
        commitsAhead: 0,
        commitsBehind: 0,
        filesChanged: 0,
        diffStats: { additions: 0, deletions: 0 },
        diskUsageBytes: 0,
        lastRefreshedAt: now,
      },
    };

    // Save to registry
    await this.registry.upsert(session);
    this.sessions.set(worktreeId, session);

    // Emit created event
    this.emit({
      type: "created",
      session,
      timestamp: now,
    });

    return session;
  }

  /**
   * Get worktree session by ID.
   */
  public getWorktree(sessionId: string): WorktreeSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get worktree session by agent session ID.
   */
  public getWorktreeByAgentSession(
    agentSessionId: string,
  ): WorktreeSession | undefined {
    for (const session of this.sessions.values()) {
      if (session.agentSessionId === agentSessionId) {
        return session;
      }
    }
    return undefined;
  }

  /**
   * List all worktrees with optional filtering.
   */
  public listWorktrees(filter?: WorktreeFilter): WorktreeSession[] {
    let sessions = Array.from(this.sessions.values());

    if (!filter) {
      return sessions.sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      );
    }

    // Apply status filter
    if (filter.status) {
      const statuses = Array.isArray(filter.status)
        ? filter.status
        : [filter.status];
      sessions = sessions.filter((s) => statuses.includes(s.status));
    }

    // Apply agent session filter
    if (filter.agentSessionId) {
      sessions = sessions.filter(
        (s) => s.agentSessionId === filter.agentSessionId,
      );
    }

    // Apply date range filters
    if (filter.createdAfter) {
      sessions = sessions.filter((s) => s.createdAt >= filter.createdAfter!);
    }

    if (filter.createdBefore) {
      sessions = sessions.filter((s) => s.createdAt <= filter.createdBefore!);
    }

    // Apply uncommitted changes filter
    if (filter.hasUncommittedChanges !== undefined) {
      sessions = sessions.filter(
        (s) =>
          s.metadata.hasUncommittedChanges === filter.hasUncommittedChanges,
      );
    }

    // Apply parent branch filter
    if (filter.parentBranch) {
      sessions = sessions.filter((s) => s.parentBranch === filter.parentBranch);
    }

    // Sort by created date descending
    return sessions.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  // =========================================================================
  // Metadata & Status
  // =========================================================================

  /**
   * Refresh worktree metadata from git and filesystem.
   */
  public async refreshWorktreeMetadata(
    sessionId: string,
  ): Promise<WorktreeSession> {
    this.ensureInitialized();

    const session = this.getWorktree(sessionId);
    if (!session) {
      throw WorktreeErrors.notFound(sessionId);
    }

    // Get git status
    const status = await this.gitOps.getStatus(session.worktreePath);

    // Get ahead/behind counts
    const { ahead, behind } = await this.gitOps.getAheadBehind(
      session.branchName,
      session.parentBranch,
    );

    // Get disk usage
    const diskUsageBytes = await this.fsOps.getDiskUsage(session.worktreePath);

    // Get diff stats
    const diff = await this.gitOps.getDiff(
      session.parentBranch,
      session.branchName,
      { stat: true },
    );

    // Update metadata
    session.metadata = {
      hasUncommittedChanges: !status.isClean,
      hasUnpushedCommits: ahead > 0,
      commitsAhead: ahead,
      commitsBehind: behind,
      filesChanged: diff.filesChanged.length,
      diffStats: {
        additions: diff.additions,
        deletions: diff.deletions,
      },
      diskUsageBytes,
      lastRefreshedAt: new Date(),
      lastTestResult: session.metadata.lastTestResult,
    };

    session.lastAccessedAt = new Date();

    // Save to registry
    await this.registry.upsert(session);
    this.sessions.set(sessionId, session);

    // Emit metadata updated event
    this.emit({
      type: "metadata_updated",
      sessionId,
      metadata: session.metadata,
      timestamp: new Date(),
    });

    return session;
  }

  /**
   * Get detailed git status for a worktree.
   */
  public async getGitStatus(sessionId: string): Promise<GitStatus> {
    this.ensureInitialized();

    const session = this.getWorktree(sessionId);
    if (!session) {
      throw WorktreeErrors.notFound(sessionId);
    }

    return await this.gitOps.getStatus(session.worktreePath);
  }

  /**
   * Compare worktree branch with another branch.
   */
  public async compareBranches(
    sessionId: string,
    targetBranch: string,
  ): Promise<BranchComparison> {
    this.ensureInitialized();

    const session = this.getWorktree(sessionId);
    if (!session) {
      throw WorktreeErrors.notFound(sessionId);
    }

    const { ahead, behind } = await this.gitOps.getAheadBehind(
      session.branchName,
      targetBranch,
    );

    const mergeBase = await this.gitOps.getMergeBase(
      session.branchName,
      targetBranch,
    );

    const potentialConflicts = await this.gitOps.checkMergeConflicts(
      session.branchName,
      targetBranch,
    );

    // Can fast-forward if behind === 0 and no conflicts
    const canFastForward = behind === 0 && potentialConflicts.length === 0;

    return {
      sourceBranch: session.branchName,
      targetBranch,
      commitsAhead: ahead,
      commitsBehind: behind,
      mergeBase,
      canFastForward,
      potentialConflicts,
    };
  }

  // =========================================================================
  // Navigation & Context Switching
  // =========================================================================

  /**
   * Switch current working directory to a worktree.
   */
  public async switchToWorktree(sessionId: string): Promise<void> {
    this.ensureInitialized();

    const session = this.getWorktree(sessionId);
    if (!session) {
      throw WorktreeErrors.notFound(sessionId);
    }

    const previousSessionId = this.currentWorktree;
    this.currentWorktree = sessionId;

    // Update last accessed
    session.lastAccessedAt = new Date();
    await this.registry.upsert(session);

    // Emit switched event
    this.emit({
      type: "switched",
      sessionId,
      previousSessionId,
      timestamp: new Date(),
    });
  }

  /**
   * Get currently active worktree session ID.
   */
  public getCurrentWorktree(): string | undefined {
    return this.currentWorktree;
  }

  /**
   * Switch back to main repository.
   */
  public async switchToMainRepo(): Promise<void> {
    this.ensureInitialized();

    const previousSessionId = this.currentWorktree;
    this.currentWorktree = undefined;

    if (previousSessionId) {
      this.emit({
        type: "switched",
        sessionId: "main",
        previousSessionId,
        timestamp: new Date(),
      });
    }
  }

  // =========================================================================
  // Diff & Comparison
  // =========================================================================

  /**
   * Generate diff between two worktrees or worktree and branch.
   */
  public async diffWorktrees(
    source: string,
    target: string,
    options?: DiffOptions,
  ): Promise<DiffResult> {
    this.ensureInitialized();

    // Resolve source and target to branch names
    const sourceBranch = this.resolveToBranch(source);
    const targetBranch = this.resolveToBranch(target);

    return await this.gitOps.getDiff(sourceBranch, targetBranch, options);
  }

  /**
   * Generate comparison matrix for multiple worktrees.
   */
  public async compareMultipleWorktrees(
    sessionIds: string[],
  ): Promise<Map<string, Map<string, DiffResult>>> {
    this.ensureInitialized();

    // Validate all session IDs exist
    for (const id of sessionIds) {
      if (!this.getWorktree(id)) {
        throw WorktreeErrors.notFound(id);
      }
    }

    const matrix = new Map<string, Map<string, DiffResult>>();

    // Generate pairwise combinations
    for (let i = 0; i < sessionIds.length; i++) {
      const sourceId = sessionIds[i];
      const sourceMap = new Map<string, DiffResult>();

      for (let j = 0; j < sessionIds.length; j++) {
        if (i === j) continue;

        const targetId = sessionIds[j];
        const diff = await this.diffWorktrees(sourceId, targetId);
        sourceMap.set(targetId, diff);
      }

      matrix.set(sourceId, sourceMap);
    }

    return matrix;
  }

  // =========================================================================
  // Merge Operations
  // =========================================================================

  /**
   * Merge worktree changes back to target branch.
   */
  public async mergeWorktree(
    sessionId: string,
    options?: MergeOptions,
  ): Promise<MergeResult> {
    this.ensureInitialized();

    const session = this.getWorktree(sessionId);
    if (!session) {
      throw WorktreeErrors.notFound(sessionId);
    }

    // Determine target branch
    const targetBranch = options?.targetBranch || session.parentBranch;
    const strategy = options?.strategy || this.config.ui.defaultMergeStrategy;

    // Check for uncommitted changes unless allowed
    if (!options?.allowUncommitted) {
      const status = await this.gitOps.getStatus(session.worktreePath);
      if (!status.isClean) {
        throw WorktreeErrors.uncommittedChanges(sessionId);
      }
    }

    // Run tests if configured or requested
    if (options?.runTests || this.config.requireTestsPassBeforeMerge) {
      const testsPassed = await this.runTests(session.worktreePath);
      if (!testsPassed) {
        throw WorktreeErrors.testsFailed();
      }
    }

    // Perform merge (against repository root)
    const mergeResult = await this.gitOps.merge(session.branchName, strategy, {
      message: options?.commitMessage,
      cwd: this.repositoryPath,
    });

    if (!mergeResult.success) {
      return {
        success: false,
        targetBranch,
        conflicts: mergeResult.conflicts,
        message: "Merge conflicts detected",
        timestamp: new Date(),
      };
    }

    // Get commit hash
    const { stdout: commitHash } = await execAsync("git rev-parse HEAD", {
      cwd: this.repositoryPath,
    });

    // Update session status
    session.status = "merged";
    await this.registry.upsert(session);
    this.sessions.set(sessionId, session);

    const result: MergeResult = {
      success: true,
      targetBranch,
      commitHash: commitHash.trim(),
      message: "Successfully merged",
      timestamp: new Date(),
    };

    // Emit merged event
    this.emit({
      type: "merged",
      sessionId,
      result,
      timestamp: new Date(),
    });

    // Remove worktree if requested
    if (options?.deleteAfterMerge) {
      await this.removeWorktree(sessionId, { deleteBranch: true });
    }

    return result;
  }

  /**
   * Check if worktree can be merged cleanly.
   */
  public async canMergeCleanly(
    sessionId: string,
    targetBranch?: string,
  ): Promise<{
    canMerge: boolean;
    conflicts: string[];
    strategy: MergeStrategy;
  }> {
    this.ensureInitialized();

    const session = this.getWorktree(sessionId);
    if (!session) {
      throw WorktreeErrors.notFound(sessionId);
    }

    const target = targetBranch || session.parentBranch;
    const conflicts = await this.gitOps.checkMergeConflicts(
      session.branchName,
      target,
    );

    // Determine best strategy
    const comparison = await this.compareBranches(sessionId, target);
    const strategy: MergeStrategy = comparison.canFastForward
      ? "fast-forward"
      : this.config.ui.defaultMergeStrategy;

    return {
      canMerge: conflicts.length === 0,
      conflicts,
      strategy,
    };
  }

  // =========================================================================
  // Cleanup & Removal
  // =========================================================================

  /**
   * Remove a worktree and optionally delete its branch.
   */
  public async removeWorktree(
    sessionId: string,
    options?: RemoveOptions,
  ): Promise<void> {
    this.ensureInitialized();

    const session = this.getWorktree(sessionId);
    if (!session) {
      throw WorktreeErrors.notFound(sessionId);
    }

    // Check for uncommitted changes unless force
    if (!options?.force) {
      const status = await this.gitOps.getStatus(session.worktreePath);
      if (!status.isClean) {
        throw WorktreeErrors.uncommittedChanges(sessionId);
      }
    }

    // Remove worktree
    await this.gitOps.removeWorktree(session.worktreePath, options?.force);

    // Delete branch if requested
    if (options?.deleteBranch) {
      await this.gitOps.deleteBranch(session.branchName, options?.force);
    }

    // Remove from registry
    await this.registry.remove(sessionId);
    this.sessions.delete(sessionId);

    // Emit removed event
    this.emit({
      type: "removed",
      sessionId,
      reason: "user_requested",
      timestamp: new Date(),
    });
  }

  /**
   * Clean up worktrees based on retention policy.
   */
  public async cleanupWorktrees(): Promise<CleanupReport> {
    this.ensureInitialized();

    const removed: string[] = [];
    const retained: string[] = [];
    const errors: Array<{ sessionId: string; error: string }> = [];
    let diskSpaceFreed = 0;

    const now = new Date();
    const retentionMs = this.config.cleanup.retentionDays * 24 * 60 * 60 * 1000;

    for (const [sessionId, session] of this.sessions.entries()) {
      let shouldRemove = false;

      // Check if merged and cleanup on merge is enabled
      if (session.status === "merged" && this.config.cleanup.onMerge) {
        shouldRemove = true;
      }

      // Check if abandoned and past retention period
      if (
        session.status === "abandoned" &&
        now.getTime() - session.lastAccessedAt.getTime() > retentionMs
      ) {
        shouldRemove = true;
      }

      if (shouldRemove) {
        try {
          const diskUsage = session.metadata.diskUsageBytes;
          await this.removeWorktree(sessionId, {
            force: true,
            deleteBranch: true,
          });
          removed.push(sessionId);
          diskSpaceFreed += diskUsage;
        } catch (error) {
          errors.push({
            sessionId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      } else {
        retained.push(sessionId);
      }
    }

    return {
      removed,
      retained,
      errors,
      diskSpaceFreed,
      timestamp: now,
    };
  }

  /**
   * Remove all worktrees (emergency cleanup).
   */
  public async removeAllWorktrees(force = false): Promise<CleanupReport> {
    this.ensureInitialized();

    const removed: string[] = [];
    const errors: Array<{ sessionId: string; error: string }> = [];
    let diskSpaceFreed = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      try {
        const diskUsage = session.metadata.diskUsageBytes;
        await this.removeWorktree(sessionId, { force, deleteBranch: true });
        removed.push(sessionId);
        diskSpaceFreed += diskUsage;
      } catch (error) {
        errors.push({
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      removed,
      retained: [],
      errors,
      diskSpaceFreed,
      timestamp: new Date(),
    };
  }

  // =========================================================================
  // Disk & Resource Management
  // =========================================================================

  /**
   * Get disk usage statistics for all worktrees.
   */
  public async getDiskUsage(): Promise<DiskUsageReport> {
    this.ensureInitialized();

    let totalBytes = 0;
    const worktrees: Array<{
      sessionId: string;
      sizeBytes: number;
      path: string;
    }> = [];
    const warnings: string[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      const sizeBytes = await this.fsOps.getDiskUsage(session.worktreePath);
      totalBytes += sizeBytes;

      worktrees.push({
        sessionId,
        sizeBytes,
        path: session.worktreePath,
      });

      // Check individual worktree limit
      const limitMB = this.config.limits.maxWorktreeSizeMB;
      const sizeMB = sizeBytes / (1024 * 1024);
      if (sizeMB > limitMB) {
        warnings.push(
          `Worktree ${sessionId} exceeds limit: ${formatDiskSize(sizeBytes)} > ${limitMB}MB`,
        );
      }
    }

    // Check total limit
    const totalLimitMB = this.config.limits.maxTotalSizeMB;
    const totalMB = totalBytes / (1024 * 1024);
    const limitsExceeded = totalMB > totalLimitMB;

    if (limitsExceeded) {
      warnings.push(
        `Total disk usage exceeds limit: ${formatDiskSize(totalBytes)} > ${totalLimitMB}MB`,
      );
    }

    // Emit warning event if limits exceeded
    const report: DiskUsageReport = {
      totalBytes,
      worktrees,
      timestamp: new Date(),
      limitsExceeded,
      warnings,
    };

    if (limitsExceeded) {
      this.emit({
        type: "disk_warning",
        usage: report,
        timestamp: new Date(),
      });
    }

    return report;
  }

  /**
   * Check if disk quota limits are exceeded.
   */
  public async isDiskQuotaExceeded(): Promise<boolean> {
    const usage = await this.getDiskUsage();
    return usage.limitsExceeded;
  }

  /**
   * Estimate disk space needed for new worktree.
   */
  public async estimateWorktreeSize(): Promise<number> {
    // Estimate based on current working directory size
    return await this.fsOps.getDiskUsage(this.repositoryPath);
  }

  // =========================================================================
  // Validation & Repair
  // =========================================================================

  /**
   * Validate worktree state and repair if needed.
   */
  public async validateWorktree(sessionId: string): Promise<ValidationResult> {
    const session = this.getWorktree(sessionId);
    if (!session) {
      return {
        valid: false,
        issues: ["Worktree not found in registry"],
        repaired: false,
        timestamp: new Date(),
      };
    }

    const issues: string[] = [];
    let repaired = false;
    const repairDetails: string[] = [];

    // Check directory exists
    const dirExists = await this.fsOps.exists(session.worktreePath);
    if (!dirExists) {
      issues.push("Worktree directory does not exist");
    }

    // Check branch exists
    const branchExists = await this.gitOps.branchExists(session.branchName);
    if (!branchExists) {
      issues.push("Git branch does not exist");
    }

    // If issues found, attempt repair
    if (issues.length > 0 && !dirExists) {
      // Remove from registry if directory is gone
      await this.registry.remove(sessionId);
      this.sessions.delete(sessionId);
      repaired = true;
      repairDetails.push("Removed orphaned registry entry");
    }

    return {
      valid: issues.length === 0,
      issues,
      repaired,
      repairDetails: repairDetails.length > 0 ? repairDetails : undefined,
      timestamp: new Date(),
    };
  }

  /**
   * Validate all registered worktrees.
   */
  public async validateAllWorktrees(): Promise<Map<string, ValidationResult>> {
    const results = new Map<string, ValidationResult>();

    for (const sessionId of this.sessions.keys()) {
      const result = await this.validateWorktree(sessionId);
      results.set(sessionId, result);
    }

    return results;
  }

  /**
   * Synchronize registry with actual git worktrees.
   */
  public async syncRegistry(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    const gitWorktrees = await this.gitOps.listWorktrees();
    const gitPaths = new Set<string>();

    for (const worktree of gitWorktrees) {
      const normalizedPath = path.isAbsolute(worktree.path)
        ? worktree.path
        : path.join(this.repositoryPath, worktree.path);

      gitPaths.add(normalizedPath);

      // Skip the primary workspace entry
      if (normalizedPath === this.repositoryPath) {
        continue;
      }

      const existing = this.getSessionByPath(normalizedPath);
      if (!existing) {
        await this.importGitWorktree(normalizedPath, worktree.branch);
      }
    }

    for (const [sessionId, session] of Array.from(this.sessions.entries())) {
      if (session.worktreePath === this.repositoryPath) {
        continue;
      }
      if (!gitPaths.has(session.worktreePath)) {
        await this.registry.remove(sessionId);
        this.sessions.delete(sessionId);
      }
    }
  }

  // =========================================================================
  // Configuration
  // =========================================================================

  /**
   * Get current configuration.
   */
  public getConfig(): WorktreeConfig {
    return { ...this.config };
  }

  /**
   * Update configuration at runtime.
   */
  public async updateConfig(config: Partial<WorktreeConfig>): Promise<void> {
    this.config = {
      ...this.config,
      ...config,
      cleanup: { ...this.config.cleanup, ...config.cleanup },
      limits: { ...this.config.limits, ...config.limits },
      ui: { ...this.config.ui, ...config.ui },
    };

    // Save to registry
    await this.registry.save(this.sessions);
  }

  // =========================================================================
  // Events
  // =========================================================================

  /**
   * Register event listener.
   */
  public on(
    event: WorktreeEventUnion["type"],
    handler: (event: WorktreeEventUnion) => void,
  ): void {
    const handlers = this.eventListeners.get(event) || [];
    handlers.push(handler);
    this.eventListeners.set(event, handlers);
  }

  /**
   * Unregister event listener.
   */
  public off(
    event: WorktreeEventUnion["type"],
    handler: (event: WorktreeEventUnion) => void,
  ): void {
    const handlers = this.eventListeners.get(event) || [];
    const index = handlers.indexOf(handler);
    if (index >= 0) {
      handlers.splice(index, 1);
      this.eventListeners.set(event, handlers);
    }
  }

  /**
   * Emit an event.
   */
  public emit(event: WorktreeEventUnion): void {
    const handlers = this.eventListeners.get(event.type) || [];
    for (const handler of handlers) {
      try {
        handler(event);
      } catch (error) {
        // Log error but don't let handler failures break the system
        console.error(`Error in event handler for ${event.type}:`, error);
      }
    }
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  private getSessionByPath(worktreePath: string): WorktreeSession | undefined {
    const normalized = path.resolve(worktreePath);
    for (const session of this.sessions.values()) {
      if (path.resolve(session.worktreePath) === normalized) {
        return session;
      }
    }
    return undefined;
  }

  private generateExternalSessionId(worktreePath: string): string {
    const hash = createHash("sha1").update(worktreePath).digest("hex");
    return `${EXTERNAL_SESSION_PREFIX}${hash.slice(0, 12)}`;
  }

  private async importGitWorktree(
    worktreePath: string,
    branchName: string,
  ): Promise<WorktreeSession> {
    const now = new Date();
    const sessionId = this.generateExternalSessionId(worktreePath);
    const branch = branchName || path.basename(worktreePath);

    const session: WorktreeSession = {
      id: sessionId,
      agentSessionId: "external",
      worktreePath,
      branchName: branch,
      parentBranch: branch,
      status: "active",
      createdAt: now,
      lastAccessedAt: now,
      description: "Imported from existing git worktree",
      metadata: {
        hasUncommittedChanges: false,
        hasUnpushedCommits: false,
        commitsAhead: 0,
        commitsBehind: 0,
        filesChanged: 0,
        diffStats: {
          additions: 0,
          deletions: 0,
        },
        diskUsageBytes: 0,
        lastRefreshedAt: now,
      },
    };

    this.sessions.set(sessionId, session);
    await this.registry.upsert(session);

    try {
      await this.refreshWorktreeMetadata(sessionId);
    } catch (error) {
      console.warn(
        `[WorktreeManager] Failed to refresh metadata for imported worktree ${sessionId}:`,
        error,
      );
    }

    return session;
  }

  /**
   * Ensure manager is initialized.
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw WorktreeErrors.gitOperationFailed(
        "Manager not initialized. Call initialize() first.",
      );
    }
  }

  /**
   * Validate git version >= 2.5.
   */
  private async validateGitVersion(): Promise<void> {
    try {
      const { stdout } = await execAsync("git --version");
      const match = stdout.match(/git version (\d+)\.(\d+)/);
      if (!match) {
        throw new Error("Could not parse git version");
      }

      const major = parseInt(match[1], 10);
      const minor = parseInt(match[2], 10);

      if (major < 2 || (major === 2 && minor < 5)) {
        throw WorktreeErrors.gitOperationFailed(
          `Git version 2.5 or higher required for worktree support. Found: ${major}.${minor}`,
        );
      }
    } catch (error) {
      throw WorktreeErrors.gitOperationFailed(
        `Failed to verify git version: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Resolve session ID or branch name to branch name.
   */
  private resolveToBranch(identifier: string): string {
    const session = this.getWorktree(identifier);
    return session ? session.branchName : identifier;
  }

  /**
   * Run tests in worktree.
   * Reads package.json to determine the test command, runs it with timeout,
   * and returns true only if tests pass (exit code 0).
   */
  private async runTests(worktreePath: string): Promise<boolean> {
    const TEST_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes default timeout
    const packageJsonPath = path.join(worktreePath, "package.json");

    // Determine test command
    let testCommand: string;
    let testArgs: string[] = [];

    try {
      const packageJsonContent = await fs.readFile(packageJsonPath, "utf-8");
      const packageJson = JSON.parse(packageJsonContent);
      const testScript = packageJson.scripts?.test;

      if (testScript) {
        // Use npm run to execute the script from package.json
        testCommand = "npm";
        testArgs = ["run", "test"];
      } else {
        // Fallback to npm test
        testCommand = "npm";
        testArgs = ["test"];
      }
    } catch (error) {
      // If package.json doesn't exist or is invalid, fallback to npm test
      testCommand = "npm";
      testArgs = ["test"];
    }

    return new Promise<boolean>((resolve) => {
      const child = spawn(testCommand, testArgs, {
        cwd: worktreePath,
        shell: true,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let timeoutId: NodeJS.Timeout;
      let isResolved = false;

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      };

      // Set timeout
      timeoutId = setTimeout(() => {
        if (isResolved) return;
        isResolved = true;
        cleanup();
        child.kill("SIGTERM");

        // Give it a moment, then force kill
        setTimeout(() => {
          if (!child.killed) {
            child.kill("SIGKILL");
          }
        }, 1000);

        const output = `Test command timed out after ${TEST_TIMEOUT_MS / 1000} seconds.\n\nStdout:\n${stdout}\n\nStderr:\n${stderr}`;
        console.error(`[WorktreeManager] Tests failed: ${output}`);
        resolve(false);
      }, TEST_TIMEOUT_MS);

      // Capture stdout
      child.stdout?.on("data", (data: Buffer) => {
        const text = data.toString();
        stdout += text;
        // Stream output in real-time for visibility
        process.stdout.write(text);
      });

      // Capture stderr
      child.stderr?.on("data", (data: Buffer) => {
        const text = data.toString();
        stderr += text;
        // Stream output in real-time for visibility
        process.stderr.write(text);
      });

      // Handle process completion
      child.on("close", (code) => {
        if (isResolved) return;
        isResolved = true;
        cleanup();

        if (code === 0) {
          console.log(`[WorktreeManager] Tests passed in ${worktreePath}`);
          resolve(true);
        } else {
          const output = `Test command exited with code ${code}.\n\nStdout:\n${stdout}\n\nStderr:\n${stderr}`;
          console.error(`[WorktreeManager] Tests failed: ${output}`);
          resolve(false);
        }
      });

      // Handle spawn errors
      child.on("error", (error) => {
        if (isResolved) return;
        isResolved = true;
        cleanup();

        const output = `Failed to spawn test command: ${error.message}\n\nCommand: ${testCommand} ${testArgs.join(" ")}`;
        console.error(`[WorktreeManager] Tests failed: ${output}`);
        resolve(false);
      });
    });
  }
}

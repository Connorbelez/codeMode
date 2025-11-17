import type { WorktreeConfig } from "./types";

export const WORKTREE_BASE_DIR = ".worktrees";
export const BRANCH_PREFIX = "claude/";
export const REGISTRY_PATH = ".codemode/worktrees.json";
export const MAX_CONCURRENT_WORKTREES = 10;
export const RETENTION_DAYS = 7;
export const MAX_WORKTREE_SIZE_MB = 500;
export const MAX_TOTAL_SIZE_MB = 5000;

/**
 * Default configuration for the worktree manager.
 */
export const DEFAULT_WORKTREE_CONFIG: WorktreeConfig = {
  worktreeBaseDir: WORKTREE_BASE_DIR,
  branchPrefix: BRANCH_PREFIX,
  maxConcurrentWorktrees: MAX_CONCURRENT_WORKTREES,
  cleanup: {
    onSessionEnd: false,
    onMerge: true,
    retentionDays: RETENTION_DAYS,
  },
  requireTestsPassBeforeMerge: false,
  limits: {
    maxWorktreeSizeMB: MAX_WORKTREE_SIZE_MB,
    maxTotalSizeMB: MAX_TOTAL_SIZE_MB,
  },
  ui: {
    showDiskUsage: true,
    confirmBeforeRemove: true,
    defaultMergeStrategy: "squash",
    showDiffStats: true,
  },
};

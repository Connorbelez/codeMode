/**
 * Worktree error definitions and helpers.
 *
 * Centralizes the `WorktreeError` class, error codes, and convenience factory
 * helpers used across the worktree management system.
 */

/**
 * Error codes for worktree operations.
 */
export enum WorktreeErrorCode {
  CREATION_FAILED = "CREATION_FAILED",
  WORKTREE_NOT_FOUND = "WORKTREE_NOT_FOUND",
  BRANCH_EXISTS = "BRANCH_EXISTS",
  BRANCH_NOT_FOUND = "BRANCH_NOT_FOUND",
  INVALID_STATE = "INVALID_STATE",
  MERGE_CONFLICT = "MERGE_CONFLICT",
  DISK_QUOTA_EXCEEDED = "DISK_QUOTA_EXCEEDED",
  MAX_WORKTREES_REACHED = "MAX_WORKTREES_REACHED",
  GIT_OPERATION_FAILED = "GIT_OPERATION_FAILED",
  UNCOMMITTED_CHANGES = "UNCOMMITTED_CHANGES",
  VALIDATION_FAILED = "VALIDATION_FAILED",
  PATH_NOT_FOUND = "PATH_NOT_FOUND",
  PERMISSION_DENIED = "PERMISSION_DENIED",
  TESTS_FAILED = "TESTS_FAILED",
  ALREADY_EXISTS = "ALREADY_EXISTS",
}

/**
 * Custom error for worktree operations.
 */
export class WorktreeError extends Error {
  constructor(
    message: string,
    public code: WorktreeErrorCode,
    public sessionId?: string,
    public cause?: Error,
  ) {
    super(message);
    this.name = "WorktreeError";

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, WorktreeError);
    }
  }

  /**
   * Convert error into a JSON-friendly payload for logging/telemetry.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      sessionId: this.sessionId,
      cause: this.cause?.message,
      stack: this.stack,
    };
  }
}

/**
 * Factory helpers for commonly-thrown errors.
 */
export class WorktreeErrors {
  static notFound(sessionId: string): WorktreeError {
    return new WorktreeError(
      `Worktree session not found: ${sessionId}`,
      WorktreeErrorCode.WORKTREE_NOT_FOUND,
      sessionId,
    );
  }

  static alreadyExists(resource: string): WorktreeError {
    return new WorktreeError(
      `Resource already exists: ${resource}`,
      WorktreeErrorCode.ALREADY_EXISTS,
    );
  }

  static branchExists(branchName: string): WorktreeError {
    return new WorktreeError(
      `Branch already exists: ${branchName}`,
      WorktreeErrorCode.BRANCH_EXISTS,
    );
  }

  static branchNotFound(branchName: string): WorktreeError {
    return new WorktreeError(
      `Branch not found: ${branchName}`,
      WorktreeErrorCode.BRANCH_NOT_FOUND,
    );
  }

  static creationFailed(message: string, cause?: Error): WorktreeError {
    return new WorktreeError(
      `Failed to create worktree: ${message}`,
      WorktreeErrorCode.CREATION_FAILED,
      undefined,
      cause,
    );
  }

  static mergeConflict(sessionId: string, conflicts?: string[]): WorktreeError {
    const details =
      conflicts && conflicts.length > 0
        ? ` Conflicts: ${conflicts.join(", ")}`
        : "";
    return new WorktreeError(
      `Merge conflict in worktree ${sessionId}.${details}`,
      WorktreeErrorCode.MERGE_CONFLICT,
      sessionId,
    );
  }

  static invalidState(sessionId: string, reason: string): WorktreeError {
    return new WorktreeError(
      `Invalid worktree state (${sessionId}): ${reason}`,
      WorktreeErrorCode.INVALID_STATE,
      sessionId,
    );
  }

  static gitOperationFailed(operation: string, cause?: Error): WorktreeError {
    return new WorktreeError(
      `Git operation failed: ${operation}`,
      WorktreeErrorCode.GIT_OPERATION_FAILED,
      undefined,
      cause,
    );
  }

  static maxWorktreesReached(limit: number): WorktreeError {
    return new WorktreeError(
      `Maximum number of worktrees reached (${limit}).`,
      WorktreeErrorCode.MAX_WORKTREES_REACHED,
    );
  }

  static diskQuotaExceeded(currentMB: number, limitMB: number): WorktreeError {
    return new WorktreeError(
      `Disk quota exceeded: ${currentMB}MB / ${limitMB}MB`,
      WorktreeErrorCode.DISK_QUOTA_EXCEEDED,
    );
  }

  static uncommittedChanges(sessionId: string): WorktreeError {
    return new WorktreeError(
      `Worktree ${sessionId} has uncommitted changes.`,
      WorktreeErrorCode.UNCOMMITTED_CHANGES,
      sessionId,
    );
  }

  static validationFailed(message: string): WorktreeError {
    return new WorktreeError(
      `Validation failed: ${message}`,
      WorktreeErrorCode.VALIDATION_FAILED,
    );
  }

  static pathNotFound(path: string): WorktreeError {
    return new WorktreeError(
      `Path not found: ${path}`,
      WorktreeErrorCode.PATH_NOT_FOUND,
    );
  }

  static permissionDenied(path: string, cause?: Error): WorktreeError {
    return new WorktreeError(
      `Permission denied: ${path}`,
      WorktreeErrorCode.PERMISSION_DENIED,
      undefined,
      cause,
    );
  }

  static testsFailed(details?: string): WorktreeError {
    const suffix = details ? `: ${details}` : "";
    return new WorktreeError(
      `Tests failed${suffix}`,
      WorktreeErrorCode.TESTS_FAILED,
    );
  }
}

/**
 * Runtime guard for identifying worktree errors.
 */
export function isWorktreeError(value: unknown): value is WorktreeError {
  return value instanceof WorktreeError;
}

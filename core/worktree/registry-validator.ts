/**
 * Registry validation utilities.
 *
 * Validates worktree sessions loaded from registry and removes orphaned entries.
 */

import type { WorktreeSession } from "./types";
import type { IGitOperations, IFilesystemOperations } from "./api";

export interface ValidationReport {
  /** Sessions that passed validation */
  valid: WorktreeSession[];

  /** Session IDs that were removed (orphaned) */
  orphaned: string[];

  /** Warnings for sessions that had issues */
  warnings: string[];
}

/**
 * Validate all sessions in the registry.
 *
 * Checks:
 * - Worktree path exists on filesystem
 * - Branch exists in git
 *
 * Removes orphaned entries and returns report.
 */
export async function validateRegistry(
  sessions: Map<string, WorktreeSession>,
  gitOps: IGitOperations,
  fsOps: IFilesystemOperations,
): Promise<ValidationReport> {
  const valid: WorktreeSession[] = [];
  const orphaned: string[] = [];
  const warnings: string[] = [];

  for (const [id, session] of sessions.entries()) {
    let isValid = true;

    // Check if worktree path exists
    const pathExists = await fsOps.exists(session.worktreePath);
    if (!pathExists) {
      warnings.push(
        `Session ${id}: Worktree path does not exist: ${session.worktreePath}`,
      );
      orphaned.push(id);
      isValid = false;
    }

    // Check if branch exists (only if path check passed)
    if (isValid) {
      try {
        const branchExists = await gitOps.branchExists(session.branchName);
        if (!branchExists) {
          warnings.push(
            `Session ${id}: Branch does not exist: ${session.branchName}`,
          );
          orphaned.push(id);
          isValid = false;
        }
      } catch (error) {
        warnings.push(
          `Session ${id}: Failed to check branch existence: ${error instanceof Error ? error.message : String(error)}`,
        );
        orphaned.push(id);
        isValid = false;
      }
    }

    if (isValid) {
      valid.push(session);
    } else {
      // Remove orphaned entry from map
      sessions.delete(id);
    }
  }

  // Log warnings
  if (warnings.length > 0) {
    console.warn(
      `Registry validation found ${orphaned.length} orphaned entries:`,
    );
    warnings.forEach((warning) => console.warn(`  - ${warning}`));
  }

  return {
    valid,
    orphaned,
    warnings,
  };
}

/**
 * Git Worktree Management CLI Commands
 *
 * Provides command-line interface for managing git worktrees for agent sessions.
 *
 * @module commands/worktree
 */

import chalk from "chalk";
import { WorktreeManagerSingleton } from "../../../../core/worktree/WorktreeManagerSingleton.js";
import type {
  WorktreeSession,
  WorktreeFilter,
  WorktreeStatus,
  MergeStrategy,
} from "../../../../core/worktree/types.js";
import { isWorktreeError } from "../../../../core/worktree/types.js";
import { gracefulExit } from "../util/exit.js";
import { logger } from "../util/logger.js";

/**
 * Get the worktree manager instance for the current repository.
 */
function getManager(): ReturnType<typeof WorktreeManagerSingleton.getInstance> {
  const repositoryPath = process.cwd();
  return WorktreeManagerSingleton.getInstance(repositoryPath);
}

/**
 * Format a date for display
 */
function formatDate(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return `${seconds}s ago`;
}

/**
 * Format disk size for display
 */
function formatDiskSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return unitIndex === 0
    ? `${size} ${units[unitIndex]}`
    : `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Get color for worktree status
 */
function getStatusColor(status: WorktreeStatus): string {
  switch (status) {
    case "active":
      return "green";
    case "merged":
      return "blue";
    case "error":
      return "red";
    case "abandoned":
      return "gray";
    default:
      return "white";
  }
}

/**
 * Handle errors from worktree operations
 */
function handleError(error: unknown): never {
  if (isWorktreeError(error)) {
    console.error(chalk.red(`Error: ${error.message}`));
    if (error.details) {
      console.error(chalk.gray(error.details));
    }
    logger.error("Worktree operation failed", { error: error.toJSON() });
  } else if (error instanceof Error) {
    console.error(chalk.red(`Error: ${error.message}`));
    logger.error("Worktree operation failed", { error: error.message });
  } else {
    console.error(chalk.red(`Unknown error: ${String(error)}`));
    logger.error("Worktree operation failed", { error: String(error) });
  }
  process.exit(1);
}

// ============================================================================
// Command Implementations
// ============================================================================

/**
 * Create a new worktree
 */
export async function worktreeCreate(options: {
  baseBranch?: string;
  description?: string;
  branchName?: string;
  agentSessionId?: string;
}): Promise<void> {
  try {
    const manager = getManager();
    await manager.initialize();

    const agentId = options.agentSessionId || `cli-${Date.now()}`;

    console.log(chalk.blue("Creating worktree..."));

    const session = await manager.createWorktree(agentId, {
      baseBranch: options.baseBranch,
      description: options.description,
      branchName: options.branchName,
    });

    console.log(chalk.green("\n✓ Worktree created successfully!\n"));
    console.log(`  ${chalk.bold("ID:")}          ${session.id}`);
    console.log(`  ${chalk.bold("Branch:")}      ${session.branchName}`);
    console.log(`  ${chalk.bold("Path:")}        ${session.worktreePath}`);
    console.log(`  ${chalk.bold("Base branch:")} ${session.parentBranch}`);
    if (session.description) {
      console.log(`  ${chalk.bold("Description:")} ${session.description}`);
    }

    console.log(
      chalk.gray("\nTo switch to this worktree: ") +
        chalk.cyan(`cd ${session.worktreePath}`),
    );

    await manager.shutdown();
  } catch (error) {
    handleError(error);
  }
}

/**
 * List all worktrees
 */
export async function worktreeList(options: {
  status?: WorktreeStatus;
  format?: "table" | "json";
}): Promise<void> {
  try {
    const manager = getManager();
    await manager.initialize();

    const filter: WorktreeFilter = options.status
      ? { status: options.status }
      : {};

    const sessions = manager.listWorktrees(filter);

    if (options.format === "json") {
      console.log(JSON.stringify(sessions, null, 2));
      await manager.shutdown();
      return;
    }

    if (sessions.length === 0) {
      console.log(chalk.yellow("No worktrees found."));
      await manager.shutdown();
      return;
    }

    console.log(
      chalk.bold(
        "\n ID          Branch                Status    Age      Files  Disk    ",
      ),
    );
    console.log(chalk.gray("─".repeat(75)));

    for (const session of sessions) {
      const id = session.id.padEnd(11);
      const branch = session.branchName.substring(0, 20).padEnd(21);
      const status = session.status.padEnd(9);
      const statusColor = getStatusColor(session.status);
      const age = formatDate(session.createdAt).padEnd(8);
      const files = String(session.metadata.filesChanged).padStart(5);
      const disk = formatDiskSize(session.metadata.diskUsageBytes).padStart(7);

      console.log(
        ` ${chalk.cyan(id)} ${branch} ${chalk[statusColor](status)} ${age} ${files}  ${disk}`,
      );
    }

    console.log();

    await manager.shutdown();
  } catch (error) {
    handleError(error);
  }
}

/**
 * Show diff between worktrees or branches
 */
export async function worktreeDiff(options: {
  source: string;
  target: string;
  stat?: boolean;
  nameOnly?: boolean;
}): Promise<void> {
  try {
    const manager = getManager();
    await manager.initialize();

    const diffResult = await manager.diffWorktrees(
      options.source,
      options.target,
      {
        stat: options.stat,
        nameOnly: options.nameOnly,
      },
    );

    if (options.nameOnly) {
      diffResult.filesChanged.forEach((file) => console.log(file));
    } else if (options.stat) {
      console.log(chalk.bold("\nDiff Statistics:\n"));
      console.log(
        `  Files changed: ${chalk.yellow(diffResult.filesChanged.length)}`,
      );
      console.log(
        `  Additions:     ${chalk.green(`+${diffResult.additions}`)}`,
      );
      console.log(`  Deletions:     ${chalk.red(`-${diffResult.deletions}`)}`);
      console.log();
    } else {
      console.log(diffResult.diff);
    }

    await manager.shutdown();
  } catch (error) {
    handleError(error);
  }
}

/**
 * Merge a worktree back to its parent branch
 */
export async function worktreeMerge(options: {
  sessionId: string;
  strategy?: MergeStrategy;
  targetBranch?: string;
  message?: string;
  deleteAfterMerge?: boolean;
  runTests?: boolean;
  force?: boolean;
}): Promise<void> {
  try {
    const manager = getManager();
    await manager.initialize();

    const session = manager.getWorktree(options.sessionId);
    if (!session) {
      console.error(chalk.red(`Worktree not found: ${options.sessionId}`));
      await gracefulExit(1);
      return;
    }

    // Show pre-merge summary
    console.log(chalk.blue("\nMerge Summary:\n"));
    console.log(`  Worktree:      ${session.id}`);
    console.log(`  Source branch: ${session.branchName}`);
    console.log(
      `  Target branch: ${options.targetBranch || session.parentBranch}`,
    );
    console.log(`  Strategy:      ${options.strategy || "squash"}`);
    console.log(`  Commits ahead: ${session.metadata.commitsAhead}`);
    console.log(`  Files changed: ${session.metadata.filesChanged}`);
    console.log();

    // Check if can merge cleanly
    const canMerge = await manager.canMergeCleanly(
      options.sessionId,
      options.targetBranch,
    );

    if (!canMerge.canMerge && !options.force) {
      console.error(
        chalk.red(
          `Cannot merge cleanly. Found ${canMerge.conflicts.length} potential conflicts:`,
        ),
      );
      canMerge.conflicts.forEach((file) => console.error(`  - ${file}`));
      console.log(
        chalk.yellow(
          "\nUse --force to merge anyway (may require manual resolution).",
        ),
      );
      await gracefulExit(1);
      return;
    }

    console.log(chalk.blue("Performing merge..."));

    const result = await manager.mergeWorktree(options.sessionId, {
      strategy: options.strategy || "squash",
      targetBranch: options.targetBranch,
      commitMessage: options.message,
      deleteAfterMerge: options.deleteAfterMerge,
      runTests: options.runTests,
      allowUncommitted: options.force,
    });

    if (result.success) {
      console.log(chalk.green("\n✓ Merge successful!\n"));
      console.log(`  Commit: ${result.commitHash}`);
      if (options.deleteAfterMerge) {
        console.log(chalk.gray("  Worktree removed"));
      }
    } else {
      console.error(chalk.red("\n✗ Merge failed\n"));
      console.error(`  ${result.message}`);
      if (result.conflicts) {
        console.error(chalk.yellow("\nConflicting files:"));
        result.conflicts.forEach((file) => console.error(`  - ${file}`));
      }
      await gracefulExit(1);
      return;
    }

    await manager.shutdown();
  } catch (error) {
    handleError(error);
  }
}

/**
 * Remove a worktree
 */
export async function worktreeRemove(options: {
  sessionId: string;
  force?: boolean;
  deleteBranch?: boolean;
}): Promise<void> {
  try {
    const manager = getManager();
    await manager.initialize();

    const session = manager.getWorktree(options.sessionId);
    if (!session) {
      console.error(chalk.red(`Worktree not found: ${options.sessionId}`));
      await gracefulExit(1);
      return;
    }

    // Show uncommitted changes warning if not force
    if (!options.force && session.metadata.hasUncommittedChanges) {
      console.warn(
        chalk.yellow("\nWarning: This worktree has uncommitted changes:"),
      );
      const status = await manager.getGitStatus(options.sessionId);
      if (status.modified.length > 0) {
        console.log(chalk.yellow("  Modified files:"));
        status.modified.forEach((file) => console.log(`    - ${file}`));
      }
      if (status.untracked.length > 0) {
        console.log(chalk.yellow("  Untracked files:"));
        status.untracked.forEach((file) => console.log(`    - ${file}`));
      }
      console.log(chalk.gray("\nUse --force to remove anyway."));
      await gracefulExit(1);
      return;
    }

    console.log(chalk.blue(`Removing worktree ${session.id}...`));

    await manager.removeWorktree(options.sessionId, {
      force: options.force,
      deleteBranch: options.deleteBranch,
    });

    console.log(chalk.green("\n✓ Worktree removed successfully"));
    if (options.deleteBranch) {
      console.log(chalk.gray(`  Branch ${session.branchName} deleted`));
    }

    await manager.shutdown();
  } catch (error) {
    handleError(error);
  }
}

/**
 * Clean up old worktrees based on retention policy
 */
export async function worktreeCleanup(options: {
  dryRun?: boolean;
}): Promise<void> {
  try {
    const manager = getManager();
    await manager.initialize();

    if (options.dryRun) {
      console.log(chalk.blue("Dry run - no worktrees will be removed\n"));
    }

    const report = options.dryRun
      ? {
          removed: [],
          retained: manager.listWorktrees().map((s) => s.id),
          errors: [],
          diskSpaceFreed: 0,
          timestamp: new Date(),
        }
      : await manager.cleanupWorktrees();

    console.log(chalk.bold("\nCleanup Report:\n"));
    console.log(`  Removed:  ${report.removed.length} worktrees`);
    console.log(`  Retained: ${report.retained.length} worktrees`);
    console.log(`  Freed:    ${formatDiskSize(report.diskSpaceFreed)}`);

    if (report.removed.length > 0) {
      console.log(chalk.gray("\nRemoved worktrees:"));
      report.removed.forEach((id) => console.log(`  - ${id}`));
    }

    if (report.errors.length > 0) {
      console.log(chalk.yellow("\nErrors during cleanup:"));
      report.errors.forEach(({ sessionId, error }) =>
        console.log(`  - ${sessionId}: ${error}`),
      );
    }

    await manager.shutdown();
  } catch (error) {
    handleError(error);
  }
}

/**
 * Show status of a worktree
 */
export async function worktreeStatus(options: {
  sessionId: string;
}): Promise<void> {
  try {
    const manager = getManager();
    await manager.initialize();

    const session = manager.getWorktree(options.sessionId);
    if (!session) {
      console.error(chalk.red(`Worktree not found: ${options.sessionId}`));
      await gracefulExit(1);
      return;
    }

    // Refresh metadata before displaying
    const updated = await manager.refreshWorktreeMetadata(options.sessionId);
    const status = await manager.getGitStatus(options.sessionId);

    console.log(chalk.bold(`\nWorktree Status: ${updated.id}\n`));
    console.log(`  Branch:        ${updated.branchName}`);
    console.log(`  Parent:        ${updated.parentBranch}`);
    console.log(
      `  Status:        ${chalk[getStatusColor(updated.status)](updated.status)}`,
    );
    console.log(`  Path:          ${updated.worktreePath}`);
    console.log();

    console.log(chalk.bold("Git Status:\n"));
    console.log(`  Commits ahead:  ${updated.metadata.commitsAhead}`);
    console.log(`  Commits behind: ${updated.metadata.commitsBehind}`);
    console.log(`  Files changed:  ${updated.metadata.filesChanged}`);
    console.log(
      `  Additions:      ${chalk.green(`+${updated.metadata.diffStats.additions}`)}`,
    );
    console.log(
      `  Deletions:      ${chalk.red(`-${updated.metadata.diffStats.deletions}`)}`,
    );
    console.log();

    if (!status.isClean) {
      console.log(chalk.yellow("Uncommitted Changes:\n"));
      if (status.modified.length > 0) {
        console.log(chalk.yellow("  Modified:"));
        status.modified.forEach((file) => console.log(`    ${file}`));
      }
      if (status.staged.length > 0) {
        console.log(chalk.green("  Staged:"));
        status.staged.forEach((file) => console.log(`    ${file}`));
      }
      if (status.untracked.length > 0) {
        console.log(chalk.gray("  Untracked:"));
        status.untracked.forEach((file) => console.log(`    ${file}`));
      }
      console.log();
    }

    console.log(chalk.bold("Metadata:\n"));
    console.log(`  Created:    ${updated.createdAt.toLocaleString()}`);
    console.log(`  Last used:  ${updated.lastAccessedAt.toLocaleString()}`);
    console.log(
      `  Disk usage: ${formatDiskSize(updated.metadata.diskUsageBytes)}`,
    );
    if (updated.description) {
      console.log(`  Description: ${updated.description}`);
    }
    console.log();

    await manager.shutdown();
  } catch (error) {
    handleError(error);
  }
}

/**
 * Validate worktree state
 */
export async function worktreeValidate(options: {
  sessionId?: string;
  all?: boolean;
  repair?: boolean;
}): Promise<void> {
  try {
    const manager = getManager();
    await manager.initialize();

    if (options.all) {
      console.log(chalk.blue("Validating all worktrees...\n"));
      const results = await manager.validateAllWorktrees();

      let validCount = 0;
      let invalidCount = 0;
      let repairedCount = 0;

      for (const [sessionId, result] of results.entries()) {
        if (result.valid) {
          validCount++;
        } else {
          invalidCount++;
          console.log(chalk.yellow(`\n${sessionId}:`));
          result.issues.forEach((issue) =>
            console.log(`  ${chalk.red("✗")} ${issue}`),
          );

          if (result.repaired) {
            repairedCount++;
            console.log(chalk.green("  ✓ Repaired"));
            result.repairDetails?.forEach((detail) =>
              console.log(chalk.gray(`    - ${detail}`)),
            );
          }
        }
      }

      console.log(chalk.bold("\nValidation Summary:\n"));
      console.log(`  Valid:    ${chalk.green(validCount)}`);
      console.log(`  Invalid:  ${chalk.red(invalidCount)}`);
      console.log(`  Repaired: ${chalk.blue(repairedCount)}`);
    } else if (options.sessionId) {
      console.log(chalk.blue(`Validating worktree ${options.sessionId}...\n`));
      const result = await manager.validateWorktree(options.sessionId);

      if (result.valid) {
        console.log(chalk.green("✓ Worktree is valid"));
      } else {
        console.log(chalk.red("✗ Worktree validation failed\n"));
        result.issues.forEach((issue) => console.log(`  - ${issue}`));

        if (result.repaired) {
          console.log(chalk.green("\n✓ Repairs applied:"));
          result.repairDetails?.forEach((detail) =>
            console.log(`  - ${detail}`),
          );
        }
      }
    } else {
      console.error(
        chalk.red("Error: Either --all or a session ID is required"),
      );
      await gracefulExit(1);
      return;
    }

    await manager.shutdown();
  } catch (error) {
    handleError(error);
  }
}

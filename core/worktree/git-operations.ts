/**
 * Git operations wrapper for worktree management.
 *
 * Provides low-level git command execution with proper error handling.
 * All git operations are executed via child_process with stderr/stdout capture.
 */

import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

import type { IGitOperations } from "./api";
import type {
  GitStatus,
  DiffOptions,
  DiffResult,
  MergeStrategy,
} from "./types";
import { WorktreeErrors } from "./errors";
import { parseGitOutput } from "./utils";

const execAsync = promisify(exec);

/**
 * Implementation of IGitOperations interface.
 */
export class GitOperations implements IGitOperations {
  constructor(private readonly repositoryPath: string) {
    if (!repositoryPath || !repositoryPath.trim()) {
      throw WorktreeErrors.validationFailed("Repository path is required");
    }
  }

  /**
   * Execute a git command in the repository.
   */
  private async execGit(
    command: string,
    cwd?: string,
  ): Promise<{ stdout: string; stderr: string }> {
    try {
      const result = await execAsync(`git ${command}`, {
        cwd: cwd || this.repositoryPath,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large diffs
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw WorktreeErrors.gitOperationFailed(
        `Command "git ${command}" failed: ${message}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Create a git worktree at the specified path.
   */
  async createWorktree(
    targetPath: string,
    branchName: string,
    baseBranch: string,
  ): Promise<void> {
    if (!targetPath || !branchName || !baseBranch) {
      throw WorktreeErrors.validationFailed(
        "Path, branch name, and base branch are required",
      );
    }

    // Check if branch already exists
    const exists = await this.branchExists(branchName);
    if (exists) {
      throw WorktreeErrors.branchExists(branchName);
    }

    try {
      // Create worktree with new branch based on baseBranch
      await this.execGit(
        `worktree add -b "${branchName}" "${targetPath}" "${baseBranch}"`,
      );
    } catch (error) {
      throw WorktreeErrors.creationFailed(
        `Failed to create worktree at ${targetPath}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Remove a git worktree.
   */
  async removeWorktree(targetPath: string, force = false): Promise<void> {
    if (!targetPath) {
      throw WorktreeErrors.validationFailed("Worktree path is required");
    }

    const forceFlag = force ? "--force" : "";
    await this.execGit(`worktree remove ${forceFlag} "${targetPath}"`);
  }

  /**
   * List all git worktrees in the repository.
   */
  async listWorktrees(): Promise<
    Array<{
      path: string;
      branch: string;
      commit: string;
    }>
  > {
    const { stdout } = await this.execGit("worktree list --porcelain");
    const entries = parseGitOutput(stdout);

    return entries.map((entry) => ({
      path: entry.worktree || "",
      branch: entry.branch?.replace("refs/heads/", "") || "",
      commit: entry.HEAD || "",
    }));
  }

  /**
   * Get git status for a worktree.
   */
  async getStatus(worktreePath: string): Promise<GitStatus> {
    if (!worktreePath) {
      throw WorktreeErrors.validationFailed("Worktree path is required");
    }

    // Get porcelain status
    const { stdout } = await this.execGit(
      "status --porcelain=v1",
      worktreePath,
    );

    const modified: string[] = [];
    const untracked: string[] = [];
    const staged: string[] = [];
    const deleted: string[] = [];

    for (const line of stdout.split("\n")) {
      if (!line.trim()) continue;

      const status = line.substring(0, 2);
      const file = line.substring(3);

      if (status[0] === "?" || status[1] === "?") {
        untracked.push(file);
      } else if (status[0] === "D" || status[1] === "D") {
        deleted.push(file);
      } else if (status[0] !== " ") {
        staged.push(file);
      } else if (status[1] !== " ") {
        modified.push(file);
      }
    }

    // Get branch and ahead/behind info
    const branch = await this.getCurrentBranch(worktreePath);

    let ahead = 0;
    let behind = 0;
    try {
      // Try to get ahead/behind for tracking branch
      const { stdout: statusOutput } = await this.execGit(
        "status --porcelain=v2 --branch",
        worktreePath,
      );

      const branchLine = statusOutput
        .split("\n")
        .find((l) => l.startsWith("# branch.ab"));
      if (branchLine) {
        const match = branchLine.match(/\+(\d+) -(\d+)/);
        if (match) {
          ahead = parseInt(match[1], 10);
          behind = parseInt(match[2], 10);
        }
      }
    } catch {
      // No tracking branch, that's okay
    }

    const isClean =
      modified.length === 0 &&
      untracked.length === 0 &&
      staged.length === 0 &&
      deleted.length === 0;

    return {
      branch,
      modified,
      untracked,
      staged,
      deleted,
      ahead,
      behind,
      isClean,
    };
  }

  /**
   * Get diff between two refs.
   */
  async getDiff(
    ref1: string,
    ref2: string,
    options?: DiffOptions,
  ): Promise<DiffResult> {
    if (!ref1 || !ref2) {
      throw WorktreeErrors.validationFailed("Both refs are required for diff");
    }

    const flags: string[] = [];

    if (options?.nameOnly) {
      flags.push("--name-only");
    }
    if (options?.stat) {
      flags.push("--stat");
    }
    if (options?.context !== undefined) {
      flags.push(`--unified=${options.context}`);
    }
    if (options?.pathFilter) {
      flags.push(`-- "${options.pathFilter}"`);
    }

    const command = `diff ${flags.join(" ")} ${ref1} ${ref2}`;
    const { stdout } = await this.execGit(command);

    // Parse diff stats
    const statsCommand = `diff --numstat ${ref1} ${ref2}`;
    const { stdout: statsOutput } = await this.execGit(statsCommand);

    let additions = 0;
    let deletions = 0;
    const filesChanged: string[] = [];

    for (const line of statsOutput.split("\n")) {
      if (!line.trim()) continue;
      const [add, del, file] = line.split(/\s+/);
      if (add && del && file) {
        additions += parseInt(add, 10) || 0;
        deletions += parseInt(del, 10) || 0;
        filesChanged.push(file);
      }
    }

    const summary = `${filesChanged.length} files changed, ${additions} insertions(+), ${deletions} deletions(-)`;

    return {
      source: ref1,
      target: ref2,
      filesChanged,
      additions,
      deletions,
      diff: stdout,
      summary,
      timestamp: new Date(),
    };
  }

  /**
   * Perform merge operation.
   */
  async merge(
    branch: string,
    strategy: MergeStrategy,
    options?: {
      message?: string;
      noCommit?: boolean;
    },
  ): Promise<{ success: boolean; conflicts?: string[] }> {
    if (!branch) {
      throw WorktreeErrors.validationFailed(
        "Branch name is required for merge",
      );
    }

    const flags: string[] = [];

    switch (strategy) {
      case "merge":
        // Default merge commit
        break;
      case "squash":
        flags.push("--squash");
        break;
      case "rebase":
        // Rebase is a different command
        try {
          await this.execGit(`rebase ${branch}`);
          return { success: true };
        } catch (error) {
          const conflicts = await this.getConflictedFiles();
          return { success: false, conflicts };
        }
      case "fast-forward":
        flags.push("--ff-only");
        break;
    }

    if (options?.message) {
      flags.push(`-m "${options.message}"`);
    }
    if (options?.noCommit) {
      flags.push("--no-commit");
    }

    try {
      await this.execGit(`merge ${flags.join(" ")} ${branch}`);
      return { success: true };
    } catch (error) {
      const conflicts = await this.getConflictedFiles();
      return { success: false, conflicts };
    }
  }

  /**
   * Get list of conflicted files.
   */
  private async getConflictedFiles(): Promise<string[]> {
    try {
      const { stdout } = await this.execGit("diff --name-only --diff-filter=U");
      return stdout
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => line.trim());
    } catch {
      return [];
    }
  }

  /**
   * Get commits ahead/behind counts between two branches.
   */
  async getAheadBehind(
    branch1: string,
    branch2: string,
  ): Promise<{ ahead: number; behind: number }> {
    if (!branch1 || !branch2) {
      throw WorktreeErrors.validationFailed(
        "Both branch names are required for comparison",
      );
    }

    try {
      const { stdout: aheadOutput } = await this.execGit(
        `rev-list --count ${branch2}..${branch1}`,
      );
      const { stdout: behindOutput } = await this.execGit(
        `rev-list --count ${branch1}..${branch2}`,
      );

      return {
        ahead: parseInt(aheadOutput.trim(), 10) || 0,
        behind: parseInt(behindOutput.trim(), 10) || 0,
      };
    } catch (error) {
      throw WorktreeErrors.gitOperationFailed(
        `Failed to compare branches ${branch1} and ${branch2}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Check if a branch exists.
   */
  async branchExists(branchName: string): Promise<boolean> {
    if (!branchName) {
      throw WorktreeErrors.validationFailed("Branch name is required");
    }

    try {
      const { stdout } = await this.execGit(`branch --list "${branchName}"`);
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Delete a branch.
   */
  async deleteBranch(branchName: string, force = false): Promise<void> {
    if (!branchName) {
      throw WorktreeErrors.validationFailed("Branch name is required");
    }

    const flag = force ? "-D" : "-d";
    await this.execGit(`branch ${flag} "${branchName}"`);
  }

  /**
   * Get current branch name for a worktree.
   */
  async getCurrentBranch(worktreePath?: string): Promise<string> {
    const { stdout } = await this.execGit(
      "branch --show-current",
      worktreePath,
    );
    const branch = stdout.trim();

    if (!branch) {
      throw WorktreeErrors.gitOperationFailed(
        "Could not determine current branch (might be in detached HEAD state)",
      );
    }

    return branch;
  }

  /**
   * Get merge base between two refs.
   */
  async getMergeBase(ref1: string, ref2: string): Promise<string> {
    if (!ref1 || !ref2) {
      throw WorktreeErrors.validationFailed(
        "Both refs are required for merge-base",
      );
    }

    const { stdout } = await this.execGit(`merge-base ${ref1} ${ref2}`);
    return stdout.trim();
  }

  /**
   * Check if merge would have conflicts (dry run).
   */
  async checkMergeConflicts(
    sourceBranch: string,
    targetBranch: string,
  ): Promise<string[]> {
    if (!sourceBranch || !targetBranch) {
      throw WorktreeErrors.validationFailed(
        "Both source and target branches are required",
      );
    }

    try {
      // Try a merge with --no-commit --no-ff to detect conflicts
      await this.execGit(
        `merge --no-commit --no-ff ${sourceBranch} ${targetBranch}`,
      );

      // If successful, abort the merge
      try {
        await this.execGit("merge --abort");
      } catch {
        // Ignore abort errors
      }

      return [];
    } catch {
      // Merge would have conflicts
      const conflicts = await this.getConflictedFiles();

      // Abort the failed merge
      try {
        await this.execGit("merge --abort");
      } catch {
        // Ignore abort errors
      }

      return conflicts;
    }
  }
}

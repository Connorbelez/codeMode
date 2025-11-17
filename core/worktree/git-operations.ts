/**
 * Git operations wrapper for worktree management.
 *
 * Provides low-level git command execution with proper error handling.
 * All git operations are executed via child_process with stderr/stdout capture.
 */

import { exec, execFile } from "child_process";
import { promisify } from "util";

import type { IGitOperations } from "./api";
import { WorktreeErrors } from "./errors";
import type {
  DiffOptions,
  DiffResult,
  GitStatus,
  MergeStrategy,
} from "./types";
import { parseGitOutput } from "./utils";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

/**
 * Escape a string for safe use in shell commands.
 * Escapes special characters and wraps in double quotes.
 */
function escapeShellArg(arg: string): string {
  // Escape backslashes and double quotes, then wrap in double quotes
  return `"${arg.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Validate and sanitize a git branch name.
 * Git branch names can contain:
 * - Letters, numbers, dots, hyphens, underscores
 * - Forward slashes (for hierarchical branches)
 * - Cannot start with a dot or contain consecutive dots
 * - Cannot end with a dot or slash
 * - Cannot contain spaces, backslashes, or other shell metacharacters
 * - Cannot contain sequences like .., @{, or \
 * - Maximum length is typically 255 characters
 */
function validateBranchName(branchName: string): string {
  if (!branchName || typeof branchName !== "string") {
    throw WorktreeErrors.validationFailed(
      "Branch name must be a non-empty string",
    );
  }

  const trimmed = branchName.trim();
  if (!trimmed) {
    throw WorktreeErrors.validationFailed(
      "Branch name cannot be empty or whitespace only",
    );
  }

  // Check length (Git typically allows up to 255 characters)
  if (trimmed.length > 255) {
    throw WorktreeErrors.validationFailed(
      "Branch name exceeds maximum length of 255 characters",
    );
  }

  // Git branch name validation regex
  // Allows: letters, numbers, dots, hyphens, underscores, forward slashes
  // Disallows: starting with dot, consecutive dots, ending with dot/slash, spaces, backslashes, shell metacharacters
  const branchNamePattern =
    /^(?!\.)(?!.*\.\.)(?!.*@\{)(?!.*\\)[a-zA-Z0-9._/-]+(?<!\.)(?<!\/)$/;

  if (!branchNamePattern.test(trimmed)) {
    throw WorktreeErrors.validationFailed(
      `Invalid branch name: "${trimmed}". Branch names can only contain letters, numbers, dots, hyphens, underscores, and forward slashes. Cannot start with a dot, contain consecutive dots, or end with a dot or slash.`,
    );
  }

  return trimmed;
}

/**
 * Validate and sanitize a file system path.
 * Paths should be relative or absolute paths without shell metacharacters.
 * Rejects paths containing command injection characters.
 */
function validatePath(path: string): string {
  if (!path || typeof path !== "string") {
    throw WorktreeErrors.validationFailed("Path must be a non-empty string");
  }

  const trimmed = path.trim();
  if (!trimmed) {
    throw WorktreeErrors.validationFailed(
      "Path cannot be empty or whitespace only",
    );
  }

  // Reject paths containing shell metacharacters that could be used for command injection
  // This includes: |, &, ;, `, $, (, ), <, >, newlines, tabs, etc.
  const dangerousChars = /[|&;`$()<>{}[\]\n\r\t]/;
  if (dangerousChars.test(trimmed)) {
    throw WorktreeErrors.validationFailed(
      `Invalid path: "${trimmed}". Path contains dangerous characters that could be used for command injection.`,
    );
  }

  // Reject paths that start with certain dangerous patterns
  if (trimmed.startsWith("..") || trimmed.includes("../")) {
    // Allow relative paths but validate they're safe
    // This is a basic check - in production you might want more sophisticated path validation
  }

  return trimmed;
}

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
   * Execute a git command with argument array (safer, prevents shell injection).
   * Arguments are passed directly to git without shell interpretation.
   */
  private async execGitWithArgs(
    args: string[],
    cwd?: string,
  ): Promise<{ stdout: string; stderr: string }> {
    try {
      const result = await execFileAsync("git", args, {
        cwd: cwd || this.repositoryPath,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large diffs
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw WorktreeErrors.gitOperationFailed(
        `Command "git ${args.join(" ")}" failed: ${message}`,
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
    // Validate and sanitize inputs before using them
    const validatedBranchName = validateBranchName(branchName);
    const validatedTargetPath = validatePath(targetPath);
    const validatedBaseBranch = validateBranchName(baseBranch);

    // Check if branch already exists
    const exists = await this.branchExists(validatedBranchName);
    if (exists) {
      throw WorktreeErrors.branchExists(validatedBranchName);
    }

    try {
      // Create worktree with new branch based on baseBranch
      // Use execGitWithArgs to pass arguments as array, preventing command injection
      const args = [
        "worktree",
        "add",
        "-b",
        validatedBranchName,
        validatedTargetPath,
        validatedBaseBranch,
      ];
      await this.execGitWithArgs(args);
    } catch (error) {
      throw WorktreeErrors.creationFailed(
        `Failed to create worktree at ${validatedTargetPath}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Remove a git worktree.
   */
  async removeWorktree(targetPath: string, force = false): Promise<void> {
    if (!targetPath || !targetPath.trim()) {
      throw WorktreeErrors.validationFailed("Worktree path is required");
    }

    const forceFlag = force ? "--force" : "";
    const escapedPath = escapeShellArg(targetPath);
    await this.execGit(`worktree remove ${forceFlag} ${escapedPath}`);
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

    let stdout: string;
    // Use argument array method when pathFilter is present to prevent shell injection
    if (options?.pathFilter) {
      const args: string[] = [
        "diff",
        ...flags,
        ref1,
        ref2,
        "--",
        options.pathFilter,
      ];
      const result = await this.execGitWithArgs(args);
      stdout = result.stdout;
    } else {
      const command = `diff ${flags.join(" ")} ${ref1} ${ref2}`;
      const result = await this.execGit(command);
      stdout = result.stdout;
    }

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
    } catch (err) {
      // Log error with context before rethrowing
      console.error(
        `[GitOperations] branchExists failed for branch "${branchName}":`,
        err,
      );
      // execGit already wraps errors in WorktreeErrors.gitOperationFailed, so rethrow
      throw err;
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

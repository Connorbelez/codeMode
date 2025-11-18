import { execFile } from "child_process";
import fs from "fs/promises";
import path from "path";
import { promisify } from "util";
import * as vscode from "vscode";

const execFileAsync = promisify(execFile);
const ACTIVE_WORKTREE_KEY = "continue.worktrees.activePath";
const REPO_ROOT_KEY = "continue.worktrees.repoRoot";

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Tracks the canonical repository root and currently active worktree.
 *
 * This manager enables multi-root workspaces without forcing VS Code to reload
 * by ensuring both the repo root and any activated worktree are present in the
 * workspace folder list. It also persists the active worktree between sessions
 * so the GUI can highlight the current workspace context.
 */
export class WorktreeWorkspaceManager {
  private repoRootPath?: string;
  private activeWorktreePath?: string;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.repoRootPath = context.workspaceState.get<string>(REPO_ROOT_KEY);
    this.activeWorktreePath =
      context.workspaceState.get<string>(ACTIVE_WORKTREE_KEY);
  }

  /** Returns the currently active worktree path, if any. */
  public getActiveWorktreePath(): string | undefined {
    return this.activeWorktreePath;
  }

  /** Resolves and persists the canonical repository root for worktree ops. */
  public async resolveRepositoryPath(
    startPath?: string,
  ): Promise<string | undefined> {
    if (this.repoRootPath && (await pathExists(this.repoRootPath))) {
      return this.repoRootPath;
    }

    const hint =
      startPath ??
      this.activeWorktreePath ??
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    if (!hint) {
      return undefined;
    }

    const resolved = await this.detectRepoRoot(hint);
    if (!resolved) {
      return undefined;
    }

    await this.persistRepoRoot(resolved);
    return this.repoRootPath;
  }

  /**
   * Marks the provided worktree as the active workspace for UI purposes only.
   *
   * @deprecated Worktrees should be opened in new windows instead of switching in-place.
   * This method is kept for backward compatibility and UI state tracking only.
   */
  public async activateWorktree(worktreePath: string): Promise<void> {
    const normalized = path.resolve(worktreePath);
    await this.ensureWorkspaceFolder(normalized);
    this.activeWorktreePath = normalized;
    await this.context.workspaceState.update(
      ACTIVE_WORKTREE_KEY,
      this.activeWorktreePath,
    );
  }

  /** Clears the active worktree pointer so the primary repo becomes active. */
  public async resetActiveWorktree(): Promise<string | undefined> {
    const previous = this.activeWorktreePath;
    this.activeWorktreePath = undefined;
    await this.context.workspaceState.update(ACTIVE_WORKTREE_KEY, undefined);
    return previous;
  }

  private async detectRepoRoot(fromPath: string): Promise<string | undefined> {
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["rev-parse", "--show-toplevel"],
        {
          cwd: fromPath,
        },
      );
      const normalized = stdout.trim();
      return normalized ? path.resolve(normalized) : undefined;
    } catch (error) {
      console.warn(
        `[WorktreeWorkspaceManager] Failed to resolve repo root from "${fromPath}":`,
        error,
      );
      return undefined;
    }
  }

  private async persistRepoRoot(repoRoot: string): Promise<void> {
    this.repoRootPath = path.resolve(repoRoot);
    await this.context.workspaceState.update(REPO_ROOT_KEY, this.repoRootPath);
    await this.ensureWorkspaceFolder(this.repoRootPath);
  }

  private async ensureWorkspaceFolder(targetPath: string): Promise<void> {
    const normalized = path.resolve(targetPath);
    const folders = vscode.workspace.workspaceFolders ?? [];
    const exists = folders.some(
      (folder) => path.resolve(folder.uri.fsPath) === normalized,
    );

    if (exists) {
      return;
    }

    vscode.workspace.updateWorkspaceFolders(folders.length, 0, {
      uri: vscode.Uri.file(normalized),
      name: path.basename(normalized),
    });
  }
}

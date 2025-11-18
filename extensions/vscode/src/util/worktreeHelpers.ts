import { execSync } from "child_process";
import type { IWorktreeManager } from "core/worktree/api";
import type {
  WorktreeAgentStatus,
  WorktreeSession,
  WorktreeSessionWithStats,
} from "core/worktree/types";
import * as vscode from "vscode";

const METADATA_STALE_THRESHOLD_MS = 30_000;

function toTimestamp(dateValue?: Date): number | undefined {
  if (!dateValue) {
    return undefined;
  }

  if (dateValue instanceof Date) {
    return dateValue.getTime();
  }

  // Some callers may serialize dates before hydration; fall back to Date ctor.
  const parsed = new Date(dateValue as unknown as string);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.getTime();
}

export function getCurrentRepositoryPath(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

export function isGitRepository(repoPath: string): boolean {
  try {
    execSync("git rev-parse --is-inside-work-tree", {
      cwd: repoPath,
      stdio: "ignore",
    });
    return true;
  } catch (error) {
    console.warn(
      `[Worktree] Workspace ${repoPath} is not a git repository:`,
      error,
    );
    return false;
  }
}

export function inferAgentStatus(
  session: WorktreeSession,
): WorktreeAgentStatus {
  switch (session.status) {
    case "creating":
    case "active":
    case "merging":
      return "working";
    case "idle":
      return "idle";
    case "merged":
      return "completed";
    case "error":
    case "abandoned":
    default:
      return "error";
  }
}

export async function enrichSessionWithStats(
  session: WorktreeSession,
  manager: IWorktreeManager,
  options: { refreshIfStale?: boolean } = {},
): Promise<WorktreeSessionWithStats> {
  const lastRefreshedAt = toTimestamp(session.metadata.lastRefreshedAt);
  const shouldRefresh =
    options.refreshIfStale &&
    (!lastRefreshedAt ||
      Date.now() - lastRefreshedAt > METADATA_STALE_THRESHOLD_MS);

  let resolvedSession = session;
  if (shouldRefresh) {
    try {
      resolvedSession = await manager.refreshWorktreeMetadata(session.id);
    } catch (error) {
      console.warn(
        `[Worktree] Failed to refresh metadata for ${session.id}:`,
        error,
      );
    }
  }

  return {
    ...resolvedSession,
    diffStats: {
      filesChanged: resolvedSession.metadata.filesChanged,
      linesAdded: resolvedSession.metadata.diffStats.additions,
      linesRemoved: resolvedSession.metadata.diffStats.deletions,
      lastChecked: resolvedSession.metadata.lastRefreshedAt,
    },
    agentStatus: inferAgentStatus(resolvedSession),
  };
}

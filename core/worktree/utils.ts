import { randomBytes } from "crypto";
import path from "path";

import { BRANCH_PREFIX, WORKTREE_BASE_DIR } from "./constants";
import { WorktreeErrors } from "./errors";

export const WORKTREE_ID_PREFIX = "wt-";
const SAFE_SEGMENT_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
const BRANCH_NAME_REGEX = /^[a-zA-Z0-9/_-]+$/;

export type GitPorcelainEntry = Record<string, string>;

/**
 * Generate a unique identifier for a worktree session.
 */
export function generateWorktreeId(): string {
  const random = randomBytes(6).toString("hex");
  return `${WORKTREE_ID_PREFIX}${random}`;
}

/**
 * Validate and normalize a worktree path.
 *
 * Ensures the path is relative, contains no traversal, and lives under the
 * configured worktree base directory. Returns the sanitized path that should
 * be safe to pass to filesystem/git commands.
 */
export function validatePath(
  targetPath: string,
  baseDir: string = WORKTREE_BASE_DIR,
): string {
  if (!targetPath || !targetPath.trim()) {
    throw WorktreeErrors.validationFailed("Worktree path cannot be empty");
  }

  const normalizedInput = path.posix
    .normalize(targetPath.replace(/\\/g, "/"))
    .replace(/^\.\/+/, "");

  if (!normalizedInput || normalizedInput === "." || normalizedInput === "..") {
    throw WorktreeErrors.validationFailed(
      "Worktree path must reference a directory",
    );
  }

  if (normalizedInput.startsWith("../") || normalizedInput.includes("/../")) {
    throw WorktreeErrors.validationFailed(
      "Worktree path cannot contain parent directory traversal",
    );
  }

  if (path.posix.isAbsolute(normalizedInput)) {
    throw WorktreeErrors.validationFailed(
      "Worktree path must be relative to the repository",
    );
  }

  let relativePart = normalizedInput.replace(/^\/+/, "");
  if (relativePart.startsWith(baseDir)) {
    relativePart = relativePart.slice(baseDir.length).replace(/^\/+/, "");
  }

  const finalPath =
    relativePart.length > 0 ? path.posix.join(baseDir, relativePart) : baseDir;

  if (finalPath !== baseDir && !finalPath.startsWith(`${baseDir}/`)) {
    throw WorktreeErrors.validationFailed(
      `Worktree path must reside under ${baseDir}`,
    );
  }

  const baseSegments = baseDir.split("/").filter(Boolean);
  const finalSegments = finalPath.split("/").filter(Boolean);
  const dynamicSegments = finalSegments.slice(baseSegments.length);

  for (const segment of dynamicSegments) {
    if (!SAFE_SEGMENT_REGEX.test(segment)) {
      throw WorktreeErrors.validationFailed(
        "Worktree path contains invalid characters",
      );
    }
  }

  return finalPath;
}

/**
 * Format git branch names with prefix validation.
 */
export function formatBranchName(
  worktreeId: string,
  prefix: string = BRANCH_PREFIX,
): string {
  if (!worktreeId || !worktreeId.trim()) {
    throw WorktreeErrors.validationFailed(
      "Worktree ID is required to format branch name",
    );
  }

  const branch = `${prefix}${worktreeId.trim()}`;
  if (!BRANCH_NAME_REGEX.test(branch)) {
    throw WorktreeErrors.validationFailed(
      `Branch name contains invalid characters: ${branch}`,
    );
  }

  return branch;
}

/**
 * Parse git porcelain output (e.g., from `git worktree list --porcelain`).
 */
export function parseGitOutput(output: string): GitPorcelainEntry[] {
  if (!output) {
    return [];
  }

  const entries: GitPorcelainEntry[] = [];
  let current: GitPorcelainEntry = {};

  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (Object.keys(current).length > 0) {
        entries.push(current);
        current = {};
      }
      continue;
    }

    const [key, ...rest] = trimmed.split(/\s+/);
    current[key] = rest.join(" ");
  }

  if (Object.keys(current).length > 0) {
    entries.push(current);
  }

  return entries;
}

/**
 * Convert bytes into a human readable string.
 */
export function formatDiskSize(bytes: number): string {
  if (bytes < 0) {
    throw WorktreeErrors.validationFailed("Disk size cannot be negative");
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const formatted =
    unitIndex === 0
      ? `${size} ${units[unitIndex]}`
      : `${size.toFixed(2)} ${units[unitIndex]}`;
  return formatted;
}

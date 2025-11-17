/**
 * Filesystem operations for worktree management.
 *
 * Provides file system abstractions with proper error handling and permissions.
 */

import fs from "fs/promises";
import path from "path";
import { constants as fsConstants } from "fs";

import type { IFilesystemOperations } from "./api";
import { WorktreeErrors } from "./errors";

/**
 * Implementation of IFilesystemOperations interface.
 */
export class FilesystemOperations implements IFilesystemOperations {
  /**
   * Get disk usage for a directory recursively.
   */
  async getDiskUsage(targetPath: string): Promise<number> {
    if (!targetPath) {
      throw WorktreeErrors.validationFailed(
        "Path is required for disk usage calculation",
      );
    }

    try {
      const stats = await fs.stat(targetPath);

      if (!stats.isDirectory()) {
        return stats.size;
      }

      let totalSize = 0;
      const entries = await fs.readdir(targetPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(targetPath, entry.name);

        if (entry.isDirectory()) {
          // Skip .git directory to avoid counting shared objects multiple times
          if (entry.name === ".git") {
            continue;
          }
          totalSize += await this.getDiskUsage(fullPath);
        } else if (entry.isFile()) {
          const fileStats = await fs.stat(fullPath);
          totalSize += fileStats.size;
        }
      }

      return totalSize;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw WorktreeErrors.pathNotFound(targetPath);
      }
      if ((error as NodeJS.ErrnoException).code === "EACCES") {
        throw WorktreeErrors.permissionDenied(
          targetPath,
          error instanceof Error ? error : undefined,
        );
      }
      throw WorktreeErrors.validationFailed(
        `Failed to calculate disk usage for ${targetPath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Check if a path exists.
   */
  async exists(targetPath: string): Promise<boolean> {
    if (!targetPath) {
      return false;
    }

    try {
      await fs.access(targetPath, fsConstants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create directory recursively (mkdir -p).
   */
  async mkdirp(targetPath: string): Promise<void> {
    if (!targetPath) {
      throw WorktreeErrors.validationFailed(
        "Path is required for directory creation",
      );
    }

    try {
      await fs.mkdir(targetPath, { recursive: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EACCES") {
        throw WorktreeErrors.permissionDenied(
          targetPath,
          error instanceof Error ? error : undefined,
        );
      }
      throw WorktreeErrors.validationFailed(
        `Failed to create directory ${targetPath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Remove directory recursively (rm -rf).
   */
  async rmdir(targetPath: string, force = false): Promise<void> {
    if (!targetPath) {
      throw WorktreeErrors.validationFailed(
        "Path is required for directory removal",
      );
    }

    try {
      await fs.rm(targetPath, { recursive: true, force });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT" && !force) {
        throw WorktreeErrors.pathNotFound(targetPath);
      }
      if ((error as NodeJS.ErrnoException).code === "EACCES") {
        throw WorktreeErrors.permissionDenied(
          targetPath,
          error instanceof Error ? error : undefined,
        );
      }
      throw WorktreeErrors.validationFailed(
        `Failed to remove directory ${targetPath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Copy files from source to destination with optional filtering.
   */
  async copy(source: string, dest: string, filter?: string[]): Promise<void> {
    if (!source || !dest) {
      throw WorktreeErrors.validationFailed(
        "Both source and destination paths are required for copy",
      );
    }

    try {
      const stats = await fs.stat(source);

      if (stats.isFile()) {
        // Single file copy
        if (filter && !this.matchesFilter(source, filter)) {
          return;
        }

        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.copyFile(source, dest);
      } else if (stats.isDirectory()) {
        // Directory copy
        await this.copyDirectory(source, dest, filter);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw WorktreeErrors.pathNotFound(source);
      }
      if ((error as NodeJS.ErrnoException).code === "EACCES") {
        throw WorktreeErrors.permissionDenied(
          source,
          error instanceof Error ? error : undefined,
        );
      }
      throw WorktreeErrors.validationFailed(
        `Failed to copy from ${source} to ${dest}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Copy directory recursively with optional filtering.
   */
  private async copyDirectory(
    source: string,
    dest: string,
    filter?: string[],
  ): Promise<void> {
    await fs.mkdir(dest, { recursive: true });

    const entries = await fs.readdir(source, { withFileTypes: true });

    for (const entry of entries) {
      const sourcePath = path.join(source, entry.name);
      const destPath = path.join(dest, entry.name);

      if (filter && !this.matchesFilter(sourcePath, filter)) {
        continue;
      }

      if (entry.isDirectory()) {
        await this.copyDirectory(sourcePath, destPath, filter);
      } else if (entry.isFile()) {
        await fs.copyFile(sourcePath, destPath);
      }
    }
  }

  /**
   * Check if a path matches any filter patterns.
   */
  private matchesFilter(targetPath: string, filter: string[]): boolean {
    if (!filter || filter.length === 0) {
      return true;
    }

    const normalized = targetPath.replace(/\\/g, "/");
    const basename = path.basename(normalized);

    return filter.some((pattern) => {
      // Simple glob matching (supports * and **)
      const regexPattern = pattern
        .replace(/\./g, "\\.")
        .replace(/\*\*/g, ".*")
        .replace(/\*/g, "[^/]*");

      const regex = new RegExp(regexPattern);
      // Match against both full path and basename
      return regex.test(normalized) || regex.test(basename);
    });
  }

  /**
   * Get list of files in directory with optional recursion.
   */
  async readdir(targetPath: string, recursive = false): Promise<string[]> {
    if (!targetPath) {
      throw WorktreeErrors.validationFailed(
        "Path is required for reading directory",
      );
    }

    try {
      if (!recursive) {
        const entries = await fs.readdir(targetPath);
        return entries;
      }

      // Recursive listing
      const allFiles: string[] = [];
      await this.readdirRecursive(targetPath, "", allFiles);
      return allFiles;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw WorktreeErrors.pathNotFound(targetPath);
      }
      if ((error as NodeJS.ErrnoException).code === "EACCES") {
        throw WorktreeErrors.permissionDenied(
          targetPath,
          error instanceof Error ? error : undefined,
        );
      }
      throw WorktreeErrors.validationFailed(
        `Failed to read directory ${targetPath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Recursive helper for readdir.
   */
  private async readdirRecursive(
    basePath: string,
    relativePath: string,
    results: string[],
  ): Promise<void> {
    const currentPath = path.join(basePath, relativePath);
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryRelativePath = path.join(relativePath, entry.name);

      if (entry.isDirectory()) {
        await this.readdirRecursive(basePath, entryRelativePath, results);
      } else {
        results.push(entryRelativePath);
      }
    }
  }
}

/**
 * Worktree registry for persisting worktree session state.
 *
 * Manages the JSON file that stores all active worktree sessions,
 * providing atomic writes, corruption recovery, and validation.
 */

import fs from "fs/promises";
import path from "path";
import { constants as fsConstants } from "fs";

import type { IWorktreeRegistry } from "./api";
import type {
  WorktreeSession,
  WorktreeRegistryState,
  WorktreeConfig,
} from "./types";
import { WorktreeErrors } from "./errors";
import { DEFAULT_WORKTREE_CONFIG } from "./constants";

const REGISTRY_VERSION = "1.0.0";

/**
 * Implementation of IWorktreeRegistry interface.
 *
 * Persists worktree sessions to a JSON file with atomic writes,
 * corruption recovery, and concurrent access safety.
 */
export class WorktreeRegistry implements IWorktreeRegistry {
  private readonly registryPath: string;
  private lockPromise: Promise<void> | null = null;
  private storedConfig: WorktreeConfig | undefined;

  constructor(registryPath: string) {
    if (!registryPath || !registryPath.trim()) {
      throw WorktreeErrors.validationFailed("Registry path is required");
    }
    this.registryPath = registryPath;
  }

  /**
   * Get the registry file path.
   */
  getRegistryPath(): string {
    return this.registryPath;
  }

  /**
   * Load all sessions from the registry file (without locking).
   *
   * Internal helper that performs file I/O without acquiring a lock.
   * Callers must ensure they hold the lock before calling this.
   *
   * Returns empty Map if file doesn't exist.
   * Handles corrupted JSON by backing up and reinitializing.
   */
  private async loadUnlocked(): Promise<{
    sessions: Map<string, WorktreeSession>;
    config?: WorktreeConfig;
  }> {
    try {
      // Check if file exists
      await fs.access(this.registryPath, fsConstants.F_OK);
    } catch {
      // File doesn't exist - return empty Map
      return { sessions: new Map() };
    }

    try {
      const content = await fs.readFile(this.registryPath, "utf-8");
      const state: WorktreeRegistryState = JSON.parse(content);

      // Validate schema version
      if (!state.version) {
        throw new Error("Missing version field in registry");
      }

      // Convert dates from ISO strings back to Date objects
      const sessions = new Map<string, WorktreeSession>();
      for (const [id, session] of Object.entries(state.sessions || {})) {
        sessions.set(id, this.deserializeSession(session));
      }

      // Store and return config if present
      const config = state.config;
      if (config) {
        this.storedConfig = config;
        return { sessions, config };
      }

      return { sessions };
    } catch (error) {
      // Handle corrupted JSON - backup and reinitialize
      const backupPath = `${this.registryPath}.backup.${Date.now()}`;

      try {
        await fs.copyFile(this.registryPath, backupPath);
        console.warn(`Corrupted registry detected. Backed up to ${backupPath}`);
      } catch {
        // If backup fails, still continue with empty state
        console.warn("Failed to backup corrupted registry");
      }

      // Return empty Map to start fresh
      return { sessions: new Map() };
    }
  }

  /**
   * Load all sessions from the registry file.
   *
   * Returns empty Map if file doesn't exist.
   * Handles corrupted JSON by backing up and reinitializing.
   */
  async load(): Promise<{
    sessions: Map<string, WorktreeSession>;
    config?: WorktreeConfig;
  }> {
    return this.withLock(async () => {
      return this.loadUnlocked();
    });
  }

  /**
   * Save all sessions to the registry file atomically (without locking).
   *
   * Internal helper that performs file I/O without acquiring a lock.
   * Callers must ensure they hold the lock before calling this.
   *
   * Uses atomic write (write to temp, then rename) to prevent corruption.
   */
  private async saveUnlocked(
    sessions: Map<string, WorktreeSession>,
    config?: WorktreeConfig,
  ): Promise<void> {
    // Serialize sessions map to plain object
    const sessionsObj: Record<string, WorktreeSession> = {};
    for (const [id, session] of sessions.entries()) {
      sessionsObj[id] = this.serializeSession(session);
    }

    // Use provided config, stored config, or default
    const configToSave = config || this.storedConfig || DEFAULT_WORKTREE_CONFIG;
    // Update stored config for future saves
    this.storedConfig = configToSave;

    const state: WorktreeRegistryState = {
      version: REGISTRY_VERSION,
      sessions: sessionsObj,
      lastCleanup: new Date(),
      config: configToSave,
    };

    const content = JSON.stringify(state, null, 2);

    // Ensure directory exists
    const dir = path.dirname(this.registryPath);
    await fs.mkdir(dir, { recursive: true });

    // Atomic write: write to temp file, then rename
    const tempPath = `${this.registryPath}.tmp.${process.pid}`;
    try {
      await fs.writeFile(tempPath, content, { mode: 0o600 }); // Restrictive permissions
      await fs.rename(tempPath, this.registryPath);
    } catch (error) {
      // Clean up temp file if rename failed
      try {
        await fs.unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
      throw WorktreeErrors.validationFailed(
        `Failed to save registry: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Save all sessions to the registry file atomically.
   *
   * Uses atomic write (write to temp, then rename) to prevent corruption.
   */
  async save(
    sessions: Map<string, WorktreeSession>,
    config?: WorktreeConfig,
  ): Promise<void> {
    return this.withLock(async () => {
      await this.saveUnlocked(sessions, config);
    });
  }

  /**
   * Add or update a single session in the registry.
   *
   * Performs the entire read-modify-write operation atomically within a single lock.
   */
  async upsert(session: WorktreeSession): Promise<void> {
    return this.withLock(async () => {
      const { sessions, config } = await this.loadUnlocked();
      sessions.set(session.id, session);
      await this.saveUnlocked(sessions, config);
    });
  }

  /**
   * Remove a session from the registry.
   *
   * Performs the entire read-modify-write operation atomically within a single lock.
   */
  async remove(sessionId: string): Promise<void> {
    return this.withLock(async () => {
      const { sessions, config } = await this.loadUnlocked();
      if (!sessions.has(sessionId)) {
        throw WorktreeErrors.notFound(sessionId);
      }
      sessions.delete(sessionId);
      await this.saveUnlocked(sessions, config);
    });
  }

  /**
   * Clear all sessions from the registry.
   *
   * Performs the entire read-modify-write operation atomically within a single lock.
   */
  async clear(): Promise<void> {
    return this.withLock(async () => {
      const { config } = await this.loadUnlocked();
      await this.saveUnlocked(new Map(), config);
    });
  }

  /**
   * Serialize a WorktreeSession for JSON storage.
   *
   * Converts Date objects to ISO strings.
   */
  private serializeSession(session: WorktreeSession): WorktreeSession {
    return {
      ...session,
      createdAt: session.createdAt as any, // JSON.stringify will convert Date to string
      lastAccessedAt: session.lastAccessedAt as any,
      metadata: {
        ...session.metadata,
        lastRefreshedAt: session.metadata.lastRefreshedAt as any,
        lastTestResult: session.metadata.lastTestResult
          ? {
              ...session.metadata.lastTestResult,
              timestamp: session.metadata.lastTestResult.timestamp as any,
            }
          : undefined,
      },
    };
  }

  /**
   * Deserialize a WorktreeSession from JSON storage.
   *
   * Converts ISO strings back to Date objects.
   */
  private deserializeSession(session: any): WorktreeSession {
    return {
      ...session,
      createdAt: new Date(session.createdAt),
      lastAccessedAt: new Date(session.lastAccessedAt),
      metadata: {
        ...session.metadata,
        lastRefreshedAt: new Date(session.metadata.lastRefreshedAt),
        lastTestResult: session.metadata.lastTestResult
          ? {
              ...session.metadata.lastTestResult,
              timestamp: new Date(session.metadata.lastTestResult.timestamp),
            }
          : undefined,
      },
    };
  }

  /**
   * Execute a callback with file locking to prevent concurrent access issues.
   *
   * This is a simple lock implementation that queues operations.
   * For production use across processes, consider using proper file locking.
   */
  private async withLock<T>(callback: () => Promise<T>): Promise<T> {
    // Wait for any existing lock to release
    while (this.lockPromise) {
      await this.lockPromise;
    }

    // Acquire lock
    let releaseLock: () => void;
    this.lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    try {
      return await callback();
    } finally {
      // Release lock
      releaseLock!();
      this.lockPromise = null;
    }
  }
}

# Worktree Implementation Guide

This document provides technical guidance for implementing the worktree management feature.

---

## Implementation Overview

### Recommended Implementation Order

1. **Core Types & Infrastructure** (Week 1)
2. **Git Operations Wrapper** (Week 1-2)
3. **WorktreeManager Basic Operations** (Week 2)
4. **Persistence & Registry** (Week 2-3)
5. **CLI Commands** (Week 3)
6. **Diff & Merge Operations** (Week 3-4)
7. **GUI Integration** (Week 4-5)
8. **Polish & Testing** (Week 5-6)

---

## Phase 1: Core Infrastructure

### Files to Create

```
core/worktree/
├── types.ts              ✅ (already created)
├── api.ts                ✅ (already created)
├── errors.ts             ← Create error handling
├── constants.ts          ← Default configs
└── utils.ts              ← Helper functions
```

### Step 1.1: Error Handling (`core/worktree/errors.ts`)

```typescript
import { WorktreeError, WorktreeErrorCode } from "./types";

/**
 * Factory functions for common errors
 */
export class WorktreeErrors {
  static notFound(sessionId: string): WorktreeError {
    return new WorktreeError(
      `Worktree session not found: ${sessionId}`,
      WorktreeErrorCode.WORKTREE_NOT_FOUND,
      sessionId
    );
  }

  static branchExists(branchName: string): WorktreeError {
    return new WorktreeError(
      `Branch already exists: ${branchName}`,
      WorktreeErrorCode.BRANCH_EXISTS
    );
  }

  static gitOperationFailed(
    operation: string,
    cause: Error
  ): WorktreeError {
    return new WorktreeError(
      `Git operation failed: ${operation}`,
      WorktreeErrorCode.GIT_OPERATION_FAILED,
      undefined,
      cause
    );
  }

  static diskQuotaExceeded(
    current: number,
    limit: number
  ): WorktreeError {
    return new WorktreeError(
      `Disk quota exceeded: ${current}MB / ${limit}MB`,
      WorktreeErrorCode.DISK_QUOTA_EXCEEDED
    );
  }

  static uncommittedChanges(sessionId: string): WorktreeError {
    return new WorktreeError(
      `Worktree has uncommitted changes: ${sessionId}`,
      WorktreeErrorCode.UNCOMMITTED_CHANGES,
      sessionId
    );
  }

  static maxWorktreesReached(max: number): WorktreeError {
    return new WorktreeError(
      `Maximum number of worktrees reached: ${max}`,
      WorktreeErrorCode.MAX_WORKTREES_REACHED
    );
  }
}
```

### Step 1.2: Constants (`core/worktree/constants.ts`)

```typescript
import type { WorktreeConfig } from "./types";

/**
 * Default configuration values
 */
export const DEFAULT_WORKTREE_CONFIG: WorktreeConfig = {
  worktreeBaseDir: ".worktrees",
  branchPrefix: "claude/",
  maxConcurrentWorktrees: 10,

  cleanup: {
    onSessionEnd: false,
    onMerge: true,
    retentionDays: 7,
  },

  requireTestsPassBeforeMerge: false,

  limits: {
    maxWorktreeSizeMB: 1000,
    maxTotalSizeMB: 5000,
  },

  ui: {
    showDiskUsage: true,
    confirmBeforeRemove: true,
    defaultMergeStrategy: "squash",
    showDiffStats: true,
  },
};

/**
 * Registry file location
 */
export const REGISTRY_FILE = ".codemode/worktrees.json";
export const REGISTRY_VERSION = "1.0.0";

/**
 * Session ID prefix
 */
export const SESSION_ID_PREFIX = "wt-";

/**
 * Auto-cleanup interval (ms)
 */
export const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
```

### Step 1.3: Utilities (`core/worktree/utils.ts`)

```typescript
import { randomBytes } from "crypto";
import { SESSION_ID_PREFIX } from "./constants";

/**
 * Generate unique session ID
 */
export function generateSessionId(): string {
  const random = randomBytes(8).toString("hex");
  return `${SESSION_ID_PREFIX}${random}`;
}

/**
 * Generate branch name for worktree
 */
export function generateBranchName(
  prefix: string,
  sessionId: string
): string {
  const timestamp = Date.now();
  return `${prefix}agent-${sessionId}-${timestamp}`;
}

/**
 * Validate session ID format
 */
export function isValidSessionId(id: string): boolean {
  return id.startsWith(SESSION_ID_PREFIX) && id.length > SESSION_ID_PREFIX.length;
}

/**
 * Format bytes to human-readable size
 */
export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Format diff stats
 */
export function formatDiffStats(additions: number, deletions: number): string {
  return `+${additions} -${deletions}`;
}

/**
 * Sanitize path for security
 */
export function sanitizePath(path: string): string {
  // Remove any path traversal attempts
  return path.replace(/\.\./g, "").replace(/[^a-zA-Z0-9\-_\/]/g, "");
}
```

---

## Phase 2: Git Operations

### File: `core/worktree/git-operations.ts`

```typescript
import { spawn } from "child_process";
import type { IGitOperations } from "./api";
import type { GitStatus, DiffOptions, DiffResult, MergeStrategy } from "./types";
import { WorktreeErrors } from "./errors";

export class GitOperations implements IGitOperations {
  constructor(private repoPath: string) {}

  /**
   * Execute git command
   */
  private async exec(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn("git", args, {
        cwd: this.repoPath,
        env: process.env,
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(
            WorktreeErrors.gitOperationFailed(
              args.join(" "),
              new Error(stderr)
            )
          );
        }
      });

      proc.on("error", (error) => {
        reject(WorktreeErrors.gitOperationFailed(args.join(" "), error));
      });
    });
  }

  async createWorktree(
    path: string,
    branchName: string,
    baseBranch: string
  ): Promise<void> {
    await this.exec(["worktree", "add", path, "-b", branchName, baseBranch]);
  }

  async removeWorktree(path: string, force?: boolean): Promise<void> {
    const args = ["worktree", "remove", path];
    if (force) args.push("--force");
    await this.exec(args);
  }

  async listWorktrees(): Promise<
    Array<{ path: string; branch: string; commit: string }>
  > {
    const output = await this.exec([
      "worktree",
      "list",
      "--porcelain",
    ]);

    const worktrees: Array<{ path: string; branch: string; commit: string }> = [];
    const lines = output.split("\n");

    let current: Partial<{ path: string; branch: string; commit: string }> = {};

    for (const line of lines) {
      if (line.startsWith("worktree ")) {
        current.path = line.substring(9);
      } else if (line.startsWith("branch ")) {
        current.branch = line.substring(7).replace("refs/heads/", "");
      } else if (line.startsWith("HEAD ")) {
        current.commit = line.substring(5);
      } else if (line === "") {
        if (current.path && current.branch && current.commit) {
          worktrees.push(current as any);
        }
        current = {};
      }
    }

    return worktrees;
  }

  async getStatus(worktreePath: string): Promise<GitStatus> {
    const statusOutput = await this.exec([
      "-C",
      worktreePath,
      "status",
      "--porcelain=v2",
      "--branch",
    ]);

    const status: GitStatus = {
      branch: "",
      modified: [],
      untracked: [],
      staged: [],
      deleted: [],
      ahead: 0,
      behind: 0,
      isClean: true,
    };

    for (const line of statusOutput.split("\n")) {
      if (line.startsWith("# branch.head ")) {
        status.branch = line.substring(14);
      } else if (line.startsWith("# branch.ab ")) {
        const [ahead, behind] = line.substring(12).split(" ").map(Number);
        status.ahead = ahead;
        status.behind = behind;
      } else if (line.startsWith("1 ")) {
        // Modified file
        const parts = line.split(" ");
        const file = parts[parts.length - 1];
        status.modified.push(file);
        status.isClean = false;
      } else if (line.startsWith("? ")) {
        // Untracked file
        status.untracked.push(line.substring(2));
        status.isClean = false;
      }
    }

    return status;
  }

  async getDiff(
    ref1: string,
    ref2: string,
    options?: DiffOptions
  ): Promise<DiffResult> {
    const args = ["diff"];

    if (options?.nameOnly) args.push("--name-only");
    if (options?.stat) args.push("--stat");
    if (options?.context) args.push(`--unified=${options.context}`);
    if (options?.pathFilter) args.push("--", options.pathFilter);

    args.push(ref1, ref2);

    const output = await this.exec(args);

    // Parse diff output
    const filesChanged = output.match(/(\d+) files? changed/)?.[1] || "0";
    const additions = output.match(/(\d+) insertions?/)?.[1] || "0";
    const deletions = output.match(/(\d+) deletions?/)?.[1] || "0";

    return {
      source: ref1,
      target: ref2,
      filesChanged: output.split("\n").filter((l) => l.startsWith("diff --git")).length,
      additions: parseInt(additions, 10),
      deletions: parseInt(deletions, 10),
      diff: output,
      summary: `${filesChanged} files changed, ${additions} insertions(+), ${deletions} deletions(-)`,
      timestamp: new Date(),
    };
  }

  async merge(
    branch: string,
    strategy: MergeStrategy,
    options?: { message?: string; noCommit?: boolean }
  ): Promise<{ success: boolean; conflicts?: string[] }> {
    const args = ["merge"];

    if (strategy === "squash") args.push("--squash");
    if (strategy === "fast-forward") args.push("--ff-only");
    if (options?.message) args.push("-m", options.message);
    if (options?.noCommit) args.push("--no-commit");

    args.push(branch);

    try {
      await this.exec(args);
      return { success: true };
    } catch (error: any) {
      // Check for conflicts
      const conflictOutput = await this.exec([
        "diff",
        "--name-only",
        "--diff-filter=U",
      ]).catch(() => "");

      const conflicts = conflictOutput.split("\n").filter(Boolean);

      return {
        success: false,
        conflicts: conflicts.length > 0 ? conflicts : undefined,
      };
    }
  }

  async getAheadBehind(
    branch1: string,
    branch2: string
  ): Promise<{ ahead: number; behind: number }> {
    const output = await this.exec([
      "rev-list",
      "--left-right",
      "--count",
      `${branch1}...${branch2}`,
    ]);

    const [ahead, behind] = output.split("\t").map(Number);
    return { ahead, behind };
  }

  async branchExists(branchName: string): Promise<boolean> {
    try {
      await this.exec(["rev-parse", "--verify", `refs/heads/${branchName}`]);
      return true;
    } catch {
      return false;
    }
  }

  async deleteBranch(branchName: string, force?: boolean): Promise<void> {
    const args = ["branch", force ? "-D" : "-d", branchName];
    await this.exec(args);
  }

  async getCurrentBranch(worktreePath?: string): Promise<string> {
    const args = ["branch", "--show-current"];
    if (worktreePath) args.unshift("-C", worktreePath);
    return await this.exec(args);
  }

  async getMergeBase(ref1: string, ref2: string): Promise<string> {
    return await this.exec(["merge-base", ref1, ref2]);
  }

  async checkMergeConflicts(
    sourceBranch: string,
    targetBranch: string
  ): Promise<string[]> {
    try {
      await this.exec([
        "merge-tree",
        await this.getMergeBase(sourceBranch, targetBranch),
        sourceBranch,
        targetBranch,
      ]);
      return [];
    } catch (error: any) {
      // Parse conflict files from error output
      const conflicts = error.message
        .split("\n")
        .filter((line: string) => line.includes("CONFLICT"))
        .map((line: string) => {
          const match = line.match(/in (.+)$/);
          return match ? match[1] : "";
        })
        .filter(Boolean);

      return conflicts;
    }
  }
}
```

---

## Phase 3: Persistence Layer

### File: `core/worktree/registry.ts`

```typescript
import fs from "fs/promises";
import path from "path";
import type { IWorktreeRegistry } from "./api";
import type { WorktreeSession, WorktreeRegistryState } from "./types";
import { REGISTRY_FILE, REGISTRY_VERSION, DEFAULT_WORKTREE_CONFIG } from "./constants";

export class WorktreeRegistry implements IWorktreeRegistry {
  private registryPath: string;

  constructor(private repoPath: string) {
    this.registryPath = path.join(repoPath, REGISTRY_FILE);
  }

  async load(): Promise<Map<string, WorktreeSession>> {
    try {
      const content = await fs.readFile(this.registryPath, "utf-8");
      const state: WorktreeRegistryState = JSON.parse(content);

      // Convert sessions object to Map
      const sessions = new Map<string, WorktreeSession>();
      for (const [id, session] of Object.entries(state.sessions)) {
        // Restore Date objects
        sessions.set(id, {
          ...session,
          createdAt: new Date(session.createdAt),
          lastAccessedAt: new Date(session.lastAccessedAt),
          metadata: {
            ...session.metadata,
            lastRefreshedAt: new Date(session.metadata.lastRefreshedAt),
          },
        });
      }

      return sessions;
    } catch (error: any) {
      if (error.code === "ENOENT") {
        // Registry doesn't exist yet
        return new Map();
      }
      throw error;
    }
  }

  async save(sessions: Map<string, WorktreeSession>): Promise<void> {
    // Convert Map to object for JSON serialization
    const sessionsObj: Record<string, WorktreeSession> = {};
    for (const [id, session] of sessions.entries()) {
      sessionsObj[id] = session;
    }

    const state: WorktreeRegistryState = {
      version: REGISTRY_VERSION,
      sessions: sessionsObj,
      lastCleanup: new Date(),
      config: DEFAULT_WORKTREE_CONFIG,
    };

    // Ensure directory exists
    await fs.mkdir(path.dirname(this.registryPath), { recursive: true });

    // Write atomically
    const tempPath = `${this.registryPath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(state, null, 2));
    await fs.rename(tempPath, this.registryPath);
  }

  async upsert(session: WorktreeSession): Promise<void> {
    const sessions = await this.load();
    sessions.set(session.id, session);
    await this.save(sessions);
  }

  async remove(sessionId: string): Promise<void> {
    const sessions = await this.load();
    sessions.delete(sessionId);
    await this.save(sessions);
  }

  async clear(): Promise<void> {
    await this.save(new Map());
  }

  getRegistryPath(): string {
    return this.registryPath;
  }
}
```

---

## Phase 4: Main Manager Implementation

### File: `core/worktree/WorktreeManagerSingleton.ts`

```typescript
import path from "path";
import { EventEmitter } from "events";
import type { IWorktreeManager } from "./api";
import type {
  WorktreeSession,
  WorktreeConfig,
  CreateWorktreeOptions,
  WorktreeFilter,
  // ... import all other types
} from "./types";
import { GitOperations } from "./git-operations";
import { WorktreeRegistry } from "./registry";
import { WorktreeErrors } from "./errors";
import { DEFAULT_WORKTREE_CONFIG } from "./constants";
import { generateSessionId, generateBranchName } from "./utils";

export class WorktreeManagerSingleton
  extends EventEmitter
  implements IWorktreeManager
{
  private static instance: WorktreeManagerSingleton;
  private worktrees: Map<string, WorktreeSession>;
  private config: WorktreeConfig;
  private git: GitOperations;
  private registry: WorktreeRegistry;
  private initialized: boolean = false;
  private cleanupInterval?: NodeJS.Timeout;

  private constructor(private baseRepoPath: string) {
    super();
    this.worktrees = new Map();
    this.config = DEFAULT_WORKTREE_CONFIG;
    this.git = new GitOperations(baseRepoPath);
    this.registry = new WorktreeRegistry(baseRepoPath);
  }

  static getInstance(baseRepoPath?: string): WorktreeManagerSingleton {
    if (!this.instance) {
      if (!baseRepoPath) {
        throw new Error("baseRepoPath required for first getInstance call");
      }
      this.instance = new WorktreeManagerSingleton(baseRepoPath);
    }
    return this.instance;
  }

  async initialize(config?: Partial<WorktreeConfig>): Promise<void> {
    if (this.initialized) return;

    // Merge config
    this.config = { ...DEFAULT_WORKTREE_CONFIG, ...config };

    // Load existing worktrees from registry
    this.worktrees = await this.registry.load();

    // Validate all loaded worktrees
    await this.validateAllWorktrees();

    // Start cleanup task
    this.startCleanupTask();

    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    // Stop cleanup task
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Save state
    await this.registry.save(this.worktrees);

    this.initialized = false;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async createWorktree(
    agentSessionId: string,
    options: CreateWorktreeOptions = {}
  ): Promise<WorktreeSession> {
    this.ensureInitialized();

    // Check limits
    if (this.worktrees.size >= this.config.maxConcurrentWorktrees) {
      throw WorktreeErrors.maxWorktreesReached(
        this.config.maxConcurrentWorktrees
      );
    }

    // Generate IDs
    const sessionId = generateSessionId();
    const branchName =
      options.branchName ||
      generateBranchName(this.config.branchPrefix, sessionId);

    // Check if branch exists
    if (await this.git.branchExists(branchName)) {
      throw WorktreeErrors.branchExists(branchName);
    }

    // Determine base branch
    const baseBranch = options.baseBranch || await this.git.getCurrentBranch();

    // Create worktree path
    const worktreePath = path.join(
      this.baseRepoPath,
      this.config.worktreeBaseDir,
      sessionId
    );

    // Create worktree
    await this.git.createWorktree(worktreePath, branchName, baseBranch);

    // Create session
    const session: WorktreeSession = {
      id: sessionId,
      agentSessionId,
      worktreePath,
      branchName,
      parentBranch: baseBranch,
      status: "active",
      createdAt: new Date(),
      lastAccessedAt: new Date(),
      description: options.description,
      metadata: {
        hasUncommittedChanges: false,
        hasUnpushedCommits: false,
        commitsAhead: 0,
        commitsBehind: 0,
        filesChanged: 0,
        diffStats: { additions: 0, deletions: 0 },
        diskUsageBytes: 0,
        lastRefreshedAt: new Date(),
      },
    };

    // Register
    this.worktrees.set(sessionId, session);
    await this.registry.upsert(session);

    // Emit event
    this.emit({ type: "created", session, timestamp: new Date() });

    return session;
  }

  // ... Implement all other IWorktreeManager methods
  // (getWorktree, listWorktrees, refreshWorktreeMetadata, etc.)

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error("WorktreeManager not initialized. Call initialize() first.");
    }
  }

  private startCleanupTask(): void {
    this.cleanupInterval = setInterval(
      () => this.cleanupWorktrees(),
      CLEANUP_INTERVAL_MS
    );
  }
}
```

---

## Key Implementation Notes

### 1. Thread Safety

The manager uses a singleton pattern. For thread safety:
- Use async/await consistently
- Don't mutate shared state without registry saves
- Consider adding mutex for critical sections

### 2. Error Handling

Always use `WorktreeErrors` factory methods for consistency:
```typescript
throw WorktreeErrors.notFound(sessionId);
```

### 3. Event Emitting

Emit events for all state changes:
```typescript
this.emit({
  type: "created",
  session,
  timestamp: new Date()
});
```

### 4. Registry Persistence

Save to registry after every mutation:
```typescript
this.worktrees.set(id, session);
await this.registry.upsert(session);
```

### 5. Metadata Refresh

Metadata is expensive to compute. Cache it and refresh on-demand:
```typescript
// Refresh before displaying
await manager.refreshWorktreeMetadata(sessionId);
```

---

## Testing Strategy

### Unit Tests

```typescript
// __tests__/worktree-manager.test.ts
describe("WorktreeManagerSingleton", () => {
  let manager: WorktreeManagerSingleton;

  beforeEach(async () => {
    manager = WorktreeManagerSingleton.getInstance("/test/repo");
    await manager.initialize();
  });

  it("creates worktree successfully", async () => {
    const session = await manager.createWorktree("agent-123");
    expect(session.id).toMatch(/^wt-/);
    expect(session.agentSessionId).toBe("agent-123");
  });

  it("throws error when max worktrees reached", async () => {
    // Create max worktrees
    for (let i = 0; i < 10; i++) {
      await manager.createWorktree(`agent-${i}`);
    }

    // Should fail
    await expect(
      manager.createWorktree("agent-11")
    ).rejects.toThrow("Maximum number of worktrees reached");
  });
});
```

### Integration Tests

```typescript
// __tests__/integration/worktree-lifecycle.test.ts
describe("Worktree Lifecycle", () => {
  it("complete workflow: create -> work -> merge -> cleanup", async () => {
    // Create
    const session = await manager.createWorktree("agent-123", {
      description: "Test feature",
    });

    // Simulate work
    await fs.writeFile(
      path.join(session.worktreePath, "test.txt"),
      "content"
    );

    // Commit
    await git.exec(["-C", session.worktreePath, "add", "."]);
    await git.exec(["-C", session.worktreePath, "commit", "-m", "Test"]);

    // Merge
    const result = await manager.mergeWorktree(session.id, {
      strategy: "squash",
      deleteAfterMerge: true,
    });

    expect(result.success).toBe(true);
    expect(manager.getWorktree(session.id)).toBeUndefined();
  });
});
```

---

## Next Steps

Once core implementation is complete:

1. **CLI Integration** - Add commands to `extensions/cli/src/commands/worktree.ts`
2. **GUI Integration** - Add panel to VSCode extension
3. **Documentation** - Write user-facing docs
4. **Performance Testing** - Test with many concurrent worktrees
5. **Security Audit** - Review path handling and git operations

---

## Questions & Decisions

Track open decisions here:

- [ ] Should we support custom worktree locations outside `.worktrees/`?
- [ ] Should cleanup be opt-in or opt-out by default?
- [ ] Should we integrate with E2B sandboxes automatically?
- [ ] Should we add telemetry for usage metrics?
- [ ] Should we support remote worktree synchronization?

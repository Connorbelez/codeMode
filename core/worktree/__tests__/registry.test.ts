import { describe, expect, it, beforeEach, afterEach } from "@jest/globals";
import fs from "fs/promises";
import path from "path";
import os from "os";

import { WorktreeRegistry } from "../registry";
import type { WorktreeSession, WorktreeConfig } from "../types";
import { DEFAULT_WORKTREE_CONFIG } from "../constants";

describe("WorktreeRegistry", () => {
  let registry: WorktreeRegistry;
  let tempDir: string;
  let registryPath: string;

  beforeEach(async () => {
    // Create temporary directory for test registry
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "registry-test-"));
    registryPath = path.join(tempDir, "worktrees.json");
    registry = new WorktreeRegistry(registryPath);
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("constructor", () => {
    it("creates instance with valid path", () => {
      expect(registry).toBeInstanceOf(WorktreeRegistry);
    });

    it("throws error for empty path", () => {
      expect(() => new WorktreeRegistry("")).toThrow(
        "Registry path is required",
      );
    });
  });

  describe("getRegistryPath", () => {
    it("returns the registry path", () => {
      expect(registry.getRegistryPath()).toBe(registryPath);
    });
  });

  describe("load", () => {
    it("returns empty Map for non-existent file", async () => {
      const { sessions } = await registry.load();

      expect(sessions).toBeInstanceOf(Map);
      expect(sessions.size).toBe(0);
    });

    it("loads existing registry with sessions", async () => {
      const mockSession: WorktreeSession = {
        id: "wt-123",
        agentSessionId: "agent-456",
        worktreePath: "/path/to/worktree",
        branchName: "claude/wt-123",
        parentBranch: "main",
        status: "active",
        createdAt: new Date("2024-01-01T00:00:00Z"),
        lastAccessedAt: new Date("2024-01-01T01:00:00Z"),
        description: "Test worktree",
        metadata: {
          hasUncommittedChanges: false,
          hasUnpushedCommits: true,
          commitsAhead: 2,
          commitsBehind: 0,
          filesChanged: 5,
          diffStats: { additions: 100, deletions: 50 },
          diskUsageBytes: 1024000,
          lastRefreshedAt: new Date("2024-01-01T01:00:00Z"),
        },
      };

      // Save initial session
      await registry.save(new Map([["wt-123", mockSession]]));

      // Load and verify
      const { sessions } = await registry.load();

      expect(sessions.size).toBe(1);
      expect(sessions.has("wt-123")).toBe(true);

      const loaded = sessions.get("wt-123")!;
      expect(loaded.id).toBe("wt-123");
      expect(loaded.agentSessionId).toBe("agent-456");
      expect(loaded.worktreePath).toBe("/path/to/worktree");
      expect(loaded.branchName).toBe("claude/wt-123");
      expect(loaded.status).toBe("active");

      // Verify dates are deserialized correctly
      expect(loaded.createdAt).toBeInstanceOf(Date);
      expect(loaded.createdAt.toISOString()).toBe("2024-01-01T00:00:00.000Z");
      expect(loaded.lastAccessedAt).toBeInstanceOf(Date);
      expect(loaded.metadata.lastRefreshedAt).toBeInstanceOf(Date);
    });

    it("handles corrupted JSON by backing up and returning empty", async () => {
      // Write corrupted JSON
      await fs.writeFile(registryPath, "{ invalid json }", "utf-8");

      const { sessions } = await registry.load();

      // Should return empty Map
      expect(sessions.size).toBe(0);

      // Should create backup file
      const backupFiles = (await fs.readdir(tempDir)).filter((f) =>
        f.startsWith("worktrees.json.backup"),
      );
      expect(backupFiles.length).toBeGreaterThan(0);
    });

    it("handles registry without version field", async () => {
      // Write registry without version
      await fs.writeFile(
        registryPath,
        JSON.stringify({ sessions: {} }),
        "utf-8",
      );

      const { sessions } = await registry.load();

      // Should handle gracefully and return empty
      expect(sessions.size).toBe(0);
    });
  });

  describe("save", () => {
    it("saves sessions to file", async () => {
      const mockSession: WorktreeSession = {
        id: "wt-789",
        agentSessionId: "agent-012",
        worktreePath: "/test/path",
        branchName: "claude/wt-789",
        parentBranch: "develop",
        status: "idle",
        createdAt: new Date("2024-02-01T00:00:00Z"),
        lastAccessedAt: new Date("2024-02-01T00:00:00Z"),
        metadata: {
          hasUncommittedChanges: false,
          hasUnpushedCommits: false,
          commitsAhead: 0,
          commitsBehind: 0,
          filesChanged: 0,
          diffStats: { additions: 0, deletions: 0 },
          diskUsageBytes: 512000,
          lastRefreshedAt: new Date("2024-02-01T00:00:00Z"),
        },
      };

      await registry.save(new Map([["wt-789", mockSession]]));

      // Verify file exists
      const content = await fs.readFile(registryPath, "utf-8");
      const parsed = JSON.parse(content);

      expect(parsed.version).toBeDefined();
      expect(parsed.sessions).toBeDefined();
      expect(parsed.sessions["wt-789"]).toBeDefined();
      expect(parsed.sessions["wt-789"].id).toBe("wt-789");
    });

    it("creates directory if it doesn't exist", async () => {
      const nestedPath = path.join(tempDir, "nested", "dir", "registry.json");
      const nestedRegistry = new WorktreeRegistry(nestedPath);

      const mockSession: WorktreeSession = {
        id: "wt-test",
        agentSessionId: "agent-test",
        worktreePath: "/test",
        branchName: "test",
        parentBranch: "main",
        status: "active",
        createdAt: new Date(),
        lastAccessedAt: new Date(),
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

      await nestedRegistry.save(new Map([["wt-test", mockSession]]));

      // Verify file was created
      const exists = await fs
        .access(nestedPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });

    it("uses atomic write (temp file then rename)", async () => {
      const mockSession: WorktreeSession = {
        id: "wt-atomic",
        agentSessionId: "agent-atomic",
        worktreePath: "/atomic",
        branchName: "atomic",
        parentBranch: "main",
        status: "active",
        createdAt: new Date(),
        lastAccessedAt: new Date(),
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

      await registry.save(new Map([["wt-atomic", mockSession]]));

      // Verify no temp files left behind
      const files = await fs.readdir(tempDir);
      const tempFiles = files.filter((f) => f.includes(".tmp."));
      expect(tempFiles.length).toBe(0);
    });
  });

  describe("upsert", () => {
    it("adds new session to registry", async () => {
      const mockSession: WorktreeSession = {
        id: "wt-new",
        agentSessionId: "agent-new",
        worktreePath: "/new",
        branchName: "new",
        parentBranch: "main",
        status: "active",
        createdAt: new Date(),
        lastAccessedAt: new Date(),
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

      await registry.upsert(mockSession);

      const { sessions } = await registry.load();
      expect(sessions.has("wt-new")).toBe(true);
    });

    it("updates existing session in registry", async () => {
      const mockSession: WorktreeSession = {
        id: "wt-update",
        agentSessionId: "agent-update",
        worktreePath: "/update",
        branchName: "update",
        parentBranch: "main",
        status: "active",
        createdAt: new Date(),
        lastAccessedAt: new Date(),
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

      await registry.upsert(mockSession);

      // Update status
      const updated = { ...mockSession, status: "merged" as const };
      await registry.upsert(updated);

      const { sessions } = await registry.load();
      expect(sessions.get("wt-update")?.status).toBe("merged");
    });
  });

  describe("remove", () => {
    it("removes session from registry", async () => {
      const mockSession: WorktreeSession = {
        id: "wt-remove",
        agentSessionId: "agent-remove",
        worktreePath: "/remove",
        branchName: "remove",
        parentBranch: "main",
        status: "active",
        createdAt: new Date(),
        lastAccessedAt: new Date(),
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

      await registry.upsert(mockSession);
      await registry.remove("wt-remove");

      const { sessions } = await registry.load();
      expect(sessions.has("wt-remove")).toBe(false);
    });

    it("throws error for non-existent session", async () => {
      await expect(registry.remove("nonexistent")).rejects.toThrow("not found");
    });
  });

  describe("clear", () => {
    it("removes all sessions from registry", async () => {
      const mockSession1: WorktreeSession = {
        id: "wt-1",
        agentSessionId: "agent-1",
        worktreePath: "/1",
        branchName: "1",
        parentBranch: "main",
        status: "active",
        createdAt: new Date(),
        lastAccessedAt: new Date(),
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

      const mockSession2: WorktreeSession = {
        id: "wt-2",
        agentSessionId: "agent-2",
        worktreePath: "/2",
        branchName: "2",
        parentBranch: "main",
        status: "active",
        createdAt: new Date(),
        lastAccessedAt: new Date(),
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

      await registry.save(
        new Map([
          ["wt-1", mockSession1],
          ["wt-2", mockSession2],
        ]),
      );

      await registry.clear();

      const { sessions } = await registry.load();
      expect(sessions.size).toBe(0);
    });
  });

  describe("date serialization", () => {
    it("correctly serializes and deserializes dates", async () => {
      const testDate = new Date("2024-06-15T12:30:45.123Z");

      const mockSession: WorktreeSession = {
        id: "wt-dates",
        agentSessionId: "agent-dates",
        worktreePath: "/dates",
        branchName: "dates",
        parentBranch: "main",
        status: "active",
        createdAt: testDate,
        lastAccessedAt: testDate,
        metadata: {
          hasUncommittedChanges: false,
          hasUnpushedCommits: false,
          commitsAhead: 0,
          commitsBehind: 0,
          filesChanged: 0,
          diffStats: { additions: 0, deletions: 0 },
          diskUsageBytes: 0,
          lastRefreshedAt: testDate,
          lastTestResult: {
            passed: true,
            timestamp: testDate,
            summary: "All tests passed",
          },
        },
      };

      await registry.save(new Map([["wt-dates", mockSession]]));
      const { sessions } = await registry.load();
      const loaded = sessions.get("wt-dates")!;

      expect(loaded.createdAt.toISOString()).toBe(testDate.toISOString());
      expect(loaded.lastAccessedAt.toISOString()).toBe(testDate.toISOString());
      expect(loaded.metadata.lastRefreshedAt.toISOString()).toBe(
        testDate.toISOString(),
      );
      expect(loaded.metadata.lastTestResult?.timestamp.toISOString()).toBe(
        testDate.toISOString(),
      );
    });
  });

  describe("config persistence", () => {
    it("saves and loads config", async () => {
      const mockSession: WorktreeSession = {
        id: "wt-config",
        agentSessionId: "agent-123",
        worktreePath: "/path/to/worktree",
        branchName: "claude/wt-config",
        parentBranch: "main",
        status: "active",
        createdAt: new Date(),
        lastAccessedAt: new Date(),
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

      const customConfig: WorktreeConfig = {
        ...DEFAULT_WORKTREE_CONFIG,
        worktreeBaseDir: ".custom-worktrees",
        branchPrefix: "custom/",
        maxConcurrentWorktrees: 5,
      };

      // Save with custom config
      await registry.save(new Map([["wt-config", mockSession]]), customConfig);

      // Load and verify config is restored
      const { sessions, config } = await registry.load();
      expect(sessions.size).toBe(1);
      expect(config).toBeDefined();
      expect(config?.worktreeBaseDir).toBe(".custom-worktrees");
      expect(config?.branchPrefix).toBe("custom/");
      expect(config?.maxConcurrentWorktrees).toBe(5);
    });

    it("uses stored config when saving without explicit config", async () => {
      const mockSession: WorktreeSession = {
        id: "wt-stored",
        agentSessionId: "agent-456",
        worktreePath: "/path/to/worktree",
        branchName: "claude/wt-stored",
        parentBranch: "main",
        status: "active",
        createdAt: new Date(),
        lastAccessedAt: new Date(),
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

      const customConfig: WorktreeConfig = {
        ...DEFAULT_WORKTREE_CONFIG,
        branchPrefix: "stored/",
      };

      // Save with custom config first
      await registry.save(new Map([["wt-stored", mockSession]]), customConfig);

      // Save again without config - should use stored config
      await registry.save(new Map([["wt-stored", mockSession]]));

      // Verify stored config was used
      const { config } = await registry.load();
      expect(config?.branchPrefix).toBe("stored/");
    });
  });
});

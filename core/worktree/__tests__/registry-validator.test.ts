import { describe, expect, it, jest, beforeEach } from "@jest/globals";

import { validateRegistry } from "../registry-validator";
import type { WorktreeSession } from "../types";
import type { IGitOperations, IFilesystemOperations } from "../api";

describe("validateRegistry", () => {
  let mockGitOps: jest.Mocked<IGitOperations>;
  let mockFsOps: jest.Mocked<IFilesystemOperations>;

  beforeEach(() => {
    mockGitOps = {
      branchExists: jest.fn(),
    } as any;

    mockFsOps = {
      exists: jest.fn(),
    } as any;
  });

  const createMockSession = (id: string): WorktreeSession => ({
    id,
    agentSessionId: `agent-${id}`,
    worktreePath: `/path/to/${id}`,
    branchName: `claude/${id}`,
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
  });

  it("validates all sessions successfully when everything exists", async () => {
    const session1 = createMockSession("wt-1");
    const session2 = createMockSession("wt-2");
    const sessions = new Map([
      ["wt-1", session1],
      ["wt-2", session2],
    ]);

    mockFsOps.exists.mockResolvedValue(true);
    mockGitOps.branchExists.mockResolvedValue(true);

    const report = await validateRegistry(sessions, mockGitOps, mockFsOps);

    expect(report.valid).toHaveLength(2);
    expect(report.orphaned).toHaveLength(0);
    expect(report.warnings).toHaveLength(0);
    expect(sessions.size).toBe(2);
  });

  it("removes sessions with non-existent worktree paths", async () => {
    const session1 = createMockSession("wt-1");
    const session2 = createMockSession("wt-2");
    const sessions = new Map([
      ["wt-1", session1],
      ["wt-2", session2],
    ]);

    // wt-1 path exists, wt-2 doesn't
    mockFsOps.exists.mockImplementation(async (path: string) => {
      return path.includes("wt-1");
    });
    mockGitOps.branchExists.mockResolvedValue(true);

    const report = await validateRegistry(sessions, mockGitOps, mockFsOps);

    expect(report.valid).toHaveLength(1);
    expect(report.valid[0].id).toBe("wt-1");
    expect(report.orphaned).toContain("wt-2");
    expect(report.warnings.length).toBeGreaterThan(0);
    expect(sessions.size).toBe(1);
    expect(sessions.has("wt-1")).toBe(true);
    expect(sessions.has("wt-2")).toBe(false);
  });

  it("removes sessions with non-existent branches", async () => {
    const session1 = createMockSession("wt-1");
    const session2 = createMockSession("wt-2");
    const sessions = new Map([
      ["wt-1", session1],
      ["wt-2", session2],
    ]);

    mockFsOps.exists.mockResolvedValue(true);
    // wt-1 branch exists, wt-2 doesn't
    mockGitOps.branchExists.mockImplementation(async (branchName: string) => {
      return branchName.includes("wt-1");
    });

    const report = await validateRegistry(sessions, mockGitOps, mockFsOps);

    expect(report.valid).toHaveLength(1);
    expect(report.valid[0].id).toBe("wt-1");
    expect(report.orphaned).toContain("wt-2");
    expect(report.warnings.length).toBeGreaterThan(0);
    expect(sessions.size).toBe(1);
  });

  it("removes sessions when branch check throws error", async () => {
    const session = createMockSession("wt-error");
    const sessions = new Map([["wt-error", session]]);

    mockFsOps.exists.mockResolvedValue(true);
    mockGitOps.branchExists.mockRejectedValue(
      new Error("Git operation failed"),
    );

    const report = await validateRegistry(sessions, mockGitOps, mockFsOps);

    expect(report.valid).toHaveLength(0);
    expect(report.orphaned).toContain("wt-error");
    expect(
      report.warnings.some((w) => w.includes("Git operation failed")),
    ).toBe(true);
    expect(sessions.size).toBe(0);
  });

  it("handles empty session map", async () => {
    const sessions = new Map<string, WorktreeSession>();

    const report = await validateRegistry(sessions, mockGitOps, mockFsOps);

    expect(report.valid).toHaveLength(0);
    expect(report.orphaned).toHaveLength(0);
    expect(report.warnings).toHaveLength(0);
  });

  it("removes all sessions if all are invalid", async () => {
    const session1 = createMockSession("wt-1");
    const session2 = createMockSession("wt-2");
    const session3 = createMockSession("wt-3");
    const sessions = new Map([
      ["wt-1", session1],
      ["wt-2", session2],
      ["wt-3", session3],
    ]);

    mockFsOps.exists.mockResolvedValue(false);
    mockGitOps.branchExists.mockResolvedValue(false);

    const report = await validateRegistry(sessions, mockGitOps, mockFsOps);

    expect(report.valid).toHaveLength(0);
    expect(report.orphaned).toHaveLength(3);
    expect(report.warnings.length).toBe(3);
    expect(sessions.size).toBe(0);
  });

  it("generates warning messages with session details", async () => {
    const session = createMockSession("wt-test");
    const sessions = new Map([["wt-test", session]]);

    mockFsOps.exists.mockResolvedValue(false);

    const report = await validateRegistry(sessions, mockGitOps, mockFsOps);

    expect(report.warnings[0]).toContain("wt-test");
    expect(report.warnings[0]).toContain("Worktree path does not exist");
    expect(report.warnings[0]).toContain(session.worktreePath);
  });
});

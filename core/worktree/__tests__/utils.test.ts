import { describe, expect, it } from "@jest/globals";

import {
  formatBranchName,
  formatDiskSize,
  generateWorktreeId,
  parseGitOutput,
  validatePath,
  WORKTREE_ID_PREFIX,
} from "../utils";
import { BRANCH_PREFIX, WORKTREE_BASE_DIR } from "../constants";

describe("generateWorktreeId", () => {
  it("generates prefixed unique identifiers", () => {
    const first = generateWorktreeId();
    const second = generateWorktreeId();

    expect(first).toMatch(new RegExp(`^${WORKTREE_ID_PREFIX}[a-f0-9]+$`));
    expect(second).toMatch(new RegExp(`^${WORKTREE_ID_PREFIX}[a-f0-9]+$`));
    expect(first).not.toEqual(second);
  });
});

describe("validatePath", () => {
  it("normalizes simple relative paths under base directory", () => {
    const result = validatePath("my-worktree");
    expect(result).toBe(`${WORKTREE_BASE_DIR}/my-worktree`);
  });

  it("accepts paths that already include the base directory", () => {
    const existing = `${WORKTREE_BASE_DIR}/wt-123`;
    expect(validatePath(existing)).toBe(existing);
  });

  it("rejects traversal and absolute paths", () => {
    expect(() => validatePath("../etc/passwd")).toThrow(
      /cannot contain parent directory/,
    );
    expect(() => validatePath("/tmp/worktree")).toThrow(/must be relative/);
  });

  it("rejects invalid characters", () => {
    expect(() => validatePath("invalid!name")).toThrow(/invalid characters/);
  });
});

describe("formatBranchName", () => {
  it("applies the configured prefix", () => {
    const id = "wt-abc123";
    expect(formatBranchName(id)).toBe(`${BRANCH_PREFIX}${id}`);
  });

  it("rejects invalid branch characters", () => {
    expect(() => formatBranchName("feat!")).toThrow(/invalid characters/);
  });
});

describe("parseGitOutput", () => {
  it("parses porcelain key/value blocks", () => {
    const sample = `worktree /repo
HEAD 1234abcd
branch refs/heads/main

worktree /repo/.worktrees/wt-1
HEAD abcd9876
branch refs/heads/${BRANCH_PREFIX}wt-1
prunable`;

    const entries = parseGitOutput(sample);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      worktree: "/repo",
      HEAD: "1234abcd",
      branch: "refs/heads/main",
    });
    expect(entries[1]).toMatchObject({
      worktree: "/repo/.worktrees/wt-1",
      HEAD: "abcd9876",
    });
    expect(entries[1].prunable).toBe("");
  });
});

describe("formatDiskSize", () => {
  it("formats bytes into human readable units", () => {
    expect(formatDiskSize(500)).toBe("500 B");
    expect(formatDiskSize(1024)).toBe("1.00 KB");
    expect(formatDiskSize(5 * 1024 * 1024)).toBe("5.00 MB");
  });

  it("rejects negative sizes", () => {
    expect(() => formatDiskSize(-1)).toThrow(/cannot be negative/);
  });
});

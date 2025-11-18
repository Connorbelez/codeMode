import { describe, expect, it } from "@jest/globals";

import { GitOperations } from "../git-operations";
import { WorktreeErrors } from "../errors";

describe("GitOperations", () => {
  const mockRepoPath = "/mock/repo";

  describe("constructor", () => {
    it("creates instance with valid repository path", () => {
      const gitOps = new GitOperations(mockRepoPath);
      expect(gitOps).toBeInstanceOf(GitOperations);
    });

    it("throws error for empty repository path", () => {
      expect(() => new GitOperations("")).toThrow(
        "Repository path is required",
      );
    });

    it("throws error for whitespace-only repository path", () => {
      expect(() => new GitOperations("   ")).toThrow(
        "Repository path is required",
      );
    });
  });

  // Note: Full integration tests with actual git command execution
  // would be more appropriate for GitOperations than mocking child_process.
  // These tests verify the basic validation logic.
});

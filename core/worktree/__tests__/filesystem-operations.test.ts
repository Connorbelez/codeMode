import {
  describe,
  expect,
  it,
  jest,
  beforeEach,
  afterEach,
} from "@jest/globals";
import fs from "fs/promises";
import path from "path";
import os from "os";

import { FilesystemOperations } from "../filesystem-operations";
import { WorktreeErrorCode } from "../errors";

describe("FilesystemOperations", () => {
  let fsOps: FilesystemOperations;
  let tempDir: string;

  beforeEach(async () => {
    fsOps = new FilesystemOperations();
    // Create a temporary directory for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "worktree-test-"));
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("exists", () => {
    it("returns true for existing path", async () => {
      const testFile = path.join(tempDir, "test.txt");
      await fs.writeFile(testFile, "content");

      const exists = await fsOps.exists(testFile);

      expect(exists).toBe(true);
    });

    it("returns false for non-existing path", async () => {
      const exists = await fsOps.exists(path.join(tempDir, "nonexistent.txt"));

      expect(exists).toBe(false);
    });

    it("returns false for empty path", async () => {
      const exists = await fsOps.exists("");

      expect(exists).toBe(false);
    });
  });

  describe("mkdirp", () => {
    it("creates directory", async () => {
      const newDir = path.join(tempDir, "new-dir");

      await fsOps.mkdirp(newDir);

      const stats = await fs.stat(newDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it("creates nested directories", async () => {
      const nestedDir = path.join(tempDir, "level1", "level2", "level3");

      await fsOps.mkdirp(nestedDir);

      const stats = await fs.stat(nestedDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it("succeeds if directory already exists", async () => {
      const existingDir = path.join(tempDir, "existing");
      await fs.mkdir(existingDir);

      await expect(fsOps.mkdirp(existingDir)).resolves.not.toThrow();
    });

    it("throws error for empty path", async () => {
      await expect(fsOps.mkdirp("")).rejects.toThrow(
        "Path is required for directory creation",
      );
    });
  });

  describe("rmdir", () => {
    it("removes directory", async () => {
      const dirToRemove = path.join(tempDir, "remove-me");
      await fs.mkdir(dirToRemove);

      await fsOps.rmdir(dirToRemove);

      await expect(fs.access(dirToRemove)).rejects.toThrow();
    });

    it("removes directory with contents", async () => {
      const dirToRemove = path.join(tempDir, "remove-with-contents");
      await fs.mkdir(dirToRemove);
      await fs.writeFile(path.join(dirToRemove, "file.txt"), "content");

      await fsOps.rmdir(dirToRemove);

      await expect(fs.access(dirToRemove)).rejects.toThrow();
    });

    it("removes nested directories", async () => {
      const nestedDir = path.join(tempDir, "nested", "deep");
      await fs.mkdir(path.dirname(nestedDir), { recursive: true });
      await fs.mkdir(nestedDir);

      await fsOps.rmdir(path.join(tempDir, "nested"));

      await expect(fs.access(path.join(tempDir, "nested"))).rejects.toThrow();
    });

    it("throws error for non-existing directory without force", async () => {
      await expect(
        fsOps.rmdir(path.join(tempDir, "nonexistent")),
      ).rejects.toThrow("Path not found");
    });

    it("succeeds for non-existing directory with force", async () => {
      await expect(
        fsOps.rmdir(path.join(tempDir, "nonexistent"), true),
      ).resolves.not.toThrow();
    });
  });

  describe("getDiskUsage", () => {
    it("calculates size of single file", async () => {
      const testFile = path.join(tempDir, "test.txt");
      const content = "Hello, World!";
      await fs.writeFile(testFile, content);

      const size = await fsOps.getDiskUsage(testFile);

      expect(size).toBeGreaterThan(0);
      expect(size).toBe(Buffer.from(content).length);
    });

    it("calculates size of directory with files", async () => {
      const dir = path.join(tempDir, "calc-size");
      await fs.mkdir(dir);
      await fs.writeFile(path.join(dir, "file1.txt"), "content1");
      await fs.writeFile(path.join(dir, "file2.txt"), "content2");

      const size = await fsOps.getDiskUsage(dir);

      expect(size).toBeGreaterThan(0);
      // Size should be sum of both files
      const expectedSize = "content1".length + "content2".length;
      expect(size).toBe(expectedSize);
    });

    it("calculates size of nested directories", async () => {
      const dir = path.join(tempDir, "nested-calc");
      const subdir = path.join(dir, "subdir");
      await fs.mkdir(subdir, { recursive: true });
      await fs.writeFile(path.join(dir, "file1.txt"), "abc");
      await fs.writeFile(path.join(subdir, "file2.txt"), "def");

      const size = await fsOps.getDiskUsage(dir);

      expect(size).toBe(6); // "abc" + "def" = 6 bytes
    });

    it("skips .git directory", async () => {
      const dir = path.join(tempDir, "with-git");
      const gitDir = path.join(dir, ".git");
      await fs.mkdir(gitDir, { recursive: true });
      await fs.writeFile(path.join(dir, "file.txt"), "content");
      await fs.writeFile(path.join(gitDir, "large.txt"), "x".repeat(1000));

      const size = await fsOps.getDiskUsage(dir);

      // Should only count file.txt, not .git/large.txt
      expect(size).toBe("content".length);
    });

    it("throws error for non-existing path", async () => {
      await expect(
        fsOps.getDiskUsage(path.join(tempDir, "nonexistent")),
      ).rejects.toThrow("Path not found");
    });
  });

  describe("copy", () => {
    it("copies single file", async () => {
      const source = path.join(tempDir, "source.txt");
      const dest = path.join(tempDir, "dest.txt");
      const content = "test content";
      await fs.writeFile(source, content);

      await fsOps.copy(source, dest);

      const copiedContent = await fs.readFile(dest, "utf-8");
      expect(copiedContent).toBe(content);
    });

    it("copies directory with contents", async () => {
      const sourceDir = path.join(tempDir, "source-dir");
      const destDir = path.join(tempDir, "dest-dir");
      await fs.mkdir(sourceDir);
      await fs.writeFile(path.join(sourceDir, "file1.txt"), "content1");
      await fs.writeFile(path.join(sourceDir, "file2.txt"), "content2");

      await fsOps.copy(sourceDir, destDir);

      const file1Content = await fs.readFile(
        path.join(destDir, "file1.txt"),
        "utf-8",
      );
      const file2Content = await fs.readFile(
        path.join(destDir, "file2.txt"),
        "utf-8",
      );
      expect(file1Content).toBe("content1");
      expect(file2Content).toBe("content2");
    });

    it("copies nested directories", async () => {
      const sourceDir = path.join(tempDir, "source-nested");
      const subdir = path.join(sourceDir, "subdir");
      const destDir = path.join(tempDir, "dest-nested");

      await fs.mkdir(subdir, { recursive: true });
      await fs.writeFile(path.join(sourceDir, "root.txt"), "root");
      await fs.writeFile(path.join(subdir, "nested.txt"), "nested");

      await fsOps.copy(sourceDir, destDir);

      const rootContent = await fs.readFile(
        path.join(destDir, "root.txt"),
        "utf-8",
      );
      const nestedContent = await fs.readFile(
        path.join(destDir, "subdir", "nested.txt"),
        "utf-8",
      );
      expect(rootContent).toBe("root");
      expect(nestedContent).toBe("nested");
    });

    it("applies filter to copy", async () => {
      const sourceDir = path.join(tempDir, "source-filter");
      const destDir = path.join(tempDir, "dest-filter");
      await fs.mkdir(sourceDir);
      await fs.writeFile(path.join(sourceDir, "file.ts"), "typescript");
      await fs.writeFile(path.join(sourceDir, "file.js"), "javascript");

      await fsOps.copy(sourceDir, destDir, ["*.ts"]);

      // Should copy .ts file
      const tsExists = await fsOps.exists(path.join(destDir, "file.ts"));
      expect(tsExists).toBe(true);

      // Should NOT copy .js file
      const jsExists = await fsOps.exists(path.join(destDir, "file.js"));
      expect(jsExists).toBe(false);
    });

    it("throws error for non-existing source", async () => {
      await expect(
        fsOps.copy(
          path.join(tempDir, "nonexistent"),
          path.join(tempDir, "dest"),
        ),
      ).rejects.toThrow("Path not found");
    });
  });

  describe("readdir", () => {
    it("lists files in directory", async () => {
      const dir = path.join(tempDir, "list-dir");
      await fs.mkdir(dir);
      await fs.writeFile(path.join(dir, "file1.txt"), "");
      await fs.writeFile(path.join(dir, "file2.txt"), "");

      const files = await fsOps.readdir(dir);

      expect(files).toContain("file1.txt");
      expect(files).toContain("file2.txt");
      expect(files).toHaveLength(2);
    });

    it("lists files recursively", async () => {
      const dir = path.join(tempDir, "list-recursive");
      const subdir = path.join(dir, "subdir");
      await fs.mkdir(subdir, { recursive: true });
      await fs.writeFile(path.join(dir, "root.txt"), "");
      await fs.writeFile(path.join(subdir, "nested.txt"), "");

      const files = await fsOps.readdir(dir, true);

      expect(files).toContain("root.txt");
      expect(files).toContain(path.join("subdir", "nested.txt"));
      expect(files).toHaveLength(2);
    });

    it("returns empty array for empty directory", async () => {
      const dir = path.join(tempDir, "empty-dir");
      await fs.mkdir(dir);

      const files = await fsOps.readdir(dir);

      expect(files).toEqual([]);
    });

    it("throws error for non-existing directory", async () => {
      await expect(
        fsOps.readdir(path.join(tempDir, "nonexistent")),
      ).rejects.toThrow("Path not found");
    });

    it("throws error for empty path", async () => {
      await expect(fsOps.readdir("")).rejects.toThrow(
        "Path is required for reading directory",
      );
    });
  });
});

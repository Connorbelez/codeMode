# Footguns & Mitigations – Worktree Management

## Branching & Git Preconditions

- **Existing branch collisions** – `git worktree add` fails if `claude/<id>` already exists; always call `GitOperations.branchExists` before creation and surface `WorktreeErrors.branchExists` with suggestions. [3][4]
- **Unsupported git versions** – Worktrees require git ≥2.5; guard `initialize()` with a version check so users get a clear error instead of cryptic failures later. [2][8]

## Disk Usage & Cleanup

- **Quota overruns** – Worktrees share `.git` but can still exceed per-worktree (500 MB default) or total (5 GB) limits. Refresh metadata regularly, emit `WorktreeDiskWarningEvent` once usage >90%, and block new worktrees when limits hit. [4][5]
- **Stale retention** – Forgetting to run cleanup leaves abandoned branches. Keep the hourly cleanup task enabled, honor `cleanup.retentionDays`, and expose `codemode worktree cleanup --dry-run` so users can preview deletions. [3][4][6]

## Registry Integrity

- **Corrupted `.codemode/worktrees.json`** – Power loss or crashes mid-write can corrupt the registry. Always write via temp file + rename, back up corrupted files to `.backup`, and reinitialize empty maps when parsing fails. [3][4]
- **Manual deletions** – If users delete worktree directories manually, registry entries go stale. Run `validateAllWorktrees` on startup and provide `syncRegistry()` so CLI can reconcile git’s view with the registry. [4][6]

## Path & Command Safety

- **Path traversal / symlink attacks** – Unsanitized user paths could escape the repo. Use the provided `sanitizePath` helper, ensure generated paths stay under `.worktrees`, and reject custom paths that resolve outside the repo root. [2][3]
- **Command injection** – Never build git command strings; always pass args arrays to `spawn`, and bubble stderr through `WorktreeErrors.gitOperationFailed` so operators see the failing command. [2][3]

## Merge & Removal Hazards

- **Uncommitted changes loss** – Removing or merging with dirty worktrees risks data loss. Run `getGitStatus` before destructive actions, block unless `force`/`allowUncommitted` explicitly set, and include file lists in the error message. [3][4]
- **Silent conflict overrides** – Skipping `checkMergeConflicts` can hide merge blockers. Use the dry-run merge tree helper first, keep worktree status `merging` until conflicts resolved, and propagate conflict file paths back to the CLI. [2][3][4]

## UX & Configuration

- **Mismatched defaults** – Spec sets max worktree size to 500 MB while the implementation guide constant still says 1000 MB. Align `DEFAULT_WORKTREE_CONFIG` with the spec to prevent surprise quota breaches. [3][4]
- **Poor descriptions & tracking** – Creating many unnamed worktrees complicates cleanup. Encourage `--description` in CLI (docs emphasize descriptive names) and show descriptions in `list` output to help users prune stale sessions. [4][6]

## Shared Git State

- **Hook side effects** – Worktrees reuse `.git/hooks`, so repository hooks will fire for agent commits. Document this behavior and provide overrides if agents need different hook behavior. [2][6]
- **Single-branch checkout rule** – Git forbids checking out the same branch in multiple worktrees; enforce unique branch names and surface actionable errors so users don’t see cryptic git failures. [3][6]

## Sources

1. `docs/rfcs/0001-worktree-management.md` (read 2025-11-17 10:19:58Z)
2. `openspec/changes/implement-worktree-management/design.md` (read 2025-11-17 10:19:58Z)
3. `docs/worktree-implementation-guide.md` (read 2025-11-17 10:19:58Z)
4. `openspec/changes/implement-worktree-management/specs/worktree-management/spec.md` (read 2025-11-17 10:19:58Z)
5. `core/worktree/types.ts` (read 2025-11-17 10:19:58Z)
6. `docs/worktree-workflows.md` (read 2025-11-17 10:19:58Z)
7. `work-tree-prd.md` (read 2025-11-17 10:19:58Z)
8. `openspec/changes/implement-worktree-management/proposal.md` (read 2025-11-17 10:19:58Z)
9. `core/worktree/api.ts` (read 2025-11-17 10:19:58Z)
10. `openspec/changes/implement-worktree-management/tasks.md` (read 2025-11-17 10:19:58Z)

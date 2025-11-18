# Implementation Research – Worktree Management

## Architecture & Responsibilities

- The RFC and design describe `WorktreeManagerSingleton` as the single orchestration point that routes CLI/GUI requests into git worktree commands, registry persistence, and optional ControlPlane + E2B hooks, so all lifecycle state stays centralized. [1][2][8]
- The system stack is `codemode worktree <cmd>` → WorktreeManager → adapters (`GitOperations`, `FilesystemOperations`, `WorktreeRegistry`) → git/FS/ControlPlane, which keeps git process handling, registry I/O, and policy enforcement testable in isolation. [2][4][8]
- Follow the staged implementation order (errors → constants → utils → git wrapper → filesystem ops → manager → CLI) to keep scope tight and unblock downstream files only when their contracts exist. [3][10]

## Lifecycle & Core Behaviors

- Creation must enforce concurrent count, disk quotas, and branch uniqueness before invoking `git worktree add`, then store sessions under `.worktrees/wt-<id>` and branch prefix `claude/` with registry + event updates. [3][4]
- Listing/filtering works off the in-memory `Map<string, WorktreeSession>` while metadata refresh recomputes commits ahead/behind, diff stats, disk usage, and git status so policies run on fresh data. [4][5]
- Merge flows follow the design’s data flow: reject uncommitted changes (unless `allowUncommitted`), run dry-run conflict detection, respect strategies (`squash`, `fast-forward`, standard), and optionally auto-remove merged worktrees when `cleanup.onMerge` is enabled. [2][4]
- Removal & cleanup require WorktreeError surfacing (UNCOMMITTED_CHANGES vs `force`), optional branch deletion, retention-based cleanup (`cleanup.retentionDays`), and an emergency `removeAllWorktrees` that clears registry + branches. [4][5]
- Validation (`validateWorktree`, `validateAllWorktrees`, `syncRegistry`) must run on initialization to repair orphaned entries, confirm directories/branches still exist, and log warnings before allowing new sessions. [4]

## Git & Filesystem Operations

- `GitOperations` should wrap `child_process.spawn("git", args, {cwd})`, capture stdout/stderr, and convert failures into `WorktreeErrors.gitOperationFailed` so CLI and UI get actionable diagnostics. [3]
- Core git helpers include `worktree add/remove/list --porcelain`, `status --porcelain=v2 --branch`, `diff` with stat/name filters, `merge` with strategy flags, `rev-list --left-right --count` for ahead/behind, `merge-tree` for conflict prediction, and branch existence/deletion helpers. [3]
- A separate `FilesystemOperations` module handles disk usage recursion, mkdirp/rmdir, copy, and readdir with consistent error handling—this keeps heavy FS work testable without invoking git. [10]
- Utilities must generate secure IDs/branch names and sanitize paths to prevent traversal; the guide recommends `randomBytes` + prefixing and stripping `..` + invalid characters before hitting the filesystem. [3]

## Registry & Persistence

- Registry lives at `.codemode/worktrees.json`, storing `WorktreeRegistryState` (version, sessions map, lastCleanup, config snapshot) and should be updated atomically via temp files + rename. [3][4]
- Initialization loads registry into a `Map`, repairs orphans, and spins up an hourly cleanup task (`CLEANUP_INTERVAL_MS = 1h`) that enforces retention and disk policies. [3][4]
- Corrupted registry files must be backed up (`.backup` suffix) and reinitialized to empty, while missing files should be created automatically so the manager bootstraps cleanly. [4]

## Configuration & Policies

- Default config per spec: `.worktrees` base dir, `claude/` branch prefix, `maxConcurrentWorktrees = 10`, retention = 7 days, `limits.maxWorktreeSizeMB = 500`, `limits.maxTotalSizeMB = 5000`, plus UI preferences (disk usage, confirmation prompts, default `squash` merge). [4]
- The implementation guide’s `DEFAULT_WORKTREE_CONFIG` currently shows `maxWorktreeSizeMB = 1000`, so reconcile that constant with the spec before shipping to avoid mismatched quotas. [3][4]
- Users configure overrides in `.codemode/config.yaml` (enablement, branch prefix, cleanup, limits, merge defaults); CLI docs provide production vs dev presets to mimic. [6]
- Proposal constraints require git ≥2.5 (worktree support) and bring no new npm dependencies, so version checks should fail fast during initialization. [8]

## Events, CLI & UX Integration

- Event types (`created`, `removed`, `merged`, `disk_warning`, `metadata_updated`, etc.) are defined in `core/worktree/types.ts` and emitted per spec whenever lifecycles change; listeners register via `manager.on/off` in the API. [4][5][9]
- Disk usage >90% should raise `WorktreeDiskWarningEvent` with the full `DiskUsageReport`, empowering CLI or UI to warn users before quotas trip. [4][5]
- CLI requirements cover `create`, `list`, `diff`, `merge`, `remove`, `cleanup`, plus workflows describing `info`, `switch`, `usage`, and `cleanup --dry-run` patterns; implement them in `extensions/cli/src/commands/worktree.ts` with consistent messaging. [4][6][8]
- CLI flows should prompt before destructive actions, format tables sorted by `createdAt`, and surface conflict/disk information pulled from refreshed metadata and events. [4][6]

## Testing, Monitoring & Rollout

- Unit coverage should target utils, git wrapper (mocked), registry, errors, and manager invariants (limit enforcement) while integration tests span create → diff → merge → cleanup workflows. [2][3]
- Manual testing must cover macOS/Linux/Windows, large repos (>1 GB), and older git versions (2.5, 2.10, 2.20) to ensure cross-platform git behavior. [2]
- Performance targets: creation <5 s, diff <2 s, cleanup of 50 worktrees <30 s; cache metadata for 30 s, debounce registry writes (≤1 per 5 s), and watch disk usage growth. [2]
- Monitor metrics such as creation/merge timing, disk consumption, and cleanup recency; alert if cleanup hasn’t run in 30 days or quotas exceed thresholds. [2]

## Security & Reliability Considerations

- Validate branch names (`^[a-zA-Z0-9/_-]+$`), sanitize paths, resolve symlinks, and always pass git args as arrays to avoid injection or traversal attacks. [2][3]
- Enforce disk quotas and concurrent limits to prevent denial-of-service; registry permissions should be 600, and `WorktreeDiskWarningEvent` should drive surfaced alerts. [2][4][5]
- Backup corrupted registries, ensure registry saves happen after every mutation, and keep `WorktreeError` serialization (`toJSON`) consistent for CLI logs and telemetry. [3][4][5]
- Document that git hooks are shared because worktrees reuse `.git/hooks`, and remind users that each branch can only be checked out in one worktree (per FAQs). [2][6]

## Example Snippets

```ts
export function generateSessionId(): string {
  const random = randomBytes(8).toString("hex");
  return `${SESSION_ID_PREFIX}${random}`;
}

export function sanitizePath(path: string): string {
  return path.replace(/\.\./g, "").replace(/[^a-zA-Z0-9\-_\/]/g, "");
}
```

```ts
async createWorktree(path: string, branch: string, base: string) {
  await this.exec(["worktree", "add", path, "-b", branch, base]);
}
```

Use the manager skeleton from the implementation guide (singleton `getInstance`, `initialize`, `createWorktree`, hourly cleanup) as the blueprint, and wire CLI commands through the typed API so events and registry updates always stay in sync. [3][9]

## User Value & Dependencies

- Product docs emphasize that isolated worktrees unlock parallel agents, fast comparisons, and safer experimentation while typical worktrees consume 10–50 MB thanks to shared `.git`. [7][8]
- ControlPlane session IDs plus optional E2B sandbox metadata belong in each `WorktreeSession`, ensuring cross-tool visibility without duplicating repo clones. [1][2][5][8]

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

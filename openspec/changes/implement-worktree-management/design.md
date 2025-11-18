# Design: Git Worktree Management for Agent Sessions

## Context

This design builds upon the detailed RFC already created in `docs/rfcs/0001-worktree-management.md`. The RFC provides comprehensive architectural decisions, data models, and user workflows.

**Key Stakeholders:**

- Code Mode users wanting to run parallel agent sessions
- Developers implementing worktree management
- Agent developers integrating with worktree system

**Background:**

- Git worktrees share the `.git` directory but have separate working trees
- Each worktree can have its own branch checked out
- Worktrees are lightweight (no .git directory duplication)
- Continue's agent sessions currently share a single workspace

**Constraints:**

- Must work with git ≥2.5 (worktree support introduced)
- Must persist across process restarts (requires registry)
- Must support Windows, macOS, and Linux
- Must not break existing single-workspace workflows

## Goals / Non-Goals

### Goals

1. Enable parallel agent sessions in isolated worktrees
2. Provide simple CLI interface for worktree management
3. Automatic cleanup of abandoned worktrees
4. Safe merge operations with conflict detection
5. Disk usage tracking and quota enforcement
6. Persist worktree state across restarts

### Non-Goals (Phase 1)

1. GUI integration (deferred to phase 2)
2. Agent-initiated worktree creation (user-triggered only for MVP)
3. Automatic conflict resolution
4. Remote worktree synchronization
5. Multi-repository worktree support
6. Worktree templates or presets

## Key Decisions

### Decision 1: Singleton Manager Pattern

**What:** Use singleton `WorktreeManagerSingleton` as central coordinator.

**Why:**

- Centralizes state management (prevents multiple registries)
- Simplifies dependency injection (one instance per process)
- Provides global access point for CLI and agent integrations

**Alternatives Considered:**

- **Service class instance** - Requires passing instance through call stack
- **Static utility functions** - Difficult to maintain state and events

### Decision 2: JSON File Registry

**What:** Persist worktree state to `.codemode/worktrees.json`.

**Why:**

- Human-readable and debuggable
- No external dependencies (no SQLite, no database)
- Easy to backup and restore
- Atomic writes with file locking

**Alternatives Considered:**

- **SQLite database** - Overkill for simple key-value storage
- **In-memory only** - Loses state on restart
- **Git notes** - Non-standard and hard to query

### Decision 3: Auto-Generated Branch Names

**What:** Generate branch names as `claude/wt-<shortid>` automatically.

**Why:**

- Prevents naming conflicts
- Clear namespace separation (`claude/` prefix)
- Consistent and predictable
- Users can provide custom names if needed

**Alternatives Considered:**

- **User-provided names** - Requires validation, prone to conflicts
- **Timestamp-based names** - Less readable and memorable

### Decision 4: Separate Git Operations Layer

**What:** Abstract all git commands in `GitOperations` class.

**Why:**

- Testable (mock git commands in tests)
- Consistent error handling
- Platform-specific git path handling
- Potential to swap implementations (libgit2 in future)

**Alternatives Considered:**

- **Direct git command calls** - Scattered logic, hard to test
- **Third-party git library** - Additional dependency, compatibility issues

### Decision 5: Event-Driven Lifecycle

**What:** Emit events for all worktree lifecycle operations.

**Why:**

- Enables UI integration without tight coupling
- Supports monitoring and logging
- Allows plugins to hook into lifecycle

**Alternatives Considered:**

- **Callbacks in options** - Less flexible, harder to manage multiple listeners
- **No events** - Difficult to integrate with UI

### Decision 6: Merge Strategy Choice

**What:** Support multiple merge strategies (squash, merge, rebase, fast-forward).

**Why:**

- Different workflows have different preferences
- Squash keeps clean history (recommended default)
- Fast-forward avoids merge commits when possible
- Rebase provides linear history

**Alternatives Considered:**

- **Squash-only** - Too restrictive for advanced users
- **Auto-detect strategy** - Confusing, not explicit

### Decision 7: User-Triggered Cleanup

**What:** Cleanup requires explicit user action (CLI command).

**Why:**

- Prevents unexpected data loss
- Users control when disk space is reclaimed
- Retention policy provides safety net (7 days default)

**Alternatives Considered:**

- **Automatic background cleanup** - Risk of removing active work
- **No cleanup** - Disk usage grows indefinitely

### Decision 8: Disk Quota Enforcement

**What:** Configurable limits for per-worktree and total disk usage.

**Why:**

- Prevents runaway disk usage
- Provides early warnings
- Encourages cleanup of old worktrees

**Alternatives Considered:**

- **No limits** - Risk of filling disk
- **Hard OS limits** - Not portable, hard to configure

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                   CLI Commands Layer                         │
│  codemode worktree {create|list|diff|merge|remove|cleanup}   │
└────────────────────┬─────────────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────────────┐
│           WorktreeManagerSingleton (Core)                     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  State: sessions Map<id, WorktreeSession>            │   │
│  │  Config: WorktreeConfig                              │   │
│  │  Events: EventEmitter pattern                        │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │ GitOperations   │  │ FilesystemOps   │  │  Registry   │ │
│  │ - createWorktree│  │ - getDiskUsage  │  │ - load()    │ │
│  │ - merge         │  │ - mkdirp        │  │ - save()    │ │
│  │ - diff          │  │ - rmdir         │  │ - upsert()  │ │
│  └─────────────────┘  └─────────────────┘  └─────────────┘ │
└────────────────────┬─────────────────────────────────────────┘
                     │
         ┌───────────┼───────────┬─────────────────┐
         │           │           │                 │
┌────────▼──────┐ ┌──▼──────┐ ┌─▼─────────┐ ┌─────▼──────────┐
│ Git CLI       │ │ Node.js │ │ JSON File │ │ Agent Sessions │
│ Worktrees     │ │ fs API  │ │ Registry  │ │ (ControlPlane) │
└───────────────┘ └─────────┘ └───────────┘ └────────────────┘
```

### Data Flow: Create Worktree

```
User runs CLI
     │
     ▼
[worktree create command]
     │
     ▼
WorktreeManager.createWorktree(agentId, options)
     │
     ├─> Check concurrent limit
     ├─> Check disk quota
     ├─> Generate unique ID
     ├─> Validate base branch
     │
     ▼
GitOperations.createWorktree(path, branch, base)
     │
     ▼
Execute: git worktree add <path> -b <branch> <base>
     │
     ▼
Create WorktreeSession object
     │
     ▼
Registry.upsert(session)
     │
     ├─> Write to .codemode/worktrees.json
     │
     ▼
Emit WorktreeCreatedEvent
     │
     ▼
Return session to CLI
     │
     ▼
Display success message
```

### Data Flow: Merge Worktree

```
User runs CLI
     │
     ▼
[worktree merge wt-123 --strategy=squash]
     │
     ▼
WorktreeManager.mergeWorktree(sessionId, options)
     │
     ├─> Get session
     ├─> Check uncommitted changes
     ├─> Run tests (if configured)
     │
     ▼
GitOperations.checkMergeConflicts(source, target)
     │
     ├─> If conflicts: return error
     │
     ▼
GitOperations.merge(branch, strategy, options)
     │
     ├─> Switch to target branch
     ├─> Execute: git merge --squash <branch>
     ├─> Create commit
     │
     ▼
Update session status to 'merged'
     │
     ▼
Registry.upsert(session)
     │
     ▼
Emit WorktreeMergedEvent
     │
     ▼
WorktreeManager.removeWorktree (if deleteAfterMerge)
     │
     ▼
Return MergeResult to CLI
     │
     ▼
Display merge success + commit hash
```

## Data Models

See `core/worktree/types.ts` for complete type definitions. Key models:

**WorktreeSession:**

- Primary entity representing one worktree instance
- Links to agent session ID
- Contains path, branch, status, metadata

**WorktreeMetadata:**

- Computed state (refreshed on-demand)
- Git stats: commits ahead/behind, uncommitted changes
- Filesystem stats: disk usage, file counts

**WorktreeConfig:**

- Runtime configuration with defaults
- Controls limits, cleanup policies, UI preferences

**WorktreeRegistryState:**

- Persistence format for `.codemode/worktrees.json`
- Schema version for migrations
- Snapshot of all active sessions

## Error Handling Strategy

### Error Hierarchy

```
Error (JavaScript base)
  ↓
WorktreeError (custom class)
  ↓
WorktreeErrorCode enum:
  - CREATION_FAILED
  - WORKTREE_NOT_FOUND
  - BRANCH_EXISTS
  - MERGE_CONFLICT
  - DISK_QUOTA_EXCEEDED
  - MAX_WORKTREES_REACHED
  - GIT_OPERATION_FAILED
  - UNCOMMITTED_CHANGES
  - VALIDATION_FAILED
  - PERMISSION_DENIED
```

### Error Recovery

| Error Code            | User Action                         | System Response                     |
| --------------------- | ----------------------------------- | ----------------------------------- |
| MAX_WORKTREES_REACHED | Run cleanup or remove old worktrees | List oldest worktrees for removal   |
| DISK_QUOTA_EXCEEDED   | Run cleanup or increase limit       | Show disk usage breakdown           |
| UNCOMMITTED_CHANGES   | Commit changes or use --force       | List uncommitted files              |
| MERGE_CONFLICT        | Resolve conflicts manually          | Show conflict file paths            |
| BRANCH_EXISTS         | Choose different branch name        | Suggest auto-generated alternatives |
| GIT_OPERATION_FAILED  | Check git version and repo state    | Include git error output            |

### Graceful Degradation

- If registry is corrupted, backup and reinitialize
- If worktree path is missing, remove from registry
- If git command times out, retry once before failing
- If disk usage calculation fails, estimate based on last known value

## Migration Plan

### Phase 1: MVP Implementation

1. Implement core manager and git operations
2. Add CLI commands
3. Deploy to beta users
4. Gather feedback on workflows

### Phase 2: GUI Integration

1. Add "Launch in Worktree" button to agent UI
2. Add worktree comparison view
3. Visual merge conflict resolution

### Phase 3: Advanced Features

1. Agent-initiated worktree creation
2. Worktree templates
3. Remote worktree sync
4. Multi-repository support

### Rollback Plan

- Feature flag in config: `experimental.worktrees.enabled`
- If disabled, CLI commands show "feature not enabled" message
- No breaking changes to existing workflows
- Registry file can be safely deleted without affecting main repo

## Performance Considerations

### Optimization Targets

- **Metadata refresh**: Cache git command results for 30 seconds
- **Disk usage**: Calculate incrementally, store baseline
- **Registry save**: Debounce writes (max 1 write per 5 seconds)
- **Git operations**: Use `--porcelain` for parseable output

### Scalability Limits

- **Max concurrent worktrees**: 10 (configurable to 50)
- **Max total disk usage**: 5GB (configurable to 20GB)
- **Registry file size**: <1MB for 100 worktrees (acceptable)

### Monitoring

- Track average worktree creation time (target: <5 seconds)
- Track merge operation time (target: <10 seconds)
- Monitor disk usage growth rate
- Alert if cleanup hasn't run in 30 days

## Security Considerations

### Attack Vectors

1. **Path traversal**: Malicious paths in worktree creation
2. **Command injection**: Unsanitized input to git commands
3. **Symlink attacks**: Worktree pointing outside repo
4. **Disk exhaustion**: Creating too many large worktrees

### Mitigations

1. Validate all paths are within repository
2. Use argument arrays (not shell strings) for git commands
3. Resolve symlinks and validate target paths
4. Enforce disk quotas and concurrent limits
5. Set restrictive permissions on registry file (600)
6. Validate branch names against regex (`^[a-zA-Z0-9/_-]+$`)

## Testing Strategy

### Unit Tests

- All utility functions (ID generation, path validation)
- Git operations with mocked git commands
- Registry operations with temp files
- Error creation and serialization

### Integration Tests

- Full lifecycle: create → diff → merge → remove
- Concurrent worktree operations
- Registry persistence across restarts
- Cleanup with retention policy
- Disk quota enforcement

### Manual Testing

- Test on macOS, Linux, Windows
- Test with large repositories (>1GB)
- Test with old git versions (2.5, 2.10, 2.20)
- Test merge conflicts and resolution

### Performance Testing

- Benchmark worktree creation (target: <5s)
- Benchmark diff operations (target: <2s)
- Benchmark cleanup of 50 worktrees (target: <30s)

## API Integration Patterns

- **Manager bootstrap:** CLI and ControlPlane integrations MUST obtain the singleton via `WorktreeManagerSingleton.getInstance(repoPath)` and call `initialize(overrides)` exactly once per process so registry state and cleanup tasks are not duplicated. Keep the instance alive for the lifetime of CLI sessions to avoid redundant registry reads (ref: `core/worktree/api.ts`).
- **Event subscriptions:** UI surfaces (CLI progress bars, VS Code panels) SHOULD subscribe to `created`, `merged`, `removed`, `disk_warning`, and `error` events immediately after initialization so lifecycle notifications appear without polling. Event payloads already include `WorktreeSession` snapshots for optimistic rendering (ref: `core/worktree/types.ts`).
- **Git wrapper usage:** All git calls flow through `GitOperations`, providing centralized logging, retries, and test-friendly seams. Downstream consumers must never shell out directly.
- **Code example (git 2.5+, recorded 2025-11):**

```ts
// Guaranteed git 2.5+ invocation path (docs/worktree-implementation-guide.md)
await this.exec([
  "worktree",
  "add",
  worktreePath,
  "-b",
  branchName,
  baseBranch,
]);
```

This wrapper pattern ensures every CLI command shares the same error handling and telemetry surface.

## Security Implementation

- **Version gate:** `initialize()` SHALL verify `git --version` ≥2.5 before enabling worktree commands, matching the RFC constraint and preventing undefined behavior on older installations.
- **Path & branch sanitization:** Always run user-provided paths through `sanitizePath()` and enforce the `^[a-zA-Z0-9/_-]+$` regex for branch names so worktrees remain under `.worktrees/` and do not collide with existing branches. Treat any rejection as `WorktreeErrorCode.VALIDATION_FAILED` and echo remediation guidance.
- **Command hardening:** Continue to use `child_process.spawn` with argument arrays (never interpolated shell strings) and wrap failures with `WorktreeErrors.gitOperationFailed` so logs capture the attempted verb without leaking shell metacharacters. Deprecated pattern: `exec("git ...")` with string concatenation—replace with the existing `exec(args: string[])` helper.
- **Registry protection:** Persist `.codemode/worktrees.json` with mode `0o600`, write via temp files + rename, and back up corrupted files to `.backup` before reinitializing to keep session history auditable.

## Configuration

- **YAML-driven defaults:** `.codemode/config.yaml` remains the primary override surface. Encourage teams to check the file into their repo with explicit values for `worktreeBaseDir`, `branchPrefix`, cleanup policies, and disk limits so every workstation inherits the same constraints.
- **Environment variable overrides:** Because `WorktreeManager.initialize` accepts a `Partial<WorktreeConfig>`, CLI launchers can pipe env vars into overrides before initialization:

```ts
const overrides: Partial<WorktreeConfig> = {
  worktreeBaseDir: process.env.WORKTREE_BASE_DIR ?? ".worktrees",
  limits: {
    maxWorktreeSizeMB: Number(process.env.WORKTREE_MAX_MB ?? "500"),
    maxTotalSizeMB: Number(process.env.WORKTREE_MAX_TOTAL_MB ?? "5000"),
  },
  cleanup: {
    ...DEFAULT_WORKTREE_CONFIG.cleanup,
    retentionDays: Number(process.env.WORKTREE_RETENTION_DAYS ?? "7"),
  },
};
await WorktreeManagerSingleton.getInstance(repoPath).initialize(overrides);
```

- **Sample YAML with env interpolation:**

```yaml
# .codemode/config.yaml (2025-11)
worktree:
  enabled: true
  worktreeBaseDir: ${WORKTREE_BASE_DIR:-.worktrees}
  limits:
    maxWorktreeSizeMB: ${WORKTREE_MAX_MB:-500}
    maxTotalSizeMB: ${WORKTREE_MAX_TOTAL_MB:-5000}
```

Documenting these patterns gives operators a concrete recipe for staging vs. production configs without editing source files.

## Open Questions

1. **Should worktrees support sparse checkouts?**

   - Pro: Reduces disk usage for large repos
   - Con: Adds complexity to initial implementation
   - **Decision:** Defer to Phase 2

2. **Should we support worktree-specific .env files?**

   - Pro: Enables parallel test runs with different configs
   - Con: Adds environment management complexity
   - **Decision:** Out of scope, users can manage manually

3. **How to handle git hooks in worktrees?**

   - Git hooks are shared via `.git/hooks/`
   - Worktrees inherit all hooks from main repo
   - **Decision:** Document this behavior, no special handling

4. **Should cleanup prompt for confirmation?**

   - Pro: Prevents accidental data loss
   - Con: Makes scripting harder
   - **Decision:** Prompt by default, add `--yes` flag to skip

5. **What happens if git worktree command is unavailable?**
   - Check git version on initialization
   - Throw clear error if git <2.5
   - **Decision:** Fail fast with actionable error message

## References

- **Detailed RFC:** `docs/rfcs/0001-worktree-management.md`
- **User Workflows:** `docs/worktree-workflows.md`
- **Implementation Guide:** `docs/worktree-implementation-guide.md`
- **Type Definitions:** `core/worktree/types.ts`
- **API Specification:** `core/worktree/api.ts`
- **Git Worktree Docs:** https://git-scm.com/docs/git-worktree

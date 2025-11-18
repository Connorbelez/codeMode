# Blast Radius – Worktree Management

## Affected Modules & Boundaries

- `core/worktree/WorktreeManagerSingleton.ts`, `git-operations.ts`, `filesystem-operations.ts`, `registry.ts`, `errors.ts`, `constants.ts`, and `utils.ts` form the new core; omissions or regressions in any of these will surface everywhere because the manager is the single entry point for lifecycle orchestration. [2][3][10]
- `core/worktree/types.ts` and `core/worktree/api.ts` already define the contracts (session state, configs, events, interfaces). Implementations must stay aligned or downstream consumers (CLI, ControlPlane) will break. [5][9]
- `extensions/cli/src/commands/worktree.ts` is the user-facing surface for `create/list/diff/merge/remove/cleanup`; every CLI change must call into the typed API so WorktreeManager remains the only place mutating state. [4][6][8]
- `.codemode/worktrees.json` and `.codemode/config.yaml` are persisted artifacts. Schema changes or incompatible defaults can corrupt user data, so registry writes must stay atomic and configurations need migration paths. [3][4][6]

## Integration Points & Contracts

- WorktreeManager exposes lifecycle (`createWorktree`, `mergeWorktree`, `removeWorktree`, `cleanupWorktrees`, etc.), metadata (`refreshWorktreeMetadata`, `getGitStatus`, `compareBranches`, `getDiskUsage`), validation (`validateWorktree`, `syncRegistry`), configuration, and event subscription APIs. CLI/GUI, ControlPlane, and telemetry must only use these surfaces. [4][5][9]
- Event contracts (`created`, `removed`, `merged`, `disk_warning`, `metadata_updated`, `status_changed`, `error`) power UI notifications and automation hooks; changes require synchronized updates across manager, CLI, and any listeners. [4][5]
- Optional ControlPlane + E2B integrations rely on `WorktreeSession.agentSessionId` and metadata fields, so WorktreeManager must keep those fields accurate for every create/remove/merge call. [1][2][5][8]

## Data Models & Persistence

- `WorktreeSession` tracks IDs, agent session IDs, filesystem paths, branch names, statuses, timestamps, sandbox IDs, and detailed metadata (commits ahead/behind, diff stats, disk usage, last tests). Any additions require registry schema updates and spec deltas. [4][5]
- Registry state stores a version string, `sessions` object, `lastCleanup`, and a config snapshot; migrations must preserve these keys and maintain atomic writes via temp files to avoid corruption. [3][4]
- Disk usage policies (`limits.maxWorktreeSizeMB`, `limits.maxTotalSizeMB`, warning threshold at 90%) and cleanup retention settings (default 7 days) are persisted both in config and per-session metadata, meaning config changes alter enforcement logic immediately. [4][6]

## External Dependencies & Tooling

- Git CLI ≥2.5 is required (worktree commands); initialization should fail fast if the binary is missing or too old, and commands must always use argument arrays to avoid injection. [3][8]
- Node’s `child_process.spawn` (git) and `fs/promises` (registry + disk usage) are the only runtime dependencies; reliability hinges on handling permission errors, long-running git commands, and potential disk exhaustion gracefully. [2][3]
- `.codemode/config.yaml` drives enablement and policy tuning (cleanup, limits, merge defaults). CLI should surface validation errors and maintain backward-compatible parsing. [4][6]

## Adjacent Systems & Risks

- ControlPlane agent tracking expects one worktree per agent session; if mapping breaks, agents may collide in the main repo again. [1][8]
- Existing specs/tasks already define other core directories; make sure new modules don’t conflict with current imports or bundler rules inside `core/` and `extensions/cli/`. [2][10]
- Worktree features share the `.git` directory and default branch prefix `claude/`; inadvertent branch deletions or naming collisions could impact existing developer workflows if validation is bypassed. [3][4]

## Testing & Observability Impact

- Unit/integration suites must now cover manager workflows, git wrapper behavior, registry persistence, disk quota enforcement, CLI command output, and multi-platform test matrices (macOS/Linux/Windows, git 2.5+). [2][3][4]
- Monitoring/alerts should track worktree creation/merge duration, disk usage growth, and cleanup recency with event-driven hooks (`WorktreeDiskWarningEvent`). Failures need to emit structured `WorktreeError` payloads for telemetry. [2][4][5]

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

# Change: Implement Git Worktree Management for Agent Sessions

## Why

Code Mode agents currently operate in a shared working directory, creating bottlenecks and risks:

- Only one agent can safely work at a time without conflicts
- Comparing different agent approaches requires manual branch switching
- Experimental agent changes can pollute the main workspace
- Users must review and test before launching another agent

Git worktrees provide isolated workspaces that share the same `.git` directory, enabling parallel agent execution and safe experimentation.

## What Changes

### Core Capabilities

- **Worktree lifecycle management** - Create, list, remove, and validate isolated worktrees
- **Git integration layer** - Wrapper for git worktree, branch, diff, and merge operations
- **Persistence registry** - Track active worktrees across sessions in `.codemode/worktrees.json`
- **CLI commands** - User-facing commands for worktree operations (`create`, `list`, `diff`, `merge`, `remove`)
- **Event system** - Lifecycle notifications for UI integration (created, merged, removed, error)
- **Resource management** - Disk usage tracking and auto-cleanup based on retention policies

### Components to Implement

1. **core/worktree/WorktreeManagerSingleton.ts** - Main manager singleton
2. **core/worktree/git-operations.ts** - Git CLI wrapper
3. **core/worktree/registry.ts** - JSON-based persistence
4. **core/worktree/errors.ts** - Error handling utilities
5. **core/worktree/constants.ts** - Default configuration values
6. **core/worktree/utils.ts** - Helper functions (ID generation, path validation)
7. **extensions/cli/src/commands/worktree.ts** - CLI command implementations

### Breaking Changes

None - this is a new additive feature with no impact on existing functionality.

## Impact

### Affected Specs

- **NEW**: `worktree-management` - Complete capability specification

### Affected Code

- **New files**: 7 implementation files in `core/worktree/` and `extensions/cli/`
- **No modifications** to existing systems - fully isolated feature
- **Optional integration** with agent sessions (can be adopted incrementally)

### User Experience

- Users gain ability to launch parallel agent sessions
- CLI commands follow existing pattern: `codemode worktree <command>`
- GUI integration deferred to post-MVP (button planned but not in scope)

### Performance

- Minimal overhead - worktrees share `.git` directory (no duplication)
- Disk usage: ~10-50MB per worktree depending on working tree file changes
- Registry operations are async JSON file I/O (negligible latency)

### Dependencies

- Requires git ≥2.5 (worktree support)
- No new NPM dependencies
- Integrates with existing `ControlPlane` agent session tracking (optional)

## Success Criteria

- [ ] Users can create isolated worktrees via CLI
- [ ] Multiple agents can work in parallel without conflicts
- [ ] Worktrees persist across process restarts (registry)
- [ ] Users can compare and diff between worktrees
- [ ] Users can merge worktree changes back to main branch
- [ ] Auto-cleanup removes abandoned worktrees after retention period
- [ ] Disk usage limits are enforced and reported
- [ ] All operations have comprehensive error handling
- [ ] Documentation covers all CLI commands and workflows

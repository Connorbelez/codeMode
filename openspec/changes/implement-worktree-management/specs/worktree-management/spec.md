# Worktree Management Specification

This specification defines the requirements for managed git worktrees in Code Mode, enabling isolated agent workspaces with safe parallel execution and selective merging.

## ADDED Requirements

### Requirement: Worktree Creation

The system SHALL create isolated git worktrees for agent sessions with automatic branch and directory management.

#### Scenario: Create worktree for agent session

- **GIVEN** a valid git repository with current branch `main`
- **WHEN** user creates worktree with `createWorktree('agent-123', { baseBranch: 'main', description: 'Add auth' })`
- **THEN** system creates new git worktree in `.worktrees/wt-<id>/`
- **AND** system creates new branch `claude/wt-<id>` from `main`
- **AND** system returns `WorktreeSession` with `id`, `worktreePath`, `branchName`, and `status: 'active'`
- **AND** worktree is registered in `.codemode/worktrees.json`

#### Scenario: Auto-generate unique branch names

- **GIVEN** existing worktree with branch `claude/wt-abc123`
- **WHEN** user creates another worktree
- **THEN** system generates unique ID ensuring no branch name collision
- **AND** system verifies branch doesn't exist before creating worktree

#### Scenario: Create worktree with custom branch name

- **GIVEN** user provides custom `branchName` in options
- **WHEN** worktree is created
- **THEN** system uses provided branch name prefixed with `claude/`
- **AND** system validates branch name doesn't already exist
- **AND** system throws `WorktreeError` with code `BRANCH_EXISTS` if branch exists

#### Scenario: Reject creation when max limit reached

- **GIVEN** 10 active worktrees (default `maxConcurrentWorktrees`)
- **WHEN** user attempts to create 11th worktree
- **THEN** system throws `WorktreeError` with code `MAX_WORKTREES_REACHED`
- **AND** error message suggests cleanup or config adjustment

#### Scenario: Reject creation when disk quota exceeded

- **GIVEN** current disk usage is 950MB and limit is 1000MB
- **WHEN** estimated new worktree size is 100MB
- **THEN** system throws `WorktreeError` with code `DISK_QUOTA_EXCEEDED`
- **AND** error message shows current usage and suggests cleanup

### Requirement: Worktree Listing and Retrieval

The system SHALL provide efficient querying of active worktrees with filtering capabilities.

#### Scenario: List all worktrees

- **WHEN** user calls `listWorktrees()` with no filter
- **THEN** system returns array of all `WorktreeSession` objects
- **AND** list is ordered by `createdAt` descending (newest first)

#### Scenario: Filter by status

- **GIVEN** 5 active and 3 idle worktrees
- **WHEN** user calls `listWorktrees({ status: 'active' })`
- **THEN** system returns only the 5 active worktrees

#### Scenario: Filter by multiple criteria

- **GIVEN** various worktrees with different states
- **WHEN** user calls `listWorktrees({ status: ['active', 'idle'], hasUncommittedChanges: true })`
- **THEN** system returns only active or idle worktrees that have uncommitted changes

#### Scenario: Get worktree by session ID

- **GIVEN** worktree with id `wt-abc123` exists
- **WHEN** user calls `getWorktree('wt-abc123')`
- **THEN** system returns matching `WorktreeSession`
- **AND** when ID doesn't exist, system returns `undefined`

#### Scenario: Get worktree by agent session ID

- **GIVEN** worktree associated with agent session `agent-456`
- **WHEN** user calls `getWorktreeByAgentSession('agent-456')`
- **THEN** system returns matching `WorktreeSession`

### Requirement: Worktree Metadata and Status Tracking

The system SHALL compute and refresh worktree metadata including git status, disk usage, and diff statistics.

#### Scenario: Refresh metadata on demand

- **GIVEN** worktree with outdated metadata (last refreshed 1 hour ago)
- **WHEN** user calls `refreshWorktreeMetadata('wt-123')`
- **THEN** system executes git commands to compute current state
- **AND** system updates `metadata.commitsAhead`, `metadata.commitsBehind`
- **AND** system updates `metadata.filesChanged`, `metadata.diffStats`
- **AND** system updates `metadata.hasUncommittedChanges`, `metadata.hasUnpushedCommits`
- **AND** system updates `metadata.diskUsageBytes`
- **AND** system sets `metadata.lastRefreshedAt` to current timestamp

#### Scenario: Get detailed git status

- **GIVEN** worktree with modified files and staged changes
- **WHEN** user calls `getGitStatus('wt-123')`
- **THEN** system returns `GitStatus` with arrays of `modified`, `untracked`, `staged`, `deleted` files
- **AND** status includes `ahead` and `behind` commit counts

#### Scenario: Compare branches for merge preview

- **GIVEN** worktree branch `claude/wt-123` and target branch `main`
- **WHEN** user calls `compareBranches('wt-123', 'main')`
- **THEN** system returns `BranchComparison` with `commitsAhead`, `commitsBehind`, `mergeBase`
- **AND** comparison indicates whether `canFastForward` merge is possible
- **AND** comparison lists `potentialConflicts` file paths

### Requirement: Diff and Comparison Operations

The system SHALL generate diffs between worktrees or branches with multiple output formats.

#### Scenario: Diff worktree against parent branch

- **GIVEN** worktree created from `main` with 3 files modified
- **WHEN** user calls `diffWorktrees('wt-123', 'main')`
- **THEN** system returns `DiffResult` with `filesChanged` array
- **AND** result includes `additions` and `deletions` line counts
- **AND** result includes `diff` string with unified diff format
- **AND** result includes human-readable `summary` (e.g., "3 files changed, +45 -12")

#### Scenario: Diff with stat-only format

- **WHEN** user calls `diffWorktrees('wt-123', 'main', { stat: true })`
- **THEN** system returns diff with statistics but no patch content
- **AND** `diff` string contains `--stat` format output

#### Scenario: Diff with path filter

- **WHEN** user calls `diffWorktrees('wt-123', 'main', { pathFilter: 'src/**/*.ts' })`
- **THEN** system returns diff including only TypeScript files in `src/` directory

#### Scenario: Compare multiple worktrees matrix

- **GIVEN** 3 worktrees: `wt-A`, `wt-B`, `wt-C`
- **WHEN** user calls `compareMultipleWorktrees(['wt-A', 'wt-B', 'wt-C'])`
- **THEN** system returns `Map<string, Map<string, DiffResult>>` with pairwise comparisons
- **AND** result includes A→B, A→C, B→A, B→C, C→A, C→B diffs

### Requirement: Merge Operations

The system SHALL merge worktree changes back to target branch with multiple strategies and conflict detection.

#### Scenario: Squash merge with auto-delete

- **GIVEN** worktree `wt-123` with 5 commits
- **WHEN** user calls `mergeWorktree('wt-123', { strategy: 'squash', deleteAfterMerge: true })`
- **THEN** system switches to parent branch (`main`)
- **AND** system executes `git merge --squash claude/wt-123`
- **AND** system creates single commit with auto-generated message
- **AND** system removes worktree and deletes branch
- **AND** system returns `MergeResult` with `success: true`, `commitHash`, and `message`

#### Scenario: Merge conflict detection

- **GIVEN** worktree with changes conflicting with target branch
- **WHEN** user calls `mergeWorktree('wt-123', { strategy: 'merge' })`
- **THEN** system detects conflicts during merge attempt
- **AND** system returns `MergeResult` with `success: false`
- **AND** result includes `conflicts` array listing conflicting file paths
- **AND** worktree remains in `merging` status for manual resolution

#### Scenario: Pre-merge conflict check

- **GIVEN** worktree that would have conflicts when merged
- **WHEN** user calls `canMergeCleanly('wt-123', 'main')`
- **THEN** system performs dry-run merge check
- **AND** system returns `{ canMerge: false, conflicts: ['file1.ts', 'file2.ts'], strategy: 'merge' }`
- **AND** system does NOT modify repository state

#### Scenario: Fast-forward merge when possible

- **GIVEN** worktree branch is directly ahead of target (no divergence)
- **WHEN** user calls `mergeWorktree('wt-123', { strategy: 'fast-forward' })`
- **THEN** system executes `git merge --ff-only`
- **AND** merge succeeds without merge commit

#### Scenario: Reject merge with uncommitted changes

- **GIVEN** worktree with uncommitted changes
- **WHEN** user calls `mergeWorktree('wt-123', { allowUncommitted: false })`
- **THEN** system throws `WorktreeError` with code `UNCOMMITTED_CHANGES`
- **AND** error message lists uncommitted files

### Requirement: Worktree Removal and Cleanup

The system SHALL remove worktrees safely with uncommitted change detection and optional branch deletion.

#### Scenario: Safe removal warns about uncommitted changes

- **GIVEN** worktree with uncommitted changes
- **WHEN** user calls `removeWorktree('wt-123', { force: false })`
- **THEN** system throws `WorktreeError` with code `UNCOMMITTED_CHANGES`
- **AND** error message lists uncommitted files and suggests `force: true`

#### Scenario: Force removal deletes worktree

- **GIVEN** worktree with uncommitted changes
- **WHEN** user calls `removeWorktree('wt-123', { force: true, deleteBranch: true })`
- **THEN** system removes git worktree via `git worktree remove --force`
- **AND** system deletes branch `claude/wt-123`
- **AND** system removes entry from registry
- **AND** system emits `WorktreeRemovedEvent`

#### Scenario: Auto-cleanup based on retention policy

- **GIVEN** config with `cleanup.retentionDays: 7`
- **AND** worktree in `abandoned` status created 10 days ago
- **WHEN** user calls `cleanupWorktrees()`
- **THEN** system removes abandoned worktree older than 7 days
- **AND** system returns `CleanupReport` with `removed` session IDs and `diskSpaceFreed`

#### Scenario: Cleanup after merge (configurable)

- **GIVEN** config with `cleanup.onMerge: true`
- **AND** worktree in `merged` status
- **WHEN** system completes merge operation
- **THEN** system automatically removes merged worktree
- **AND** system deletes associated branch

#### Scenario: Emergency cleanup all worktrees

- **WHEN** user calls `removeAllWorktrees(force: true)`
- **THEN** system removes ALL registered worktrees
- **AND** system deletes all `claude/*` branches
- **AND** system clears registry
- **AND** returns `CleanupReport` with counts and freed space

### Requirement: Disk Usage Management

The system SHALL track disk usage per worktree and enforce configurable limits.

#### Scenario: Get disk usage report

- **WHEN** user calls `getDiskUsage()`
- **THEN** system computes size of each worktree directory
- **AND** system returns `DiskUsageReport` with `totalBytes` and per-worktree breakdown
- **AND** report indicates whether `limitsExceeded` is true
- **AND** report includes `warnings` array if approaching limits (e.g., ">90% of quota")

#### Scenario: Enforce per-worktree size limit

- **GIVEN** config with `limits.maxWorktreeSizeMB: 500`
- **AND** worktree has grown to 520MB
- **WHEN** system refreshes metadata
- **THEN** system sets warning in worktree metadata
- **AND** system emits `WorktreeDiskWarningEvent`

#### Scenario: Estimate worktree size before creation

- **WHEN** user calls `estimateWorktreeSize()`
- **THEN** system estimates based on current working directory size
- **AND** system returns estimated bytes
- **AND** estimation used in quota check before worktree creation

### Requirement: Validation and Repair

The system SHALL validate worktree integrity and repair common issues automatically.

#### Scenario: Validate worktree state

- **GIVEN** worktree registered in `.codemode/worktrees.json`
- **WHEN** user calls `validateWorktree('wt-123')`
- **THEN** system checks directory exists at `worktreePath`
- **AND** system verifies git worktree is registered (`git worktree list`)
- **AND** system verifies branch exists
- **AND** system returns `ValidationResult` with `valid: true` if all checks pass

#### Scenario: Detect and repair orphaned registry entry

- **GIVEN** worktree in registry but directory deleted manually
- **WHEN** user calls `validateWorktree('wt-123')`
- **THEN** system detects missing directory
- **AND** system removes orphaned entry from registry
- **AND** returns `ValidationResult` with `valid: false`, `repaired: true`
- **AND** `repairDetails` explains "Removed orphaned registry entry"

#### Scenario: Validate all worktrees on startup

- **WHEN** `WorktreeManager.initialize()` is called
- **THEN** system calls `validateAllWorktrees()` automatically
- **AND** system removes invalid entries silently
- **AND** system logs warnings for any repaired entries

#### Scenario: Sync registry with git worktrees

- **GIVEN** git worktree exists but not in registry (created manually)
- **WHEN** user calls `syncRegistry()`
- **THEN** system lists all git worktrees via `git worktree list`
- **AND** system adds missing worktrees to registry with inferred metadata
- **AND** system removes registry entries for deleted worktrees

### Requirement: Event System

The system SHALL emit lifecycle events for UI integration and monitoring.

#### Scenario: Emit created event

- **WHEN** worktree creation completes successfully
- **THEN** system emits `WorktreeCreatedEvent` with `type: 'created'`, `session`, `timestamp`
- **AND** registered event handlers are invoked with event object

#### Scenario: Emit removed event

- **WHEN** worktree is removed
- **THEN** system emits `WorktreeRemovedEvent` with `sessionId` and `reason`
- **AND** reason is one of: `'user_requested'`, `'auto_cleanup'`, `'merged'`

#### Scenario: Emit merged event

- **WHEN** merge operation completes
- **THEN** system emits `WorktreeMergedEvent` with `sessionId` and `MergeResult`

#### Scenario: Emit error event

- **WHEN** any worktree operation fails with `WorktreeError`
- **THEN** system emits `WorktreeErrorEvent` with error details
- **AND** error event does NOT prevent error from being thrown

#### Scenario: Emit disk warning event

- **WHEN** disk usage exceeds 90% of total limit
- **THEN** system emits `WorktreeDiskWarningEvent` with `DiskUsageReport`

#### Scenario: Register and unregister event listeners

- **WHEN** user calls `manager.on('created', handler)`
- **THEN** system stores handler in event listeners map
- **AND** handler is invoked for all future `created` events
- **WHEN** user calls `manager.off('created', handler)`
- **THEN** system removes handler from listeners

### Requirement: Persistence and Registry

The system SHALL persist worktree state to JSON file for durability across restarts.

#### Scenario: Save registry after worktree creation

- **WHEN** worktree is created successfully
- **THEN** system writes updated registry to `.codemode/worktrees.json`
- **AND** JSON contains all session data including metadata snapshot

#### Scenario: Load registry on initialization

- **GIVEN** `.codemode/worktrees.json` exists with 3 worktree entries
- **WHEN** `manager.initialize()` is called
- **THEN** system loads JSON file into memory
- **AND** system populates `Map<string, WorktreeSession>` with loaded sessions
- **AND** system validates each loaded worktree exists

#### Scenario: Handle missing registry file

- **GIVEN** `.codemode/worktrees.json` does not exist
- **WHEN** `manager.initialize()` is called
- **THEN** system creates empty registry file with default structure
- **AND** initialization completes without error

#### Scenario: Handle corrupted registry file

- **GIVEN** `.codemode/worktrees.json` contains invalid JSON
- **WHEN** `manager.initialize()` is called
- **THEN** system logs error warning
- **AND** system backs up corrupted file to `.codemode/worktrees.json.backup`
- **AND** system initializes with empty registry

### Requirement: Configuration Management

The system SHALL support runtime configuration with sensible defaults.

#### Scenario: Initialize with default configuration

- **WHEN** `manager.initialize()` is called without config parameter
- **THEN** system uses default values:
  - `worktreeBaseDir: '.worktrees'`
  - `branchPrefix: 'claude/'`
  - `maxConcurrentWorktrees: 10`
  - `cleanup.retentionDays: 7`
  - `limits.maxWorktreeSizeMB: 500`
  - `limits.maxTotalSizeMB: 5000`

#### Scenario: Override configuration at initialization

- **WHEN** `manager.initialize({ maxConcurrentWorktrees: 20 })` is called
- **THEN** system merges provided config with defaults
- **AND** `maxConcurrentWorktrees` is set to 20
- **AND** all other values use defaults

#### Scenario: Update configuration at runtime

- **WHEN** user calls `manager.updateConfig({ cleanup: { retentionDays: 14 } })`
- **THEN** system updates in-memory configuration
- **AND** system saves updated config to registry
- **AND** new configuration applies to subsequent operations

#### Scenario: Get current configuration

- **WHEN** user calls `manager.getConfig()`
- **THEN** system returns current `WorktreeConfig` object
- **AND** config includes all fields with current values

### Requirement: Configuration Inputs

The system SHALL support configuration overrides from environment variables and YAML placeholders.

#### Scenario: Override config via environment variables

- **GIVEN** env vars `WORKTREE_MAX_MB=800` and `WORKTREE_MAX_TOTAL_MB=8192`
- **WHEN** CLI loads config and calls `manager.initialize({ limits: { maxWorktreeSizeMB: process.env.WORKTREE_MAX_MB } })`
- **THEN** system sets per-worktree limit to 800MB and total limit to 8192MB
- **AND** overrides persist in registry snapshot for observability

#### Scenario: Resolve YAML env placeholders

- **GIVEN** `.codemode/config.yaml` includes `maxTotalSizeMB: ${WORKTREE_MAX_TOTAL_MB:-5000}`
- **AND** env var `WORKTREE_MAX_TOTAL_MB=6000`
- **WHEN** CLI parses config before initialization
- **THEN** system substitutes 6000 for the placeholder
- **AND** `manager.getConfig()` reflects the resolved value

### Requirement: Security and Version Enforcement

The system SHALL enforce git version requirements, sanitize paths, and ensure safe command execution.

#### Scenario: Validate git version

- **GIVEN** repository is managed with git 2.3
- **WHEN** `manager.initialize()` runs
- **THEN** system checks `git --version`
- **AND** system throws `WorktreeError` with code `VALIDATION_FAILED` explaining git ≥2.5 is required

#### Scenario: Sanitize worktree paths

- **GIVEN** user attempts to create worktree at `../../etc/passwd`
- **WHEN** `createWorktree()` is called
- **THEN** system rejects the path after running `sanitizePath`
- **AND** error message explains that worktree paths must reside under `.worktrees/`

#### Scenario: Validate branch names

- **GIVEN** custom branch name `claude/wt-feature!`
- **WHEN** system formats branch name
- **THEN** branch name is validated against `^[a-zA-Z0-9/_-]+$`
- **AND** invalid characters cause `WorktreeError` with code `VALIDATION_FAILED`

#### Scenario: Parameterize git commands

- **GIVEN** user triggers `mergeWorktree()`
- **WHEN** GitOperations executes `git merge`
- **THEN** system invokes git via argument arrays (`spawn('git', args)`)
- **AND** command strings are never shell-interpolated, preventing injection attacks

### Requirement: Merge Testing Guardrail

The system SHALL optionally require automated tests to pass before merge.

#### Scenario: Require tests before merge when enabled

- **GIVEN** config with `requireTestsPassBeforeMerge: true`
- **AND** worktree `wt-123` has failing tests
- **WHEN** user calls `mergeWorktree('wt-123', { strategy: 'squash' })`
- **THEN** system runs configured test command for the worktree
- **AND** system throws `WorktreeError` with code `TESTS_FAILED` if tests fail, blocking merge

#### Scenario: Merge proceeds when tests disabled

- **GIVEN** config with `requireTestsPassBeforeMerge: false`
- **WHEN** user merges a worktree
- **THEN** system skips automated test execution
- **AND** merge continues based on git status checks alone

### Requirement: CLI Interface

The system SHALL provide intuitive CLI commands for all worktree operations.

#### Scenario: Create worktree via CLI

- **WHEN** user runs `codemode worktree create --description="Add auth"`
- **THEN** CLI calls `createWorktree()` with agent session from context
- **AND** CLI outputs: "Created: claude/wt-abc123 at .worktrees/wt-abc123"
- **AND** CLI returns exit code 0 on success

#### Scenario: List worktrees via CLI

- **WHEN** user runs `codemode worktree list`
- **THEN** CLI calls `listWorktrees()` and formats output as table
- **AND** table includes columns: ID, Branch, Status, Age, Files Changed
- **AND** table is sorted by creation date descending

#### Scenario: Diff worktrees via CLI

- **WHEN** user runs `codemode worktree diff wt-123 main --stat`
- **THEN** CLI calls `diffWorktrees('wt-123', 'main', { stat: true })`
- **AND** CLI outputs diff statistics in human-readable format

#### Scenario: Merge worktree via CLI

- **WHEN** user runs `codemode worktree merge wt-123 --strategy=squash`
- **THEN** CLI calls `mergeWorktree('wt-123', { strategy: 'squash' })`
- **AND** CLI prompts for confirmation before merge
- **AND** CLI outputs merge result with commit hash

#### Scenario: Remove worktree via CLI

- **WHEN** user runs `codemode worktree remove wt-123 --force --delete-branch`
- **THEN** CLI calls `removeWorktree('wt-123', { force: true, deleteBranch: true })`
- **AND** CLI outputs: "Removed worktree wt-123 and deleted branch claude/wt-123"

#### Scenario: Cleanup worktrees via CLI

- **WHEN** user runs `codemode worktree cleanup`
- **THEN** CLI calls `cleanupWorktrees()`
- **AND** CLI outputs cleanup report with removed count and freed space

### Requirement: Error Handling

The system SHALL provide detailed error messages with recovery suggestions.

#### Scenario: Throw error with appropriate code

- **WHEN** any operation fails
- **THEN** system throws `WorktreeError` with relevant `WorktreeErrorCode`
- **AND** error message is human-readable and actionable
- **AND** error includes `sessionId` if applicable
- **AND** error includes `cause` from underlying error if available

#### Scenario: Handle git command failures

- **GIVEN** git command fails with non-zero exit code
- **WHEN** operation attempts to execute git command
- **THEN** system throws `WorktreeError` with code `GIT_OPERATION_FAILED`
- **AND** error message includes git command output
- **AND** error suggests checking git version and repository state

#### Scenario: Handle permission errors

- **GIVEN** user lacks write permissions in worktree base directory
- **WHEN** system attempts to create worktree
- **THEN** system throws `WorktreeError` with code `PERMISSION_DENIED`
- **AND** error message includes path and suggests permission fix

#### Scenario: Serialize errors to JSON

- **WHEN** `WorktreeError` is converted to JSON via `toJSON()`
- **THEN** result includes `name`, `message`, `code`, `sessionId`, `stack`
- **AND** result is suitable for logging or API responses

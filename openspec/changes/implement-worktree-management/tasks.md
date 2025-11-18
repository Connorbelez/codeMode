# Implementation Tasks: Git Worktree Management

Implementation is divided into 5 phases for incremental delivery and testing.

## Phase 1: Foundation (Day 1-2, ~6-8 hours)

### 1.1 Infrastructure Files

- [x] Create `core/worktree/errors.ts`

  - [x] Implement `WorktreeError` class extending `Error`
  - [x] Define all `WorktreeErrorCode` enum values
  - [x] Add `toJSON()` serialization method
  - [x] Add factory functions for common errors

- [x] Create `core/worktree/constants.ts`

  - [x] Define `DEFAULT_WORKTREE_CONFIG` with all defaults
  - [x] Define `WORKTREE_BASE_DIR = '.worktrees'`
  - [x] Define `BRANCH_PREFIX = 'claude/'`
  - [x] Define `REGISTRY_PATH = '.codemode/worktrees.json'`
  - [x] Define `MAX_CONCURRENT_WORKTREES = 10`
  - [x] Define `RETENTION_DAYS = 7`
  - [x] Define `MAX_WORKTREE_SIZE_MB = 500`
  - [x] Define `MAX_TOTAL_SIZE_MB = 5000`

- [x] Create `core/worktree/utils.ts`
  - [x] Implement `generateWorktreeId()` - unique short ID generation
  - [x] Implement `validatePath(path: string)` - path safety checks
  - [x] Implement `formatBranchName(id: string)` - branch naming
  - [x] Implement `parseGitOutput(output: string)` - git command parsing
  - [x] Implement `formatDiskSize(bytes: number)` - human-readable sizes
  - [x] Add unit tests for all utilities

### 1.2 Git Operations Layer

- [x] Create `core/worktree/git-operations.ts`
  - [x] Implement `GitOperations` class implementing `IGitOperations`
  - [x] Add `constructor(repositoryPath: string)`
  - [x] Implement `createWorktree(path, branchName, baseBranch)` using `git worktree add`
  - [x] Implement `removeWorktree(path, force)` using `git worktree remove`
  - [x] Implement `listWorktrees()` using `git worktree list --porcelain`
  - [x] Implement `getStatus(worktreePath)` using `git status --porcelain`
  - [x] Implement `getDiff(ref1, ref2, options)` using `git diff`
  - [x] Implement `merge(branch, strategy, options)` with strategy handling
  - [x] Implement `getAheadBehind(branch1, branch2)` using `git rev-list`
  - [x] Implement `branchExists(branchName)` using `git branch --list`
  - [x] Implement `deleteBranch(branchName, force)` using `git branch -d/-D`
  - [x] Implement `getCurrentBranch(worktreePath)` using `git branch --show-current`
  - [x] Implement `getMergeBase(ref1, ref2)` using `git merge-base`
  - [x] Implement `checkMergeConflicts(source, target)` with dry-run merge
  - [x] Add error handling for all git command failures
  - [x] Add unit tests with mocked git commands

### 1.3 Filesystem Operations Layer

- [x] Create `core/worktree/filesystem-operations.ts`
  - [x] Implement `FilesystemOperations` class implementing `IFilesystemOperations`
  - [x] Implement `getDiskUsage(path)` using recursive directory size calculation
  - [x] Implement `exists(path)` using `fs.access`
  - [x] Implement `mkdirp(path)` using `fs.mkdir({ recursive: true })`
  - [x] Implement `rmdir(path, force)` using `fs.rm({ recursive: true, force })`
  - [x] Implement `copy(source, dest, filter)` with selective file copying
  - [x] Implement `readdir(path, recursive)` with optional recursion
  - [x] Add error handling for permission and I/O errors
  - [x] Add unit tests for all filesystem operations

### 1.4 Verify Foundation

- [x] Run all unit tests for errors, constants, utils, git-operations, filesystem-operations
- [x] Verify TypeScript compilation with no errors
- [x] Verify eslint passes on all new files

## Phase 2: Registry and Persistence (Day 2-3, ~4-5 hours)

### 2.1 Registry Implementation

- [x] Create `core/worktree/registry.ts`
  - [x] Implement `WorktreeRegistry` class implementing `IWorktreeRegistry`
  - [x] Add `constructor(registryPath: string)`
  - [x] Implement `load()` - read and parse JSON registry file
  - [x] Implement `save(sessions)` - write sessions to JSON atomically
  - [x] Implement `upsert(session)` - add or update single session
  - [x] Implement `remove(sessionId)` - delete session from registry
  - [x] Implement `clear()` - reset registry to empty state
  - [x] Implement `getRegistryPath()` - return registry file path
  - [x] Handle missing registry file (initialize empty)
  - [x] Handle corrupted JSON (backup and reinitialize)
  - [x] Add file locking for concurrent access safety
  - [x] Add unit tests with temp file fixtures

### 2.2 Registry Schema Versioning

- [x] Implement `WorktreeRegistryState` serialization
  - [x] Include `version` field for schema migrations
  - [x] Include `sessions` map serialized as object
  - [x] Include `lastCleanup` timestamp
  - [x] Include `config` snapshot
  - [x] Add schema validation on load
  - [x] Add migration path from v1 to v2 (future-proofing)

### 2.3 Registry Validation

- [x] Implement registry validation on load
  - [x] Verify each session's `worktreePath` exists
  - [x] Verify each session's `branchName` exists in git
  - [x] Remove orphaned entries automatically
  - [x] Log warnings for cleaned entries
  - [x] Add validation unit tests

## Phase 3: Core Manager (Day 3-5, ~8-10 hours)

### 3.1 Manager Singleton Structure

- [x] Create `core/worktree/WorktreeManagerSingleton.ts`
  - [x] Implement `WorktreeManagerSingleton` class implementing `IWorktreeManager`
  - [x] Add private static `instance` field
  - [x] Implement `static getInstance(repositoryPath)` singleton accessor
  - [x] Add private `sessions` Map<string, WorktreeSession>
  - [x] Add private `config` field
  - [x] Add private `gitOps`, `fsOps`, `registry` instances
  - [x] Add private `initialized` boolean flag
  - [x] Add private `eventListeners` Map for event system
  - [x] Add private `currentWorktree` string | undefined for context tracking

### 3.2 Lifecycle Methods

- [x] Implement `initialize(config?)`

  - [x] Load configuration with defaults
  - [x] Enforce git version >= 2.5 before enabling worktrees (fail fast with actionable error)
  - [x] Initialize `GitOperations`, `FilesystemOperations`, `WorktreeRegistry`
  - [x] Load registry from disk
  - [x] Validate all loaded worktrees
  - [x] Set `initialized = true`
  - [x] Add initialization tests

- [x] Implement `shutdown()`

  - [x] Save registry to disk
  - [x] Clear event listeners
  - [x] Reset `initialized` flag
  - [x] Add shutdown tests

- [x] Implement `isInitialized()`
  - [x] Return `initialized` boolean

### 3.3 Worktree Creation

- [x] Implement `createWorktree(agentSessionId, options)`
  - [x] Validate not exceeding `maxConcurrentWorktrees`
  - [x] Validate disk quota not exceeded
  - [x] Generate unique worktree ID
  - [x] Determine base branch (default to current)
  - [x] Generate branch name with prefix
  - [x] Validate branch name against `^[a-zA-Z0-9/_-]+$`
  - [x] Validate branch doesn't exist
  - [x] Create worktree directory path
  - [x] Sanitize worktree path to ensure it stays under `.worktrees/`
  - [x] Call `gitOps.createWorktree(path, branchName, baseBranch)`
  - [x] Create `WorktreeSession` object with metadata
  - [x] Save session to registry
  - [x] Emit `WorktreeCreatedEvent`
  - [x] Return created session
  - [x] Add comprehensive error handling
  - [x] Add integration tests

### 3.4 Worktree Retrieval

- [x] Implement `getWorktree(sessionId)`

  - [x] Return session from `sessions` Map or `undefined`

- [x] Implement `getWorktreeByAgentSession(agentSessionId)`

  - [x] Find session by `agentSessionId` field

- [x] Implement `listWorktrees(filter?)`
  - [x] Return all sessions if no filter
  - [x] Apply status filter if provided
  - [x] Apply date range filter if provided
  - [x] Apply uncommitted changes filter if provided
  - [x] Sort by `createdAt` descending
  - [x] Add filtering tests

### 3.5 Metadata and Status

- [x] Implement `refreshWorktreeMetadata(sessionId)`

  - [x] Get worktree session
  - [x] Call `gitOps.getStatus(worktreePath)`
  - [x] Call `gitOps.getAheadBehind(branchName, parentBranch)`
  - [x] Call `fsOps.getDiskUsage(worktreePath)`
  - [x] Compute `filesChanged` from git diff
  - [x] Update session metadata
  - [x] Update `lastRefreshedAt` timestamp
  - [x] Save to registry
  - [x] Emit `WorktreeMetadataUpdatedEvent`
  - [x] Return updated session
  - [x] Add tests

- [x] Implement `getGitStatus(sessionId)`

  - [x] Get worktree session
  - [x] Call `gitOps.getStatus(worktreePath)`
  - [x] Return formatted `GitStatus`

- [x] Implement `compareBranches(sessionId, targetBranch)`
  - [x] Get worktree session
  - [x] Call `gitOps.getAheadBehind(branchName, targetBranch)`
  - [x] Call `gitOps.getMergeBase(branchName, targetBranch)`
  - [x] Call `gitOps.checkMergeConflicts(branchName, targetBranch)`
  - [x] Determine if fast-forward is possible
  - [x] Return `BranchComparison`

### 3.6 Diff Operations

- [x] Implement `diffWorktrees(source, target, options?)`

  - [x] Resolve source and target to branch names
  - [x] Call `gitOps.getDiff(sourceBranch, targetBranch, options)`
  - [x] Return `DiffResult` with stats and content

- [x] Implement `compareMultipleWorktrees(sessionIds)`
  - [x] Validate all session IDs exist
  - [x] Generate pairwise combinations
  - [x] Call `diffWorktrees` for each pair
  - [x] Build result matrix Map
  - [x] Return comparison matrix

### 3.7 Merge Operations

- [x] Implement `mergeWorktree(sessionId, options?)`

  - [x] Get worktree session
  - [x] Determine target branch (default to parent)
  - [x] Check for uncommitted changes if `!allowUncommitted`
  - [x] Run tests if `runTests` is true or `config.requireTestsPassBeforeMerge` is enabled (throw `WorktreeError(TESTS_FAILED)` on failure)
  - [x] Switch to target branch
  - [x] Call `gitOps.merge(branchName, strategy, options)`
  - [x] Handle conflicts (return result with `success: false`)
  - [x] Update session status to `merged`
  - [x] Emit `WorktreeMergedEvent`
  - [x] Remove worktree if `deleteAfterMerge`
  - [x] Return `MergeResult`
  - [x] Add comprehensive merge tests

- [x] Implement `canMergeCleanly(sessionId, targetBranch?)`
  - [x] Call `gitOps.checkMergeConflicts(sourceBranch, targetBranch)`
  - [x] Return preview result with conflict list

### 3.8 Removal and Cleanup

- [x] Implement `removeWorktree(sessionId, options?)`

  - [x] Get worktree session
  - [x] Check for uncommitted changes if `!force`
  - [x] Call `gitOps.removeWorktree(path, force)`
  - [x] Delete branch if `deleteBranch`
  - [x] Remove from registry
  - [x] Emit `WorktreeRemovedEvent`
  - [x] Add tests

- [x] Implement `cleanupWorktrees()`

  - [x] Get all sessions
  - [x] Filter by retention policy
  - [x] Filter abandoned worktrees older than `retentionDays`
  - [x] Filter merged worktrees if `cleanup.onMerge`
  - [x] Remove each eligible worktree
  - [x] Track removed IDs and freed space
  - [x] Return `CleanupReport`
  - [x] Add cleanup tests

- [x] Implement `removeAllWorktrees(force?)`
  - [x] Iterate all sessions
  - [x] Call `removeWorktree` for each
  - [x] Return cleanup report

### 3.9 Resource Management

- [x] Implement `getDiskUsage()`

  - [x] Iterate all sessions
  - [x] Call `fsOps.getDiskUsage` for each worktree
  - [x] Compute total usage
  - [x] Check against limits
  - [x] Generate warnings if approaching limits
  - [x] Return `DiskUsageReport`

- [x] Implement `isDiskQuotaExceeded()`

  - [x] Call `getDiskUsage()`
  - [x] Return `true` if `limitsExceeded` is `true`

- [x] Implement `estimateWorktreeSize()`
  - [x] Get current working directory size as estimate
  - [x] Return estimated bytes

### 3.10 Validation

- [x] Implement `validateWorktree(sessionId)`

  - [x] Get worktree session
  - [x] Check directory exists
  - [x] Check git worktree is registered
  - [x] Check branch exists
  - [x] Attempt repair if issues found
  - [x] Return `ValidationResult`

- [x] Implement `validateAllWorktrees()`

  - [x] Iterate all sessions
  - [x] Call `validateWorktree` for each
  - [x] Return Map of results

- [x] Implement `syncRegistry()`
  - [x] Call `gitOps.listWorktrees()`
  - [x] Compare with registry
  - [x] Add missing entries
  - [x] Remove orphaned entries

### 3.11 Configuration

- [x] Implement `getConfig()`

  - [x] Return current config object

- [x] Implement `updateConfig(config)`

  - [x] Merge with existing config
  - [x] Save to registry
  - [x] Apply immediately

- [x] Support environment variable overrides and YAML placeholders
  - [x] Parse `.codemode/config.yaml` for `${VAR:-default}` patterns
  - [x] Allow CLI/env overrides to pass `Partial<WorktreeConfig>` into `initialize`
  - [x] Persist resolved values in registry snapshot for observability

### 3.12 Event System

- [x] Implement `on(event, handler)`

  - [x] Add handler to listeners map for event type

- [x] Implement `off(event, handler)`

  - [x] Remove handler from listeners map

- [x] Implement `emit(event)`
  - [x] Get handlers for event type
  - [x] Invoke each handler with event object
  - [x] Handle handler errors gracefully

### 3.13 Navigation (Optional - Future)

- [x] Implement `switchToWorktree(sessionId)` - updates process.cwd()
- [x] Implement `getCurrentWorktree()` - returns active worktree ID
- [x] Implement `switchToMainRepo()` - returns to main repository

## Phase 4: CLI Commands (Day 5-6, ~6-8 hours)

### 4.1 CLI Infrastructure

- [x] Create `extensions/cli/src/commands/worktree.ts`
  - [x] Import `WorktreeManagerSingleton`
  - [x] Create `worktree` command group
  - [x] Add `--help` documentation
  - [x] Add command aliases

### 4.2 Create Command

- [x] Implement `worktree create` command
  - [x] Parse `--base-branch`, `--description`, `--sandbox` flags
  - [x] Get repository path from context
  - [x] Initialize manager if needed
  - [x] Call `createWorktree` with options
  - [x] Display created worktree info (ID, path, branch)
  - [x] Handle errors with user-friendly messages

### 4.3 List Command

- [x] Implement `worktree list` command
  - [x] Parse `--status`, `--format` flags
  - [x] Call `listWorktrees` with filter
  - [x] Format as table with columns: ID, Branch, Status, Age, Files Changed, Disk Usage
  - [x] Support JSON output format
  - [x] Add color coding for status

### 4.4 Diff Command

- [x] Implement `worktree diff` command
  - [x] Parse `<source>`, `<target>`, `--stat`, `--name-only` arguments
  - [x] Call `diffWorktrees` with options
  - [x] Display diff output formatted
  - [x] Show statistics summary

### 4.5 Merge Command

- [x] Implement `worktree merge` command
  - [x] Parse `<session-id>`, `--strategy`, `--delete`, `--target`, `--message` flags
  - [x] Show pre-merge summary (commits, files changed)
  - [x] Prompt for confirmation
  - [x] Call `mergeWorktree` with options
  - [x] Display merge result (commit hash, conflicts)
  - [x] Handle conflicts with guidance

### 4.6 Remove Command

- [x] Implement `worktree remove` command
  - [x] Parse `<session-id>`, `--force`, `--delete-branch` flags
  - [x] Show uncommitted changes warning if applicable
  - [x] Prompt for confirmation
  - [x] Call `removeWorktree` with options
  - [x] Display removal confirmation

### 4.7 Cleanup Command

- [x] Implement `worktree cleanup` command
  - [x] Parse `--dry-run` flag
  - [x] Call `cleanupWorktrees()`
  - [x] Display cleanup report (removed count, freed space)
  - [x] Show which worktrees were removed and why

### 4.8 Status Command

- [x] Implement `worktree status` command
  - [x] Parse `<session-id>` argument
  - [x] Call `getWorktree` and `getGitStatus`
  - [x] Display detailed status (branch, commits ahead/behind, uncommitted files, disk usage)

### 4.9 Validate Command

- [x] Implement `worktree validate` command
  - [x] Parse `--all`, `--repair` flags
  - [x] Call `validateWorktree` or `validateAllWorktrees`
  - [x] Display validation results
  - [x] Show repair actions taken

## Phase 5: Testing, Documentation, and Polish (Day 6-7, ~6-8 hours)

### 5.1 Unit Tests

- [ ] Write unit tests for `errors.ts` - error creation and serialization
- [ ] Write unit tests for `constants.ts` - config defaults
- [ ] Write unit tests for `utils.ts` - ID generation, path validation, formatting
- [ ] Write unit tests for `git-operations.ts` - all git commands with mocks
- [ ] Write unit tests for `filesystem-operations.ts` - all fs operations with temp files
- [ ] Write unit tests for `registry.ts` - load, save, upsert, remove with temp files
- [ ] Write unit tests for `WorktreeManagerSingleton.ts` - all manager methods
- [ ] Ensure 80%+ code coverage

### 5.2 Integration Tests

- [ ] Create integration test suite in `core/worktree/__tests__/integration.test.ts`
  - [ ] Test full lifecycle: create → modify → diff → merge → remove
  - [ ] Test parallel worktree creation
  - [ ] Test cleanup with retention policy
  - [ ] Test registry persistence across restarts
  - [ ] Test validation and repair
  - [ ] Test disk quota enforcement
  - [ ] Test event emission

### 5.3 CLI Tests

- [ ] Create CLI test suite in `extensions/cli/src/commands/__tests__/worktree.test.ts`
  - [ ] Test each command with various flags
  - [ ] Test error handling and user prompts
  - [ ] Test output formatting

### 5.4 Documentation

- [ ] Update `docs/worktree-workflows.md` with CLI command examples
- [ ] Update `docs/worktree-implementation-guide.md` with actual implementation notes
- [ ] Add JSDoc comments to all public methods
- [ ] Add inline code comments for complex logic
- [ ] Create troubleshooting guide for common errors

### 5.5 Error Handling Audit

- [ ] Review all `try/catch` blocks for proper error handling
- [ ] Ensure all errors use `WorktreeError` with appropriate codes
- [ ] Ensure error messages are actionable and user-friendly
- [ ] Add error recovery suggestions in error messages

### 5.6 Performance Optimization

- [ ] Profile disk usage calculations (consider caching)
- [ ] Optimize git command calls (batch where possible)
- [ ] Add metadata refresh throttling (don't refresh too frequently)
- [ ] Consider lazy loading registry on first access

### 5.7 Security Audit

- [ ] Validate all user-provided paths for directory traversal
- [ ] Sanitize git command arguments to prevent injection
- [ ] Ensure registry file permissions are restrictive (600)
- [ ] Validate branch names against malicious patterns

### 5.8 Final Validation

- [ ] Run full test suite and ensure all tests pass
- [ ] Run `npm run tsc:check` and resolve all type errors
- [ ] Run `npm run lint` and resolve all linting issues
- [ ] Test on macOS, Linux, and Windows (if applicable)
- [ ] Verify git version compatibility (test with git 2.5+)
- [ ] Manual end-to-end testing of all workflows

### 5.9 Release Preparation

- [ ] Update CHANGELOG.md with new feature description
- [ ] Update README.md with worktree feature mention
- [ ] Tag relevant files for inclusion in release notes
- [ ] Prepare migration guide (if needed)

## Dependencies & Parallelization

**Phase Dependencies:**

- Phase 2 depends on Phase 1 (foundation must exist)
- Phase 3 depends on Phases 1 and 2 (manager needs git ops and registry)
- Phase 4 depends on Phase 3 (CLI needs manager)
- Phase 5 can begin after Phase 3 is substantially complete

**Parallelizable Work:**

- Phase 1.1 and 1.2 can be done in parallel (different developers)
- Phase 4.2-4.9 (CLI commands) can be implemented in parallel once infrastructure exists
- Phase 5.1-5.4 (tests and docs) can be done in parallel once code is complete

**External Dependencies:**

- Requires git ≥2.5 installed on system
- No new NPM packages required
- Optional integration with `ControlPlane` for agent session tracking

**Estimated Total Time:** 36-45 hours (approximately 5-6 working days for one developer)

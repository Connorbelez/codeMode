# RFC 0001: Managed Git Worktrees for Agent Sessions

**Status:** Draft
**Author:** Code Mode Team
**Created:** 2025-11-17
**Updated:** 2025-11-17

---

## Summary

This RFC proposes a managed git worktree system for Code Mode that enables users to launch agent sessions in isolated worktrees, compare results across multiple agents, and selectively merge changes back into the main workspace.

## Motivation

### Problem Statement

Currently, all agent sessions operate in the same working directory, which creates several challenges:

1. **Sequential Bottleneck:** Only one agent can safely modify files at a time without conflicts
2. **Difficult Comparison:** Testing multiple approaches requires manual branch switching and stashing
3. **Risk Management:** Experimental changes from agents can pollute the main workspace
4. **Review Overhead:** Users must review and test agent changes before they can launch another agent
5. **Context Loss:** Switching branches loses uncommitted work and requires mental context switching

### Goals

1. **Isolation:** Each agent session gets its own filesystem workspace via git worktrees
2. **Parallelization:** Multiple agents can work simultaneously without conflicts
3. **Easy Comparison:** Users can quickly switch between and compare agent outputs
4. **Safe Experimentation:** Agent changes remain isolated until explicitly merged
5. **Simple UX:** One-click worktree creation with automatic cleanup options

### Non-Goals (Phase 1)

1. Agent-initiated worktree creation (user-only for MVP)
2. Automatic conflict resolution for merges
3. Remote worktree collaboration
4. Multi-repository worktree support
5. Worktree templates or configuration presets

---

## Design Overview

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        User Interface                       │
│  CLI Commands + GUI Button ("Launch in Worktree")          │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│              WorktreeManagerSingleton                       │
│  - Lifecycle management (create, remove, cleanup)           │
│  - Session registry (Map<sessionId, WorktreeSession>)       │
│  - Git operations wrapper                                   │
└────────────────────┬────────────────────────────────────────┘
                     │
         ┌───────────┼───────────┐
         │           │           │
┌────────▼──────┐ ┌──▼──────┐ ┌─▼──────────────┐
│ Git Worktree  │ │ E2B     │ │ Agent Session  │
│ Operations    │ │ Sandbox │ │ Tracking       │
│               │ │         │ │                │
└───────────────┘ └─────────┘ └────────────────┘
```

### Key Components

1. **WorktreeManagerSingleton** - Central coordinator for all worktree operations
2. **WorktreeSession** - State container for each worktree instance
3. **WorktreeLifecycle** - Handles creation, validation, and cleanup
4. **WorktreeDiff** - Comparison engine for multiple worktrees
5. **WorktreeMerge** - Orchestrates safe merging back to main workspace

---

## Detailed Design

### 1. Data Model

#### WorktreeSession

Represents a single worktree instance tied to an agent session.

```typescript
interface WorktreeSession {
  /** Unique identifier for this worktree session */
  id: string;

  /** Associated agent session ID from ControlPlane */
  agentSessionId: string;

  /** Absolute filesystem path to the worktree directory */
  worktreePath: string;

  /** Git branch name for this worktree */
  branchName: string;

  /** Parent branch this worktree was created from */
  parentBranch: string;

  /** Current status of the worktree */
  status: WorktreeStatus;

  /** When this worktree was created */
  createdAt: Date;

  /** Last time this worktree was accessed */
  lastAccessedAt: Date;

  /** Optional user-provided description */
  description?: string;

  /** Associated E2B sandbox ID if any */
  sandboxId?: string;

  /** Metadata for tracking and display */
  metadata: WorktreeMetadata;
}

type WorktreeStatus =
  | 'creating'     // Worktree is being set up
  | 'active'       // Agent is actively working
  | 'idle'         // Agent completed, awaiting user review
  | 'merging'      // Merge in progress
  | 'merged'       // Successfully merged
  | 'abandoned'    // Marked for deletion
  | 'error';       // Creation or operation failed

interface WorktreeMetadata {
  /** Whether worktree has uncommitted changes */
  hasUncommittedChanges: boolean;

  /** Whether worktree has unpushed commits */
  hasUnpushedCommits: boolean;

  /** Number of commits ahead of parent branch */
  commitsAhead: number;

  /** Number of commits behind parent branch */
  commitsBehind: number;

  /** Files modified in this worktree vs parent */
  filesChanged: number;

  /** Lines added/removed vs parent */
  diffStats: {
    additions: number;
    deletions: number;
  };

  /** Last test run result if any */
  lastTestResult?: TestResult;

  /** Disk space used by this worktree */
  diskUsageBytes: number;
}

interface TestResult {
  passed: boolean;
  timestamp: Date;
  summary: string;
  details?: unknown;
}
```

#### Configuration

```typescript
interface WorktreeConfig {
  /** Base directory for all worktrees (default: .worktrees/) */
  worktreeBaseDir: string;

  /** Branch name prefix (default: claude/) */
  branchPrefix: string;

  /** Maximum number of concurrent worktrees (default: 10) */
  maxConcurrentWorktrees: number;

  /** Auto-cleanup settings */
  cleanup: {
    /** Remove worktree when agent session ends */
    onSessionEnd: boolean;

    /** Remove worktree after successful merge */
    onMerge: boolean;

    /** Keep abandoned worktrees for N days (default: 7) */
    retentionDays: number;
  };

  /** Whether to run tests before allowing merge */
  requireTestsPassBeforeMerge: boolean;

  /** Disk space limits */
  limits: {
    /** Max disk space per worktree in MB */
    maxWorktreeSizeMB: number;

    /** Max total disk space for all worktrees in MB */
    maxTotalSizeMB: number;
  };
}
```

---

### 2. Core API

#### WorktreeManagerSingleton

The central interface for all worktree operations.

```typescript
class WorktreeManagerSingleton {
  private static instance: WorktreeManagerSingleton;
  private worktrees: Map<string, WorktreeSession>;
  private config: WorktreeConfig;
  private baseRepoPath: string;

  /**
   * Get singleton instance
   */
  static getInstance(baseRepoPath?: string): WorktreeManagerSingleton;

  /**
   * Initialize worktree manager with configuration
   */
  async initialize(config?: Partial<WorktreeConfig>): Promise<void>;

  /**
   * Create a new worktree for an agent session
   *
   * @param agentSessionId - Agent session ID from control plane
   * @param options - Creation options
   * @returns Created worktree session
   * @throws {WorktreeError} If creation fails
   */
  async createWorktree(
    agentSessionId: string,
    options?: CreateWorktreeOptions
  ): Promise<WorktreeSession>;

  /**
   * Get worktree session by ID
   */
  getWorktree(sessionId: string): WorktreeSession | undefined;

  /**
   * Get worktree by agent session ID
   */
  getWorktreeByAgentSession(agentSessionId: string): WorktreeSession | undefined;

  /**
   * List all worktrees with optional filtering
   */
  listWorktrees(filter?: WorktreeFilter): WorktreeSession[];

  /**
   * Update worktree metadata (e.g., after git operations)
   */
  async refreshWorktreeMetadata(sessionId: string): Promise<WorktreeSession>;

  /**
   * Switch current working directory to a worktree
   * Note: This updates the process CWD and associated sandbox
   */
  async switchToWorktree(sessionId: string): Promise<void>;

  /**
   * Generate diff between two worktrees or worktree and branch
   */
  async diffWorktrees(
    source: string,
    target: string,
    options?: DiffOptions
  ): Promise<DiffResult>;

  /**
   * Merge worktree changes back to target branch
   */
  async mergeWorktree(
    sessionId: string,
    options?: MergeOptions
  ): Promise<MergeResult>;

  /**
   * Remove a worktree and optionally delete its branch
   */
  async removeWorktree(
    sessionId: string,
    options?: RemoveOptions
  ): Promise<void>;

  /**
   * Clean up abandoned or merged worktrees based on retention policy
   */
  async cleanupWorktrees(): Promise<CleanupReport>;

  /**
   * Get disk usage statistics for all worktrees
   */
  async getDiskUsage(): Promise<DiskUsageReport>;

  /**
   * Validate worktree state and repair if needed
   */
  async validateWorktree(sessionId: string): Promise<ValidationResult>;
}

interface CreateWorktreeOptions {
  /** Base branch to create from (default: current branch) */
  baseBranch?: string;

  /** Custom branch name (auto-generated if not provided) */
  branchName?: string;

  /** Optional description for this worktree */
  description?: string;

  /** Whether to create associated E2B sandbox */
  createSandbox?: boolean;

  /** Copy uncommitted changes from current workspace */
  copyUncommitted?: boolean;
}

interface WorktreeFilter {
  status?: WorktreeStatus | WorktreeStatus[];
  agentSessionId?: string;
  createdAfter?: Date;
  createdBefore?: Date;
  hasUncommittedChanges?: boolean;
}

interface DiffOptions {
  /** Include file names only (no content) */
  nameOnly?: boolean;

  /** Include diff statistics */
  stat?: boolean;

  /** Context lines for diff */
  context?: number;

  /** File path pattern to include */
  pathFilter?: string;
}

interface DiffResult {
  source: string;
  target: string;
  filesChanged: string[];
  additions: number;
  deletions: number;
  diff: string; // Raw diff output
  summary: string;
}

interface MergeOptions {
  /** Target branch to merge into (default: parent branch) */
  targetBranch?: string;

  /** Merge strategy */
  strategy: MergeStrategy;

  /** Commit message (auto-generated if not provided) */
  commitMessage?: string;

  /** Run tests before merging */
  runTests?: boolean;

  /** Delete worktree after successful merge */
  deleteAfterMerge?: boolean;
}

type MergeStrategy =
  | 'merge'        // Standard merge commit
  | 'squash'       // Squash all commits
  | 'rebase'       // Rebase onto target
  | 'fast-forward'; // Fast-forward only

interface MergeResult {
  success: boolean;
  targetBranch: string;
  commitHash?: string;
  conflicts?: string[];
  message: string;
}

interface RemoveOptions {
  /** Delete the git branch as well */
  deleteBranch?: boolean;

  /** Force removal even with uncommitted changes */
  force?: boolean;
}

interface CleanupReport {
  removed: string[]; // Session IDs
  retained: string[];
  errors: Array<{ sessionId: string; error: string }>;
  diskSpaceFreed: number;
}

interface DiskUsageReport {
  totalBytes: number;
  worktrees: Array<{
    sessionId: string;
    sizeBytes: number;
    path: string;
  }>;
}

interface ValidationResult {
  valid: boolean;
  issues: string[];
  repaired: boolean;
}
```

---

### 3. Error Handling

```typescript
class WorktreeError extends Error {
  constructor(
    message: string,
    public code: WorktreeErrorCode,
    public sessionId?: string,
    public cause?: Error
  ) {
    super(message);
    this.name = 'WorktreeError';
  }
}

enum WorktreeErrorCode {
  CREATION_FAILED = 'CREATION_FAILED',
  WORKTREE_NOT_FOUND = 'WORKTREE_NOT_FOUND',
  BRANCH_EXISTS = 'BRANCH_EXISTS',
  INVALID_STATE = 'INVALID_STATE',
  MERGE_CONFLICT = 'MERGE_CONFLICT',
  DISK_QUOTA_EXCEEDED = 'DISK_QUOTA_EXCEEDED',
  MAX_WORKTREES_REACHED = 'MAX_WORKTREES_REACHED',
  GIT_OPERATION_FAILED = 'GIT_OPERATION_FAILED',
  UNCOMMITTED_CHANGES = 'UNCOMMITTED_CHANGES',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
}
```

---

### 4. Events System

```typescript
interface WorktreeEventEmitter {
  on(event: 'created', handler: (session: WorktreeSession) => void): void;
  on(event: 'removed', handler: (sessionId: string) => void): void;
  on(event: 'merged', handler: (result: MergeResult) => void): void;
  on(event: 'switched', handler: (sessionId: string) => void): void;
  on(event: 'error', handler: (error: WorktreeError) => void): void;
  on(event: 'disk_warning', handler: (usage: DiskUsageReport) => void): void;
}

// Usage in UI:
worktreeManager.on('created', (session) => {
  console.log(`Worktree created: ${session.branchName}`);
  updateUIWorktreeList();
});
```

---

## User Experience

### CLI Commands

```bash
# Create worktree for new agent session
codemode worktree create [--base=main] [--description="Feature X"]

# List all worktrees
codemode worktree list [--status=active,idle]

# Show detailed info about a worktree
codemode worktree info <session-id>

# Switch to a worktree (changes CWD)
codemode worktree switch <session-id>

# Diff between worktrees
codemode worktree diff <session-id-1> <session-id-2>
codemode worktree diff <session-id> main  # Compare to branch

# Merge worktree back to main
codemode worktree merge <session-id> [--strategy=squash] [--delete]

# Remove worktree
codemode worktree remove <session-id> [--force] [--delete-branch]

# Cleanup old worktrees
codemode worktree cleanup [--dry-run]

# Show disk usage
codemode worktree usage
```

### GUI Integration

#### Button: "Launch Agent in Worktree"

When user clicks this button:

1. **Pre-creation Dialog** (optional):
   - Base branch selector (default: current branch)
   - Description field
   - "Copy uncommitted changes" checkbox

2. **Creation Flow**:
   ```
   [Creating worktree...]
   ✓ Created branch: claude/agent-abc123-1731891234
   ✓ Worktree path: .worktrees/session-abc123
   ✓ Associated with agent session: abc123

   [Launching agent...]
   ```

3. **Status Display**:
   ```
   ┌─ Active Worktrees ──────────────────────────────┐
   │ ● agent-abc123  claude/agent-abc123-1731891234  │
   │   Status: Active | 5 files changed | +45 -12    │
   │   [Switch] [Diff] [Merge] [Remove]              │
   └──────────────────────────────────────────────────┘
   ```

#### Worktree Manager Panel

Dedicated panel showing:
- List of all worktrees with status indicators
- Quick actions (switch, diff, merge, remove)
- Disk usage visualization
- Filter/sort options

---

## Implementation Plan

### Phase 1: Core Infrastructure (Week 1-2)

**Tasks:**
1. Create type definitions (`core/worktree/types.ts`)
2. Implement `WorktreeManagerSingleton` basic lifecycle
3. Git worktree wrapper functions
4. Error handling and validation
5. Unit tests for core functionality

**Deliverables:**
- Functional worktree create/remove
- Session registry
- Basic metadata tracking

### Phase 2: CLI Integration (Week 2-3)

**Tasks:**
1. Add CLI commands (`extensions/cli/src/commands/worktree.ts`)
2. Command output formatting
3. Interactive prompts for confirmations
4. Integration with existing agent commands

**Deliverables:**
- Full CLI command suite
- Help documentation
- Integration tests

### Phase 3: Diff & Merge (Week 3-4)

**Tasks:**
1. Implement `WorktreeDiff` engine
2. Implement `WorktreeMerge` orchestrator
3. Conflict detection (no auto-resolution yet)
4. Merge strategy implementations

**Deliverables:**
- Working diff comparison
- Safe merge with rollback
- Conflict reporting

### Phase 4: GUI Integration (Week 4-5)

**Tasks:**
1. Add "Launch in Worktree" button
2. Worktree manager panel/view
3. Status indicators and notifications
4. Diff visualization (basic)

**Deliverables:**
- Functional GUI controls
- Visual worktree management
- User documentation

### Phase 5: Polish & Documentation (Week 5-6)

**Tasks:**
1. Auto-cleanup background task
2. Disk usage monitoring
3. Performance optimization
4. Comprehensive documentation
5. Example workflows

**Deliverables:**
- Production-ready feature
- User guide
- Developer documentation

---

## Testing Strategy

### Unit Tests

- WorktreeManagerSingleton methods
- Git operation wrappers
- Metadata calculation
- Error handling paths

### Integration Tests

- End-to-end worktree creation → agent work → merge
- Multiple concurrent worktrees
- Cleanup and retention policies
- Disk quota enforcement

### Manual Testing

- User workflows (parallel experiments, review, merge)
- Edge cases (network failures, interrupted operations)
- Performance with many worktrees
- UI responsiveness

---

## Security Considerations

1. **Path Traversal:** Validate worktree paths stay within allowed directories
2. **Branch Permissions:** Respect git permissions for branch creation/deletion
3. **Disk Exhaustion:** Enforce quota limits to prevent DoS
4. **Cleanup Validation:** Ensure removed worktrees don't contain sensitive data
5. **Concurrent Access:** Handle race conditions with file locks

---

## Performance Considerations

1. **Git Operations:** Worktree operations are fast (symlinks + new index)
2. **Disk Space:** Each worktree is ~same size as repo (shared .git)
3. **Metadata Refresh:** Cache metadata, refresh on-demand or periodically
4. **Cleanup Schedule:** Run cleanup in background, not blocking UI
5. **Max Worktrees:** Limit to 10 concurrent to avoid resource exhaustion

---

## Alternatives Considered

### 1. Branch-based Approach (No Worktrees)

**Pros:** Simpler, no git worktree complexity
**Cons:** Can't work in parallel, must switch branches, loses context

**Decision:** Rejected - core goal is parallelization

### 2. Separate Repository Clones

**Pros:** Complete isolation, familiar model
**Cons:** Huge disk usage, slow, complicated sync

**Decision:** Rejected - git worktrees provide same isolation with less overhead

### 3. In-memory Virtual Filesystems

**Pros:** No disk usage, ultra-fast
**Cons:** Complex implementation, doesn't integrate with git, limited tooling support

**Decision:** Rejected - not compatible with existing tools and workflows

---

## Open Questions

1. **Should worktrees persist across Code Mode restarts?**
   - **Proposal:** Yes, store registry in `.codemode/worktrees.json`

2. **How to handle upstream changes during long-running agents?**
   - **Proposal:** Phase 2 feature - auto-rebase on parent branch updates

3. **Should we support nested worktrees (worktree of worktree)?**
   - **Proposal:** No, single-level only for MVP

4. **Integration with existing agent session lifecycle?**
   - **Proposal:** Extend `AgentSessionView` with optional `worktreeSessionId`

5. **What happens if user manually deletes worktree directory?**
   - **Proposal:** Validation check detects and marks as error, cleanup removes registry entry

---

## Success Metrics

1. **Adoption:** % of agent sessions launched in worktrees (target: >30% after 1 month)
2. **Parallel Usage:** Average concurrent worktrees per user (target: 2-3)
3. **Merge Success Rate:** % of worktrees successfully merged (target: >80%)
4. **Time to Review:** Time between agent completion and merge (baseline to measure)
5. **User Satisfaction:** Survey feedback on worktree workflow (target: >4/5)

---

## Future Enhancements (Post-MVP)

1. **AI-Assisted Merge Conflicts:** Let agent resolve its own conflicts
2. **Worktree Templates:** Pre-configured setups for common tasks
3. **Multi-Repository Support:** Worktrees spanning multiple repos
4. **Remote Worktrees:** Collaborate on worktrees across machines
5. **Checkpoint System:** Save/restore worktree state
6. **Auto-Testing:** Run tests automatically on creation/before merge
7. **Smart Cleanup:** AI suggests which worktrees to merge/abandon
8. **Diff Visualization:** Rich visual diff with syntax highlighting
9. **Cherry-Pick UI:** Drag-drop files to selectively merge
10. **Worktree Sharing:** Share worktree links with team members

---

## References

- [Git Worktree Documentation](https://git-scm.com/docs/git-worktree)
- [E2B Sandbox Documentation](https://e2b.dev/docs)
- Code Mode Architecture (`/home/user/codeMode/README.md`)
- Existing Agent Session Management (`core/control-plane/client.ts`)

---

## Appendix A: Example Workflows

### Workflow 1: Compare Three Approaches

```bash
# User launches 3 agents in parallel worktrees
$ codemode worktree create --description="Approach 1: REST API"
Created: session-001 (branch: claude/agent-001-1731891234)

$ codemode worktree create --description="Approach 2: GraphQL"
Created: session-002 (branch: claude/agent-002-1731891235)

$ codemode worktree create --description="Approach 3: gRPC"
Created: session-003 (branch: claude/agent-003-1731891236)

# Review each approach
$ codemode worktree switch session-001
$ npm test  # Test approach 1

$ codemode worktree switch session-002
$ npm test  # Test approach 2

$ codemode worktree switch session-003
$ npm test  # Test approach 3

# Compare side-by-side
$ codemode worktree diff session-001 session-002 --stat
5 files changed, 120 insertions(+), 45 deletions(-)

# Merge winner
$ codemode worktree merge session-002 --strategy=squash --delete
✓ Merged claude/agent-002-1731891235 into main
✓ Removed worktree session-002

# Cleanup losers
$ codemode worktree remove session-001 --delete-branch
$ codemode worktree remove session-003 --delete-branch
```

### Workflow 2: Iterative Development

```bash
# Create worktree
$ codemode worktree create --description="Feature: User Authentication"
Created: session-auth-1 (branch: claude/agent-auth-1-1731891234)

# Agent does initial work...
# User reviews
$ codemode worktree switch session-auth-1
$ npm test
# Tests fail, needs more work

# Resume agent in same worktree (reuses existing)
$ codemode agent resume session-auth-1 --feedback="Fix failing tests"

# Agent completes fixes
$ npm test
# All tests pass!

# Merge
$ codemode worktree merge session-auth-1 --strategy=squash
✓ Merged successfully
```

---

## Appendix B: Configuration Example

```yaml
# .codemode/config.yaml
worktree:
  enabled: true

  # Directory for all worktrees
  baseDir: .worktrees

  # Branch naming
  branchPrefix: claude/

  # Limits
  maxConcurrentWorktrees: 10
  maxWorktreeSizeMB: 1000
  maxTotalSizeMB: 5000

  # Cleanup policy
  cleanup:
    onSessionEnd: false        # Keep for review
    onMerge: true              # Auto-remove after merge
    retentionDays: 7           # Keep abandoned for 7 days

  # Safety features
  requireTestsPassBeforeMerge: false  # Don't block MVP

  # UI preferences
  ui:
    showDiskUsage: true
    confirmBeforeRemove: true
    defaultMergeStrategy: squash
```

---

## Changelog

**2025-11-17:**
- Initial RFC draft
- Core API design
- Implementation plan

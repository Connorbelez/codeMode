# Worktree Management - User Workflows

This document provides practical examples and workflows for using the git worktree management feature in Code Mode.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Basic Workflows](#basic-workflows)
3. [Advanced Workflows](#advanced-workflows)
4. [CLI Reference](#cli-reference)
5. [GUI Usage](#gui-usage)
6. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Launch Agent in Worktree (GUI)

1. Open Code Mode
2. Click **"Launch Agent in Worktree"** button
3. (Optional) Configure:
   - Base branch (default: current branch)
   - Description
4. Agent launches in isolated workspace
5. Review changes when complete
6. Merge or discard

### Launch Agent in Worktree (CLI)

```bash
# Create worktree and launch agent
codemode worktree create --description="Implement feature X"

# Agent works in isolation...

# Review and merge when ready
codemode worktree merge <session-id> --strategy=squash
```

---

## Basic Workflows

### Workflow 1: Single Feature Development

**Scenario:** You want an agent to implement a feature in isolation so you can review before merging.

```bash
# 1. Create worktree for agent
$ codemode worktree create --base=main --description="Add user authentication"

✓ Created worktree session: wt-abc123
  Branch: claude/agent-abc123-1731891234
  Path: .worktrees/wt-abc123

[Agent session starts automatically in worktree context]

# Agent works on implementation...
# (User sees progress updates)

# 2. Review the changes
$ codemode worktree info wt-abc123

Worktree: wt-abc123
Status: idle
Branch: claude/agent-abc123-1731891234
Files changed: 8
+145 -23 lines

Files:
  src/auth/login.ts (modified)
  src/auth/register.ts (new)
  src/middleware/auth.ts (new)
  tests/auth.test.ts (new)
  ...

# 3. Switch to worktree to test
$ codemode worktree switch wt-abc123
$ npm test
All tests passed ✓

# 4. Review diff
$ codemode worktree diff wt-abc123 main --stat

src/auth/login.ts        | 45 +++++++++++++++++++++
src/auth/register.ts     | 67 +++++++++++++++++++++++++++++++
src/middleware/auth.ts   | 23 +++++++++++
tests/auth.test.ts       | 38 +++++++++++++++++
8 files changed, 145 insertions(+), 23 deletions(-)

# 5. Merge changes back to main
$ codemode worktree merge wt-abc123 \
  --strategy=squash \
  --commit-message="feat: Add user authentication system" \
  --delete

✓ Merged successfully into main
✓ Commit: a1b2c3d
✓ Worktree removed
```

---

### Workflow 2: Try Multiple Approaches

**Scenario:** You want to try 3 different approaches and pick the best one.

```bash
# Launch 3 agents in parallel worktrees
$ codemode worktree create --description="Approach 1: REST API"
Created: wt-001 (claude/agent-001-1731891234)

$ codemode worktree create --description="Approach 2: GraphQL"
Created: wt-002 (claude/agent-002-1731891235)

$ codemode worktree create --description="Approach 3: gRPC"
Created: wt-003 (claude/agent-003-1731891236)

# Check status of all worktrees
$ codemode worktree list

┌──────────┬──────────────┬────────────────┬──────────┐
│ ID       │ Status       │ Description    │ Changes  │
├──────────┼──────────────┼────────────────┼──────────┤
│ wt-001   │ active       │ Approach 1...  │ 12 files │
│ wt-002   │ active       │ Approach 2...  │ 15 files │
│ wt-003   │ idle         │ Approach 3...  │ 9 files  │
└──────────┴──────────────┴────────────────┴──────────┘

# Test each approach
$ codemode worktree switch wt-001
$ npm test
$ npm run benchmark
Performance: 245 req/s

$ codemode worktree switch wt-002
$ npm test
$ npm run benchmark
Performance: 312 req/s ✓ (best)

$ codemode worktree switch wt-003
$ npm test
$ npm run benchmark
Performance: 198 req/s

# Compare implementations
$ codemode worktree diff wt-001 wt-002 --stat
25 files changed, 267 insertions(+), 145 deletions(-)

# Merge winner (GraphQL approach)
$ codemode worktree merge wt-002 --strategy=squash --delete
✓ Merged wt-002

# Clean up losers
$ codemode worktree remove wt-001 --delete-branch
$ codemode worktree remove wt-003 --delete-branch
✓ Removed 2 worktrees

# Return to main
$ codemode worktree switch --main
```

---

### Workflow 3: Iterative Refinement

**Scenario:** Agent completes work, but you need refinements before merging.

```bash
# Create worktree
$ codemode worktree create --description="Feature: Email notifications"
Created: wt-email (claude/agent-email-1731891234)

# Agent does initial implementation...

# Review
$ codemode worktree switch wt-email
$ npm test

Tests:
  ✓ Send welcome email
  ✗ Handle email delivery failure
  ✗ Rate limiting

# Not ready yet - provide feedback to agent
$ codemode agent resume wt-email --feedback="
Please add:
1. Error handling for email delivery failures
2. Rate limiting (max 100 emails/hour)
3. Tests for both scenarios
"

# Agent continues work in same worktree...
# (Reuses existing worktree, builds on previous work)

# Review again
$ codemode worktree switch wt-email
$ npm test

All tests passed ✓

# Check changes
$ codemode worktree diff wt-email main

# Looks good - merge
$ codemode worktree merge wt-email --strategy=squash
✓ Merged successfully
```

---

### Workflow 4: Safe Experimentation

**Scenario:** You want agent to try a risky refactor without touching main code.

```bash
# Create worktree for risky work
$ codemode worktree create --description="Experiment: Migrate to TypeScript 5.5"
Created: wt-ts55 (claude/agent-ts55-1731891234)

# Agent does migration in isolation...

# Test thoroughly
$ codemode worktree switch wt-ts55
$ npm install
$ npm test
$ npm run type-check
$ npm run build

# Issues found - not ready
$ npm test
45 tests failed

# Decision: Abandon for now
$ codemode worktree remove wt-ts55 --delete-branch --force
✓ Removed worktree (experimental work discarded)

# Main codebase untouched - no harm done ✓
```

---

## Advanced Workflows

### Workflow 5: Cherry-Pick Specific Changes

**Scenario:** Agent made good changes to auth, but broke unrelated config.

```bash
# Agent worked in worktree
$ codemode worktree info wt-123

Files changed:
  src/auth/login.ts ✓ (want)
  src/auth/register.ts ✓ (want)
  src/config/database.ts ✗ (broken)
  src/config/redis.ts ✗ (broken)

# Strategy: Manually cherry-pick good files
$ codemode worktree switch wt-123

# Copy only auth files to main
$ git checkout main
$ git checkout wt-123 -- src/auth/login.ts src/auth/register.ts
$ git add src/auth/
$ git commit -m "feat: Update auth implementation"

# Remove worktree (config changes discarded)
$ codemode worktree remove wt-123 --delete-branch
```

**Future:** This will be automated with a `cherry-pick` command:

```bash
# Future API (not yet implemented)
$ codemode worktree cherry-pick wt-123 \
  --include="src/auth/**" \
  --exclude="src/config/**" \
  --target=main
```

---

### Workflow 6: Long-Running Development

**Scenario:** Agent works on large feature over multiple sessions.

```bash
# Day 1: Start feature
$ codemode worktree create --description="Large Feature: Analytics Dashboard"
Created: wt-analytics (claude/agent-analytics-1731891234)

# Agent works...
# User reviews, provides feedback
$ codemode agent resume wt-analytics --feedback="Add date range selector"

# Day 2: Continue work (worktree persists)
$ codemode worktree list
wt-analytics | active | Large Feature... | 45 files

# Agent continues in same worktree...

# Day 3: Check if diverged from main
$ codemode worktree diff wt-analytics main --stat
$ codemode worktree info wt-analytics

Status: 12 commits ahead, 5 commits behind main

# Optional: Rebase on latest main
$ codemode worktree switch wt-analytics
$ git fetch origin main
$ git rebase origin/main
# (resolve any conflicts)

# Day 4: Complete and merge
$ codemode worktree merge wt-analytics --strategy=squash
✓ Large feature merged successfully
```

---

### Workflow 7: Parallel Bug Fixes

**Scenario:** Multiple urgent bugs need fixing simultaneously.

```bash
# Create worktree for each bug
$ codemode worktree create --base=main --description="Bug: Memory leak in websocket"
Created: wt-bug-ws

$ codemode worktree create --base=main --description="Bug: Race condition in cache"
Created: wt-bug-cache

$ codemode worktree create --base=main --description="Bug: SQL injection in search"
Created: wt-bug-sql

# Agents work in parallel (no conflicts)...

# Each completes at different time
$ codemode worktree list --status=idle
wt-bug-sql   | idle | Bug: SQL injection...
wt-bug-cache | idle | Bug: Race condition...
wt-bug-ws    | active | Bug: Memory leak...

# Merge as they complete
$ codemode worktree merge wt-bug-sql --strategy=squash --delete
✓ Merged

$ codemode worktree merge wt-bug-cache --strategy=squash --delete
✓ Merged

# Last one finishes
$ codemode worktree merge wt-bug-ws --strategy=squash --delete
✓ Merged

# All bugs fixed in parallel! 🎉
```

---

## CLI Reference

### Create Worktree

```bash
codemode worktree create [options]

Options:
  --base=<branch>         Base branch to create from (default: current)
  --branch=<name>         Custom branch name (default: auto-generated)
  --description=<text>    Description for this worktree
  --no-sandbox            Don't create E2B sandbox
  --copy-uncommitted      Copy uncommitted changes to worktree

Examples:
  codemode worktree create
  codemode worktree create --base=develop --description="Feature X"
  codemode worktree create --branch=custom/feature-name
```

---

### List Worktrees

```bash
codemode worktree list [options]

Options:
  --status=<status>       Filter by status (active, idle, merged, etc.)
  --format=<format>       Output format (table, json, compact)
  --sort=<field>          Sort by field (created, status, changes)

Examples:
  codemode worktree list
  codemode worktree list --status=active,idle
  codemode worktree list --format=json
```

---

### Show Worktree Info

```bash
codemode worktree info <session-id>

Shows detailed information about a worktree:
  - Status and timestamps
  - Branch and commit info
  - Files changed
  - Diff statistics
  - Disk usage
  - Test results (if any)

Example:
  codemode worktree info wt-abc123
```

---

### Switch to Worktree

```bash
codemode worktree switch <session-id>
codemode worktree switch --main  # Return to main repo

Changes current working directory to worktree.
Subsequent commands run in worktree context.

Examples:
  codemode worktree switch wt-abc123
  cd .worktrees/wt-abc123  # Alternative (manual)
```

---

### Diff Worktrees

```bash
codemode worktree diff <source> <target> [options]

Options:
  --stat                  Show statistics only
  --name-only             Show file names only
  --context=<n>           Context lines (default: 3)
  --path=<pattern>        Filter by path pattern

Examples:
  codemode worktree diff wt-123 main
  codemode worktree diff wt-123 wt-456 --stat
  codemode worktree diff wt-123 main --path="src/**/*.ts"
```

---

### Merge Worktree

```bash
codemode worktree merge <session-id> [options]

Options:
  --strategy=<strategy>   Merge strategy: merge, squash, rebase, fast-forward
  --target=<branch>       Target branch (default: parent branch)
  --message=<text>        Commit message
  --delete                Delete worktree after merge
  --no-tests              Skip test validation
  --dry-run               Preview merge without executing

Examples:
  codemode worktree merge wt-123 --strategy=squash --delete
  codemode worktree merge wt-123 --target=develop --message="feat: Add feature"
  codemode worktree merge wt-123 --dry-run
```

---

### Remove Worktree

```bash
codemode worktree remove <session-id> [options]

Options:
  --delete-branch         Delete git branch as well
  --force                 Force removal even with uncommitted changes
  --backup                Create backup before removal

Examples:
  codemode worktree remove wt-123
  codemode worktree remove wt-123 --delete-branch --force
```

---

### Cleanup Worktrees

```bash
codemode worktree cleanup [options]

Options:
  --dry-run               Show what would be removed
  --all                   Remove all worktrees (dangerous!)
  --older-than=<days>     Remove worktrees older than N days

Automatically removes:
  - Merged worktrees (if configured)
  - Abandoned worktrees past retention period
  - Orphaned worktrees

Examples:
  codemode worktree cleanup --dry-run
  codemode worktree cleanup --older-than=7
```

---

### Show Disk Usage

```bash
codemode worktree usage [options]

Options:
  --format=<format>       Output format (human, bytes, json)
  --sort=<field>          Sort by size or name

Shows disk space used by all worktrees.

Example:
  codemode worktree usage

  Total: 2.4 GB

  wt-123    450 MB
  wt-456    1.1 GB
  wt-789    850 MB
```

---

## GUI Usage

### Worktree Manager Panel

The Worktree Manager panel provides a visual interface for managing worktrees:

```
┌─ Worktree Manager ──────────────────────────────────────┐
│                                                          │
│  ● wt-auth      claude/agent-auth-1731891234      [⚡]  │
│    Status: Active | 8 files changed | +145 -23          │
│    [Switch] [Diff] [Merge ▼] [Remove]                   │
│                                                          │
│  ○ wt-payments  claude/agent-payments-1731891235  [✓]   │
│    Status: Idle | 15 files changed | +267 -45           │
│    [Switch] [Diff] [Merge ▼] [Remove]                   │
│                                                          │
│  ○ wt-refactor  claude/agent-refactor-1731891236  [⏸]   │
│    Status: Idle | 42 files changed | +512 -389          │
│    [Switch] [Diff] [Merge ▼] [Remove]                   │
│                                                          │
├─ Actions ───────────────────────────────────────────────┤
│  [+ New Worktree]  [🧹 Cleanup]  [📊 Disk Usage]        │
└──────────────────────────────────────────────────────────┘
```

### Status Indicators

- **●** Green dot: Active (agent working)
- **○** Gray dot: Idle (agent completed)
- **⚡** Lightning: Tests passed
- **✗** X: Tests failed
- **⚠** Warning: Merge conflicts
- **✓** Checkmark: Merged
- **⏸** Pause: Abandoned

### Quick Actions

**Switch:** Changes context to worktree
**Diff:** Opens diff view against main
**Merge:** Dropdown with strategies (squash, merge, rebase)
**Remove:** Removes worktree with confirmation

### Diff Viewer

```
┌─ Diff: wt-auth vs main ─────────────────────────────────┐
│                                                          │
│  Files Changed (8)                     +145    -23      │
│  ├─ src/auth/login.ts                  +45     -10      │
│  ├─ src/auth/register.ts (new)         +67     -0       │
│  ├─ src/middleware/auth.ts (new)       +23     -0       │
│  └─ tests/auth.test.ts (new)           +38     -0       │
│                                                          │
│  [< Previous]  [Next >]  [Copy to Main]  [Close]        │
│                                                          │
│  ┌─ src/auth/login.ts ──────────────────────────────┐   │
│  │  @@ -15,6 +15,10 @@                             │   │
│  │                                                   │   │
│  │   export async function login(req, res) {        │   │
│  │ +   // Validate input                            │   │
│  │ +   if (!req.body.email || !req.body.password) { │   │
│  │ +     return res.status(400).json(...)           │   │
│  │ +   }                                             │   │
│  │     const user = await User.findOne(...)         │   │
│  │     ...                                           │   │
│  └───────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

---

## Troubleshooting

### Issue: "Worktree creation failed"

**Cause:** Branch name already exists or disk space full

**Solution:**
```bash
# Check existing branches
git branch -a | grep claude/

# Delete stale branch
git branch -D claude/old-branch-name

# Check disk space
df -h
codemode worktree usage

# Clean up old worktrees
codemode worktree cleanup
```

---

### Issue: "Cannot switch to worktree"

**Cause:** Worktree directory missing or corrupted

**Solution:**
```bash
# Validate worktree
codemode worktree info wt-123

# If corrupted, repair
git worktree list
git worktree repair

# Or remove and recreate
codemode worktree remove wt-123 --force
```

---

### Issue: "Merge conflicts detected"

**Cause:** Worktree diverged from target branch

**Solution:**
```bash
# Check conflict files
codemode worktree merge wt-123 --dry-run

Conflicts in:
  - src/config/database.ts
  - src/utils/helpers.ts

# Option 1: Manual resolution
codemode worktree switch wt-123
git fetch origin main
git rebase origin/main
# (resolve conflicts)
git rebase --continue

# Option 2: Abandon and start fresh
codemode worktree remove wt-123 --delete-branch
codemode worktree create --base=main
```

---

### Issue: "Disk quota exceeded"

**Cause:** Too many worktrees or worktrees too large

**Solution:**
```bash
# Check usage
codemode worktree usage

Total: 4.8 GB (limit: 5 GB) ⚠️

# Clean up
codemode worktree cleanup

# Or remove specific worktrees
codemode worktree remove wt-old-1 --delete-branch
codemode worktree remove wt-old-2 --delete-branch

# Adjust limits in config
# Edit .codemode/config.yaml:
worktree:
  limits:
    maxTotalSizeMB: 10000  # Increase to 10 GB
```

---

### Issue: "Uncommitted changes warning"

**Cause:** Trying to remove worktree with uncommitted work

**Solution:**
```bash
# Option 1: Commit changes
codemode worktree switch wt-123
git add .
git commit -m "WIP: Save progress"

# Option 2: Stash changes
git stash push -m "Save for later"

# Option 3: Force remove (loses changes!)
codemode worktree remove wt-123 --force
```

---

### Issue: "Tests failed before merge"

**Cause:** Config requires tests to pass before merge

**Solution:**
```bash
# Fix tests
codemode worktree switch wt-123
npm test  # See failures
# Fix issues...
npm test  # Verify pass

# Or skip test requirement (not recommended)
codemode worktree merge wt-123 --no-tests

# Or adjust config
# Edit .codemode/config.yaml:
worktree:
  requireTestsPassBeforeMerge: false
```

---

## Best Practices

### 1. Descriptive Names

Always provide descriptions:
```bash
# Good
codemode worktree create --description="Feature: User authentication with OAuth"

# Less helpful
codemode worktree create
```

### 2. Regular Cleanup

Set up automatic cleanup:
```yaml
# .codemode/config.yaml
worktree:
  cleanup:
    onMerge: true           # Remove after successful merge
    retentionDays: 7        # Keep abandoned for 7 days
```

### 3. Test Before Merge

Always test in worktree before merging:
```bash
codemode worktree switch wt-123
npm test
npm run build
npm run lint
# All good? Now merge
codemode worktree merge wt-123 --strategy=squash
```

### 4. Squash for Clean History

Use squash for feature work:
```bash
codemode worktree merge wt-123 --strategy=squash \
  --message="feat: Add user authentication

- Implement OAuth 2.0 flow
- Add JWT token management
- Create auth middleware
- Add comprehensive tests"
```

### 5. Monitor Disk Usage

Check regularly:
```bash
codemode worktree usage
codemode worktree cleanup --dry-run
```

---

## Configuration Examples

### Minimal Configuration

```yaml
# .codemode/config.yaml
worktree:
  enabled: true
```

### Production Configuration

```yaml
worktree:
  enabled: true
  worktreeBaseDir: .worktrees
  branchPrefix: claude/
  maxConcurrentWorktrees: 10

  cleanup:
    onSessionEnd: false
    onMerge: true
    retentionDays: 7

  requireTestsPassBeforeMerge: true

  limits:
    maxWorktreeSizeMB: 1000
    maxTotalSizeMB: 5000

  ui:
    showDiskUsage: true
    confirmBeforeRemove: true
    defaultMergeStrategy: squash
    showDiffStats: true
```

### Development Configuration

```yaml
worktree:
  enabled: true
  maxConcurrentWorktrees: 20  # More for experimentation

  cleanup:
    onSessionEnd: false
    onMerge: false              # Keep for reference
    retentionDays: 30           # Longer retention

  requireTestsPassBeforeMerge: false  # Faster iteration

  limits:
    maxWorktreeSizeMB: 2000     # Larger worktrees
    maxTotalSizeMB: 10000       # More total space
```

---

## FAQ

**Q: Can I use worktrees with non-git projects?**
A: No, worktrees are a git feature and require a git repository.

**Q: Do worktrees share the .git directory?**
A: Yes, all worktrees share the same .git directory, which saves disk space.

**Q: Can I push a worktree branch?**
A: Yes, worktree branches are regular branches and can be pushed/pulled.

**Q: What happens if I delete a worktree directory manually?**
A: Git will still track it. Run `git worktree prune` or `codemode worktree cleanup` to clean up.

**Q: Can I have the same branch checked out in multiple worktrees?**
A: No, each branch can only be checked out in one worktree at a time.

**Q: Do worktrees persist across Code Mode restarts?**
A: Yes, worktrees are registered and persist until explicitly removed.

**Q: Can I run agents in parallel in different worktrees?**
A: Yes! This is the primary use case for worktrees.

**Q: How do I backup a worktree before merging?**
A: The worktree is a git branch, so it's automatically backed up in git history. You can also create a tag: `git tag backup/wt-123`

---

## Further Reading

- [Git Worktree Documentation](https://git-scm.com/docs/git-worktree)
- [Code Mode RFC: Worktree Management](../rfcs/0001-worktree-management.md)
- [API Reference](../api/worktree.md)

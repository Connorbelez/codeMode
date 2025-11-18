# Git Worktree Management for Code Mode

> **Status:** Design Phase
> **Branch:** `claude/github-worktrees-feature-01PLbMA5rAHF4gRQdBaq9JYt`

## Overview

This feature enables users to launch Code Mode agents in isolated git worktrees, allowing:

- ✅ **Parallel Development** - Multiple agents working simultaneously without conflicts
- ✅ **Easy Comparison** - Switch between and compare agent outputs
- ✅ **Safe Experimentation** - Isolated changes until explicitly merged
- ✅ **One-Click Launch** - Simple "Launch in Worktree" button

## Documentation

This design package includes comprehensive specifications:

### 📋 [RFC: Worktree Management](rfcs/0001-worktree-management.md)
The complete Request for Comments document covering:
- Motivation and goals
- Architecture design
- Data models and API
- Implementation plan
- Testing strategy
- Open questions

**Start here** for the complete technical specification.

---

### 🏗️ [Type Definitions](../core/worktree/types.ts)
TypeScript interfaces and types:
- `WorktreeSession` - Core session state
- `WorktreeConfig` - Configuration options
- `WorktreeMetadata` - Git and filesystem metadata
- Event types, error codes, and utility types

**Use this** as the type foundation for implementation.

---

### 🔌 [API Specification](../core/worktree/api.ts)
Complete API interfaces:
- `IWorktreeManager` - Main management interface
- `IGitOperations` - Git wrapper interface
- `IWorktreeRegistry` - Persistence interface
- Method signatures with JSDoc

**Reference this** when implementing features.

---

### 📖 [User Workflows](worktree-workflows.md)
Practical usage guide:
- Quick start guide
- 7 detailed workflow examples
- CLI command reference
- GUI usage patterns
- Troubleshooting guide
- Configuration examples

**Share this** with users for onboarding.

---

### 🛠️ [Implementation Guide](worktree-implementation-guide.md)
Developer guide:
- Recommended implementation order
- Phase-by-phase breakdown
- Code snippets and examples
- Testing strategy
- Key technical decisions

**Follow this** during development.

---

## Quick Reference

### Core Concepts

**Worktree Session**
- Isolated workspace for one agent
- Own git branch (auto-generated)
- Shares `.git` directory (space efficient)
- Persists until merged or removed

**Lifecycle**
```
Create → Agent Works → User Reviews → Merge/Discard
```

**Key Operations**
- `create` - Launch agent in new worktree
- `list` - View all active worktrees
- `diff` - Compare worktrees
- `merge` - Integrate changes back
- `remove` - Delete worktree

### Example Usage

```bash
# Create worktree
$ codemode worktree create --description="Add auth"
Created: wt-abc123

# Agent works in isolation...

# Review changes
$ codemode worktree diff wt-abc123 main --stat
8 files changed, +145 -23

# Merge when ready
$ codemode worktree merge wt-abc123 --strategy=squash
✓ Merged successfully
```

### Architecture

```
User Interface (CLI/GUI)
        ↓
WorktreeManagerSingleton
        ↓
├─ Git Operations (worktree, branch, diff, merge)
├─ Registry (persistence)
└─ Events (lifecycle notifications)
```

---

## Implementation Status

### ✅ Complete
- [x] RFC document
- [x] Type definitions
- [x] API specification
- [x] User workflows documentation
- [x] Implementation guide

### 🚧 In Progress
- [ ] Core manager implementation
- [ ] Git operations wrapper
- [ ] Registry persistence
- [ ] CLI commands
- [ ] GUI integration

### 📅 Planned
- [ ] Diff engine
- [ ] Merge orchestrator
- [ ] Auto-cleanup
- [ ] Testing suite
- [ ] Documentation site

---

## Key Decisions

Based on initial requirements:

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Scope** | Per agent session | One worktree per agent for isolation |
| **Persistence** | Until user action | User controls when to merge/remove |
| **Naming** | Auto-generated | Simplifies UX, consistent format |
| **Initiation** | User-triggered | Button-based launch (no agent API yet) |
| **Merge Strategy** | User choice | Squash, merge, rebase, fast-forward |

---

## Design Principles

1. **Simplicity First** - Easy to use, hard to break
2. **Safe by Default** - Warn before destructive actions
3. **No Surprises** - Explicit user control over merges
4. **Clean History** - Encourage squash merges
5. **Disk Conscious** - Monitor and limit usage

---

## File Structure

```
codeMode/
├── docs/
│   ├── rfcs/
│   │   └── 0001-worktree-management.md    (RFC)
│   ├── worktree-README.md                  (This file)
│   ├── worktree-workflows.md               (User guide)
│   └── worktree-implementation-guide.md    (Dev guide)
│
├── core/
│   └── worktree/
│       ├── types.ts                        (Type definitions)
│       ├── api.ts                          (API interfaces)
│       ├── WorktreeManagerSingleton.ts     (Main manager) TODO
│       ├── git-operations.ts               (Git wrapper) TODO
│       ├── registry.ts                     (Persistence) TODO
│       ├── errors.ts                       (Error handling) TODO
│       ├── constants.ts                    (Defaults) TODO
│       └── utils.ts                        (Helpers) TODO
│
├── extensions/
│   └── cli/
│       └── src/
│           └── commands/
│               └── worktree.ts             (CLI commands) TODO
│
└── .codemode/
    └── worktrees.json                      (Registry data) [Generated]
```

---

## Next Steps

### For Product/Design Review
1. Review RFC for alignment with product vision
2. Validate user workflows against use cases
3. Confirm UI/UX approach (CLI vs GUI priority)

### For Engineering Review
1. Review API design for completeness
2. Validate type definitions
3. Assess implementation complexity
4. Identify technical risks

### To Begin Implementation
1. Create infrastructure files (errors, constants, utils)
2. Implement GitOperations wrapper
3. Build WorktreeManagerSingleton core
4. Add persistence layer
5. Create CLI commands

---

## Resources

### Git Worktree Documentation
- [Official Docs](https://git-scm.com/docs/git-worktree)
- [Best Practices](https://git-scm.com/docs/git-worktree#_examples)

### Related Code Mode Docs
- [Agent Sessions](../core/control-plane/client.ts)
- [Sandbox Management](../core/tools/implementations/executeCode.ts)
- [MCP Integration](../core/context/mcp/MCPManagerSingleton.ts)

---

## Questions & Feedback

For questions or feedback on this design:

1. **Technical Questions** - Review the Implementation Guide
2. **User Experience** - Check Workflows documentation
3. **API Design** - See API Specification
4. **Overall Direction** - Read the RFC

Open issues on the repository or discuss in design reviews.

---

## Version History

**v1.0.0** (2025-11-17)
- Initial design specification
- Complete RFC, types, API, and documentation
- Ready for implementation review

---

## License

Part of Code Mode - same license as main project.

# CodeModo: 98% Token Reduction + True Agent Composability

**A production-ready fork of [Continue.dev](https://continue.dev)**  
**Created by [Connor Belez](https://github.com/Connorbelez)**  
**Repository:** https://github.com/Connorbelez/CodeModo

> Execute real TypeScript in secure sandboxes instead of verbose JSON tool calls.  
> Same workflows. 50× fewer tokens. 50× lower cost. Full composability.

<p align="center">
  <strong>CodeModo = Continue.dev + Code Execution Mode + LSP + Git Worktree Orchestration</strong>
</p>

We stand on the shoulders of giants.  
This project is a fork of continue.dev based on the papers by Anthropic and Cloudflare, the inspiration for the LSP integration from Charm/Crush, and the git worktree orchestration system pioneered by Cursor.

---

## Why CodeModo Exists

Traditional tool calling in AI coding agents (OpenAI function calling, Anthropic tools, MCP, etc.) suffers from three fatal problems:

1. **Tool schemas bloat every prompt** → 2–4k tokens wasted per request
2. **One tool call = one LLM round-trip** → impossible to loop, filter, or parallelize efficiently
3. **No real programming** → agents can’t write conditionals, state, or error handling across calls

CodeModo fixes all three by letting the agent write and execute real **TypeScript** in an E2B sandbox, while automatically generating type-safe wrappers from any MCP server.

Result: **75–98% token reduction**, true composability, and dramatically better reliability.

---

## Core Features

| Feature                        | Traditional Tool Calling                       | CodeModo                                     | Token Savings |
| ------------------------------ | ---------------------------------------------- | -------------------------------------------- | ------------- |
| Multi-step workflows           | 1 tool call per step → 10–100+ LLM round-trips | Single sandboxed execution                   | 90–98%        |
| Loops / conditionals / state   | Impossible without exploding context           | Native TypeScript                            | —             |
| Tool schemas in prompt         | Sent every request                             | Loaded on-demand via `import`                | 75–85%        |
| Data filtering & processing    | Done in LLM context                            | Done in sandbox → only final result returned | Up to 99%     |
| LSP (definitions, refs, hover) | Read entire files or guess                     | Real LSP calls → precise, tiny payloads      | 95%+          |
| Parallel agent orchestration   | Not possible                                   | Git worktree + sub-agents (Cursor-style)     | Massive       |

---

## New in CodeModo

### 1. Built-in LSP Integration (inspired by Charm/Crush)

No more “read the entire file to find a definition.” Agents can call real LSP methods:

```typescript
import { lsp } from "/mcp";

const def = await lsp.getDefinition({
  filepath: "/workspace/src/app.ts",
  line: 42,
  character: 10,
});

const refs = await lsp.findReferences({
  filepath: "/workspace/src/utils.ts",
  line: 15,
  character: 5,
});
```

Supported operations: `getDefinition`, `findReferences`, `getHover`, `getDiagnostics`, `getDocumentSymbols`, `getWorkspaceSymbols`.

→ 95–99% token reduction on navigation/refactoring tasks.

### 2. Git Worktree Parallel Sub-Agent Orchestration (Cursor-style)

Spawn isolated sub-agents in separate git worktrees for parallel, conflict-free execution:

```typescript
import { worktree } from "/mcp";

const agents = await worktree.spawn([
  { branch: "feature/auth", prompt: "Implement OAuth login" },
  { branch: "feature/payment", prompt: "Add Stripe integration" },
  { branch: "bugfix/crash", prompt: "Fix null pointer in parser" },
]);

await Promise.all(agents.map((a) => a.waitForCompletion()));
await worktree.mergeAll();
```

Perfect for large refactors, multi-feature development, or bug bashes without stepping on toes.

---

## Quick Start (30 seconds)

1. Install the Continue extension (VS Code / JetBrains)
2. Get a free E2B API key: https://e2b.dev
3. Add to `~/.continue/config.yaml`:

```yaml
experimental:
  codeExecution:
    enabled: true
    e2bApiKey: "e2b_..."

mcpServers:
  github:
    command: npx
    args: ["-y", "@modelcontextprotocol/server-github"]
    env:
      GITHUB_TOKEN: "${GITHUB_TOKEN}"
```

That’s it. Now ask:

> “Find all open high-priority bugs, group by component, and create a summary issue”

The agent will write real TypeScript using `github.*`, `lsp.*`, loops, filters — all in one execution.

---

## Real-World Token Savings (Measured with GPT-4o)

| Workflow                           | Traditional Tokens       | CodeModo Tokens | Reduction | Cost Savings |
| ---------------------------------- | ------------------------ | --------------- | --------- | ------------ |
| Update labels on 50 GitHub issues  | 450,000                  | 8,000           | 98.2%     | 56×          |
| Refactor symbol across 200 files   | 1,200,000+               | 12,000          | 99%+      | 100×+        |
| Parallel feature work (3 branches) | Not practically possible | 18,000          | —         | —            |
| Filesystem: Process 100 files      | 380,000                  | 6,500           | 98.3%     | 58×          |

See `/benchmarks` for methodology and raw logs.

---

## How It Works (For Engineers)

1. Continue starts your MCP servers (GitHub, filesystem, custom, etc.)
2. CodeModo queries `listTools()` → auto-generates TypeScript wrappers under `/mcp/{server}/`
3. Agent writes normal TypeScript using `import { github } from "/mcp"`
4. Code executes in an E2B Firecracker microVM
5. Tool calls go through secure file-based IPC → real MCP server → result back to sandbox
6. Only the final return value goes back to the LLM

No schema in prompt. No round-trips for loops. Full type safety and autocomplete.

---

## Architecture Highlights

- **Zero modifications required** for existing MCP servers
- **Progressive disclosure** – schemas loaded only when imported
- **Persistent sandbox state** across turns (`globalThis.cache`)
- **Secure by default** – E2B microVMs, no network/fs escape
- **Pluggable transport** – current file-based IPC, WebSocket in progress

---

## Roadmap

| Status      | Feature                                 |
| ----------- | --------------------------------------- |
| Done        | MCP → TypeScript wrapper generation     |
| Done        | E2B sandbox + file IPC                  |
| Done        | LSP integration                         |
| Done        | Git worktree parallel agents            |
| In Progress | WebSocket transport (lower latency)     |
| In Progress | Built-in Continue tools (git, terminal) |
| Planned     | Tool marketplace + custom tool DSL      |
| Planned     | Long-running background agents          |

---

## Resources

- Repository: https://github.com/Connorbelez/CodeModo
- Continue.dev: https://continue.dev
- MCP Servers: https://github.com/modelcontextprotocol/servers
- E2B: https://e2b.dev
- Discord: https://discord.gg/vapESyrFmJ

---

## License

Apache 2.0 — same as Continue.dev

CodeModo © 2025 Connor Belez  
Built on Continue.dev © 2023–2025 Continue Dev, Inc.

---

If you’re tired of paying $1–$10 per agent task and watching it hallucinate JSON, try CodeModo.  
One execution. Real code. Real results.

**Star the repo if this sounds useful → https://github.com/Connorbelez/CodeModo**

# Product Requirements Document: Token Inspector

## Executive Summary

The Token Inspector is a comprehensive observability feature that provides users with granular visibility into token consumption across their AI agent workflows. By surfacing exactly where, when, and how tokens are being used, this feature empowers users to optimize costs, debug performance issues, and make informed decisions about their LLM usage patterns.

**Target Users**: Developers, DevOps engineers, and product teams using Code Mode for AI-powered automation.

**Key Value Proposition**: Transform opaque token consumption into actionable insights, enabling users to reduce costs by 20-50% through targeted optimization.

---

## Problem Statement

### Current Pain Points

1. **Lack of Visibility**: Users cannot see token consumption breakdown within their workflows
   - Which LLM calls are most expensive?
   - What percentage of tokens come from tool schemas vs. actual content?
   - How effective is prompt caching?

2. **Difficult Cost Attribution**: Cannot trace costs back to specific operations
   - Which tools/functions consume the most tokens?
   - What's the token cost of a specific conversation or task?
   - How do different LLM providers compare in practice?

3. **Optimization Blindness**: No data-driven insights for improvement
   - Are tool calls being batched efficiently?
   - Is context window being managed optimally?
   - Which messages are being pruned and why?

4. **Debugging Challenges**: Token-related issues are hard to diagnose
   - Why did a conversation hit the context limit?
   - Which requests triggered cache writes vs. reads?
   - What caused an unexpected cost spike?

### Market Context

- **LLM costs** represent 60-80% of operational expenses for AI agent applications
- **Token optimization** can reduce costs by 75-98% (Code Mode's core value prop)
- **Observability gaps** are the #1 complaint in AI development workflows (according to State of AI Engineering 2024)

---

## Goals and Objectives

### Primary Goals

1. **Transparency**: Provide complete visibility into token usage at every level (request, conversation, tool, session)
2. **Actionability**: Surface insights that directly lead to cost reduction or performance improvement
3. **Developer Experience**: Make token inspection seamless and integrated into existing workflows
4. **Cost Attribution**: Enable precise tracking of which features/operations drive costs

### Success Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| **User Adoption** | 60% of active users enable Token Inspector | Telemetry (feature flag tracking) |
| **Cost Reduction** | 25% average token reduction after using insights | Before/after usage comparison |
| **Time to Insight** | <30 seconds to identify top cost drivers | User testing (time on task) |
| **Feature Satisfaction** | NPS >40 for Token Inspector feature | User survey (quarterly) |
| **Retention Impact** | 15% increase in weekly active users | Cohort analysis |

### Non-Goals (Out of Scope)

- **Real-time streaming visualization** (phase 2)
- **Cross-user analytics dashboard** (enterprise feature)
- **Automated optimization recommendations** (ML-based, future)
- **Historical data retention >90 days** (storage costs)

---

## User Stories

### Epic 1: Basic Token Visibility

**As a developer**, I want to see the total token count for each LLM request, so that I can understand the basic cost structure of my agent workflows.

- **Acceptance Criteria**:
  - Display input tokens, output tokens, and total tokens for each request
  - Show cached token reads/writes separately (Anthropic models)
  - Provide cost breakdown in USD
  - Support all 70+ LLM providers

**As a DevOps engineer**, I want to export token usage data to CSV, so that I can analyze trends and create custom reports.

- **Acceptance Criteria**:
  - Export button in UI generates downloadable CSV
  - Includes timestamp, model, provider, token counts, cost
  - Supports filtering by date range, model, or provider

---

### Epic 2: Granular Attribution

**As a product manager**, I want to see which tools/functions consume the most tokens, so that I can prioritize optimization efforts.

- **Acceptance Criteria**:
  - Aggregate view showing token usage by tool (e.g., `github.createIssue`, `filesystem.read`)
  - Breakdown by: schema overhead vs. actual data
  - Sortable by total tokens, average tokens, call count
  - Visual chart (bar/pie) for top 10 consumers

**As a developer**, I want to see token usage per conversation/session, so that I can track costs for specific tasks.

- **Acceptance Criteria**:
  - Conversation-level summary showing cumulative tokens
  - Timeline view of token consumption over conversation lifecycle
  - Breakdown by message type (user, assistant, tool)

---

### Epic 3: Context Window Analysis

**As a developer**, I want to see which messages are being pruned from context, so that I can understand if important information is being lost.

- **Acceptance Criteria**:
  - Highlight pruned messages in conversation history
  - Show pruning reason (e.g., "exceeded context limit", "older than retention policy")
  - Display context utilization percentage per request
  - Alert when >90% context usage (potential quality degradation)

**As a developer**, I want to visualize my context window usage, so that I can optimize message length and structure.

- **Acceptance Criteria**:
  - Visual gauge showing context utilization (0-100%)
  - Breakdown by component: system prompt, tools, conversation history, output buffer
  - Recommendations when specific components are inefficient

---

### Epic 4: Cache Effectiveness

**As a cost-conscious user**, I want to see prompt cache hit rates, so that I can evaluate if caching is providing ROI.

- **Acceptance Criteria**:
  - Cache hit/miss ratio for Anthropic models
  - Cost comparison: with cache vs. without cache
  - Identify which prompts/tool schemas benefit most from caching
  - Recommendations for cache optimization (e.g., "move dynamic content to end of prompt")

---

### Epic 5: Debugging & Troubleshooting

**As a developer**, I want to replay token consumption for a specific request, so that I can debug unexpected costs.

- **Acceptance Criteria**:
  - Click on any request to see detailed breakdown
  - View exact prompt sent (with syntax highlighting)
  - Token count per section (system, user message, tools, response)
  - Diff view showing changes from previous request

**As a developer**, I want to receive alerts when token usage spikes, so that I can catch runaway costs early.

- **Acceptance Criteria**:
  - Configurable thresholds (e.g., ">10,000 tokens in single request")
  - Notification in UI + optional Slack/email webhook
  - Suggested causes (e.g., "context window near limit", "large tool response")

---

## Features and Requirements

### Feature 1: Real-Time Token Dashboard (CLI & Web UI)

**Priority**: P0 (Must-Have)

#### CLI Interface

```bash
# Interactive dashboard in terminal
code-mode tokens

# Output example:
┌─────────────────────────────────────────────────────┐
│ Token Usage - Last 10 Minutes                       │
├─────────────────────────────────────────────────────┤
│ Total Tokens:        24,583                         │
│ Input:               18,421  (74.9%)                │
│ Output:               6,162  (25.1%)                │
│ Cached Reads:        12,034  (65.3% cache hit)      │
│ Cost (USD):          $0.187                         │
├─────────────────────────────────────────────────────┤
│ Top Token Consumers:                                │
│ 1. github.listIssues          8,421 tokens (7 calls)│
│ 2. executeCode                5,234 tokens (3 calls)│
│ 3. filesystem.readFile        2,891 tokens (12 calls)│
└─────────────────────────────────────────────────────┘

# Export to JSON
code-mode tokens export --format json --output tokens.json

# Watch mode (live updates)
code-mode tokens watch

# Filter by conversation
code-mode tokens --conversation abc123
```

#### Web UI Dashboard

**Layout**: New "Token Inspector" tab in main navigation

**Components**:
1. **Summary Cards** (top row)
   - Total tokens (current session)
   - Total cost (USD)
   - Cache hit rate
   - Context utilization

2. **Timeline Chart** (middle)
   - X-axis: Time
   - Y-axis: Tokens per request
   - Color-coded by request type (user, tool, assistant)
   - Hover for detailed breakdown

3. **Request List** (bottom)
   - Table with columns: Timestamp, Model, Input Tokens, Output Tokens, Cost, Duration
   - Click to expand detailed view
   - Filter/search by model, date range, cost threshold

4. **Export Controls**
   - CSV, JSON export buttons
   - Date range picker
   - Filter by model/provider

---

### Feature 2: Request-Level Inspector

**Priority**: P0 (Must-Have)

**UI**: Modal/panel that opens when clicking on a request in the dashboard

**Sections**:

1. **Overview**
   ```
   Request ID: req_abc123
   Model: claude-3.5-sonnet-20241022
   Timestamp: 2025-11-17 14:32:18 UTC
   Total Tokens: 3,842
   Cost: $0.058
   ```

2. **Token Breakdown**
   ```
   Input Tokens:          2,941
     ├─ System Prompt:      234 (8.0%)
     ├─ Tools:             1,823 (62.0%)
     └─ User Message:        884 (30.0%)

   Output Tokens:          901

   Cached Tokens:
     ├─ Cache Write:        0
     └─ Cache Read:      2,105 (71.5% of input)
   ```

3. **Message Content** (collapsible)
   - Syntax-highlighted prompt
   - Tool schemas (if applicable)
   - Response text
   - Token count overlays on each section

4. **Context Metadata**
   ```
   Context Window: 200,000 tokens
   Utilization: 38.7% (77,421 / 200,000)
   Messages Pruned: 3 older messages
   ```

---

### Feature 3: Tool Attribution Report

**Priority**: P1 (Should-Have)

**View**: Dedicated "Tools" tab in Token Inspector

**Data Table**:

| Tool Name | Calls | Total Tokens | Avg Tokens/Call | Schema Size | Data Size | Cost |
|-----------|-------|--------------|-----------------|-------------|-----------|------|
| github.listIssues | 14 | 18,234 | 1,302 | 412 | 890 | $0.274 |
| executeCode | 8 | 12,445 | 1,556 | 0 | 1,556 | $0.187 |
| filesystem.read | 23 | 5,671 | 247 | 98 | 149 | $0.085 |

**Insights Panel**:
```
💡 Optimization Opportunities
• github.listIssues: Consider batching multiple calls into single executeCode block
• executeCode: 65% of tokens are from large responses - filter data in sandbox
```

---

### Feature 4: Cache Inspector (Anthropic Models Only)

**Priority**: P1 (Should-Have)

**Metrics Display**:

```
Prompt Caching Performance (Last 24h)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Cache Hits:     127 / 143 (88.8%)
Cache Misses:   16 / 143 (11.2%)

Cost Impact:
  Without Cache:  $2.45
  With Cache:     $0.58
  Savings:        $1.87 (76.3%)

Top Cached Blocks:
1. Tool schemas (github)     12,034 tokens   43 hits
2. System prompt             1,823 tokens    127 hits
3. Tool schemas (filesystem) 2,891 tokens    38 hits
```

**Cache Efficiency Score**: 0-100 based on hit rate and cost savings

---

### Feature 5: Conversation Replay

**Priority**: P2 (Nice-to-Have)

**Feature**: Step through a conversation and see cumulative token usage

**UI**:
- Slider to scrub through conversation timeline
- Display shows: cumulative tokens, context utilization, cost at each step
- Highlight which messages were in context at that point
- Show pruning events as markers on timeline

**Use Case**: Understand when context limit was hit, which messages were retained

---

### Feature 6: Alerts & Notifications

**Priority**: P2 (Nice-to-Have)

**Configuration** (in `.continue/config.yaml`):

```yaml
experimental:
  tokenInspector:
    enabled: true
    alerts:
      - type: high_single_request
        threshold: 10000  # tokens
        action: notify

      - type: hourly_limit
        threshold: 100000  # tokens
        action: warn

      - type: context_utilization
        threshold: 0.95  # 95%
        action: notify

    notifications:
      - type: terminal  # show in CLI
      - type: webhook
        url: "https://hooks.slack.com/..."
```

**Alert Types**:
1. **High Single Request**: Individual request exceeds threshold
2. **Hourly/Daily Limit**: Cumulative usage exceeds budget
3. **Context Utilization**: Near context window limit (quality risk)
4. **Cache Miss Spike**: Unexpected cache invalidation
5. **Cost Spike**: >3σ deviation from average cost per request

---

## Technical Requirements

### Data Collection

1. **Instrumentation Points**:
   - `streamChat()` - capture request/response tokens
   - `countTokens()` - detailed token counting
   - `compileChatMessages()` - pruning events
   - `executeCode()` - tool invocation tracking
   - `MCPConnection.callTool()` - MCP tool usage

2. **Data Schema** (see Technical Specs section)

3. **Storage**: SQLite database (local) with 90-day retention

### Performance Requirements

- **Overhead**: <5% latency increase on LLM requests
- **Storage**: <100MB for 90 days of typical usage
- **Query Speed**: <200ms for dashboard load
- **Export Speed**: <2s for 10,000 records

### Privacy & Security

- **No PII in logs**: Redact user content, only track token counts
- **Local-first**: All data stored locally by default
- **Opt-in telemetry**: Anonymous aggregate data for Code Mode analytics (PostHog)
- **Encryption**: SQLite database encrypted at rest

### Compatibility

- **Supported LLMs**: All 70+ providers (OpenAI, Anthropic, Groq, AWS Bedrock, etc.)
- **Clients**: CLI, VS Code, JetBrains, Web UI
- **Node Versions**: 20+
- **Operating Systems**: macOS, Linux, Windows

---

## UI/UX Requirements

### Design Principles

1. **Clarity**: Token data should be immediately understandable
2. **Actionability**: Every metric should suggest an optimization
3. **Non-intrusive**: Inspector doesn't interrupt workflow
4. **Responsive**: Works on various screen sizes

### Accessibility

- WCAG 2.1 AA compliance
- Keyboard navigation for all features
- Screen reader support
- High contrast mode

### CLI Experience

- ASCII-based charts (using libraries like `blessed`, `ink`)
- Color-coded severity (green=efficient, yellow=moderate, red=high cost)
- Interactive mode with arrow key navigation
- Export/pipe-friendly plain text mode

---

## Dependencies

### Internal Dependencies

- `core/llm/countTokens.ts` - token counting logic
- `core/util/TokensBatchingService.ts` - existing telemetry
- `core/llm/utils/calculateRequestCost.ts` - cost calculations
- `core/core.ts` - Core class integration

### External Dependencies

```json
{
  "sqlite3": "^5.1.7",           // Already in use
  "recharts": "^2.10.0",         // Web UI charts (NEW)
  "ink": "^5.0.0",               // CLI UI framework (NEW)
  "csv-stringify": "^6.4.0"     // CSV export (NEW)
}
```

---

## Release Strategy

### Phase 1: MVP (Weeks 1-3)

**Scope**:
- Basic token tracking in SQLite
- CLI dashboard with summary stats
- Request-level inspector (CLI only)
- CSV export

**Target**: Early adopters, internal testing

### Phase 2: Enhanced UI (Weeks 4-6)

**Scope**:
- Web UI dashboard with charts
- Tool attribution report
- Cache inspector (Anthropic only)
- Filtering and search

**Target**: Public beta release

### Phase 3: Intelligence (Weeks 7-9)

**Scope**:
- Alerts and notifications
- Conversation replay
- Optimization recommendations
- Slack/webhook integrations

**Target**: General availability (GA)

---

## Success Criteria

### Launch Criteria (GA Readiness)

- [ ] 100% test coverage for token tracking logic
- [ ] Performance overhead <5% validated
- [ ] Documentation complete (usage guide, API docs)
- [ ] Privacy review passed (no PII leakage)
- [ ] Dogfooding complete (Code Mode team uses for 2 weeks)
- [ ] User testing with 5+ external users

### Post-Launch Metrics (30-day checkpoint)

- Adoption rate >60%
- Zero critical bugs
- Average user cost reduction >20%
- NPS >40

---

## Open Questions

1. **Historical Data Retention**: Should we offer cloud backup for >90 days? (Privacy implications)
2. **Team Collaboration**: Multi-user dashboard for shared insights? (Enterprise feature?)
3. **Automated Actions**: Should we auto-optimize based on insights? (Risk of unintended behavior)
4. **Pricing Impact**: Does this feature justify a premium tier?

---

## Appendix

### Glossary

- **Input Tokens**: Tokens in the prompt (system + user + tools)
- **Output Tokens**: Tokens in the model's response
- **Cached Tokens**: Tokens read from Anthropic's prompt cache
- **Context Window**: Maximum tokens a model can process in one request
- **Pruning**: Removing older messages to fit context limit
- **Tool Schema**: JSON schema describing an MCP tool's interface

### References

- [Anthropic Prompt Caching Docs](https://docs.anthropic.com/en/docs/prompt-caching)
- [OpenAI Tokenizer Docs](https://platform.openai.com/tokenizer)
- [Code Mode Architecture](../README.md)

---

**Document Version**: 1.0
**Last Updated**: 2025-11-17
**Owner**: Engineering Team
**Stakeholders**: Product, DevOps, Developer Relations

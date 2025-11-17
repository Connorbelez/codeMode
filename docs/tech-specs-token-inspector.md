# Technical Specifications: Token Inspector

## Document Information

**Version**: 1.0
**Last Updated**: 2025-11-17
**Status**: Draft
**Engineering Owner**: TBD
**Related PRD**: [prd-token-inspector.md](./prd-token-inspector.md)

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Data Model](#data-model)
3. [Core Components](#core-components)
4. [API Specifications](#api-specifications)
5. [Implementation Details](#implementation-details)
6. [Performance Considerations](#performance-considerations)
7. [Testing Strategy](#testing-strategy)
8. [Migration & Rollout](#migration--rollout)
9. [Monitoring & Observability](#monitoring--observability)

---

## Architecture Overview

### System Context Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      Code Mode Core                         │
│                                                             │
│  ┌──────────────┐      ┌──────────────┐                   │
│  │  streamChat  │─────>│ TokenTracker │                   │
│  │   (LLM)      │      │  (NEW)       │                   │
│  └──────────────┘      └──────┬───────┘                   │
│                               │                            │
│  ┌──────────────┐             │        ┌────────────────┐ │
│  │ executeCode  │─────────────┴───────>│ TokenDatabase │ │
│  │  (Tools)     │                      │   (SQLite)    │ │
│  └──────────────┘                      └────────┬───────┘ │
│                                                 │          │
└─────────────────────────────────────────────────┼──────────┘
                                                  │
                    ┌─────────────────────────────┼─────────────┐
                    │                             ▼             │
        ┌───────────┴──────────┐    ┌──────────────────────┐   │
        │  CLI Token Inspector │    │ Web UI Token Inspector│   │
        │  - Dashboard         │    │ - React Dashboard     │   │
        │  - Export            │    │ - Charts (Recharts)   │   │
        │  - Alerts            │    │ - Export              │   │
        └──────────────────────┘    └───────────────────────┘   │
                                                                 │
                                    ┌──────────────────────┐     │
                                    │  Token Inspector API │     │
                                    │  - Query             │     │
                                    │  - Aggregate         │     │
                                    │  - Export            │     │
                                    └──────────────────────┘     │
                                                                 │
                                Token Inspector Layer            │
                                                                 │
                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### High-Level Flow

```
1. LLM Request
   └─> streamChat() intercepts request
       └─> TokenTracker.trackRequest(metadata)
           └─> countTokens(messages, tools)
               └─> TokenDatabase.insert(record)

2. Tool Execution
   └─> executeCode() / callTool() intercepts
       └─> TokenTracker.trackToolCall(metadata)
           └─> countToolsTokens(schemas)
               └─> TokenDatabase.insert(record)

3. Context Pruning
   └─> compileChatMessages() detects pruning
       └─> TokenTracker.trackPruning(prunedMessages)
           └─> TokenDatabase.insert(pruningEvent)

4. User Query
   └─> TokenInspectorAPI.query(filters)
       └─> TokenDatabase.query(sql)
           └─> Aggregate & format results
               └─> Return to UI/CLI
```

---

## Data Model

### Database Schema (SQLite)

#### Table: `token_requests`

Stores individual LLM requests with token counts.

```sql
CREATE TABLE token_requests (
  -- Identifiers
  id TEXT PRIMARY KEY,              -- UUID v4
  conversation_id TEXT NOT NULL,    -- Links to conversation
  session_id TEXT NOT NULL,         -- Links to Code Mode session
  parent_request_id TEXT,           -- For chained requests

  -- Timestamps
  timestamp INTEGER NOT NULL,       -- Unix timestamp (ms)
  duration_ms INTEGER,              -- Request duration

  -- Model Information
  provider TEXT NOT NULL,           -- 'anthropic', 'openai', 'groq', etc.
  model TEXT NOT NULL,              -- 'claude-3-5-sonnet-20241022', etc.

  -- Token Counts
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  total_tokens INTEGER NOT NULL,

  -- Anthropic Caching (nullable for non-Anthropic models)
  cache_creation_tokens INTEGER,    -- Tokens written to cache
  cache_read_tokens INTEGER,        -- Tokens read from cache

  -- Cost
  cost_usd REAL,                    -- Total cost in USD

  -- Breakdown (JSON)
  token_breakdown TEXT,             -- JSON: {system, tools, user, assistant}

  -- Context Window
  context_length INTEGER,           -- Model's max context
  context_utilization REAL,         -- Percentage (0.0-1.0)
  messages_pruned INTEGER DEFAULT 0,

  -- Request Type
  request_type TEXT NOT NULL,       -- 'user', 'tool', 'system', 'assistant'

  -- Metadata
  metadata TEXT,                    -- JSON: additional context

  -- Indexes
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE INDEX idx_requests_conversation ON token_requests(conversation_id);
CREATE INDEX idx_requests_timestamp ON token_requests(timestamp);
CREATE INDEX idx_requests_model ON token_requests(model);
CREATE INDEX idx_requests_session ON token_requests(session_id);
```

**Example Record**:
```json
{
  "id": "req_abc123",
  "conversation_id": "conv_xyz789",
  "session_id": "sess_2025111701",
  "timestamp": 1731859200000,
  "duration_ms": 1247,
  "provider": "anthropic",
  "model": "claude-3-5-sonnet-20241022",
  "input_tokens": 2941,
  "output_tokens": 901,
  "total_tokens": 3842,
  "cache_creation_tokens": 0,
  "cache_read_tokens": 2105,
  "cost_usd": 0.058,
  "token_breakdown": {
    "system_prompt": 234,
    "tools": 1823,
    "user_message": 884,
    "assistant": 901
  },
  "context_length": 200000,
  "context_utilization": 0.387,
  "messages_pruned": 3,
  "request_type": "user"
}
```

---

#### Table: `tool_usage`

Tracks token consumption per MCP tool.

```sql
CREATE TABLE tool_usage (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,         -- Links to token_requests
  timestamp INTEGER NOT NULL,

  -- Tool Information
  tool_server TEXT NOT NULL,        -- 'github', 'filesystem', etc.
  tool_name TEXT NOT NULL,          -- 'createIssue', 'readFile', etc.
  tool_full_name TEXT NOT NULL,     -- 'github.createIssue'

  -- Token Attribution
  schema_tokens INTEGER NOT NULL,   -- Tokens from tool schema
  input_tokens INTEGER NOT NULL,    -- Tokens in tool arguments
  output_tokens INTEGER NOT NULL,   -- Tokens in tool response
  total_tokens INTEGER NOT NULL,

  -- Execution
  execution_time_ms INTEGER,
  success BOOLEAN NOT NULL,
  error_message TEXT,

  FOREIGN KEY (request_id) REFERENCES token_requests(id)
);

CREATE INDEX idx_tool_usage_request ON tool_usage(request_id);
CREATE INDEX idx_tool_usage_name ON tool_usage(tool_full_name);
CREATE INDEX idx_tool_usage_timestamp ON tool_usage(timestamp);
```

---

#### Table: `conversations`

Metadata about conversations for grouping.

```sql
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,

  -- Aggregate Stats (updated on each request)
  total_requests INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  total_cost_usd REAL DEFAULT 0.0,

  -- Metadata
  title TEXT,                       -- User-provided or auto-generated
  tags TEXT,                        -- JSON array: ['debugging', 'feature-xyz']

  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE INDEX idx_conversations_session ON conversations(session_id);
CREATE INDEX idx_conversations_started ON conversations(started_at);
```

---

#### Table: `pruning_events`

Tracks when messages are pruned from context.

```sql
CREATE TABLE pruning_events (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,

  -- Pruning Details
  messages_pruned INTEGER NOT NULL,
  tokens_pruned INTEGER NOT NULL,
  pruning_reason TEXT NOT NULL,     -- 'context_limit', 'retention_policy'

  -- Pruned Message IDs (JSON array)
  pruned_message_ids TEXT,          -- ['msg_1', 'msg_2', ...]

  FOREIGN KEY (request_id) REFERENCES token_requests(id)
);

CREATE INDEX idx_pruning_request ON pruning_events(request_id);
CREATE INDEX idx_pruning_timestamp ON pruning_events(timestamp);
```

---

#### Table: `sessions`

High-level session metadata.

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,

  -- Environment
  client_type TEXT NOT NULL,        -- 'cli', 'vscode', 'intellij', 'web'
  os_platform TEXT,                 -- 'darwin', 'linux', 'win32'
  code_mode_version TEXT,

  -- Aggregate Stats
  total_conversations INTEGER DEFAULT 0,
  total_requests INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  total_cost_usd REAL DEFAULT 0.0
);

CREATE INDEX idx_sessions_started ON sessions(started_at);
```

---

#### Table: `alerts`

Stores triggered alerts.

```sql
CREATE TABLE alerts (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,

  -- Alert Details
  alert_type TEXT NOT NULL,         -- 'high_single_request', 'hourly_limit', etc.
  severity TEXT NOT NULL,           -- 'info', 'warning', 'critical'
  message TEXT NOT NULL,

  -- Context
  request_id TEXT,                  -- Optional link to request
  threshold_value REAL,             -- Configured threshold
  actual_value REAL,                -- Actual value that triggered alert

  -- Status
  acknowledged BOOLEAN DEFAULT 0,
  acknowledged_at INTEGER,

  FOREIGN KEY (request_id) REFERENCES token_requests(id)
);

CREATE INDEX idx_alerts_timestamp ON alerts(timestamp);
CREATE INDEX idx_alerts_type ON alerts(alert_type);
CREATE INDEX idx_alerts_acknowledged ON alerts(acknowledged);
```

---

### Data Retention Policy

```typescript
interface RetentionPolicy {
  defaultRetentionDays: 90;

  // Different retention for different data types
  retentionRules: {
    token_requests: 90,      // 90 days
    tool_usage: 90,
    conversations: 180,      // Keep conversation metadata longer
    pruning_events: 30,      // Less critical, shorter retention
    alerts: 365,             // Keep for long-term analysis
  };

  // Aggregation before deletion
  aggregateBeforeDelete: true;  // Create daily summaries
}
```

**Cleanup Query** (runs daily via cron):
```sql
-- Archive to aggregated table before deleting
INSERT INTO token_requests_daily_summary
SELECT
  DATE(timestamp / 1000, 'unixepoch') as date,
  provider,
  model,
  COUNT(*) as request_count,
  SUM(input_tokens) as total_input_tokens,
  SUM(output_tokens) as total_output_tokens,
  SUM(cost_usd) as total_cost
FROM token_requests
WHERE timestamp < ?  -- 90 days ago
GROUP BY date, provider, model;

-- Then delete old records
DELETE FROM token_requests
WHERE timestamp < ?;  -- 90 days ago
```

---

## Core Components

### 1. TokenTracker Service

**Location**: `/core/util/TokenTracker.ts`

**Purpose**: Central service for tracking all token-related events.

```typescript
import { v4 as uuidv4 } from 'uuid';
import { TokenDatabase } from './TokenDatabase';
import { countTokens } from '../llm/countTokens';
import { calculateRequestCost } from '../llm/utils/calculateRequestCost';

export interface TrackRequestOptions {
  conversationId: string;
  sessionId: string;
  provider: string;
  model: string;
  messages: any[];
  tools?: any[];
  response: {
    content: string;
    usage?: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
  duration: number;
  contextLength?: number;
  messagesPruned?: number;
  requestType?: 'user' | 'tool' | 'system' | 'assistant';
}

export class TokenTracker {
  private db: TokenDatabase;
  private enabled: boolean;

  constructor(dbPath?: string) {
    this.db = new TokenDatabase(dbPath);
    this.enabled = true; // TODO: Read from config
  }

  /**
   * Track a single LLM request
   */
  async trackRequest(options: TrackRequestOptions): Promise<string> {
    if (!this.enabled) return '';

    const requestId = uuidv4();

    // Count tokens if not provided by API
    let inputTokens = options.response.usage?.input_tokens;
    let outputTokens = options.response.usage?.output_tokens;

    if (!inputTokens || !outputTokens) {
      const counted = await countTokens({
        messages: options.messages,
        modelName: options.model,
        tools: options.tools,
      });
      inputTokens = counted.inputTokens;
      outputTokens = counted.outputTokens;
    }

    // Calculate token breakdown
    const breakdown = await this.calculateBreakdown(
      options.messages,
      options.tools,
      options.model
    );

    // Calculate cost
    const cost = calculateRequestCost({
      model: options.model,
      inputTokens,
      outputTokens,
      cacheCreationTokens: options.response.usage?.cache_creation_input_tokens,
      cacheReadTokens: options.response.usage?.cache_read_input_tokens,
    });

    // Calculate context utilization
    const contextLength = options.contextLength || this.getContextLength(options.model);
    const contextUtilization = (inputTokens + outputTokens) / contextLength;

    // Insert into database
    await this.db.insertRequest({
      id: requestId,
      conversationId: options.conversationId,
      sessionId: options.sessionId,
      timestamp: Date.now(),
      duration: options.duration,
      provider: options.provider,
      model: options.model,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      cacheCreationTokens: options.response.usage?.cache_creation_input_tokens,
      cacheReadTokens: options.response.usage?.cache_read_input_tokens,
      costUsd: cost.cost,
      tokenBreakdown: breakdown,
      contextLength,
      contextUtilization,
      messagesPruned: options.messagesPruned || 0,
      requestType: options.requestType || 'user',
    });

    // Check for alerts
    await this.checkAlerts(requestId, inputTokens + outputTokens, contextUtilization);

    return requestId;
  }

  /**
   * Track a tool call
   */
  async trackToolCall(requestId: string, options: {
    toolServer: string;
    toolName: string;
    schemaTokens: number;
    inputTokens: number;
    outputTokens: number;
    executionTime: number;
    success: boolean;
    error?: string;
  }): Promise<void> {
    if (!this.enabled) return;

    await this.db.insertToolUsage({
      id: uuidv4(),
      requestId,
      timestamp: Date.now(),
      toolServer: options.toolServer,
      toolName: options.toolName,
      toolFullName: `${options.toolServer}.${options.toolName}`,
      schemaTokens: options.schemaTokens,
      inputTokens: options.inputTokens,
      outputTokens: options.outputTokens,
      totalTokens: options.schemaTokens + options.inputTokens + options.outputTokens,
      executionTimeMs: options.executionTime,
      success: options.success,
      errorMessage: options.error,
    });
  }

  /**
   * Track context pruning
   */
  async trackPruning(requestId: string, options: {
    messagesPruned: number;
    tokensPruned: number;
    reason: string;
    prunedMessageIds: string[];
  }): Promise<void> {
    if (!this.enabled) return;

    await this.db.insertPruningEvent({
      id: uuidv4(),
      requestId,
      timestamp: Date.now(),
      messagesPruned: options.messagesPruned,
      tokensPruned: options.tokensPruned,
      pruningReason: options.reason,
      prunedMessageIds: JSON.stringify(options.prunedMessageIds),
    });
  }

  /**
   * Calculate detailed token breakdown
   */
  private async calculateBreakdown(
    messages: any[],
    tools: any[] | undefined,
    model: string
  ): Promise<Record<string, number>> {
    const breakdown: Record<string, number> = {
      system_prompt: 0,
      tools: 0,
      user_message: 0,
      assistant: 0,
    };

    // Count system prompt
    const systemMsg = messages.find(m => m.role === 'system');
    if (systemMsg) {
      breakdown.system_prompt = await countTokens({
        messages: [systemMsg],
        modelName: model,
      }).then(r => r.inputTokens);
    }

    // Count tools
    if (tools && tools.length > 0) {
      const { countToolsTokens } = await import('../llm/countTokens');
      breakdown.tools = await countToolsTokens(tools, model);
    }

    // Count user messages
    const userMsgs = messages.filter(m => m.role === 'user');
    if (userMsgs.length > 0) {
      breakdown.user_message = await countTokens({
        messages: userMsgs,
        modelName: model,
      }).then(r => r.inputTokens);
    }

    // Count assistant messages
    const assistantMsgs = messages.filter(m => m.role === 'assistant');
    if (assistantMsgs.length > 0) {
      breakdown.assistant = await countTokens({
        messages: assistantMsgs,
        modelName: model,
      }).then(r => r.inputTokens);
    }

    return breakdown;
  }

  /**
   * Get context length for model
   */
  private getContextLength(model: string): number {
    // TODO: Use llm-info package for accurate context lengths
    const contextLengths: Record<string, number> = {
      'claude-3-5-sonnet-20241022': 200000,
      'claude-3-5-haiku-20241022': 200000,
      'gpt-4o': 128000,
      'gpt-4o-mini': 128000,
      'gemini-2.0-flash-exp': 1000000,
    };

    return contextLengths[model] || 128000; // Default fallback
  }

  /**
   * Check if any alerts should be triggered
   */
  private async checkAlerts(
    requestId: string,
    totalTokens: number,
    contextUtilization: number
  ): Promise<void> {
    const config = await this.getAlertConfig();

    // High single request alert
    if (config.highSingleRequest && totalTokens > config.highSingleRequest) {
      await this.db.insertAlert({
        id: uuidv4(),
        timestamp: Date.now(),
        alertType: 'high_single_request',
        severity: 'warning',
        message: `Request used ${totalTokens} tokens (threshold: ${config.highSingleRequest})`,
        requestId,
        thresholdValue: config.highSingleRequest,
        actualValue: totalTokens,
        acknowledged: false,
      });
    }

    // High context utilization alert
    if (config.contextUtilization && contextUtilization > config.contextUtilization) {
      await this.db.insertAlert({
        id: uuidv4(),
        timestamp: Date.now(),
        alertType: 'context_utilization',
        severity: 'warning',
        message: `Context utilization at ${(contextUtilization * 100).toFixed(1)}% (threshold: ${(config.contextUtilization * 100).toFixed(0)}%)`,
        requestId,
        thresholdValue: config.contextUtilization,
        actualValue: contextUtilization,
        acknowledged: false,
      });
    }
  }

  /**
   * Get alert configuration from config file
   */
  private async getAlertConfig(): Promise<{
    highSingleRequest?: number;
    hourlyLimit?: number;
    contextUtilization?: number;
  }> {
    // TODO: Read from .continue/config.yaml
    return {
      highSingleRequest: 10000,
      contextUtilization: 0.95,
    };
  }

  /**
   * Update conversation aggregates
   */
  async updateConversationStats(conversationId: string): Promise<void> {
    await this.db.updateConversationAggregates(conversationId);
  }

  /**
   * Enable/disable tracking
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
}
```

---

### 2. TokenDatabase Service

**Location**: `/core/util/TokenDatabase.ts`

**Purpose**: SQLite database abstraction for token data.

```typescript
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export interface TokenRequest {
  id: string;
  conversationId: string;
  sessionId: string;
  timestamp: number;
  duration?: number;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  costUsd?: number;
  tokenBreakdown?: Record<string, number>;
  contextLength?: number;
  contextUtilization?: number;
  messagesPruned?: number;
  requestType: string;
  metadata?: any;
}

export class TokenDatabase {
  private db: Database.Database;
  private dbPath: string;

  constructor(dbPath?: string) {
    // Default to ~/.continue/token-inspector.db
    this.dbPath = dbPath || path.join(
      process.env.HOME || process.env.USERPROFILE || '',
      '.continue',
      'token-inspector.db'
    );

    // Ensure directory exists
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Open database
    this.db = new Database(this.dbPath);

    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');

    // Initialize schema
    this.initSchema();
  }

  /**
   * Initialize database schema
   */
  private initSchema(): void {
    // Create tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        client_type TEXT NOT NULL,
        os_platform TEXT,
        code_mode_version TEXT,
        total_conversations INTEGER DEFAULT 0,
        total_requests INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        total_cost_usd REAL DEFAULT 0.0
      );

      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        total_requests INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        total_cost_usd REAL DEFAULT 0.0,
        title TEXT,
        tags TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      );

      CREATE TABLE IF NOT EXISTS token_requests (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        parent_request_id TEXT,
        timestamp INTEGER NOT NULL,
        duration_ms INTEGER,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        input_tokens INTEGER NOT NULL,
        output_tokens INTEGER NOT NULL,
        total_tokens INTEGER NOT NULL,
        cache_creation_tokens INTEGER,
        cache_read_tokens INTEGER,
        cost_usd REAL,
        token_breakdown TEXT,
        context_length INTEGER,
        context_utilization REAL,
        messages_pruned INTEGER DEFAULT 0,
        request_type TEXT NOT NULL,
        metadata TEXT,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id)
      );

      CREATE TABLE IF NOT EXISTS tool_usage (
        id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        tool_server TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        tool_full_name TEXT NOT NULL,
        schema_tokens INTEGER NOT NULL,
        input_tokens INTEGER NOT NULL,
        output_tokens INTEGER NOT NULL,
        total_tokens INTEGER NOT NULL,
        execution_time_ms INTEGER,
        success BOOLEAN NOT NULL,
        error_message TEXT,
        FOREIGN KEY (request_id) REFERENCES token_requests(id)
      );

      CREATE TABLE IF NOT EXISTS pruning_events (
        id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        messages_pruned INTEGER NOT NULL,
        tokens_pruned INTEGER NOT NULL,
        pruning_reason TEXT NOT NULL,
        pruned_message_ids TEXT,
        FOREIGN KEY (request_id) REFERENCES token_requests(id)
      );

      CREATE TABLE IF NOT EXISTS alerts (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        alert_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        message TEXT NOT NULL,
        request_id TEXT,
        threshold_value REAL,
        actual_value REAL,
        acknowledged BOOLEAN DEFAULT 0,
        acknowledged_at INTEGER,
        FOREIGN KEY (request_id) REFERENCES token_requests(id)
      );
    `);

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_requests_conversation ON token_requests(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_requests_timestamp ON token_requests(timestamp);
      CREATE INDEX IF NOT EXISTS idx_requests_model ON token_requests(model);
      CREATE INDEX IF NOT EXISTS idx_requests_session ON token_requests(session_id);
      CREATE INDEX IF NOT EXISTS idx_tool_usage_request ON tool_usage(request_id);
      CREATE INDEX IF NOT EXISTS idx_tool_usage_name ON tool_usage(tool_full_name);
      CREATE INDEX IF NOT EXISTS idx_tool_usage_timestamp ON tool_usage(timestamp);
      CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations(session_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_started ON conversations(started_at);
      CREATE INDEX IF NOT EXISTS idx_pruning_request ON pruning_events(request_id);
      CREATE INDEX IF NOT EXISTS idx_pruning_timestamp ON pruning_events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_alerts_timestamp ON alerts(timestamp);
      CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts(alert_type);
      CREATE INDEX IF NOT EXISTS idx_alerts_acknowledged ON alerts(acknowledged);
      CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at);
    `);
  }

  /**
   * Insert a token request record
   */
  insertRequest(request: TokenRequest): void {
    const stmt = this.db.prepare(`
      INSERT INTO token_requests (
        id, conversation_id, session_id, timestamp, duration_ms,
        provider, model, input_tokens, output_tokens, total_tokens,
        cache_creation_tokens, cache_read_tokens, cost_usd,
        token_breakdown, context_length, context_utilization,
        messages_pruned, request_type
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `);

    stmt.run(
      request.id,
      request.conversationId,
      request.sessionId,
      request.timestamp,
      request.duration,
      request.provider,
      request.model,
      request.inputTokens,
      request.outputTokens,
      request.totalTokens,
      request.cacheCreationTokens,
      request.cacheReadTokens,
      request.costUsd,
      request.tokenBreakdown ? JSON.stringify(request.tokenBreakdown) : null,
      request.contextLength,
      request.contextUtilization,
      request.messagesPruned,
      request.requestType
    );
  }

  /**
   * Insert tool usage record
   */
  insertToolUsage(tool: any): void {
    const stmt = this.db.prepare(`
      INSERT INTO tool_usage (
        id, request_id, timestamp, tool_server, tool_name, tool_full_name,
        schema_tokens, input_tokens, output_tokens, total_tokens,
        execution_time_ms, success, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      tool.id,
      tool.requestId,
      tool.timestamp,
      tool.toolServer,
      tool.toolName,
      tool.toolFullName,
      tool.schemaTokens,
      tool.inputTokens,
      tool.outputTokens,
      tool.totalTokens,
      tool.executionTimeMs,
      tool.success ? 1 : 0,
      tool.errorMessage
    );
  }

  /**
   * Insert pruning event
   */
  insertPruningEvent(event: any): void {
    const stmt = this.db.prepare(`
      INSERT INTO pruning_events (
        id, request_id, timestamp, messages_pruned, tokens_pruned,
        pruning_reason, pruned_message_ids
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      event.id,
      event.requestId,
      event.timestamp,
      event.messagesPruned,
      event.tokensPruned,
      event.pruningReason,
      event.prunedMessageIds
    );
  }

  /**
   * Insert alert
   */
  insertAlert(alert: any): void {
    const stmt = this.db.prepare(`
      INSERT INTO alerts (
        id, timestamp, alert_type, severity, message,
        request_id, threshold_value, actual_value, acknowledged
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      alert.id,
      alert.timestamp,
      alert.alertType,
      alert.severity,
      alert.message,
      alert.requestId,
      alert.thresholdValue,
      alert.actualValue,
      alert.acknowledged ? 1 : 0
    );
  }

  /**
   * Query requests with filters
   */
  queryRequests(filters: {
    conversationId?: string;
    sessionId?: string;
    startTime?: number;
    endTime?: number;
    provider?: string;
    model?: string;
    limit?: number;
    offset?: number;
  }): TokenRequest[] {
    let sql = 'SELECT * FROM token_requests WHERE 1=1';
    const params: any[] = [];

    if (filters.conversationId) {
      sql += ' AND conversation_id = ?';
      params.push(filters.conversationId);
    }

    if (filters.sessionId) {
      sql += ' AND session_id = ?';
      params.push(filters.sessionId);
    }

    if (filters.startTime) {
      sql += ' AND timestamp >= ?';
      params.push(filters.startTime);
    }

    if (filters.endTime) {
      sql += ' AND timestamp <= ?';
      params.push(filters.endTime);
    }

    if (filters.provider) {
      sql += ' AND provider = ?';
      params.push(filters.provider);
    }

    if (filters.model) {
      sql += ' AND model = ?';
      params.push(filters.model);
    }

    sql += ' ORDER BY timestamp DESC';

    if (filters.limit) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
    }

    if (filters.offset) {
      sql += ' OFFSET ?';
      params.push(filters.offset);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];

    return rows.map(row => ({
      id: row.id,
      conversationId: row.conversation_id,
      sessionId: row.session_id,
      timestamp: row.timestamp,
      duration: row.duration_ms,
      provider: row.provider,
      model: row.model,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      totalTokens: row.total_tokens,
      cacheCreationTokens: row.cache_creation_tokens,
      cacheReadTokens: row.cache_read_tokens,
      costUsd: row.cost_usd,
      tokenBreakdown: row.token_breakdown ? JSON.parse(row.token_breakdown) : undefined,
      contextLength: row.context_length,
      contextUtilization: row.context_utilization,
      messagesPruned: row.messages_pruned,
      requestType: row.request_type,
    }));
  }

  /**
   * Get aggregated stats
   */
  getAggregateStats(filters: {
    conversationId?: string;
    sessionId?: string;
    startTime?: number;
    endTime?: number;
  }): {
    totalRequests: number;
    totalTokens: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCacheReadTokens: number;
    totalCost: number;
    avgTokensPerRequest: number;
    avgCost: number;
  } {
    let sql = `
      SELECT
        COUNT(*) as total_requests,
        SUM(total_tokens) as total_tokens,
        SUM(input_tokens) as total_input_tokens,
        SUM(output_tokens) as total_output_tokens,
        SUM(COALESCE(cache_read_tokens, 0)) as total_cache_read_tokens,
        SUM(COALESCE(cost_usd, 0)) as total_cost,
        AVG(total_tokens) as avg_tokens_per_request,
        AVG(COALESCE(cost_usd, 0)) as avg_cost
      FROM token_requests
      WHERE 1=1
    `;

    const params: any[] = [];

    if (filters.conversationId) {
      sql += ' AND conversation_id = ?';
      params.push(filters.conversationId);
    }

    if (filters.sessionId) {
      sql += ' AND session_id = ?';
      params.push(filters.sessionId);
    }

    if (filters.startTime) {
      sql += ' AND timestamp >= ?';
      params.push(filters.startTime);
    }

    if (filters.endTime) {
      sql += ' AND timestamp <= ?';
      params.push(filters.endTime);
    }

    const stmt = this.db.prepare(sql);
    const result = stmt.get(...params) as any;

    return {
      totalRequests: result.total_requests || 0,
      totalTokens: result.total_tokens || 0,
      totalInputTokens: result.total_input_tokens || 0,
      totalOutputTokens: result.total_output_tokens || 0,
      totalCacheReadTokens: result.total_cache_read_tokens || 0,
      totalCost: result.total_cost || 0,
      avgTokensPerRequest: result.avg_tokens_per_request || 0,
      avgCost: result.avg_cost || 0,
    };
  }

  /**
   * Get tool usage aggregated by tool
   */
  getToolAggregates(filters: {
    startTime?: number;
    endTime?: number;
  }): Array<{
    toolFullName: string;
    toolServer: string;
    toolName: string;
    callCount: number;
    totalTokens: number;
    avgTokens: number;
    schemaTokens: number;
    dataTokens: number;
  }> {
    let sql = `
      SELECT
        tool_full_name,
        tool_server,
        tool_name,
        COUNT(*) as call_count,
        SUM(total_tokens) as total_tokens,
        AVG(total_tokens) as avg_tokens,
        AVG(schema_tokens) as schema_tokens,
        AVG(input_tokens + output_tokens) as data_tokens
      FROM tool_usage
      WHERE 1=1
    `;

    const params: any[] = [];

    if (filters.startTime) {
      sql += ' AND timestamp >= ?';
      params.push(filters.startTime);
    }

    if (filters.endTime) {
      sql += ' AND timestamp <= ?';
      params.push(filters.endTime);
    }

    sql += ' GROUP BY tool_full_name ORDER BY total_tokens DESC';

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];

    return rows.map(row => ({
      toolFullName: row.tool_full_name,
      toolServer: row.tool_server,
      toolName: row.tool_name,
      callCount: row.call_count,
      totalTokens: row.total_tokens,
      avgTokens: row.avg_tokens,
      schemaTokens: row.schema_tokens,
      dataTokens: row.data_tokens,
    }));
  }

  /**
   * Update conversation aggregates
   */
  updateConversationAggregates(conversationId: string): void {
    const stmt = this.db.prepare(`
      UPDATE conversations
      SET
        total_requests = (SELECT COUNT(*) FROM token_requests WHERE conversation_id = ?),
        total_tokens = (SELECT SUM(total_tokens) FROM token_requests WHERE conversation_id = ?),
        total_cost_usd = (SELECT SUM(COALESCE(cost_usd, 0)) FROM token_requests WHERE conversation_id = ?)
      WHERE id = ?
    `);

    stmt.run(conversationId, conversationId, conversationId, conversationId);
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}
```

---

### 3. Integration Points

#### A. Integration with `streamChat()`

**Location**: `/core/llm/streamChat.ts`

**Changes**:

```typescript
import { TokenTracker } from '../util/TokenTracker';

export async function* streamChat(/* ... existing params ... */) {
  const tokenTracker = new TokenTracker();
  const startTime = Date.now();

  // ... existing streaming logic ...

  // After receiving final response
  const duration = Date.now() - startTime;

  // Track the request
  await tokenTracker.trackRequest({
    conversationId: /* extract from context */,
    sessionId: /* extract from session */,
    provider: llm.providerName,
    model: llm.model,
    messages: /* compiled messages */,
    tools: input.tools,
    response: finalResponse,
    duration,
    contextLength: llm.contextLength,
    messagesPruned: compiledResult.didPrune ? compiledResult.prunedCount : 0,
    requestType: 'user',
  });

  yield finalResponse;
}
```

#### B. Integration with `compileChatMessages()`

**Location**: `/core/llm/countTokens.ts`

**Changes**:

```typescript
export async function compileChatMessages(/* ... */) {
  // ... existing pruning logic ...

  if (didPrune) {
    const tokenTracker = new TokenTracker();

    // Track pruning event
    await tokenTracker.trackPruning(currentRequestId, {
      messagesPruned: prunedMessages.length,
      tokensPruned: totalPrunedTokens,
      reason: 'context_limit',
      prunedMessageIds: prunedMessages.map(m => m.id),
    });
  }

  return { compiledChatMessages, didPrune, /* ... */ };
}
```

#### C. Integration with `executeCode()`

**Location**: `/core/tools/implementations/executeCode.ts`

**Changes**:

```typescript
export async function executeCode(/* ... */) {
  const tokenTracker = new TokenTracker();
  const startTime = Date.now();

  // ... existing execution logic ...

  // Track tool calls made within code execution
  for (const toolCall of mcpToolCalls) {
    const schemaTokens = await countToolsTokens([toolCall.schema], model);
    const inputTokens = await countTokens({
      messages: [{ role: 'user', content: JSON.stringify(toolCall.input) }],
      modelName: model
    });
    const outputTokens = await countTokens({
      messages: [{ role: 'assistant', content: JSON.stringify(toolCall.output) }],
      modelName: model
    });

    await tokenTracker.trackToolCall(requestId, {
      toolServer: toolCall.server,
      toolName: toolCall.name,
      schemaTokens: schemaTokens,
      inputTokens: inputTokens.inputTokens,
      outputTokens: outputTokens.inputTokens,
      executionTime: toolCall.duration,
      success: toolCall.success,
      error: toolCall.error,
    });
  }

  return result;
}
```

---

## API Specifications

### REST API (for Web UI)

**Base URL**: `/api/token-inspector`

#### GET `/api/token-inspector/stats`

Get aggregate statistics.

**Query Parameters**:
- `conversationId` (optional): Filter by conversation
- `sessionId` (optional): Filter by session
- `startTime` (optional): Unix timestamp (ms)
- `endTime` (optional): Unix timestamp (ms)

**Response**:
```json
{
  "totalRequests": 142,
  "totalTokens": 245831,
  "totalInputTokens": 189234,
  "totalOutputTokens": 56597,
  "totalCacheReadTokens": 123456,
  "totalCost": 1.87,
  "avgTokensPerRequest": 1729,
  "avgCost": 0.013,
  "cacheHitRate": 0.652
}
```

#### GET `/api/token-inspector/requests`

Get list of requests.

**Query Parameters**:
- `conversationId`, `sessionId`, `startTime`, `endTime` (same as above)
- `provider` (optional): Filter by provider
- `model` (optional): Filter by model
- `limit` (optional): Max records (default: 100)
- `offset` (optional): Pagination offset

**Response**:
```json
{
  "requests": [
    {
      "id": "req_abc123",
      "conversationId": "conv_xyz789",
      "timestamp": 1731859200000,
      "provider": "anthropic",
      "model": "claude-3-5-sonnet-20241022",
      "inputTokens": 2941,
      "outputTokens": 901,
      "totalTokens": 3842,
      "cacheReadTokens": 2105,
      "costUsd": 0.058,
      "contextUtilization": 0.387
    }
  ],
  "total": 142,
  "limit": 100,
  "offset": 0
}
```

#### GET `/api/token-inspector/requests/:id`

Get detailed request information.

**Response**:
```json
{
  "id": "req_abc123",
  "conversationId": "conv_xyz789",
  "sessionId": "sess_2025111701",
  "timestamp": 1731859200000,
  "duration": 1247,
  "provider": "anthropic",
  "model": "claude-3-5-sonnet-20241022",
  "inputTokens": 2941,
  "outputTokens": 901,
  "totalTokens": 3842,
  "cacheCreationTokens": 0,
  "cacheReadTokens": 2105,
  "costUsd": 0.058,
  "tokenBreakdown": {
    "system_prompt": 234,
    "tools": 1823,
    "user_message": 884,
    "assistant": 901
  },
  "contextLength": 200000,
  "contextUtilization": 0.387,
  "messagesPruned": 3,
  "requestType": "user",
  "toolCalls": [
    {
      "toolFullName": "github.listIssues",
      "totalTokens": 1234,
      "executionTimeMs": 452
    }
  ],
  "pruningEvents": [
    {
      "messagesPruned": 3,
      "tokensPruned": 1245,
      "reason": "context_limit"
    }
  ]
}
```

#### GET `/api/token-inspector/tools`

Get aggregated tool usage.

**Query Parameters**:
- `startTime`, `endTime` (optional)

**Response**:
```json
{
  "tools": [
    {
      "toolFullName": "github.listIssues",
      "toolServer": "github",
      "toolName": "listIssues",
      "callCount": 14,
      "totalTokens": 18234,
      "avgTokens": 1302,
      "schemaTokens": 412,
      "dataTokens": 890
    }
  ]
}
```

#### GET `/api/token-inspector/export`

Export data in various formats.

**Query Parameters**:
- Same filters as `/requests`
- `format`: `csv` | `json` (default: `json`)

**Response** (CSV):
```csv
id,timestamp,provider,model,input_tokens,output_tokens,total_tokens,cost_usd
req_abc123,1731859200000,anthropic,claude-3-5-sonnet-20241022,2941,901,3842,0.058
```

#### GET `/api/token-inspector/alerts`

Get active alerts.

**Query Parameters**:
- `acknowledged` (optional): `true` | `false`
- `severity` (optional): `info` | `warning` | `critical`

**Response**:
```json
{
  "alerts": [
    {
      "id": "alert_123",
      "timestamp": 1731859200000,
      "alertType": "high_single_request",
      "severity": "warning",
      "message": "Request used 12345 tokens (threshold: 10000)",
      "requestId": "req_abc123",
      "acknowledged": false
    }
  ]
}
```

#### POST `/api/token-inspector/alerts/:id/acknowledge`

Mark an alert as acknowledged.

**Response**:
```json
{
  "success": true
}
```

---

## Implementation Details

### Phase 1: MVP (Weeks 1-3)

#### Week 1: Core Infrastructure

**Tasks**:
1. Create `TokenTracker` service
2. Create `TokenDatabase` service with SQLite schema
3. Add configuration options to `config.yaml`
4. Write unit tests for both services

**Deliverables**:
- [ ] `/core/util/TokenTracker.ts` (full implementation)
- [ ] `/core/util/TokenDatabase.ts` (full implementation)
- [ ] Schema migration scripts
- [ ] Unit tests with >90% coverage

#### Week 2: Integration

**Tasks**:
1. Integrate `TokenTracker` into `streamChat()`
2. Integrate into `compileChatMessages()` for pruning events
3. Integrate into `executeCode()` for tool tracking
4. Add telemetry opt-in/opt-out

**Deliverables**:
- [ ] Modified `core/llm/streamChat.ts`
- [ ] Modified `core/llm/countTokens.ts`
- [ ] Modified `core/tools/implementations/executeCode.ts`
- [ ] Integration tests

#### Week 3: CLI Dashboard

**Tasks**:
1. Create CLI command: `code-mode tokens`
2. Implement ASCII dashboard using `ink`
3. Implement CSV export
4. Add filtering options

**Deliverables**:
- [ ] `/extensions/cli/src/commands/tokens.ts`
- [ ] Interactive dashboard
- [ ] Export functionality
- [ ] User documentation

---

### Phase 2: Enhanced UI (Weeks 4-6)

#### Week 4: Web UI Foundation

**Tasks**:
1. Create Token Inspector API endpoints
2. Create React components for dashboard
3. Integrate with existing GUI

**Deliverables**:
- [ ] `/gui/src/api/tokenInspector.ts`
- [ ] `/gui/src/pages/TokenInspector.tsx`
- [ ] Basic dashboard layout

#### Week 5: Visualizations

**Tasks**:
1. Implement timeline chart (Recharts)
2. Implement request detail modal
3. Implement tool attribution table
4. Add filtering and search

**Deliverables**:
- [ ] Interactive charts
- [ ] Detailed request view
- [ ] Tool aggregation view
- [ ] Filter/search UI

#### Week 6: Cache Inspector

**Tasks**:
1. Add cache-specific metrics collection
2. Create cache efficiency score calculation
3. Build cache inspector UI (Anthropic only)

**Deliverables**:
- [ ] Cache hit/miss tracking
- [ ] Cache efficiency dashboard
- [ ] Cost comparison view

---

### Phase 3: Intelligence (Weeks 7-9)

#### Week 7: Alerts System

**Tasks**:
1. Implement alert checking logic
2. Create alert configuration in YAML
3. Build alerts UI
4. Add notification webhooks

**Deliverables**:
- [ ] Alert detection in `TokenTracker`
- [ ] Alert configuration schema
- [ ] Alerts dashboard
- [ ] Slack/webhook integration

#### Week 8: Conversation Replay

**Tasks**:
1. Implement timeline scrubber
2. Add cumulative stats calculation
3. Build replay UI

**Deliverables**:
- [ ] Replay API endpoints
- [ ] Timeline scrubber component
- [ ] Cumulative stats view

#### Week 9: Optimization Recommendations

**Tasks**:
1. Implement heuristics for optimization suggestions
2. Add recommendations to UI
3. Testing and bug fixes

**Deliverables**:
- [ ] Recommendation engine
- [ ] Recommendations UI
- [ ] Full test suite
- [ ] Documentation

---

## Performance Considerations

### Optimization Strategies

1. **Lazy Token Counting**
   - Only count tokens when not provided by LLM API
   - Cache token counts for identical content
   - Use worker threads for large token counts

2. **Database Performance**
   - Use prepared statements (already in design)
   - Enable WAL mode for concurrent reads/writes
   - Create appropriate indexes
   - Partition data by date for faster queries

3. **Memory Management**
   - Stream large result sets
   - Limit in-memory aggregations
   - Use pagination for UI

4. **Async Processing**
   - Track tokens asynchronously (don't block LLM requests)
   - Use queue for database writes
   - Batch inserts when possible

### Performance Benchmarks

| Operation | Target | Measurement |
|-----------|--------|-------------|
| Track single request | <5ms | 95th percentile |
| Query 100 requests | <50ms | 95th percentile |
| Export 10K records (CSV) | <2s | 95th percentile |
| Dashboard load | <200ms | 95th percentile |
| Database size (90 days) | <100MB | Typical usage |

### Monitoring

```typescript
// Add performance tracking
const trackingStart = performance.now();
await tokenTracker.trackRequest(/* ... */);
const trackingDuration = performance.now() - trackingStart;

if (trackingDuration > 10) {
  console.warn(`Token tracking slow: ${trackingDuration}ms`);
}
```

---

## Testing Strategy

### Unit Tests

**Coverage Target**: >90%

**Key Test Files**:
- `/core/util/TokenTracker.test.ts`
- `/core/util/TokenDatabase.test.ts`
- `/core/llm/countTokens.test.ts` (extend existing)

**Test Cases**:
```typescript
describe('TokenTracker', () => {
  it('should track request with all fields', async () => {
    // Test basic tracking
  });

  it('should calculate token breakdown correctly', async () => {
    // Test breakdown calculation
  });

  it('should trigger high token alert', async () => {
    // Test alert logic
  });

  it('should handle missing cache tokens for non-Anthropic models', async () => {
    // Test null handling
  });
});

describe('TokenDatabase', () => {
  beforeEach(() => {
    // Create in-memory test database
  });

  it('should insert and query requests', () => {
    // Test CRUD operations
  });

  it('should calculate aggregates correctly', () => {
    // Test aggregate queries
  });

  it('should respect retention policy', () => {
    // Test data cleanup
  });
});
```

### Integration Tests

**Test Scenarios**:
1. End-to-end LLM request → token tracking → database storage
2. Tool call tracking through `executeCode()`
3. Pruning event tracking
4. Alert triggering and notification
5. CSV export functionality

### Performance Tests

```typescript
describe('Performance', () => {
  it('should track 100 requests in <500ms', async () => {
    const start = Date.now();

    for (let i = 0; i < 100; i++) {
      await tokenTracker.trackRequest(/* ... */);
    }

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(500);
  });

  it('should query 1000 requests in <100ms', () => {
    // Test query performance
  });
});
```

### UI Tests

**Testing Framework**: Vitest + React Testing Library

**Test Cases**:
- Dashboard renders with correct stats
- Timeline chart displays data correctly
- Request detail modal shows all information
- Export functionality generates valid CSV
- Filters work correctly

---

## Migration & Rollout

### Database Migrations

**Version 1**: Initial schema (as defined above)

**Future Migrations**:
```typescript
// Migration framework
export interface Migration {
  version: number;
  up: (db: Database) => void;
  down: (db: Database) => void;
}

const migrations: Migration[] = [
  {
    version: 1,
    up: (db) => {
      // Initial schema
    },
    down: (db) => {
      // Rollback
    },
  },
  {
    version: 2,
    up: (db) => {
      // Add new column or table
      db.exec(`ALTER TABLE token_requests ADD COLUMN new_field TEXT`);
    },
    down: (db) => {
      // Remove column
      db.exec(`ALTER TABLE token_requests DROP COLUMN new_field`);
    },
  },
];
```

### Feature Flag

```yaml
# .continue/config.yaml
experimental:
  tokenInspector:
    enabled: true              # Master switch
    tracking: true             # Enable tracking
    cli: true                  # Enable CLI commands
    webUI: true                # Enable web UI
    alerts: true               # Enable alerts
    export: true               # Enable export
```

### Rollout Plan

**Phase 1: Internal Dogfooding** (Week 3)
- Code Mode team uses feature
- Collect feedback
- Fix critical bugs

**Phase 2: Closed Beta** (Week 6)
- Invite 10-20 external users
- Monitor performance metrics
- Iterate on UI/UX

**Phase 3: Public Beta** (Week 8)
- Announce in release notes
- Default: `enabled: false` (opt-in)
- Monitor adoption and feedback

**Phase 4: General Availability** (Week 9)
- Default: `enabled: true` (opt-out)
- Full documentation
- Tutorial video

---

## Monitoring & Observability

### Telemetry Events

Track anonymous usage metrics via PostHog:

```typescript
// When feature is enabled
posthog.capture('token_inspector_enabled', {
  client: 'cli' | 'vscode' | 'web',
  version: '1.0.0',
});

// When user views dashboard
posthog.capture('token_inspector_view', {
  view: 'dashboard' | 'request_detail' | 'tools' | 'alerts',
  conversationId: '<hashed>',
});

// When user exports data
posthog.capture('token_inspector_export', {
  format: 'csv' | 'json',
  recordCount: 100,
});

// When alert is triggered
posthog.capture('token_inspector_alert', {
  alertType: 'high_single_request' | 'context_utilization' | ...,
  severity: 'warning' | 'critical',
});
```

### Performance Monitoring

```typescript
// Track token inspector overhead
posthog.capture('token_inspector_performance', {
  trackingDurationMs: 3.2,
  dbWriteDurationMs: 1.5,
  totalOverheadMs: 4.7,
});
```

### Error Tracking

```typescript
try {
  await tokenTracker.trackRequest(/* ... */);
} catch (error) {
  console.error('Token tracking failed:', error);

  posthog.capture('token_inspector_error', {
    errorType: error.name,
    errorMessage: error.message,
    operation: 'trackRequest',
  });

  // Don't break the main flow
}
```

---

## Security Considerations

### Data Privacy

1. **No PII in Logs**
   - Never store actual prompt content
   - Only store token counts and metadata
   - Redact sensitive keywords (API keys, tokens, secrets)

2. **Local-First**
   - All data stored locally in SQLite
   - No automatic cloud sync
   - User controls retention policy

3. **Encryption at Rest**
   - SQLite database encrypted using SQLCipher (optional)
   - Encryption key derived from user password or OS keychain

### Access Control

1. **File Permissions**
   - Database file: `chmod 600` (owner read/write only)
   - Prevent other users from reading token data

2. **API Security**
   - Web UI API requires authentication
   - CORS restrictions for web UI
   - Rate limiting on export endpoints

---

## Open Issues & Future Work

### Known Limitations

1. **Token Counting Accuracy**
   - Some LLM providers don't return exact token counts
   - Fallback to Tiktoken/Llama may be slightly inaccurate
   - **Mitigation**: Use provider-reported counts when available

2. **Storage Growth**
   - 90-day retention can accumulate significant data
   - **Mitigation**: Implement automatic cleanup + aggregation

3. **Multi-User Scenarios**
   - SQLite doesn't handle high concurrency well
   - **Future**: Support PostgreSQL for team deployments

### Future Enhancements

1. **Cloud Sync** (Enterprise Feature)
   - Optional cloud backup for token data
   - Team-wide analytics dashboard
   - Cost allocation by user/project

2. **ML-Based Recommendations**
   - Predict high-cost operations before execution
   - Suggest alternative approaches
   - Auto-optimize prompts

3. **Real-Time Streaming**
   - Live token count during streaming responses
   - Progress bar showing token consumption
   - Real-time cost estimates

4. **Integration with CI/CD**
   - Token usage reports in PR comments
   - Fail builds if token usage exceeds threshold
   - Track token usage trends over time

---

## Appendix

### Configuration Schema

```yaml
experimental:
  tokenInspector:
    # Master switch
    enabled: true

    # Database
    database:
      path: ~/.continue/token-inspector.db
      retentionDays: 90
      autoCleanup: true

    # Tracking
    tracking:
      requests: true
      tools: true
      pruning: true
      contextWindow: true

    # Alerts
    alerts:
      - type: high_single_request
        threshold: 10000
        severity: warning

      - type: context_utilization
        threshold: 0.95
        severity: warning

      - type: hourly_limit
        threshold: 100000
        severity: critical

    # Notifications
    notifications:
      terminal: true
      webhook:
        enabled: false
        url: https://hooks.slack.com/...

    # Export
    export:
      formats: [csv, json]
      maxRecords: 10000

    # Privacy
    privacy:
      redactContent: true
      anonymizeTelemetry: true
```

### Dependencies

```json
{
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "uuid": "^10.0.0",
    "csv-stringify": "^6.4.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/uuid": "^10.0.0"
  }
}
```

For Web UI:
```json
{
  "dependencies": {
    "recharts": "^2.10.0",
    "date-fns": "^3.0.0"
  }
}
```

For CLI:
```json
{
  "dependencies": {
    "ink": "^5.0.0",
    "ink-table": "^3.1.0",
    "blessed": "^0.1.81"
  }
}
```

---

**Document Version**: 1.0
**Last Updated**: 2025-11-17
**Next Review**: 2025-12-01
**Status**: Ready for Implementation

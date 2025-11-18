# Technical Design Document: AI-Powered Web Development Platform

**Version:** 1.0
**Date:** 2025-11-17
**Status:** Draft

---

## Executive Summary

This document outlines the technical architecture for an AI-powered web development platform that combines:
- **Vercel AI SDK UI & Elements** for the user interface
- **Daytona.io** for containerized development environments and code execution
- **Monaco Editor** for in-browser VS Code experience
- **Multi-provider AI support** (OpenAI, Anthropic, and any OpenAI-compatible APIs)
- **BYOK (Bring Your Own Key)** for cost transparency and user control
- **Native Agent SDKs** (Claude Agent SDK, OpenAI Swarm) for advanced orchestration

### Key Differentiators

- ⚡ **Sub-90ms sandbox spin-up** via Daytona.io (10x faster than competitors)
- 🎨 **Production-ready UI** with Vercel AI Elements (20+ components)
- 🔑 **BYOK support** for all major AI providers
- 🤖 **Native agent orchestration** using official SDKs
- 💻 **Full IDE experience** with Monaco Editor + LSP support
- 🔄 **True parallel agents** with Daytona's infrastructure

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Technology Stack](#2-technology-stack)
3. [Component Design](#3-component-design)
4. [BYOK Architecture](#4-byok-architecture)
5. [Multi-Provider Integration](#5-multi-provider-integration)
6. [Data Models](#6-data-models)
7. [API Design](#7-api-design)
8. [Security & Authentication](#8-security--authentication)
9. [Deployment Strategy](#9-deployment-strategy)
10. [Development Roadmap](#10-development-roadmap)
11. [Technical Challenges & Solutions](#11-technical-challenges--solutions)

---

## 1. System Architecture

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Frontend (Next.js App)                       │
├──────────────────────────┬──────────────────────────────────────┤
│   Monaco Editor          │   AI Interface (Vercel AI Elements)  │
│   ├─ Code Editor         │   ├─ Message Thread                  │
│   ├─ Terminal            │   ├─ Prompt Input                    │
│   ├─ File Explorer       │   ├─ Tool Call Display               │
│   ├─ LSP Client          │   ├─ Reasoning Panel                 │
│   └─ Diff Viewer         │   └─ Streaming Response              │
└──────────────────────────┴──────────────────────────────────────┘
                              │
                    WebSocket + HTTP/2
                              │
┌─────────────────────────────┴───────────────────────────────────┐
│              Application Server (Next.js API Routes)            │
├─────────────────────────────────────────────────────────────────┤
│  Session Manager  │  Auth Service  │  WebSocket Server          │
├───────────────────┴────────────────┴────────────────────────────┤
│               Multi-Provider AI Orchestrator                    │
│  ├─ Vercel AI SDK Core (Unified Interface)                     │
│  ├─ Provider Adapter Layer                                     │
│  ├─ BYOK Key Management                                        │
│  └─ Usage Tracking & Rate Limiting                             │
├─────────────────────────────────────────────────────────────────┤
│                  Agent Orchestration Layer                      │
│  ├─ Claude Agent SDK Integration                               │
│  ├─ OpenAI Swarm Integration                                   │
│  ├─ Task Queue (Bull/BullMQ)                                   │
│  └─ Agent State Management                                     │
└─────────────────────────────────────────────────────────────────┘
            │                            │
    ┌───────┴──────┐            ┌────────┴──────────┐
    │              │            │                   │
┌───┴────────┐ ┌──┴─────────┐ ┌┴──────────────┐ ┌──┴───────────┐
│ Daytona.io │ │ PostgreSQL │ │ Redis/Valkey  │ │ AI Providers │
│ Sandboxes  │ │ (Metadata) │ │ (Real-time)   │ │ - OpenAI     │
│ - Execute  │ │ - Users    │ │ - Sessions    │ │ - Anthropic  │
│ - Files    │ │ - Projects │ │ - WebSocket   │ │ - Custom     │
│ - Git      │ │ - Keys     │ │ - Queue       │ │              │
│ - LSP      │ └────────────┘ └───────────────┘ └──────────────┘
└────────────┘
```

### 1.2 Data Flow

#### User Code Execution Flow
```
User Types Code → Monaco Editor → WebSocket → App Server
→ Daytona Sandbox → Execution → Stream Output
→ WebSocket → Monaco Terminal
```

#### AI Agent Execution Flow
```
User Request → AI Elements UI → Vercel AI SDK → Provider Adapter
→ Claude/OpenAI SDK → Tool Calls → Daytona Sandbox
→ Execute → Results → Stream to UI
```

---

## 2. Technology Stack

### 2.1 Frontend

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| **Framework** | Next.js | 15.x | React framework with App Router |
| **UI Library** | Vercel AI Elements | Latest | Pre-built AI interface components |
| **Editor** | Monaco Editor | Latest | In-browser VS Code |
| **LSP Client** | monaco-languageclient | 10.2.0+ | Language server integration |
| **State Management** | Zustand | 5.x | Lightweight state management |
| **Styling** | Tailwind CSS | 4.x | Utility-first CSS |
| **Component Library** | shadcn/ui | Latest | Base UI components |

### 2.2 Backend

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| **Runtime** | Node.js | 22.x LTS | Server runtime |
| **Framework** | Next.js API Routes | 15.x | API endpoints |
| **AI SDK** | Vercel AI SDK | 5.x | Multi-provider AI interface |
| **Agent SDK (Anthropic)** | @anthropic-ai/claude-agent-sdk | Latest | Claude agent orchestration |
| **Agent SDK (OpenAI)** | OpenAI Swarm | Latest | OpenAI multi-agent |
| **WebSocket** | Socket.io | 4.x | Real-time communication |
| **Task Queue** | BullMQ | 5.x | Background job processing |
| **Database** | PostgreSQL | 16.x | Persistent data storage |
| **Cache** | Redis/Valkey | 8.x | Real-time state & caching |
| **ORM** | Drizzle ORM | Latest | Type-safe database queries |

### 2.3 Infrastructure

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Sandboxes** | Daytona.io | Code execution environment |
| **Hosting** | Vercel | Frontend & API hosting |
| **Database** | Vercel Postgres / Neon | Managed PostgreSQL |
| **Cache** | Vercel KV / Upstash | Managed Redis |
| **Storage** | Vercel Blob | File storage |
| **Monitoring** | Vercel Analytics + Sentry | Performance & error tracking |

---

## 3. Component Design

### 3.1 Frontend Components

#### Monaco Editor Integration

```typescript
// components/editor/monaco-workspace.tsx
import { Editor } from '@monaco-editor/react';
import { MonacoLanguageClient } from 'monaco-languageclient';

interface MonacoWorkspaceProps {
  sandboxId: string;
  onFileChange: (path: string, content: string) => void;
}

export function MonacoWorkspace({ sandboxId, onFileChange }: MonacoWorkspaceProps) {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor>();
  const lspClient = useRef<MonacoLanguageClient>();

  // Initialize Monaco editor
  const handleEditorMount = (editor: monaco.editor.IStandaloneCodeEditor) => {
    editorRef.current = editor;

    // Connect to LSP server running in Daytona sandbox
    connectLSP(sandboxId);
  };

  // Connect to Language Server Protocol
  const connectLSP = async (sandboxId: string) => {
    const wsUrl = `wss://api.yourplatform.com/lsp/${sandboxId}`;

    lspClient.current = new MonacoLanguageClient({
      name: 'TypeScript',
      clientOptions: {
        documentSelector: ['typescript', 'javascript'],
        workspaceFolder: { uri: `sandbox://${sandboxId}`, name: 'workspace' }
      }
    });

    await lspClient.current.start();
  };

  return (
    <Editor
      height="100vh"
      defaultLanguage="typescript"
      theme="vs-dark"
      onMount={handleEditorMount}
      onChange={onFileChange}
      options={{
        minimap: { enabled: true },
        fontSize: 14,
        tabSize: 2,
        automaticLayout: true,
      }}
    />
  );
}
```

#### AI Chat Interface with Vercel AI Elements

```typescript
// components/ai/chat-interface.tsx
import { useChat } from 'ai/react';
import { Message, Prompt, ToolCall, ReasoningPanel } from '@/components/ai-elements';

export function AIChatInterface() {
  const { messages, input, handleInputChange, handleSubmit, isLoading, data } = useChat({
    api: '/api/chat',
    streamProtocol: 'text',
    onToolCall: async ({ toolCall }) => {
      // Handle tool calls from AI
      return await executeToolCall(toolCall);
    }
  });

  return (
    <div className="flex flex-col h-full">
      {/* Message Thread */}
      <div className="flex-1 overflow-y-auto">
        {messages.map((message) => (
          <Message
            key={message.id}
            role={message.role}
            content={message.content}
            toolCalls={message.toolInvocations}
          />
        ))}

        {/* Reasoning Display (for Claude 3.7+) */}
        {data?.reasoning && (
          <ReasoningPanel reasoning={data.reasoning} />
        )}
      </div>

      {/* Prompt Input */}
      <Prompt
        value={input}
        onChange={handleInputChange}
        onSubmit={handleSubmit}
        isLoading={isLoading}
        placeholder="Ask AI to help with your code..."
      />
    </div>
  );
}
```

### 3.2 Backend Services

#### Multi-Provider AI Orchestrator

```typescript
// lib/ai/orchestrator.ts
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText, streamText } from 'ai';

export class AIOrchestrator {
  private providers: Map<string, any> = new Map();

  constructor(private userId: string) {}

  // Initialize provider with BYOK
  async initializeProvider(provider: 'openai' | 'anthropic', apiKey: string) {
    switch (provider) {
      case 'openai':
        this.providers.set('openai', createOpenAI({ apiKey }));
        break;
      case 'anthropic':
        this.providers.set('anthropic', createAnthropic({ apiKey }));
        break;
    }
  }

  // Unified streaming interface
  async streamCompletion(options: {
    provider: string;
    model: string;
    messages: any[];
    tools?: any[];
    onToolCall?: (toolCall: any) => Promise<any>;
  }) {
    const provider = this.providers.get(options.provider);
    if (!provider) {
      throw new Error(`Provider ${options.provider} not initialized`);
    }

    const result = await streamText({
      model: provider(options.model),
      messages: options.messages,
      tools: options.tools,
      onFinish: async ({ finishReason, usage, text, toolCalls }) => {
        // Track usage for billing
        await this.trackUsage(options.provider, usage);

        // Execute tool calls
        if (toolCalls && options.onToolCall) {
          for (const toolCall of toolCalls) {
            await options.onToolCall(toolCall);
          }
        }
      }
    });

    return result.toDataStreamResponse();
  }

  private async trackUsage(provider: string, usage: any) {
    // Store usage in database for billing/analytics
    await db.insert(usage_logs).values({
      userId: this.userId,
      provider,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      timestamp: new Date()
    });
  }
}
```

#### Daytona Sandbox Manager

```typescript
// lib/daytona/sandbox-manager.ts
import { Daytona, DaytonaConfig } from '@daytonaio/sdk';

export class SandboxManager {
  private client: Daytona;
  private sandboxes: Map<string, string> = new Map();

  constructor(apiKey: string) {
    this.client = new Daytona(new DaytonaConfig({ apiKey }));
  }

  // Create a new sandbox for a project
  async createSandbox(userId: string, projectId: string, options?: {
    baseImage?: string;
    dependencies?: string[];
  }) {
    const sandbox = await this.client.sandboxes.create({
      name: `${userId}-${projectId}`,
      image: options?.baseImage || 'node:22-alpine',
      env: {
        PROJECT_ID: projectId,
        USER_ID: userId
      }
    });

    this.sandboxes.set(projectId, sandbox.id);

    // Install dependencies if specified
    if (options?.dependencies) {
      await this.executeCommand(sandbox.id,
        `npm install ${options.dependencies.join(' ')}`
      );
    }

    return sandbox;
  }

  // Execute code in sandbox
  async executeCode(sandboxId: string, code: string, language: string) {
    const result = await this.client.sandboxes.execute(sandboxId, {
      command: this.getExecutionCommand(language, code),
      stream: true
    });

    return result;
  }

  // Sync files to/from sandbox
  async syncFiles(sandboxId: string, files: Record<string, string>) {
    for (const [path, content] of Object.entries(files)) {
      await this.client.sandboxes.writeFile(sandboxId, {
        path,
        content
      });
    }
  }

  // Read files from sandbox
  async readFiles(sandboxId: string, paths: string[]) {
    const files: Record<string, string> = {};

    for (const path of paths) {
      const content = await this.client.sandboxes.readFile(sandboxId, path);
      files[path] = content;
    }

    return files;
  }

  // Start LSP server in sandbox
  async startLSP(sandboxId: string, language: string) {
    const lspCommand = this.getLSPCommand(language);

    await this.client.sandboxes.execute(sandboxId, {
      command: lspCommand,
      background: true
    });

    return {
      url: `wss://sandbox-${sandboxId}.daytona.io/lsp`,
      protocol: 'websocket'
    };
  }

  private getExecutionCommand(language: string, code: string): string {
    switch (language) {
      case 'typescript':
        return `tsx <<'EOF'\n${code}\nEOF`;
      case 'python':
        return `python3 <<'EOF'\n${code}\nEOF`;
      case 'javascript':
        return `node <<'EOF'\n${code}\nEOF`;
      default:
        throw new Error(`Unsupported language: ${language}`);
    }
  }

  private getLSPCommand(language: string): string {
    switch (language) {
      case 'typescript':
        return 'typescript-language-server --stdio';
      case 'python':
        return 'pylsp --stdio';
      default:
        throw new Error(`No LSP for language: ${language}`);
    }
  }
}
```

#### Agent Orchestration with Claude Agent SDK

```typescript
// lib/agents/claude-agent.ts
import { Agent, Task } from '@anthropic-ai/claude-agent-sdk';
import { SandboxManager } from '../daytona/sandbox-manager';

export class ClaudeAgentOrchestrator {
  private agent: Agent;
  private sandboxManager: SandboxManager;

  constructor(apiKey: string, sandboxManager: SandboxManager) {
    this.sandboxManager = sandboxManager;

    this.agent = new Agent({
      apiKey,
      model: 'claude-sonnet-4-5-20250929',
      tools: this.getTools(),
      permissionMode: 'auto' // or 'manual' for user approval
    });
  }

  // Define tools that agent can use
  private getTools() {
    return {
      execute_code: {
        description: 'Execute code in the Daytona sandbox',
        parameters: {
          type: 'object',
          properties: {
            code: { type: 'string', description: 'Code to execute' },
            language: { type: 'string', enum: ['typescript', 'python', 'javascript'] }
          },
          required: ['code', 'language']
        },
        handler: async ({ code, language, sandboxId }: any) => {
          return await this.sandboxManager.executeCode(sandboxId, code, language);
        }
      },

      read_file: {
        description: 'Read a file from the sandbox',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string' }
          },
          required: ['path']
        },
        handler: async ({ path, sandboxId }: any) => {
          const files = await this.sandboxManager.readFiles(sandboxId, [path]);
          return files[path];
        }
      },

      write_file: {
        description: 'Write a file to the sandbox',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            content: { type: 'string' }
          },
          required: ['path', 'content']
        },
        handler: async ({ path, content, sandboxId }: any) => {
          await this.sandboxManager.syncFiles(sandboxId, { [path]: content });
          return { success: true };
        }
      },

      run_command: {
        description: 'Run a shell command in the sandbox',
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string' }
          },
          required: ['command']
        },
        handler: async ({ command, sandboxId }: any) => {
          const result = await this.sandboxManager.client.sandboxes.execute(
            sandboxId,
            { command }
          );
          return result;
        }
      }
    };
  }

  // Run agent with parallel task support
  async runAgent(prompt: string, sandboxId: string, options?: {
    parallel?: boolean;
    maxTasks?: number;
  }) {
    // Create task context
    const task = new Task({
      prompt,
      context: { sandboxId },
      parallel: options?.parallel ?? false,
      maxConcurrent: options?.maxTasks ?? 5
    });

    // Stream responses
    const stream = await this.agent.run(task);

    return stream;
  }

  // Spawn multiple parallel agents
  async spawnParallelAgents(tasks: Array<{ prompt: string; sandboxId: string }>) {
    const agents = tasks.map(task => this.runAgent(task.prompt, task.sandboxId));
    return await Promise.all(agents);
  }
}
```

---

## 4. BYOK Architecture

### 4.1 Key Storage & Encryption

```typescript
// lib/byok/key-manager.ts
import { encrypt, decrypt } from '@/lib/crypto';

export class BYOKManager {
  // Store encrypted API key
  async storeKey(userId: string, provider: string, apiKey: string) {
    const encrypted = await encrypt(apiKey, process.env.ENCRYPTION_KEY!);

    await db.insert(api_keys).values({
      userId,
      provider,
      encryptedKey: encrypted,
      createdAt: new Date()
    }).onConflictDoUpdate({
      target: [api_keys.userId, api_keys.provider],
      set: { encryptedKey: encrypted, updatedAt: new Date() }
    });
  }

  // Retrieve and decrypt API key
  async getKey(userId: string, provider: string): Promise<string | null> {
    const result = await db.query.api_keys.findFirst({
      where: and(
        eq(api_keys.userId, userId),
        eq(api_keys.provider, provider)
      )
    });

    if (!result) return null;

    return await decrypt(result.encryptedKey, process.env.ENCRYPTION_KEY!);
  }

  // Validate API key
  async validateKey(provider: string, apiKey: string): Promise<boolean> {
    try {
      switch (provider) {
        case 'openai':
          const openai = new OpenAI({ apiKey });
          await openai.models.list();
          return true;

        case 'anthropic':
          const anthropic = new Anthropic({ apiKey });
          await anthropic.messages.create({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'test' }]
          });
          return true;

        default:
          return false;
      }
    } catch (error) {
      return false;
    }
  }

  // Delete API key
  async deleteKey(userId: string, provider: string) {
    await db.delete(api_keys).where(
      and(
        eq(api_keys.userId, userId),
        eq(api_keys.provider, provider)
      )
    );
  }
}
```

### 4.2 BYOK Flow

```
User Input API Key → Validate Key → Encrypt → Store in DB
                                      ↓
                                 (AES-256-GCM)
                                      ↓
User Makes Request → Retrieve Key → Decrypt → Use Key → Track Usage
                                      ↓
                                 Return to User
```

---

## 5. Multi-Provider Integration

### 5.1 Provider Adapter

```typescript
// lib/ai/provider-adapter.ts
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

export interface ProviderConfig {
  type: 'openai' | 'anthropic' | 'openai-compatible';
  apiKey: string;
  baseURL?: string;
  model: string;
}

export class ProviderAdapter {
  static createProvider(config: ProviderConfig) {
    switch (config.type) {
      case 'openai':
        return createOpenAI({
          apiKey: config.apiKey,
          baseURL: config.baseURL
        })(config.model);

      case 'anthropic':
        return createAnthropic({
          apiKey: config.apiKey
        })(config.model);

      case 'openai-compatible':
        return createOpenAICompatible({
          apiKey: config.apiKey,
          baseURL: config.baseURL!,
          name: 'custom-provider'
        })(config.model);

      default:
        throw new Error(`Unsupported provider: ${config.type}`);
    }
  }

  // Get available models for a provider
  static async getModels(provider: string, apiKey: string) {
    switch (provider) {
      case 'openai':
        const openai = new OpenAI({ apiKey });
        const models = await openai.models.list();
        return models.data.map(m => ({
          id: m.id,
          name: m.id,
          contextWindow: this.getContextWindow(m.id)
        }));

      case 'anthropic':
        // Anthropic doesn't have a models endpoint, return known models
        return [
          { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5', contextWindow: 200000 },
          { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet', contextWindow: 200000 },
          { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', contextWindow: 200000 }
        ];

      default:
        return [];
    }
  }

  private static getContextWindow(modelId: string): number {
    const contextWindows: Record<string, number> = {
      'gpt-4o': 128000,
      'gpt-4.5': 200000,
      'gpt-4-turbo': 128000,
      'o3-mini': 200000,
      'claude-sonnet-4-5-20250929': 200000,
      'claude-3-7-sonnet-20250219': 200000
    };
    return contextWindows[modelId] || 8000;
  }
}
```

### 5.2 Unified Chat API

```typescript
// app/api/chat/route.ts
import { NextRequest } from 'next/server';
import { streamText } from 'ai';
import { ProviderAdapter } from '@/lib/ai/provider-adapter';
import { BYOKManager } from '@/lib/byok/key-manager';
import { ClaudeAgentOrchestrator } from '@/lib/agents/claude-agent';

export async function POST(req: NextRequest) {
  const { messages, provider, model, sandboxId } = await req.json();
  const userId = req.headers.get('x-user-id')!;

  // Get user's API key
  const byokManager = new BYOKManager();
  const apiKey = await byokManager.getKey(userId, provider);

  if (!apiKey) {
    return new Response('API key not configured', { status: 400 });
  }

  // Create provider instance
  const providerInstance = ProviderAdapter.createProvider({
    type: provider,
    apiKey,
    model
  });

  // Define tools for sandbox operations
  const tools = {
    execute_code: {
      description: 'Execute code in the sandbox',
      parameters: z.object({
        code: z.string(),
        language: z.enum(['typescript', 'python', 'javascript'])
      }),
      execute: async ({ code, language }) => {
        const sandboxManager = new SandboxManager(process.env.DAYTONA_API_KEY!);
        return await sandboxManager.executeCode(sandboxId, code, language);
      }
    },
    // ... more tools
  };

  // Stream response
  const result = await streamText({
    model: providerInstance,
    messages,
    tools,
    maxSteps: 10,
    onFinish: async ({ usage }) => {
      // Track usage for user's billing
      await trackUsage(userId, provider, usage);
    }
  });

  return result.toDataStreamResponse();
}
```

---

## 6. Data Models

### 6.1 Database Schema

```typescript
// db/schema.ts
import { pgTable, text, timestamp, jsonb, integer, boolean, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

export const api_keys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(), // 'openai', 'anthropic', etc.
  encryptedKey: text('encrypted_key').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  sandboxId: text('sandbox_id'),
  language: text('language').notNull().default('typescript'),
  framework: text('framework'),
  settings: jsonb('settings').$type<{
    baseImage?: string;
    dependencies?: string[];
    environmentVars?: Record<string, string>;
  }>(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  sandboxId: text('sandbox_id').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  lastActivityAt: timestamp('last_activity_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow()
});

export const chat_messages = pgTable('chat_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // 'user', 'assistant', 'system'
  content: text('content').notNull(),
  provider: text('provider'),
  model: text('model'),
  toolCalls: jsonb('tool_calls'),
  reasoning: text('reasoning'),
  createdAt: timestamp('created_at').notNull().defaultNow()
});

export const usage_logs = pgTable('usage_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'set null' }),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  promptTokens: integer('prompt_tokens').notNull(),
  completionTokens: integer('completion_tokens').notNull(),
  totalTokens: integer('total_tokens').notNull(),
  cost: integer('cost'), // in cents
  createdAt: timestamp('created_at').notNull().defaultNow()
});

export const agent_tasks = pgTable('agent_tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  parentTaskId: uuid('parent_task_id'),
  type: text('type').notNull(), // 'execute_code', 'read_file', etc.
  status: text('status').notNull().default('pending'), // 'pending', 'running', 'completed', 'failed'
  input: jsonb('input'),
  output: jsonb('output'),
  error: text('error'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow()
});
```

---

## 7. API Design

### 7.1 REST Endpoints

```typescript
// API Routes Structure

POST   /api/auth/login              // User authentication
POST   /api/auth/logout             // User logout
GET    /api/auth/session            // Get current session

POST   /api/keys                    // Store BYOK API key
GET    /api/keys                    // List stored keys
DELETE /api/keys/:provider          // Delete API key
POST   /api/keys/validate           // Validate API key

POST   /api/projects                // Create new project
GET    /api/projects                // List user projects
GET    /api/projects/:id            // Get project details
PATCH  /api/projects/:id            // Update project
DELETE /api/projects/:id            // Delete project

POST   /api/sandboxes               // Create sandbox
GET    /api/sandboxes/:id           // Get sandbox status
DELETE /api/sandboxes/:id           // Destroy sandbox
POST   /api/sandboxes/:id/execute   // Execute code
GET    /api/sandboxes/:id/files     // List files
POST   /api/sandboxes/:id/files     // Upload files
GET    /api/sandboxes/:id/files/:path // Read file
PUT    /api/sandboxes/:id/files/:path // Write file

POST   /api/chat                    // Send chat message (streaming)
GET    /api/chat/:sessionId         // Get chat history
DELETE /api/chat/:sessionId         // Clear chat history

GET    /api/providers               // List available providers
GET    /api/providers/:name/models  // Get models for provider

GET    /api/usage                   // Get usage statistics
GET    /api/usage/export            // Export usage data
```

### 7.2 WebSocket Events

```typescript
// WebSocket Event Types

// Client → Server
'editor:change'       // Editor content changed
'editor:save'         // User saved file
'terminal:input'      // Terminal command input
'chat:message'        // Chat message sent
'sandbox:execute'     // Execute code request

// Server → Client
'editor:update'       // File content updated
'terminal:output'     // Terminal output
'chat:response'       // AI response chunk
'chat:tool_call'      // Agent tool execution
'sandbox:status'      // Sandbox status change
'agent:task_start'    // Agent started task
'agent:task_complete' // Agent completed task
'usage:update'        // Usage statistics update
```

---

## 8. Security & Authentication

### 8.1 Authentication Flow

```typescript
// lib/auth/auth-provider.tsx
import { createContext, useContext } from 'react';
import { useSession } from 'next-auth/react';

export function AuthProvider({ children }) {
  const { data: session, status } = useSession();

  return (
    <AuthContext.Provider value={{ session, status }}>
      {children}
    </AuthContext.Provider>
  );
}

// middleware.ts
import { withAuth } from 'next-auth/middleware';

export default withAuth({
  callbacks: {
    authorized: ({ token }) => !!token
  }
});

export const config = {
  matcher: [
    '/app/:path*',
    '/api/projects/:path*',
    '/api/sandboxes/:path*',
    '/api/chat/:path*'
  ]
};
```

### 8.2 API Key Encryption

```typescript
// lib/crypto.ts
import { webcrypto } from 'crypto';

export async function encrypt(plaintext: string, key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);

  const cryptoKey = await webcrypto.subtle.importKey(
    'raw',
    Buffer.from(key, 'hex'),
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const encrypted = await webcrypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    data
  );

  const result = new Uint8Array(iv.length + encrypted.byteLength);
  result.set(iv);
  result.set(new Uint8Array(encrypted), iv.length);

  return Buffer.from(result).toString('base64');
}

export async function decrypt(ciphertext: string, key: string): Promise<string> {
  const data = Buffer.from(ciphertext, 'base64');
  const iv = data.slice(0, 12);
  const encrypted = data.slice(12);

  const cryptoKey = await webcrypto.subtle.importKey(
    'raw',
    Buffer.from(key, 'hex'),
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  const decrypted = await webcrypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    encrypted
  );

  return new TextDecoder().decode(decrypted);
}
```

### 8.3 Rate Limiting

```typescript
// lib/rate-limit.ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!
});

export const chatRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, '1 m'), // 20 requests per minute
  analytics: true
});

export const sandboxRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '1 m'), // 10 executions per minute
  analytics: true
});
```

---

## 9. Deployment Strategy

### 9.1 Infrastructure Setup

```yaml
# vercel.json
{
  "buildCommand": "pnpm build",
  "framework": "nextjs",
  "env": {
    "DAYTONA_API_KEY": "@daytona-api-key",
    "ENCRYPTION_KEY": "@encryption-key",
    "POSTGRES_URL": "@postgres-url",
    "REDIS_URL": "@redis-url"
  },
  "functions": {
    "app/api/chat/route.ts": {
      "maxDuration": 300,
      "memory": 1024
    },
    "app/api/sandboxes/*/execute/route.ts": {
      "maxDuration": 300,
      "memory": 1024
    }
  }
}
```

### 9.2 Environment Variables

```bash
# .env.example

# Daytona
DAYTONA_API_KEY=your_daytona_api_key

# Database
POSTGRES_URL=postgresql://user:pass@host:5432/db
POSTGRES_PRISMA_URL=postgresql://user:pass@host:5432/db?pgbouncer=true

# Redis
REDIS_URL=redis://default:pass@host:6379

# Encryption
ENCRYPTION_KEY=your_32_byte_hex_key

# NextAuth
NEXTAUTH_URL=https://yourapp.com
NEXTAUTH_SECRET=your_nextauth_secret

# OAuth (optional)
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Platform API keys (optional, for non-BYOK)
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
```

### 9.3 Monitoring & Observability

```typescript
// lib/monitoring/instrumentation.ts
import * as Sentry from '@sentry/nextjs';
import { registerOTel } from '@vercel/otel';

export function register() {
  registerOTel('ai-dev-platform');

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
    integrations: [
      new Sentry.Integrations.Http({ tracing: true }),
      new Sentry.Integrations.Postgres()
    ]
  });
}

// Track AI usage
export function trackAIUsage(userId: string, provider: string, usage: any) {
  Sentry.addBreadcrumb({
    category: 'ai.usage',
    message: `${provider} usage`,
    level: 'info',
    data: {
      userId,
      provider,
      tokens: usage.totalTokens
    }
  });
}
```

---

## 10. Development Roadmap

### Phase 1: MVP (Weeks 1-8)

**Week 1-2: Project Setup**
- [ ] Initialize Next.js project with Vercel AI SDK
- [ ] Set up database schema with Drizzle ORM
- [ ] Configure authentication with NextAuth
- [ ] Set up basic UI with Tailwind CSS + shadcn/ui

**Week 3-4: Core Infrastructure**
- [ ] Integrate Daytona.io SDK for sandbox management
- [ ] Implement BYOK key storage and encryption
- [ ] Build multi-provider adapter with Vercel AI SDK
- [ ] Set up WebSocket server for real-time communication

**Week 5-6: Editor Integration**
- [ ] Integrate Monaco Editor with React
- [ ] Implement file sync with Daytona sandboxes
- [ ] Add basic terminal emulator
- [ ] Connect LSP client for TypeScript/JavaScript

**Week 7-8: AI Chat Interface**
- [ ] Integrate Vercel AI Elements
- [ ] Build chat interface with streaming
- [ ] Implement basic tool calls (execute_code, read_file, write_file)
- [ ] Add usage tracking and billing UI

### Phase 2: Agent Orchestration (Weeks 9-16)

**Week 9-10: Claude Agent SDK**
- [ ] Integrate Claude Agent SDK
- [ ] Implement advanced tool calls
- [ ] Add agent task visualization
- [ ] Build reasoning panel for Claude 3.7+

**Week 11-12: OpenAI Swarm**
- [ ] Integrate OpenAI Swarm for multi-agent
- [ ] Implement agent handoffs
- [ ] Add parallel agent execution
- [ ] Build agent pipeline dashboard

**Week 13-14: Advanced Features**
- [ ] Add git operations in sandbox
- [ ] Implement project templates
- [ ] Build file explorer UI
- [ ] Add diff viewer for AI changes

**Week 15-16: Polish & Testing**
- [ ] End-to-end testing
- [ ] Performance optimization
- [ ] Documentation
- [ ] Beta launch

### Phase 3: Production Features (Weeks 17-24)

**Week 17-18: Team Collaboration**
- [ ] Multi-user sessions
- [ ] Real-time collaboration
- [ ] Team workspaces
- [ ] Role-based access control

**Week 19-20: Advanced LSP**
- [ ] Support for Python, Go, Rust
- [ ] Custom language server configurations
- [ ] Extension marketplace foundation
- [ ] IntelliSense improvements

**Week 21-22: Deployment & CI/CD**
- [ ] Build/deploy pipeline in sandbox
- [ ] GitHub integration
- [ ] Automatic testing
- [ ] Environment management

**Week 23-24: Enterprise Features**
- [ ] SSO integration
- [ ] Audit logs
- [ ] Usage analytics dashboard
- [ ] Custom model hosting support

---

## 11. Technical Challenges & Solutions

### 11.1 Challenge: Monaco LSP in Browser

**Problem:** VS Code extensions don't work in Monaco, LSP requires WebSocket connection to server.

**Solution:**
- Use `monaco-languageclient` v10+ for LSP integration
- Run language servers in Daytona sandboxes
- Proxy WebSocket connections through Next.js API routes
- Use browser-compatible language servers (e.g., typescript-language-server)
- Implement custom in-browser language servers with WebWorkers for performance

### 11.2 Challenge: File Sync Latency

**Problem:** User edits in Monaco need to sync to Daytona sandbox in real-time for LSP and execution.

**Solution:**
- Implement debounced file sync (300ms delay)
- Use WebSocket for bidirectional file changes
- Store working copy in browser IndexedDB
- Only sync changed files, not entire project
- Use operational transformation (OT) or CRDT for conflict resolution
- Implement optimistic UI updates

### 11.3 Challenge: Agent Tool Call Latency

**Problem:** Sequential tool calls increase response time (read file → analyze → write file).

**Solution:**
- Use Claude Agent SDK's parallel execution mode
- Batch similar tool calls (read multiple files at once)
- Cache frequently accessed files in Redis
- Pre-fetch predictable tool calls
- Stream tool call results as they complete
- Use Daytona's sub-90ms sandbox spin-up for new parallel tasks

### 11.4 Challenge: Cost Management with BYOK

**Problem:** Users might exceed their AI provider quotas, need clear usage visibility.

**Solution:**
- Real-time token counting and cost estimation
- Usage alerts via WebSocket
- Daily/monthly spending caps per user
- Detailed usage dashboard with per-project breakdown
- Export usage data to CSV
- Recommend cheaper models for simple tasks

### 11.5 Challenge: Security of Stored API Keys

**Problem:** User API keys must be stored securely and never exposed.

**Solution:**
- AES-256-GCM encryption with unique encryption key
- Store encryption key in Vercel environment variables (not in database)
- Rotate encryption keys periodically
- Never log API keys
- Use API key scopes (OpenAI restricts by project)
- Implement key expiry and rotation reminders
- Option for user to provide key per-session (not stored)

### 11.6 Challenge: WebSocket Scaling

**Problem:** WebSocket connections don't scale horizontally across multiple Vercel instances.

**Solution:**
- Use Redis pub/sub for cross-instance communication
- Implement sticky sessions with load balancer
- Store WebSocket connection state in Redis
- Use Vercel's Edge Functions for WebSocket when available
- Consider dedicated WebSocket service (e.g., Soketi, Ably)

### 11.7 Challenge: Sandbox State Persistence

**Problem:** Daytona sandboxes might be destroyed, losing user's work.

**Solution:**
- Implement automatic snapshots every 5 minutes
- Store snapshots in Vercel Blob storage
- Restore sandbox from snapshot on reconnect
- Git integration for version control
- Export project to .zip for download
- Hibernate sandboxes instead of destroying (Daytona feature)

### 11.8 Challenge: Context Window Management

**Problem:** Long conversations exceed 200K token limit.

**Solution:**
- Implement smart context pruning (keep recent + relevant messages)
- Summarize old messages using cheaper model
- Allow user to "branch" conversation
- Store full history in database, send trimmed context to AI
- Use RAG for codebase context instead of full files
- Implement context windowing strategies per model

---

## Appendix A: Technology Comparison

### AI UI Frameworks

| Feature | Vercel AI Elements | Custom React | ChatGPT UI |
|---------|-------------------|--------------|-----------|
| **Pre-built Components** | ✅ 20+ components | ❌ Build from scratch | ✅ Limited |
| **Streaming Support** | ✅ Native | ⚠️ Custom implementation | ✅ Native |
| **Tool Call Display** | ✅ Built-in | ❌ Custom | ✅ Limited |
| **Reasoning Panel** | ✅ Claude 3.7+ | ❌ Custom | ❌ No |
| **Customization** | ✅ Full control | ✅ Full control | ❌ Limited |
| **Maintenance** | ✅ Vercel | ❌ Self | ⚠️ Community |

**Verdict:** Vercel AI Elements provides the best balance of functionality and customization.

### Agent SDKs

| Feature | Claude Agent SDK | OpenAI Swarm | LangChain Agents |
|---------|-----------------|--------------|------------------|
| **Official Support** | ✅ Anthropic | ✅ OpenAI | ❌ Community |
| **Parallel Execution** | ✅ Native | ⚠️ Manual | ⚠️ Manual |
| **Tool Use** | ✅ Advanced | ✅ Functions | ✅ Tools |
| **Reasoning Display** | ✅ Supported | ❌ No | ❌ No |
| **BYOK** | ✅ Yes | ✅ Yes | ✅ Yes |
| **Learning Curve** | ⚠️ Medium | ✅ Low | ❌ High |

**Verdict:** Use both - Claude Agent SDK for Anthropic models, OpenAI Swarm for OpenAI models.

### Sandbox Providers

| Feature | Daytona.io | E2B | Modal | CodeSandbox |
|---------|-----------|-----|-------|-------------|
| **Spin-up Time** | ✅ Sub-90ms | ⚠️ ~1s | ⚠️ ~2s | ⚠️ ~5s |
| **AI-Native** | ✅ Yes | ✅ Yes | ❌ No | ❌ No |
| **Docker Compatible** | ✅ Yes | ✅ Yes | ⚠️ Custom | ❌ No |
| **Pricing** | ✅ Affordable | ⚠️ Medium | ⚠️ High | ✅ Free tier |
| **Scalability** | ✅ 10K+ concurrent | ⚠️ ~1K | ✅ High | ❌ Limited |
| **SDK Quality** | ✅ TypeScript/Python | ✅ TypeScript | ✅ Python | ⚠️ REST only |

**Verdict:** Daytona.io is the clear winner for AI agent workloads.

---

## Appendix B: Cost Analysis

### Infrastructure Costs (Monthly)

**Vercel Pro Plan:** $20/month
- Hobby: Free (sufficient for development)
- Pro: $20/user/month (production)

**Vercel Postgres:** ~$20-50/month
- 1GB storage, 60 compute hours
- Alternative: Neon.tech (free tier available)

**Vercel KV (Redis):** ~$10-30/month
- 500MB storage, 10K commands/day
- Alternative: Upstash Redis (generous free tier)

**Daytona.io:** Usage-based
- $0.0001 per sandbox-second
- Estimate: $50-200/month for 100 active users

**Total Infrastructure:** ~$100-300/month

### AI Costs (BYOK - User Pays)

**OpenAI GPT-4o:**
- $2.50 per 1M input tokens
- $10.00 per 1M output tokens
- Average: ~$0.10 per conversation (500 tokens each way)

**Anthropic Claude Sonnet 4.5:**
- $3.00 per 1M input tokens
- $15.00 per 1M output tokens
- Average: ~$0.12 per conversation

**User Monthly Cost (Heavy Usage):**
- 1000 conversations/month: ~$100-120
- This is transparent and visible to users via BYOK

---

## Appendix C: Performance Benchmarks

### Target Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Sandbox Spin-up** | <100ms | Time to first code execution |
| **Editor Load** | <1s | Monaco editor ready |
| **First AI Response** | <500ms | Time to first token |
| **File Sync** | <300ms | Editor → Sandbox |
| **LSP Response** | <100ms | IntelliSense suggestions |
| **WebSocket Latency** | <50ms | Round-trip time |
| **API Response** | <200ms | REST endpoint P95 |

### Optimization Strategies

1. **CDN for Static Assets:** Vercel Edge Network
2. **Database Connection Pooling:** PgBouncer
3. **Redis Caching:** Frequently accessed data
4. **Code Splitting:** Lazy load Monaco and AI Elements
5. **WebSocket Compression:** Reduce bandwidth
6. **Image Optimization:** Next.js Image component
7. **Server-Side Rendering:** Initial page load optimization

---

## Conclusion

This technical design provides a comprehensive architecture for building an AI-powered web development platform that combines the best elements of Claude Code and Cursor, with:

✅ **Modern UI** via Vercel AI SDK UI & Elements
✅ **Blazing-fast sandboxes** via Daytona.io
✅ **Full IDE experience** via Monaco Editor
✅ **Multi-provider AI** with BYOK support
✅ **Native agent orchestration** using official SDKs
✅ **Scalable architecture** on Vercel infrastructure

The platform is positioned to provide a superior developer experience compared to existing solutions, with transparent pricing through BYOK and sub-100ms latency for code execution.

### Next Steps

1. Review and approve this technical design
2. Set up development environment
3. Create project repository
4. Begin Phase 1 implementation
5. Schedule weekly technical reviews

---

**Document Status:** Ready for Review
**Last Updated:** 2025-11-17
**Approved By:** [Pending]

# Technical Design: Custom Claude Code Agent Import System

**Version:** 1.0
**Date:** 2025-11-18
**Status:** Proposal

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Problem Statement](#problem-statement)
3. [Goals & Requirements](#goals--requirements)
4. [Architecture Overview](#architecture-overview)
5. [Current System Analysis](#current-system-analysis)
6. [Proposed Solution](#proposed-solution)
7. [Implementation Details](#implementation-details)
8. [UI/UX Design](#uiux-design)
9. [Technical Considerations](#technical-considerations)
10. [Migration & Compatibility](#migration--compatibility)
11. [Testing Strategy](#testing-strategy)
12. [Future Enhancements](#future-enhancements)

---

## Executive Summary

This document proposes a system for importing custom sub-agent definitions from Claude Code into Continue as prompt templates accessible via slash commands. The system will:

- **Auto-discover** agent definitions from configurable directories
- **Convert** Claude Code agent prompts to Continue-compatible slash commands
- **Provide** a GUI for managing, creating, and editing custom agents
- **Support** hot reload when agent definitions change
- **Enable** seamless integration with Continue's existing slash command infrastructure

The solution leverages Continue's existing prompt file system (`.prompt` files), configuration hot reload, and GUI settings architecture while adding specialized support for Claude Code's agent format.

---

## Problem Statement

Users of both Claude Code and Continue want to:

1. **Reuse agent definitions** created for Claude Code within Continue
2. **Avoid manual duplication** of prompt engineering across tools
3. **Maintain a single source of truth** for agent behavior
4. **Quickly experiment** with new agent templates
5. **Share agent definitions** across teams

Currently, there is no automated way to import Claude Code agent definitions into Continue, requiring manual recreation of prompts.

---

## Goals & Requirements

### Functional Requirements

1. **FR1**: System SHALL detect Claude Code agent definition files in user-specified directories
2. **FR2**: System SHALL convert Claude Code agent format to Continue slash commands
3. **FR3**: System SHALL support hot reload when agent files are modified
4. **FR4**: Users SHALL be able to configure agent import paths via GUI
5. **FR5**: Users SHALL be able to create new agent templates via GUI
6. **FR6**: Users SHALL be able to preview and edit imported agents
7. **FR7**: System SHALL handle conflicts (duplicate agent names)
8. **FR8**: Imported agents SHALL appear in slash command autocomplete

### Non-Functional Requirements

1. **NFR1**: Import process SHALL complete in <500ms for 100 agents
2. **NFR2**: GUI SHALL provide clear feedback during import
3. **NFR3**: System SHALL validate agent definitions before import
4. **NFR4**: Changes to agent files SHALL be detected within 2 seconds
5. **NFR5**: System SHALL preserve existing slash commands during import

### Out of Scope (v1)

- Importing tool definitions from Claude Code
- Reverse sync (Continue → Claude Code)
- Agent version control or history
- Multi-file agent definitions (only single-file supported initially)

---

## Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      User Configuration                      │
│  (GUI Settings + config.yaml)                               │
│  - Agent import paths                                       │
│  - Import enabled/disabled                                  │
│  - Naming conventions                                       │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              Agent Import Service (Core)                     │
│  - File watching & hot reload                               │
│  - Agent definition parsing                                 │
│  - Conversion to Continue format                            │
│  - Conflict resolution                                      │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│            Configuration Management Layer                    │
│  - Merges imported agents with existing slash commands      │
│  - Maintains agent metadata                                 │
│  - Triggers config reload                                   │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              Slash Command System                           │
│  - Renders imported agents as slash commands                │
│  - Handles execution with proper context                    │
│  - Provides autocomplete for imported agents                │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

```
Agent Files         Agent Import        Slash Command       User Executes
(Filesystem)   →    Service        →    Registry       →    /agent-name
                        │                   │                    │
                        │                   │                    │
                    Watches for         Registers           Renders prompt
                    changes             commands            + sends to LLM
                        │                   │                    │
                        └───────────────────┴────────────────────┘
                                Hot Reload Cycle
```

---

## Current System Analysis

### Existing Slash Command Sources

Continue currently supports **9 slash command sources** (from research):

| Source | Location | Format | Hot Reload |
|--------|----------|--------|------------|
| Built-in Legacy | `/core/commands/slash/built-in-legacy/` | TypeScript | No (compiled) |
| JSON Custom | `config.json` → `customCommands` | JSON | Yes |
| Prompt Files v1 | `.continue/prompts/*.prompt` | Markdown | Yes |
| Prompt Files v2 | `.continue/prompts/*.prompt` | YAML+Markdown | Yes |
| YAML Prompts | `config.yaml` → `prompts` | YAML | Yes |
| Invokable Rules | `.continuerules` or `.continue/rules/` | Markdown | Yes |
| MCP Prompts | MCP servers | Dynamic | Yes |
| Built-in | Hardcoded (e.g., `/init`) | TypeScript | No |

**Key Insight**: The **Prompt Files v2** system is the best foundation for Claude Code agent import because:
- Supports YAML preamble for metadata
- Markdown body for prompt content
- Already has file watching infrastructure
- Supports context provider references (`@file`, `@codebase`)
- Can include system messages

### Prompt File v2 Format

**Location**: `/home/user/codeMode/core/promptFiles/parsePromptFile.ts`

```
name: Example Agent
description: Describes what this agent does
version: 2
---

<system>
System instructions for the agent go here.
</system>

User-facing prompt with context:
@README.md
@currentFile

Analyze the above and provide insights.
```

**Parsed Structure**:
```typescript
{
  name: string;
  description: string;
  systemMessage?: string;
  prompt: string;
  version: number;
}
```

### Configuration Hot Reload Mechanism

**File**: `/home/user/codeMode/core/config/ConfigHandler.ts`

- ConfigHandler triggers `cascadeInit()` on file changes
- ProfileLifecycleManager reloads configuration
- Notifies all registered listeners
- GUI updates automatically via Redux

**Integration Point**: We can hook into this system by triggering config reload when agent files change.

---

## Proposed Solution

### Solution Overview

Introduce a **Claude Code Agent Import System** with three main components:

1. **AgentImportService** (Core) - Discovers, parses, and converts agent definitions
2. **Agent Settings UI** (GUI) - Manages import paths and agent templates
3. **Agent File Watcher** (Core) - Detects changes and triggers reload

### Agent Definition Format

We'll support **two input formats**:

#### Format 1: Claude Code Agent Format (JSON)

```json
{
  "name": "code-reviewer",
  "description": "Review code for bugs and improvements",
  "systemMessage": "You are an expert code reviewer...",
  "prompt": "Review the following code:\n\n@currentFile\n\nProvide feedback on...",
  "metadata": {
    "author": "team@example.com",
    "version": "1.0",
    "tags": ["review", "quality"]
  }
}
```

#### Format 2: Claude Code Agent Format (Markdown)

```markdown
---
name: code-reviewer
description: Review code for bugs and improvements
author: team@example.com
tags: [review, quality]
---

<system>
You are an expert code reviewer with deep knowledge of best practices.
</system>

Review the following code:

@currentFile

Provide feedback on:
1. Potential bugs
2. Performance issues
3. Code style
```

**Rationale**: Format 2 aligns perfectly with Continue's existing `.prompt` v2 format, requiring minimal conversion.

### Conversion Strategy

```typescript
// Pseudo-code for conversion
function convertAgentToPromptFile(agentDef: ClaudeCodeAgent): PromptFileContent {
  // Generate .prompt v2 format
  const preamble = {
    name: agentDef.name,
    description: agentDef.description,
    version: 2,
    // Store metadata as custom fields
    author: agentDef.metadata?.author,
    tags: agentDef.metadata?.tags,
  };

  let body = "";
  if (agentDef.systemMessage) {
    body += `<system>\n${agentDef.systemMessage}\n</system>\n\n`;
  }
  body += agentDef.prompt;

  return {
    preamble: YAML.stringify(preamble),
    body,
    fullContent: `${YAML.stringify(preamble)}\n---\n${body}`,
  };
}
```

### Storage Location

Imported agents will be stored in:
- **Primary**: `.continue/imported-agents/` (workspace-specific)
- **Global**: `~/.continue/imported-agents/` (user-wide)

**Naming Convention**: `<source-name>.<original-filename>.prompt`

Example: If importing from `/path/to/agents/reviewer.md`:
- Stored as: `.continue/imported-agents/reviewer.prompt`
- If conflict exists: `.continue/imported-agents/reviewer.001.prompt`

---

## Implementation Details

### Phase 1: Core Infrastructure

#### 1.1 Agent Definition Types

**File**: `/home/user/codeMode/core/agentImport/types.ts`

```typescript
export interface ClaudeCodeAgentMetadata {
  author?: string;
  version?: string;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ClaudeCodeAgentDefinition {
  name: string;
  description: string;
  systemMessage?: string;
  prompt: string;
  metadata?: ClaudeCodeAgentMetadata;
}

export interface AgentImportConfig {
  enabled: boolean;
  importPaths: string[];  // Directories to watch
  autoReload: boolean;
  namingStrategy: "preserve" | "prefix" | "suffix";
  namePrefix?: string;
  nameSuffix?: string;
  conflictResolution: "skip" | "rename" | "overwrite";
}

export interface ImportedAgentRecord {
  id: string;
  sourcePath: string;
  importedAt: string;
  lastModified: string;
  promptFilePath: string;
  agentDef: ClaudeCodeAgentDefinition;
  status: "active" | "error" | "disabled";
  errorMessage?: string;
}
```

#### 1.2 Agent Parser

**File**: `/home/user/codeMode/core/agentImport/parseAgent.ts`

```typescript
export async function parseAgentFile(
  filePath: string,
  content: string,
): Promise<ClaudeCodeAgentDefinition | null> {
  const ext = path.extname(filePath);

  if (ext === ".json") {
    return parseJsonAgent(content);
  } else if (ext === ".md" || ext === ".markdown") {
    return parseMarkdownAgent(content);
  }

  return null;
}

function parseJsonAgent(content: string): ClaudeCodeAgentDefinition {
  const json = JSON.parse(content);
  // Validate schema
  if (!json.name || !json.prompt) {
    throw new Error("Invalid agent definition: missing required fields");
  }
  return json;
}

function parseMarkdownAgent(content: string): ClaudeCodeAgentDefinition {
  // Already compatible with .prompt v2 format
  const parsed = parsePromptFile("temp.prompt", content);

  return {
    name: parsed.name,
    description: parsed.description,
    systemMessage: parsed.systemMessage,
    prompt: parsed.prompt,
    metadata: {
      // Extract from YAML preamble if present
    },
  };
}
```

#### 1.3 Agent Import Service

**File**: `/home/user/codeMode/core/agentImport/AgentImportService.ts`

```typescript
export class AgentImportService {
  private watchers: Map<string, FSWatcher> = new Map();
  private importedAgents: Map<string, ImportedAgentRecord> = new Map();
  private config: AgentImportConfig;

  constructor(
    private ide: IDE,
    private configHandler: ConfigHandler,
  ) {}

  async initialize(config: AgentImportConfig): Promise<void> {
    this.config = config;

    if (!config.enabled) {
      return;
    }

    // Initial import
    await this.importAllAgents();

    // Setup file watchers
    if (config.autoReload) {
      this.setupWatchers();
    }
  }

  private async importAllAgents(): Promise<void> {
    const agentFiles: string[] = [];

    for (const importPath of this.config.importPaths) {
      const files = await this.ide.listDir(importPath);
      const agentFiles = files.filter(f =>
        f.endsWith(".json") ||
        f.endsWith(".md") ||
        f.endsWith(".markdown")
      );
      agentFiles.push(...agentFiles.map(f => path.join(importPath, f)));
    }

    const importResults = await Promise.allSettled(
      agentFiles.map(f => this.importAgentFile(f))
    );

    // Log results
    const successful = importResults.filter(r => r.status === "fulfilled").length;
    const failed = importResults.filter(r => r.status === "rejected").length;

    console.log(`Agent import complete: ${successful} succeeded, ${failed} failed`);
  }

  private async importAgentFile(sourcePath: string): Promise<ImportedAgentRecord> {
    const content = await this.ide.readFile(sourcePath);
    const agentDef = await parseAgentFile(sourcePath, content);

    if (!agentDef) {
      throw new Error(`Failed to parse agent file: ${sourcePath}`);
    }

    // Generate prompt file content
    const promptContent = this.convertToPromptFile(agentDef);

    // Determine storage location
    const promptFilePath = await this.getPromptFilePath(
      agentDef.name,
      sourcePath,
    );

    // Write prompt file
    await this.ide.writeFile(promptFilePath, promptContent);

    // Create record
    const record: ImportedAgentRecord = {
      id: uuidv4(),
      sourcePath,
      importedAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      promptFilePath,
      agentDef,
      status: "active",
    };

    this.importedAgents.set(record.id, record);

    return record;
  }

  private convertToPromptFile(agentDef: ClaudeCodeAgentDefinition): string {
    const preamble = {
      name: this.applyNamingStrategy(agentDef.name),
      description: agentDef.description,
      version: 2,
      ...(agentDef.metadata || {}),
    };

    let body = "";
    if (agentDef.systemMessage) {
      body += `<system>\n${agentDef.systemMessage}\n</system>\n\n`;
    }
    body += agentDef.prompt;

    return `${YAML.stringify(preamble)}\n---\n${body}`;
  }

  private applyNamingStrategy(name: string): string {
    switch (this.config.namingStrategy) {
      case "prefix":
        return `${this.config.namePrefix || ""}${name}`;
      case "suffix":
        return `${name}${this.config.nameSuffix || ""}`;
      default:
        return name;
    }
  }

  private async getPromptFilePath(
    agentName: string,
    sourcePath: string,
  ): Promise<string> {
    const workspaceDirs = await this.ide.getWorkspaceDirs();
    const importDir = path.join(
      workspaceDirs[0] || os.homedir(),
      ".continue",
      "imported-agents",
    );

    // Ensure directory exists
    await this.ide.makeDir(importDir);

    const baseName = `${agentName}.prompt`;
    let filePath = path.join(importDir, baseName);

    // Handle conflicts
    if (await this.ide.fileExists(filePath)) {
      switch (this.config.conflictResolution) {
        case "skip":
          throw new Error(`Agent already exists: ${agentName}`);
        case "rename":
          let counter = 1;
          while (await this.ide.fileExists(filePath)) {
            filePath = path.join(
              importDir,
              `${agentName}.${String(counter).padStart(3, "0")}.prompt`,
            );
            counter++;
          }
          break;
        case "overwrite":
          // Will overwrite
          break;
      }
    }

    return filePath;
  }

  private setupWatchers(): void {
    for (const importPath of this.config.importPaths) {
      const watcher = fs.watch(
        importPath,
        { recursive: false },
        (eventType, filename) => {
          if (!filename) return;

          const fullPath = path.join(importPath, filename);

          if (eventType === "change") {
            void this.handleFileChange(fullPath);
          } else if (eventType === "rename") {
            void this.handleFileRemoved(fullPath);
          }
        },
      );

      this.watchers.set(importPath, watcher);
    }
  }

  private async handleFileChange(filePath: string): Promise<void> {
    console.log(`Agent file changed: ${filePath}`);

    try {
      await this.importAgentFile(filePath);

      // Trigger config reload
      await this.configHandler.reloadConfig("agent-import-update");

      // Notify user
      void this.ide.showToast("info", `Agent updated: ${path.basename(filePath)}`);
    } catch (error) {
      console.error(`Failed to reload agent: ${error}`);
      void this.ide.showToast("error", `Failed to reload agent: ${error.message}`);
    }
  }

  private async handleFileRemoved(filePath: string): Promise<void> {
    // Find and remove corresponding prompt file
    const record = Array.from(this.importedAgents.values()).find(
      r => r.sourcePath === filePath,
    );

    if (record) {
      await this.ide.deleteFile(record.promptFilePath);
      this.importedAgents.delete(record.id);

      await this.configHandler.reloadConfig("agent-import-removed");
    }
  }

  async shutdown(): Promise<void> {
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
  }

  getImportedAgents(): ImportedAgentRecord[] {
    return Array.from(this.importedAgents.values());
  }
}
```

#### 1.4 Integration with ConfigHandler

**File**: `/home/user/codeMode/core/config/ConfigHandler.ts` (modification)

```typescript
export class ConfigHandler extends EventEmitter {
  private agentImportService: AgentImportService;

  constructor(/* existing params */) {
    // ... existing code ...

    this.agentImportService = new AgentImportService(ide, this);
  }

  async loadConfig(): Promise<ConfigResult<ContinueConfig>> {
    const result = await super.loadConfig();

    // Initialize agent import service with config
    const agentImportConfig = result.config?.agentImport || {
      enabled: false,
      importPaths: [],
      autoReload: true,
      namingStrategy: "preserve",
      conflictResolution: "rename",
    };

    await this.agentImportService.initialize(agentImportConfig);

    return result;
  }

  getImportedAgents(): ImportedAgentRecord[] {
    return this.agentImportService.getImportedAgents();
  }
}
```

#### 1.5 Configuration Schema Extension

**File**: `/home/user/codeMode/core/index.d.ts` (additions)

```typescript
export interface ContinueConfig {
  // ... existing fields ...

  agentImport?: AgentImportConfig;
}

export interface BrowserSerializedContinueConfig {
  // ... existing fields ...

  agentImport?: AgentImportConfig;
  importedAgents?: ImportedAgentRecord[];
}
```

**File**: `/home/user/codeMode/packages/config-yaml/src/schemas/index.ts` (addition)

```yaml
# Agent Import Configuration
agentImport:
  enabled: true
  importPaths:
    - ~/claude-code-agents
    - .continue/custom-agents
  autoReload: true
  namingStrategy: prefix
  namePrefix: "cc-"
  conflictResolution: rename
```

---

### Phase 2: Protocol Extensions

#### 2.1 New Protocol Messages

**File**: `/home/user/codeMode/core/protocol/core.ts` (additions)

```typescript
export type ToCoreFromIdeOrWebviewProtocol = {
  // ... existing messages ...

  "agentImport/getImportedAgents": [undefined, ImportedAgentRecord[]];
  "agentImport/addImportPath": [{ path: string }, void];
  "agentImport/removeImportPath": [{ path: string }, void];
  "agentImport/reimportAll": [undefined, { success: number; failed: number }];
  "agentImport/createNewAgent": [
    {
      name: string;
      description: string;
      systemMessage?: string;
      prompt: string;
    },
    ImportedAgentRecord,
  ];
  "agentImport/updateAgent": [
    {
      id: string;
      updates: Partial<ClaudeCodeAgentDefinition>;
    },
    ImportedAgentRecord,
  ];
  "agentImport/deleteAgent": [{ id: string }, void];
  "agentImport/toggleAgentStatus": [{ id: string; enabled: boolean }, void];
};
```

#### 2.2 Core Message Handlers

**File**: `/home/user/codeMode/core/core.ts` (additions)

```typescript
private async handleAgentImportMessage(msg: Message) {
  switch (msg.messageType) {
    case "agentImport/getImportedAgents":
      return this.configHandler.getImportedAgents();

    case "agentImport/addImportPath":
      return this.addAgentImportPath(msg.data.path);

    case "agentImport/removeImportPath":
      return this.removeAgentImportPath(msg.data.path);

    case "agentImport/reimportAll":
      return this.reimportAllAgents();

    case "agentImport/createNewAgent":
      return this.createNewAgent(msg.data);

    // ... other handlers
  }
}

private async addAgentImportPath(newPath: string): Promise<void> {
  const { config } = await this.configHandler.loadConfig();

  if (!config.agentImport) {
    config.agentImport = {
      enabled: true,
      importPaths: [],
      autoReload: true,
      namingStrategy: "preserve",
      conflictResolution: "rename",
    };
  }

  if (!config.agentImport.importPaths.includes(newPath)) {
    config.agentImport.importPaths.push(newPath);

    // Update config file
    await this.updateConfigYaml({ agentImport: config.agentImport });

    // Trigger reload
    await this.configHandler.reloadConfig("agent-import-path-added");
  }
}
```

---

### Phase 3: GUI Implementation

#### 3.1 Agent Import Settings Section

**File**: `/home/user/codeMode/gui/src/pages/config/sections/AgentImportSection.tsx`

```typescript
import { useContext, useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import { IdeMessengerContext } from "@/context/IdeMessenger";
import { ImportedAgentRecord } from "@/core/agentImport/types";
import { ConfigSection } from "../components/ConfigSection";
import { ConfigHeader } from "../components/ConfigHeader";
import { UserSetting } from "../components/UserSetting";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export function AgentImportSection() {
  const ideMessenger = useContext(IdeMessengerContext);
  const config = useAppSelector(state => state.config.config);
  const [importedAgents, setImportedAgents] = useState<ImportedAgentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadImportedAgents();
  }, []);

  async function loadImportedAgents() {
    const agents = await ideMessenger.request("agentImport/getImportedAgents", undefined);
    setImportedAgents(agents);
  }

  async function handleAddImportPath() {
    const path = await ideMessenger.request("showDialog", {
      type: "folder",
      title: "Select Agent Directory",
    });

    if (path) {
      await ideMessenger.post("agentImport/addImportPath", { path });
      void loadImportedAgents();
    }
  }

  async function handleReimportAll() {
    setIsLoading(true);
    try {
      const result = await ideMessenger.request("agentImport/reimportAll", undefined);
      void ideMessenger.post("showToast", {
        type: "success",
        message: `Imported ${result.success} agents (${result.failed} failed)`,
      });
      void loadImportedAgents();
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCreateNewAgent() {
    // Open agent creation dialog
    setShowCreateDialog(true);
  }

  return (
    <ConfigSection>
      <ConfigHeader
        title="Agent Import"
        description="Import custom agents from Claude Code"
        onAddClick={handleAddImportPath}
        addButtonText="Add Import Path"
      />

      <Card className="mb-4">
        <UserSetting
          type="toggle"
          title="Enable Agent Import"
          description="Automatically import agents from configured directories"
          value={config.agentImport?.enabled ?? false}
          onChange={(enabled) => updateAgentImportConfig({ enabled })}
        />

        <UserSetting
          type="toggle"
          title="Auto Reload"
          description="Watch for changes and automatically reload agents"
          value={config.agentImport?.autoReload ?? true}
          onChange={(autoReload) => updateAgentImportConfig({ autoReload })}
        />

        <UserSetting
          type="select"
          title="Naming Strategy"
          description="How to name imported agents"
          value={config.agentImport?.namingStrategy ?? "preserve"}
          options={[
            { label: "Preserve Original", value: "preserve" },
            { label: "Add Prefix", value: "prefix" },
            { label: "Add Suffix", value: "suffix" },
          ]}
          onChange={(namingStrategy) => updateAgentImportConfig({ namingStrategy })}
        />

        {config.agentImport?.namingStrategy === "prefix" && (
          <UserSetting
            type="input"
            title="Name Prefix"
            description="Prefix to add to agent names (e.g., 'cc-')"
            value={config.agentImport?.namePrefix ?? ""}
            onChange={(namePrefix) => updateAgentImportConfig({ namePrefix })}
          />
        )}

        <UserSetting
          type="select"
          title="Conflict Resolution"
          description="What to do when agent name conflicts occur"
          value={config.agentImport?.conflictResolution ?? "rename"}
          options={[
            { label: "Skip (don't import)", value: "skip" },
            { label: "Rename (add number)", value: "rename" },
            { label: "Overwrite", value: "overwrite" },
          ]}
          onChange={(conflictResolution) => updateAgentImportConfig({ conflictResolution })}
        />
      </Card>

      <ConfigHeader
        title="Import Paths"
        description="Directories containing agent definitions"
      />

      <div className="space-y-2 mb-4">
        {config.agentImport?.importPaths?.map((path, index) => (
          <Card key={index} className="flex items-center justify-between p-3">
            <span className="text-sm font-mono">{path}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleRemoveImportPath(path)}
            >
              Remove
            </Button>
          </Card>
        ))}

        {(!config.agentImport?.importPaths || config.agentImport.importPaths.length === 0) && (
          <div className="text-center text-muted-foreground py-8">
            No import paths configured. Click "Add Import Path" to get started.
          </div>
        )}
      </div>

      <ConfigHeader
        title="Imported Agents"
        description={`${importedAgents.length} agents imported`}
        onAddClick={handleCreateNewAgent}
        addButtonText="Create New Agent"
      />

      <div className="flex gap-2 mb-4">
        <Button
          variant="outline"
          onClick={handleReimportAll}
          disabled={isLoading}
        >
          {isLoading ? "Reimporting..." : "Reimport All"}
        </Button>
      </div>

      <div className="space-y-2">
        {importedAgents.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            onEdit={() => handleEditAgent(agent)}
            onDelete={() => handleDeleteAgent(agent.id)}
            onToggle={(enabled) => handleToggleAgent(agent.id, enabled)}
          />
        ))}
      </div>
    </ConfigSection>
  );
}
```

#### 3.2 Agent Card Component

**File**: `/home/user/codeMode/gui/src/pages/config/components/AgentCard.tsx`

```typescript
import { ImportedAgentRecord } from "@/core/agentImport/types";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

interface AgentCardProps {
  agent: ImportedAgentRecord;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (enabled: boolean) => void;
}

export function AgentCard({ agent, onEdit, onDelete, onToggle }: AgentCardProps) {
  const isActive = agent.status === "active";

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold">{agent.agentDef.name}</h3>
            <Badge variant={isActive ? "success" : "error"}>
              {agent.status}
            </Badge>
            {agent.agentDef.metadata?.tags?.map(tag => (
              <Badge key={tag} variant="secondary">{tag}</Badge>
            ))}
          </div>

          <p className="text-sm text-muted-foreground mb-2">
            {agent.agentDef.description}
          </p>

          <div className="text-xs text-muted-foreground space-y-1">
            <div>Source: <code className="font-mono">{agent.sourcePath}</code></div>
            <div>Slash command: <code>/{ agent.agentDef.name}</code></div>
            <div>Last modified: {new Date(agent.lastModified).toLocaleString()}</div>
          </div>

          {agent.errorMessage && (
            <div className="mt-2 text-sm text-error">
              Error: {agent.errorMessage}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onToggle(!isActive)}
          >
            {isActive ? "Disable" : "Enable"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
          >
            Delete
          </Button>
        </div>
      </div>
    </Card>
  );
}
```

#### 3.3 Agent Creation Dialog

**File**: `/home/user/codeMode/gui/src/pages/config/components/AgentCreationDialog.tsx`

```typescript
import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";

interface AgentCreationDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (agent: {
    name: string;
    description: string;
    systemMessage?: string;
    prompt: string;
  }) => Promise<void>;
}

export function AgentCreationDialog({ open, onClose, onSave }: AgentCreationDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [systemMessage, setSystemMessage] = useState("");
  const [prompt, setPrompt] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave() {
    setIsSaving(true);
    try {
      await onSave({
        name,
        description,
        systemMessage: systemMessage || undefined,
        prompt,
      });
      onClose();
      resetForm();
    } finally {
      setIsSaving(false);
    }
  }

  function resetForm() {
    setName("");
    setDescription("");
    setSystemMessage("");
    setPrompt("");
  }

  return (
    <Dialog open={open} onClose={onClose} title="Create New Agent">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">
            Agent Name
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="code-reviewer"
          />
          <p className="text-xs text-muted-foreground mt-1">
            This will be the slash command name (e.g., /{name})
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Description
          </label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Reviews code for bugs and improvements"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            System Message (Optional)
          </label>
          <Textarea
            value={systemMessage}
            onChange={(e) => setSystemMessage(e.target.value)}
            placeholder="You are an expert code reviewer..."
            rows={3}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Prompt Template
          </label>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={`Review the following code:\n\n@currentFile\n\nProvide feedback on...`}
            rows={8}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Use @file, @codebase, @currentFile to reference context
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!name || !prompt || isSaving}
          >
            {isSaving ? "Creating..." : "Create Agent"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
```

#### 3.4 Add to Config Tabs

**File**: `/home/user/codeMode/gui/src/pages/config/configTabs.tsx` (modification)

```typescript
export const topTabSections: TabSection[] = [
  // ... existing tabs ...
  {
    title: "Agents",
    options: [
      {
        title: "Import Agents",
        component: <AgentImportSection />,
        icon: "download", // Or appropriate icon
      },
    ],
  },
];
```

---

## UI/UX Design

### User Workflows

#### Workflow 1: First-Time Setup

```
1. User opens Continue Settings
2. Navigates to "Agents" → "Import Agents"
3. Clicks "Add Import Path"
4. Selects directory containing Claude Code agents
5. System automatically imports all agents
6. User sees list of imported agents
7. User can test agents via /agent-name in chat
```

#### Workflow 2: Creating a New Agent

```
1. User clicks "Create New Agent" button
2. Dialog opens with form:
   - Name field
   - Description field
   - System Message (optional)
   - Prompt Template (with context provider syntax hints)
3. User fills in fields
4. Clicks "Create Agent"
5. System validates and saves agent
6. Agent immediately available as /agent-name
```

#### Workflow 3: Editing an Existing Agent

```
1. User finds agent in "Imported Agents" list
2. Clicks "Edit" button
3. Same dialog as creation, pre-filled with current values
4. User makes changes
5. Clicks "Save"
6. System updates agent and triggers config reload
7. Updated agent immediately available
```

#### Workflow 4: Auto-Reload on File Change

```
1. User has auto-reload enabled
2. User edits agent file in external editor
3. File watcher detects change
4. System automatically reimports agent
5. Toast notification appears: "Agent updated: code-reviewer"
6. Agent is immediately available with new definition
```

### UI Mockup (Text Description)

```
┌─────────────────────────────────────────────────────────┐
│ Continue Settings                                  [×]  │
├──────────────┬──────────────────────────────────────────┤
│ Models       │ Agent Import                             │
│ Rules        │                                          │
│ Tools        │ ┌────────────────────────────────────┐   │
│ Configs      │ │ Enable Agent Import          [ON] │   │
│ Orgs         │ │ Auto Reload                  [ON] │   │
│► Agents ──┐  │ │ Naming Strategy      [Preserve ▾] │   │
│  Import   │  │ │ Conflict Resolution  [Rename   ▾] │   │
│           │  │ └────────────────────────────────────┘   │
│ Indexing  │  │                                          │
│ Settings  │  │ Import Paths              [Add Path]     │
│ Help      │  │ ┌────────────────────────────────────┐   │
│           │  │ │ ~/claude-code-agents      [Remove] │   │
│           │  │ │ .continue/custom-agents   [Remove] │   │
│           │  │ └────────────────────────────────────┘   │
│           │  │                                          │
│           │  │ Imported Agents (12)    [+ Create New]   │
│           │  │ [Reimport All]                           │
│           │  │                                          │
│           │  │ ┌────────────────────────────────────┐   │
│           │  │ │ code-reviewer          [active]    │   │
│           │  │ │ Review code for bugs...            │   │
│           │  │ │ /code-reviewer                     │   │
│           │  │ │ Source: ~/agents/reviewer.md       │   │
│           │  │ │           [Edit] [Disable] [Delete]│   │
│           │  │ └────────────────────────────────────┘   │
│           │  │                                          │
│           │  │ ┌────────────────────────────────────┐   │
│           │  │ │ test-generator         [active]    │   │
│           │  │ │ Generate unit tests...             │   │
│           │  │ │ /test-generator                    │   │
│           │  │ │ Source: ~/agents/test-gen.json     │   │
│           │  │ │           [Edit] [Disable] [Delete]│   │
│           │  │ └────────────────────────────────────┘   │
└──────────────┴──────────────────────────────────────────┘
```

### Agent Creation Dialog Mockup

```
┌─────────────────────────────────────────────┐
│ Create New Agent                       [×]  │
├─────────────────────────────────────────────┤
│                                             │
│ Agent Name                                  │
│ ┌─────────────────────────────────────────┐ │
│ │ code-reviewer                           │ │
│ └─────────────────────────────────────────┘ │
│ This will be the slash command name        │
│                                             │
│ Description                                 │
│ ┌─────────────────────────────────────────┐ │
│ │ Reviews code for bugs and improvements  │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ System Message (Optional)                   │
│ ┌─────────────────────────────────────────┐ │
│ │ You are an expert code reviewer with   │ │
│ │ deep knowledge of best practices...    │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ Prompt Template                             │
│ ┌─────────────────────────────────────────┐ │
│ │ Review the following code:             │ │
│ │                                         │ │
│ │ @currentFile                            │ │
│ │                                         │ │
│ │ Provide feedback on:                   │ │
│ │ 1. Potential bugs                      │ │
│ │ 2. Performance issues                  │ │
│ │ 3. Code style                          │ │
│ └─────────────────────────────────────────┘ │
│ Use @file, @codebase, @currentFile         │
│                                             │
│                        [Cancel] [Create]    │
└─────────────────────────────────────────────┘
```

---

## Technical Considerations

### Performance

**Import Performance**:
- Target: Import 100 agents in <500ms
- Strategy: Parallel processing with Promise.allSettled
- File reading optimized with streaming for large files

**File Watching**:
- Use native fs.watch (low overhead)
- Debounce file change events (300ms) to avoid duplicate imports
- Only watch configured directories, not recursive

**Config Reload**:
- Incremental reload: only re-parse changed agents
- Batch updates: collect multiple changes before triggering reload

### Error Handling

**Import Errors**:
```typescript
try {
  await importAgentFile(path);
} catch (error) {
  // Log error but continue with other agents
  const record: ImportedAgentRecord = {
    // ... agent data ...
    status: "error",
    errorMessage: error.message,
  };

  // Store errored agent for UI display
  this.importedAgents.set(record.id, record);

  // Show non-blocking notification
  void this.ide.showToast("warning", `Failed to import ${path}: ${error.message}`);
}
```

**File Watching Errors**:
- Gracefully degrade: disable auto-reload but keep manual reimport
- Show persistent error indicator in UI
- Provide "Retry" button

**Conflict Resolution**:
- Clear error messages when conflicts occur
- Suggest resolution strategy in error message
- Log conflicts to continue.log for debugging

### Security

**Path Validation**:
```typescript
function validateImportPath(path: string): boolean {
  // Prevent directory traversal
  const normalized = path.normalize(path);
  if (normalized.includes("..")) {
    return false;
  }

  // Ensure path is absolute
  if (!path.isAbsolute(normalized)) {
    return false;
  }

  // Check path exists and is directory
  return fs.existsSync(normalized) && fs.statSync(normalized).isDirectory();
}
```

**File Content Validation**:
- Sanitize agent names (remove special characters)
- Limit file size (max 1MB per agent file)
- Validate JSON schema for .json files
- Escape HTML/script tags in prompts

**Privilege Escalation**:
- Agent prompts run in same context as other prompts (no additional privileges)
- System messages cannot override security policies
- Tool execution still subject to tool policies

### Compatibility

**Backward Compatibility**:
- Existing slash commands unaffected
- Agent import opt-in (disabled by default)
- Old configs without agentImport field work as before

**Cross-Platform**:
- Path handling: use path.join, path.normalize
- File watching: test on Windows, macOS, Linux
- Path separators: handle both / and \

**IDE Compatibility**:
- VS Code: Full support
- JetBrains: Full support (binary architecture compatible)
- CLI: Support via config.yaml

---

## Migration & Compatibility

### Migration from Manual Prompts

Users with existing manual prompt files can:

1. **Keep existing prompts**: Agent import doesn't affect `.continue/prompts/`
2. **Migrate to agents**: Move prompts to agent import directory
3. **Hybrid approach**: Use both systems simultaneously

**No migration required** - this is a purely additive feature.

### Compatibility Matrix

| Component | Compatibility | Notes |
|-----------|---------------|-------|
| Existing slash commands | ✅ Full | No changes to existing system |
| Prompt files (.prompt) | ✅ Full | Agent import generates .prompt files |
| MCP prompts | ✅ Full | Independent systems |
| Custom commands (JSON) | ✅ Full | Not affected |
| Rules | ✅ Full | Not affected |
| VS Code extension | ✅ Full | Works out of box |
| JetBrains extension | ✅ Full | Binary architecture compatible |
| CLI | ✅ Full | Config via YAML |
| Web version | ⚠️ Limited | File watching not available (manual import only) |

---

## Testing Strategy

### Unit Tests

**File**: `/home/user/codeMode/core/agentImport/__tests__/parseAgent.test.ts`

```typescript
describe("parseAgentFile", () => {
  it("should parse JSON agent definition", async () => {
    const content = JSON.stringify({
      name: "test-agent",
      description: "Test",
      prompt: "Test prompt",
    });

    const result = await parseAgentFile("test.json", content);

    expect(result).toEqual({
      name: "test-agent",
      description: "Test",
      prompt: "Test prompt",
    });
  });

  it("should parse Markdown agent definition", async () => {
    const content = `---
name: test-agent
description: Test
---

Test prompt`;

    const result = await parseAgentFile("test.md", content);

    expect(result.name).toBe("test-agent");
    expect(result.prompt).toBe("Test prompt");
  });

  it("should handle invalid JSON gracefully", async () => {
    await expect(
      parseAgentFile("test.json", "invalid json")
    ).rejects.toThrow();
  });
});
```

### Integration Tests

**File**: `/home/user/codeMode/core/agentImport/__tests__/AgentImportService.test.ts`

```typescript
describe("AgentImportService", () => {
  let service: AgentImportService;
  let mockIde: IDE;
  let mockConfigHandler: ConfigHandler;

  beforeEach(() => {
    mockIde = createMockIde();
    mockConfigHandler = createMockConfigHandler();
    service = new AgentImportService(mockIde, mockConfigHandler);
  });

  it("should import agents from directory", async () => {
    mockIde.listDir = jest.fn().mockResolvedValue([
      "agent1.json",
      "agent2.md",
    ]);

    mockIde.readFile = jest.fn()
      .mockResolvedValueOnce(JSON.stringify({ name: "agent1", prompt: "test" }))
      .mockResolvedValueOnce("---\nname: agent2\n---\ntest");

    await service.initialize({
      enabled: true,
      importPaths: ["/test/agents"],
      autoReload: false,
      namingStrategy: "preserve",
      conflictResolution: "skip",
    });

    const agents = service.getImportedAgents();
    expect(agents).toHaveLength(2);
  });

  it("should handle file changes", async () => {
    // Setup service with watcher
    // Trigger file change event
    // Verify reimport and config reload
  });
});
```

### E2E Tests

**File**: `/home/user/codeMode/extensions/vscode/src/test/suite/agentImport.test.ts`

```typescript
describe("Agent Import E2E", () => {
  it("should import agents and make them available as slash commands", async () => {
    // 1. Create test agent file
    const agentPath = path.join(workspace, "test-agents", "reviewer.md");
    await fs.promises.writeFile(agentPath, `---
name: reviewer
description: Test
---
Review @currentFile`);

    // 2. Configure import path
    await configureAgentImport([path.dirname(agentPath)]);

    // 3. Wait for import
    await waitFor(() => getImportedAgents().length > 0);

    // 4. Verify slash command available
    const commands = await getSlashCommands();
    expect(commands).toContainEqual(
      expect.objectContaining({ name: "reviewer" })
    );

    // 5. Execute slash command
    const result = await executeSlashCommand("/reviewer");
    expect(result).toContain("Review");
  });
});
```

### Manual Testing Checklist

- [ ] Import agents from directory
- [ ] Create new agent via GUI
- [ ] Edit existing agent
- [ ] Delete agent
- [ ] Enable/disable agent
- [ ] Auto-reload on file change
- [ ] Conflict resolution (skip, rename, overwrite)
- [ ] Naming strategies (preserve, prefix, suffix)
- [ ] Slash command autocomplete shows imported agents
- [ ] Execute imported agent slash command
- [ ] Error handling for invalid agent files
- [ ] Multiple import paths
- [ ] Reimport all functionality

---

## Future Enhancements

### Phase 2 Features

1. **Agent Versioning**
   - Track version history of agents
   - Rollback to previous versions
   - Compare versions side-by-side

2. **Agent Marketplace**
   - Share agents with community
   - Browse and install published agents
   - Rate and review agents

3. **Advanced Agent Templates**
   - Multi-step agent workflows
   - Conditional logic in prompts
   - Agent composition (call other agents)

4. **Tool Integration**
   - Import tool definitions from Claude Code
   - Map Claude Code tools to Continue tools
   - Custom tool execution policies per agent

5. **Bi-Directional Sync**
   - Export Continue agents to Claude Code format
   - Two-way sync between tools
   - Conflict resolution for bidirectional changes

6. **Agent Analytics**
   - Track agent usage statistics
   - Performance metrics (tokens, latency)
   - User feedback collection

7. **Team Collaboration**
   - Shared agent repositories
   - Team-specific agent libraries
   - Access control and permissions

8. **Advanced Validation**
   - Schema validation for agent definitions
   - Prompt linting and suggestions
   - Performance optimization recommendations

### Technical Debt Considerations

1. **Refactor Prompt File System**
   - Unify v1 and v2 formats
   - Single parsing pipeline for all prompt sources
   - Improved error reporting

2. **Protocol Optimization**
   - Reduce protocol message overhead
   - Batch agent updates
   - Incremental sync

3. **GUI Performance**
   - Virtualize agent list for 1000+ agents
   - Lazy load agent details
   - Search and filter optimization

---

## Appendices

### Appendix A: Agent Definition Schema

```typescript
interface ClaudeCodeAgentDefinition {
  name: string;                        // Required: Slash command name
  description: string;                 // Required: Shown in autocomplete
  systemMessage?: string;              // Optional: LLM system message
  prompt: string;                      // Required: Template with context refs
  metadata?: {
    author?: string;
    version?: string;
    tags?: string[];
    createdAt?: string;
    updatedAt?: string;
    license?: string;
    repository?: string;
  };
}
```

### Appendix B: File Paths Reference

**Core Files (New)**:
- `/core/agentImport/types.ts` - Type definitions
- `/core/agentImport/parseAgent.ts` - Agent file parser
- `/core/agentImport/AgentImportService.ts` - Import service
- `/core/agentImport/__tests__/*` - Unit tests

**Core Files (Modified)**:
- `/core/config/ConfigHandler.ts` - Add agent import service
- `/core/index.d.ts` - Add agent import types to config
- `/core/protocol/core.ts` - Add agent import protocol messages
- `/core/core.ts` - Add agent import message handlers

**GUI Files (New)**:
- `/gui/src/pages/config/sections/AgentImportSection.tsx` - Main UI
- `/gui/src/pages/config/components/AgentCard.tsx` - Agent list item
- `/gui/src/pages/config/components/AgentCreationDialog.tsx` - Create/edit dialog

**GUI Files (Modified)**:
- `/gui/src/pages/config/configTabs.tsx` - Add agent import tab
- `/gui/src/redux/slices/configSlice.ts` - Add agent import state

**Config Files (Modified)**:
- `/packages/config-yaml/src/schemas/index.ts` - Add agent import schema

### Appendix C: Example Configurations

**Minimal Configuration** (config.yaml):
```yaml
agentImport:
  enabled: true
  importPaths:
    - ~/claude-code-agents
```

**Full Configuration** (config.yaml):
```yaml
agentImport:
  enabled: true
  importPaths:
    - ~/claude-code-agents
    - .continue/custom-agents
    - /shared/team-agents
  autoReload: true
  namingStrategy: prefix
  namePrefix: "cc-"
  nameSuffix: ""
  conflictResolution: rename
```

**Disabled Configuration** (default):
```yaml
agentImport:
  enabled: false
```

### Appendix D: Example Agent Files

**Example 1: JSON Format**
```json
{
  "name": "code-reviewer",
  "description": "Review code for bugs, performance, and style issues",
  "systemMessage": "You are an expert code reviewer with deep knowledge of software engineering best practices, security vulnerabilities, and performance optimization.",
  "prompt": "Review the following code:\n\n@currentFile\n\nProvide detailed feedback on:\n1. Potential bugs or logic errors\n2. Performance issues or optimization opportunities\n3. Code style and readability\n4. Security vulnerabilities\n5. Best practice violations\n\nFor each issue, explain why it's a problem and suggest a specific fix.",
  "metadata": {
    "author": "dev-team@example.com",
    "version": "1.2.0",
    "tags": ["review", "quality", "security"],
    "createdAt": "2024-01-15",
    "license": "MIT"
  }
}
```

**Example 2: Markdown Format**
```markdown
---
name: test-generator
description: Generate comprehensive unit tests for code
author: qa-team@example.com
version: 2.0.0
tags: [testing, quality, automation]
---

<system>
You are a QA engineer specializing in test automation. You write comprehensive,
maintainable unit tests that cover edge cases and follow testing best practices.
</system>

Generate unit tests for the following code:

@currentFile

Requirements:
- Use the testing framework appropriate for this language
- Cover happy path, edge cases, and error conditions
- Include setup and teardown if needed
- Add descriptive test names
- Aim for >90% code coverage

Please organize tests logically and add comments explaining complex test cases.
```

### Appendix E: Troubleshooting Guide

**Issue**: Agents not appearing in slash command list

**Solution**:
1. Check agent import is enabled in settings
2. Verify import paths are correct and accessible
3. Check Continue logs for import errors
4. Try "Reimport All" button
5. Verify agent files have valid format

---

**Issue**: File changes not triggering reload

**Solution**:
1. Verify auto-reload is enabled
2. Check file watcher permissions
3. Look for errors in Continue logs
4. Try manual reimport
5. Restart Continue extension

---

**Issue**: Agent conflicts during import

**Solution**:
1. Check conflict resolution strategy in settings
2. Use "rename" strategy to auto-resolve
3. Or manually rename conflicting agents
4. Check imported agents list for duplicates

---

## Conclusion

This design provides a comprehensive solution for importing Claude Code agents into Continue as prompt templates accessible via slash commands. The implementation leverages Continue's existing architecture while adding specialized support for agent import, management, and hot reload.

**Key Benefits**:
- **Seamless integration** with existing slash command system
- **User-friendly GUI** for managing agents
- **Hot reload support** for rapid iteration
- **Flexible configuration** with sensible defaults
- **Extensible architecture** for future enhancements

**Next Steps**:
1. Review and approve design
2. Create implementation tickets
3. Implement Phase 1 (Core + Protocol)
4. Implement Phase 2 (GUI)
5. Write tests
6. Beta testing with select users
7. Documentation and release

---

**Document Version History**:
- v1.0 (2025-11-18): Initial design proposal

# Technical Specification: Execution Replay

**Feature Name:** Execution Replay
**Version:** 1.0
**Date:** 2025-11-17
**Status:** Draft
**Related PRD:** [prd-execution-replay.md](./prd-execution-replay.md)

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Data Models](#data-models)
3. [Core Components](#core-components)
4. [API Specifications](#api-specifications)
5. [Storage Layer](#storage-layer)
6. [Parameterization Engine](#parameterization-engine)
7. [Replay Execution Engine](#replay-execution-engine)
8. [UI Components](#ui-components)
9. [Security Considerations](#security-considerations)
10. [Performance Optimization](#performance-optimization)
11. [Testing Strategy](#testing-strategy)
12. [Migration & Compatibility](#migration--compatibility)
13. [Implementation Phases](#implementation-phases)

---

## Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        GUI Layer                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Workflow    │  │   Workflow   │  │    Replay    │      │
│  │  Library UI  │  │  Detail View │  │  Config UI   │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
└─────────┼──────────────────┼──────────────────┼─────────────┘
          │                  │                  │
┌─────────┼──────────────────┼──────────────────┼─────────────┐
│         │         Core Workflow Layer         │             │
│  ┌──────▼───────┐  ┌──────▼────────┐  ┌──────▼────────┐    │
│  │   Workflow   │  │  Workflow     │  │    Replay     │    │
│  │   Capture    │  │  Manager      │  │    Engine     │    │
│  └──────┬───────┘  └──────┬────────┘  └──────┬────────┘    │
│         │                  │                  │             │
│  ┌──────▼──────────────────▼──────────────────▼────────┐    │
│  │        Parameter Detection & Extraction             │    │
│  └──────────────────────────┬───────────────────────────┘    │
└─────────────────────────────┼───────────────────────────────┘
                              │
┌─────────────────────────────┼───────────────────────────────┐
│                      Storage Layer                          │
│  ┌───────────────┐  ┌──────▼────────┐  ┌──────────────┐    │
│  │   Session     │  │   Workflow    │  │   Replay     │    │
│  │   Storage     │  │   Storage     │  │   History    │    │
│  │ (existing)    │  │    (new)      │  │    (new)     │    │
│  └───────────────┘  └───────────────┘  └──────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────┼───────────────────────────────┐
│                   Execution Layer (existing)                │
│  ┌──────────────┐  ┌───────▼───────┐  ┌──────────────┐     │
│  │  Tool Call   │  │   E2B Sandbox │  │     MCP      │     │
│  │   Executor   │  │    Manager    │  │    Bridge    │     │
│  └──────────────┘  └───────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

### Component Interaction Flow

#### Workflow Capture Flow

```
User Session (Core)
      │
      ├─ Multiple Tool Calls Execute
      │  └─ ToolCallStates[] accumulate
      │
      ├─ Session completion detected
      │  └─ Heuristic analysis runs
      │      └─ isReplayWorthy(session) → true
      │
      ├─ GUI shows "Save Workflow" suggestion
      │
      ├─ User clicks "Save"
      │  └─ WorkflowCaptureDialog opens
      │      ├─ Parameter detection runs
      │      ├─ User provides metadata
      │      └─ User confirms parameters
      │
      └─ WorkflowCapture.captureFromSession()
         ├─ Extract tool call sequence
         ├─ Apply parameterization
         ├─ Sanitize sensitive data
         ├─ Generate workflow object
         └─ WorkflowStorage.save(workflow)
            └─ Write to ~/.continue/workflows/{id}.json
```

#### Workflow Replay Flow

```
User selects workflow from library
      │
      ├─ WorkflowManager.load(workflowId)
      │  └─ Returns Workflow object
      │
      ├─ ReplayConfigDialog opens
      │  ├─ ParameterExtractor.detectParameters(workflow)
      │  ├─ ContextAnalyzer.suggestDefaults(currentContext)
      │  └─ User configures parameters
      │
      ├─ User clicks "Start Replay"
      │  └─ ReplayEngine.execute(workflow, config)
      │
      └─ For each step in workflow.steps:
         ├─ ParameterInjector.applyParameters(step, config)
         ├─ ToolCallExecutor.execute(toolCall, context)
         │  └─ (Existing tool execution flow)
         ├─ ReplayHistory.recordStepResult(stepResult)
         ├─ GUI updates progress
         └─ If error:
            ├─ ReplayEngine.handleError(error, config)
            └─ User chooses: retry | skip | abort
```

---

## Data Models

### Core Type Definitions

```typescript
// =====================================================
// Workflow Types
// =====================================================

/**
 * Complete workflow definition including metadata, steps, and statistics
 */
interface Workflow {
  version: string; // Format version (e.g., "1.0")
  metadata: WorkflowMetadata;
  parameters: WorkflowParameter[];
  steps: WorkflowStep[];
  statistics: WorkflowStatistics;
}

/**
 * Workflow metadata and identification
 */
interface WorkflowMetadata {
  id: string; // Unique identifier (wf_...)
  name: string; // User-provided name
  description: string; // User-provided description
  tags: string[]; // Categorization tags
  createdAt: string; // ISO 8601 timestamp
  createdBy?: string; // User identifier
  lastModified: string; // ISO 8601 timestamp
  modifiedBy?: string; // User identifier
  workspaceDirectory: string; // Original workspace path
  sourceSessionId: string; // Original session ID
  starred?: boolean; // User favorited
  archived?: boolean; // Hidden from main library
}

/**
 * Parameterizable value within a workflow
 */
interface WorkflowParameter {
  id: string; // Unique parameter ID (param_...)
  name: string; // Variable name (e.g., "targetFile")
  description: string; // Human-readable description
  type: ParameterType; // Data type
  defaultValue: any; // Default value (from original execution)
  required: boolean; // Must be provided for replay
  validation?: ParameterValidation; // Optional validation rules
  suggestedValues?: any[]; // Common/suggested values
}

/**
 * Parameter data types
 */
type ParameterType =
  | "string"
  | "number"
  | "boolean"
  | "file_path"
  | "directory_path"
  | "enum"
  | "json"
  | "code";

/**
 * Parameter validation rules
 */
interface ParameterValidation {
  pattern?: string; // Regex pattern (for strings)
  min?: number; // Minimum value (for numbers)
  max?: number; // Maximum value (for numbers)
  fileExtensions?: string[]; // Allowed extensions (for file_path)
  options?: any[]; // Allowed values (for enum)
  customValidator?: string; // Custom validation function name
}

/**
 * Single step in a workflow (maps to one tool call)
 */
interface WorkflowStep {
  id: string; // Unique step ID (step_...)
  name: string; // Human-readable step name
  description?: string; // Optional step description
  toolCall: ToolCall; // Original tool call (from ChatMessage)
  parsedArgs: Record<string, any>; // Parsed arguments with parameter placeholders
  contextItems?: ContextItemWithId[]; // Context items used
  expectedOutput?: StepExpectedOutput; // Captured output from original execution
  groupId?: string; // Optional logical grouping
  continueOnError?: boolean; // Whether to continue if this step fails
  timeout?: number; // Optional timeout in milliseconds
}

/**
 * Expected output from a step (for comparison/validation)
 */
interface StepExpectedOutput {
  type: "context_items" | "error" | "empty";
  summary?: string; // Brief summary of output
  duration?: number; // Execution duration in ms
  contentHash?: string; // Hash of output content (for comparison)
  outputItems?: ContextItem[]; // Actual output (may be truncated)
}

/**
 * Workflow execution statistics
 */
interface WorkflowStatistics {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  lastRunAt?: string; // ISO 8601 timestamp
  lastSuccessAt?: string; // ISO 8601 timestamp
  avgDuration?: number; // Average duration in ms
  executions: ReplayExecution[]; // Recent execution history (limited)
}

// =====================================================
// Replay Types
// =====================================================

/**
 * Configuration for a workflow replay
 */
interface ReplayConfig {
  workflowId: string;
  parameters: Record<string, any>; // Parameter values for this replay
  executionMode: ReplayExecutionMode;
  errorHandling: ReplayErrorHandling;
  workspaceDirectory?: string; // Override workspace (optional)
  contextOverrides?: ContextOverride[]; // Override context items
}

/**
 * Replay execution modes
 */
type ReplayExecutionMode =
  | "auto" // Execute all steps automatically
  | "confirmation" // Prompt before each step
  | "preview"; // Dry run (don't execute, just show plan)

/**
 * Error handling strategy
 */
type ReplayErrorHandling =
  | "fail_fast" // Stop on first error
  | "continue" // Continue to next step on error
  | "prompt"; // Ask user what to do on error

/**
 * Override context items for replay
 */
interface ContextOverride {
  originalItemId: string;
  newContent?: string;
  newPath?: string;
}

/**
 * Record of a workflow replay execution
 */
interface ReplayExecution {
  runId: string; // Unique execution ID (exec_...)
  workflowId: string;
  workflowVersion: string; // Workflow version at time of execution
  startedAt: string; // ISO 8601 timestamp
  completedAt?: string; // ISO 8601 timestamp (null if running)
  status: ReplayExecutionStatus;
  parameters: Record<string, any>; // Parameters used
  config: ReplayConfig; // Full configuration
  stepResults: StepExecutionResult[];
  error?: Error; // Error if execution failed
  sessionId?: string; // Created session ID (if applicable)
}

/**
 * Replay execution status
 */
type ReplayExecutionStatus =
  | "pending" // Not started
  | "running" // Currently executing
  | "completed" // Completed successfully
  | "failed" // Failed with error
  | "canceled" // Canceled by user
  | "partial"; // Some steps succeeded, some failed

/**
 * Result of executing a single step
 */
interface StepExecutionResult {
  stepId: string;
  startedAt: string; // ISO 8601 timestamp
  completedAt?: string; // ISO 8601 timestamp
  status: "success" | "error" | "skipped" | "canceled";
  duration?: number; // Duration in ms
  output?: ContextItem[]; // Actual output
  error?: Error; // Error if step failed
  outputMatchesExpected?: boolean; // Comparison result
  retryCount?: number; // Number of retries attempted
}

// =====================================================
// Parameterization Types
// =====================================================

/**
 * Detected parameter candidate during capture
 */
interface ParameterCandidate {
  path: string[]; // JSON path in arguments (e.g., ["code", "filepath"])
  originalValue: any; // Original value from execution
  suggestedName: string; // Suggested parameter name
  suggestedType: ParameterType; // Detected type
  confidence: number; // Confidence score (0-1)
  reason: string; // Why this was detected as parameter
  occurrences: number; // How many times this value appears
}

/**
 * Parameter detection strategy
 */
interface ParameterDetectionStrategy {
  name: string; // Strategy name
  detect: (args: any, context: DetectionContext) => ParameterCandidate[];
  priority: number; // Higher priority runs first
}

/**
 * Context for parameter detection
 */
interface DetectionContext {
  workspaceDirectory: string;
  toolCallHistory: ToolCallState[];
  sessionHistory: ChatHistoryItem[];
}

// =====================================================
// Storage Types
// =====================================================

/**
 * Workflow index entry (for fast library loading)
 */
interface WorkflowIndexEntry {
  id: string;
  name: string;
  description: string;
  tags: string[];
  createdAt: string;
  lastModified: string;
  lastRunAt?: string;
  successRate: number; // successfulRuns / totalRuns
  totalRuns: number;
  starred: boolean;
  archived: boolean;
}

/**
 * Workflow collection (folder/grouping)
 */
interface WorkflowCollection {
  id: string;
  name: string;
  description?: string;
  workflowIds: string[];
  createdAt: string;
  lastModified: string;
}

/**
 * Workflow storage manifest (index file)
 */
interface WorkflowManifest {
  version: string; // Manifest format version
  workflows: WorkflowIndexEntry[];
  collections: WorkflowCollection[];
  lastUpdated: string;
}

// =====================================================
// Export/Import Types
// =====================================================

/**
 * Exportable workflow format (sanitized)
 */
interface ExportedWorkflow {
  version: string;
  metadata: Omit<WorkflowMetadata, "id" | "createdBy" | "modifiedBy" | "sourceSessionId">;
  parameters: WorkflowParameter[];
  steps: ExportedWorkflowStep[];
  documentation?: string; // Optional markdown documentation
}

/**
 * Exported step (with sensitive data removed)
 */
interface ExportedWorkflowStep {
  name: string;
  description?: string;
  toolCall: ToolCall; // Sanitized tool call
  parsedArgs: Record<string, any>; // Sanitized arguments
  expectedOutput?: Omit<StepExpectedOutput, "outputItems">; // No actual outputs
}

/**
 * Workflow import result
 */
interface WorkflowImportResult {
  success: boolean;
  workflow?: Workflow;
  errors: string[];
  warnings: string[];
  requiresManualConfiguration: boolean;
  missingDependencies: string[]; // Tools/MCP servers not available
}

// =====================================================
// UI State Types
// =====================================================

/**
 * Workflow library UI state
 */
interface WorkflowLibraryState {
  workflows: WorkflowIndexEntry[];
  selectedWorkflowId?: string;
  searchQuery: string;
  selectedTags: string[];
  sortBy: "recent" | "name" | "success_rate" | "most_used";
  viewMode: "grid" | "list";
  showArchived: boolean;
}

/**
 * Replay progress state
 */
interface ReplayProgressState {
  execution: ReplayExecution;
  currentStepIndex: number;
  isPaused: boolean;
  canCancel: boolean;
  canRetry: boolean;
  estimatedTimeRemaining?: number;
}
```

---

## Core Components

### 1. Workflow Capture

**File**: `core/workflow/capture.ts`

```typescript
/**
 * Captures workflows from completed sessions
 */
export class WorkflowCapture {
  /**
   * Analyze session and determine if it's worth capturing as workflow
   */
  static isReplayWorthy(session: Session): boolean {
    const toolCalls = this.extractToolCallStates(session);

    // Minimum 3 tool calls
    if (toolCalls.length < 3) return false;

    // All tool calls successful
    const allSuccessful = toolCalls.every(tc => tc.status === "done");
    if (!allSuccessful) return false;

    // Session duration > 5 minutes
    const duration = this.calculateSessionDuration(session);
    if (duration < 5 * 60 * 1000) return false;

    // Not abandoned (has recent activity)
    const lastActivity = this.getLastActivityTime(session);
    const timeSinceActivity = Date.now() - lastActivity;
    if (timeSinceActivity > 30 * 60 * 1000) return false; // 30 min

    return true;
  }

  /**
   * Capture workflow from session
   */
  static async captureFromSession(
    session: Session,
    metadata: Partial<WorkflowMetadata>,
    options?: CaptureOptions
  ): Promise<Workflow> {
    // Extract tool call sequence
    const toolCalls = this.extractToolCallStates(session);

    // Detect parameters
    const parameterCandidates = await ParameterDetector.detect(
      toolCalls,
      session,
      options?.detectionStrategies
    );

    // Allow user to confirm/modify parameters
    const confirmedParameters = options?.autoConfirmParameters
      ? parameterCandidates.map(c => this.candidateToParameter(c))
      : await this.confirmParametersWithUser(parameterCandidates);

    // Build workflow steps with parameterization
    const steps = await this.buildWorkflowSteps(
      toolCalls,
      confirmedParameters,
      session
    );

    // Generate workflow object
    const workflow: Workflow = {
      version: "1.0",
      metadata: {
        id: this.generateWorkflowId(),
        name: metadata.name || "Untitled Workflow",
        description: metadata.description || "",
        tags: metadata.tags || [],
        createdAt: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        workspaceDirectory: session.workspaceDirectory,
        sourceSessionId: session.sessionId,
        starred: false,
        archived: false,
      },
      parameters: confirmedParameters,
      steps: steps,
      statistics: {
        totalRuns: 0,
        successfulRuns: 0,
        failedRuns: 0,
        executions: [],
      },
    };

    // Sanitize sensitive data
    const sanitized = await this.sanitizeWorkflow(workflow);

    return sanitized;
  }

  /**
   * Extract all tool call states from session history
   */
  private static extractToolCallStates(session: Session): ToolCallState[] {
    const toolCalls: ToolCallState[] = [];

    for (const historyItem of session.history) {
      if (historyItem.toolCallStates) {
        toolCalls.push(...historyItem.toolCallStates);
      }
    }

    return toolCalls.filter(tc => tc.status === "done");
  }

  /**
   * Build workflow steps with parameter placeholders
   */
  private static async buildWorkflowSteps(
    toolCalls: ToolCallState[],
    parameters: WorkflowParameter[],
    session: Session
  ): Promise<WorkflowStep[]> {
    const steps: WorkflowStep[] = [];

    for (let i = 0; i < toolCalls.length; i++) {
      const toolCall = toolCalls[i];

      // Apply parameterization to arguments
      const parameterizedArgs = ParameterInjector.parameterize(
        toolCall.parsedArgs,
        parameters
      );

      // Capture expected output
      const expectedOutput: StepExpectedOutput = {
        type: toolCall.output ? "context_items" : "empty",
        summary: this.summarizeOutput(toolCall.output),
        duration: this.calculateToolCallDuration(toolCall),
        contentHash: this.hashOutput(toolCall.output),
        outputItems: toolCall.output, // May be truncated later
      };

      steps.push({
        id: `step_${i + 1}`,
        name: this.generateStepName(toolCall, i + 1),
        toolCall: toolCall.toolCall,
        parsedArgs: parameterizedArgs,
        contextItems: this.extractContextItems(toolCall, session),
        expectedOutput: expectedOutput,
        continueOnError: false,
      });
    }

    return steps;
  }

  /**
   * Sanitize workflow to remove sensitive data
   */
  private static async sanitizeWorkflow(workflow: Workflow): Promise<Workflow> {
    const sanitizer = new WorkflowSanitizer();
    return sanitizer.sanitize(workflow);
  }
}

/**
 * Capture options
 */
interface CaptureOptions {
  autoConfirmParameters?: boolean;
  detectionStrategies?: ParameterDetectionStrategy[];
  includeOutputs?: boolean;
  maxOutputSize?: number;
}
```

### 2. Parameter Detection

**File**: `core/workflow/parameterDetection.ts`

```typescript
/**
 * Detects parameterizable values in tool call arguments
 */
export class ParameterDetector {
  private strategies: ParameterDetectionStrategy[] = [
    new FilePathDetectionStrategy(),
    new VariableNameDetectionStrategy(),
    new StringLiteralDetectionStrategy(),
    new ConfigValueDetectionStrategy(),
  ];

  /**
   * Detect parameter candidates from tool calls
   */
  static async detect(
    toolCalls: ToolCallState[],
    session: Session,
    customStrategies?: ParameterDetectionStrategy[]
  ): Promise<ParameterCandidate[]> {
    const detector = new ParameterDetector();

    if (customStrategies) {
      detector.strategies = [...customStrategies, ...detector.strategies];
      detector.strategies.sort((a, b) => b.priority - a.priority);
    }

    const context: DetectionContext = {
      workspaceDirectory: session.workspaceDirectory,
      toolCallHistory: toolCalls,
      sessionHistory: session.history,
    };

    const allCandidates: ParameterCandidate[] = [];

    // Run each strategy
    for (const strategy of detector.strategies) {
      for (const toolCall of toolCalls) {
        const candidates = strategy.detect(toolCall.parsedArgs, context);
        allCandidates.push(...candidates);
      }
    }

    // Deduplicate and rank
    const deduplicated = this.deduplicateCandidates(allCandidates);
    const ranked = this.rankCandidates(deduplicated);

    return ranked;
  }

  /**
   * Deduplicate candidates with same path
   */
  private static deduplicateCandidates(
    candidates: ParameterCandidate[]
  ): ParameterCandidate[] {
    const seen = new Map<string, ParameterCandidate>();

    for (const candidate of candidates) {
      const key = candidate.path.join(".");
      const existing = seen.get(key);

      if (!existing || candidate.confidence > existing.confidence) {
        seen.set(key, candidate);
      } else {
        // Merge occurrences
        existing.occurrences += candidate.occurrences;
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Rank candidates by confidence and occurrences
   */
  private static rankCandidates(
    candidates: ParameterCandidate[]
  ): ParameterCandidate[] {
    return candidates.sort((a, b) => {
      // Higher confidence first
      if (a.confidence !== b.confidence) {
        return b.confidence - a.confidence;
      }
      // More occurrences first
      return b.occurrences - a.occurrences;
    });
  }
}

/**
 * Detects file paths in arguments
 */
class FilePathDetectionStrategy implements ParameterDetectionStrategy {
  name = "file_path";
  priority = 100;

  detect(args: any, context: DetectionContext): ParameterCandidate[] {
    const candidates: ParameterCandidate[] = [];

    this.traverse(args, [], (path, value) => {
      if (this.isFilePath(value, context)) {
        candidates.push({
          path: path,
          originalValue: value,
          suggestedName: this.extractFileName(value, path),
          suggestedType: "file_path",
          confidence: 0.9,
          reason: "Value matches file path pattern",
          occurrences: 1,
        });
      }
    });

    return candidates;
  }

  private isFilePath(value: any, context: DetectionContext): boolean {
    if (typeof value !== "string") return false;

    // Check if looks like file path
    const hasPathSeparator = value.includes("/") || value.includes("\\");
    const hasFileExtension = /\.[a-z0-9]+$/i.test(value);
    const isRelativeToWorkspace = value.startsWith(context.workspaceDirectory);

    return hasPathSeparator && (hasFileExtension || isRelativeToWorkspace);
  }

  private extractFileName(path: string, jsonPath: string[]): string {
    // Try to get meaningful name from JSON path or file name
    const fileName = path.split(/[/\\]/).pop()?.split(".")[0];
    const pathKey = jsonPath[jsonPath.length - 1];

    return fileName || pathKey || "targetFile";
  }

  private traverse(
    obj: any,
    currentPath: string[],
    callback: (path: string[], value: any) => void
  ): void {
    if (typeof obj !== "object" || obj === null) {
      callback(currentPath, obj);
      return;
    }

    for (const [key, value] of Object.entries(obj)) {
      this.traverse(value, [...currentPath, key], callback);
    }
  }
}

/**
 * Detects variable/identifier names in code
 */
class VariableNameDetectionStrategy implements ParameterDetectionStrategy {
  name = "variable_name";
  priority = 80;

  detect(args: any, context: DetectionContext): ParameterCandidate[] {
    const candidates: ParameterCandidate[] = [];

    // Look for code arguments
    if (args.code && typeof args.code === "string") {
      const identifiers = this.extractIdentifiers(args.code);

      // Find identifiers that appear multiple times (likely parameterizable)
      const frequentIdentifiers = identifiers.filter(id => id.count > 2);

      for (const identifier of frequentIdentifiers) {
        candidates.push({
          path: ["code"], // Path to code argument
          originalValue: identifier.name,
          suggestedName: identifier.name,
          suggestedType: "string",
          confidence: 0.6,
          reason: `Identifier "${identifier.name}" appears ${identifier.count} times`,
          occurrences: identifier.count,
        });
      }
    }

    return candidates;
  }

  private extractIdentifiers(code: string): Array<{ name: string; count: number }> {
    // Simple regex-based extraction (could be enhanced with AST parsing)
    const identifierRegex = /\b[a-zA-Z_][a-zA-Z0-9_]*\b/g;
    const matches = code.match(identifierRegex) || [];

    const counts = new Map<string, number>();
    for (const match of matches) {
      counts.set(match, (counts.get(match) || 0) + 1);
    }

    return Array.from(counts.entries()).map(([name, count]) => ({ name, count }));
  }
}

/**
 * Detects string literals in arguments
 */
class StringLiteralDetectionStrategy implements ParameterDetectionStrategy {
  name = "string_literal";
  priority = 50;

  detect(args: any, context: DetectionContext): ParameterCandidate[] {
    const candidates: ParameterCandidate[] = [];

    this.traverse(args, [], (path, value) => {
      if (typeof value === "string" && value.length > 3 && value.length < 100) {
        // Skip common constants
        if (this.isLikelyConstant(value)) return;

        candidates.push({
          path: path,
          originalValue: value,
          suggestedName: this.generateName(path),
          suggestedType: "string",
          confidence: 0.3,
          reason: "String literal that may vary",
          occurrences: 1,
        });
      }
    });

    return candidates;
  }

  private isLikelyConstant(value: string): boolean {
    // Skip single words, URLs, common keywords
    const commonKeywords = ["true", "false", "null", "undefined", "auto"];
    if (commonKeywords.includes(value.toLowerCase())) return true;

    // Skip URLs
    if (value.startsWith("http://") || value.startsWith("https://")) return true;

    return false;
  }

  private generateName(path: string[]): string {
    return path[path.length - 1] || "value";
  }

  private traverse(
    obj: any,
    currentPath: string[],
    callback: (path: string[], value: any) => void
  ): void {
    if (typeof obj !== "object" || obj === null) {
      callback(currentPath, obj);
      return;
    }

    for (const [key, value] of Object.entries(obj)) {
      this.traverse(value, [...currentPath, key], callback);
    }
  }
}

/**
 * Detects configuration values (numbers, booleans)
 */
class ConfigValueDetectionStrategy implements ParameterDetectionStrategy {
  name = "config_value";
  priority = 40;

  detect(args: any, context: DetectionContext): ParameterCandidate[] {
    const candidates: ParameterCandidate[] = [];

    this.traverse(args, [], (path, value) => {
      const key = path[path.length - 1];

      // Detect numbers that look like configuration
      if (typeof value === "number" && this.isConfigNumber(key)) {
        candidates.push({
          path: path,
          originalValue: value,
          suggestedName: key,
          suggestedType: "number",
          confidence: 0.5,
          reason: `Number in config-like key: ${key}`,
          occurrences: 1,
        });
      }

      // Detect booleans
      if (typeof value === "boolean") {
        candidates.push({
          path: path,
          originalValue: value,
          suggestedName: key,
          suggestedType: "boolean",
          confidence: 0.4,
          reason: `Boolean flag: ${key}`,
          occurrences: 1,
        });
      }
    });

    return candidates;
  }

  private isConfigNumber(key: string): boolean {
    const configKeywords = [
      "count", "limit", "max", "min", "timeout", "threshold",
      "depth", "size", "length", "width", "height", "port"
    ];

    return configKeywords.some(keyword =>
      key.toLowerCase().includes(keyword)
    );
  }

  private traverse(
    obj: any,
    currentPath: string[],
    callback: (path: string[], value: any) => void
  ): void {
    if (typeof obj !== "object" || obj === null) {
      callback(currentPath, obj);
      return;
    }

    for (const [key, value] of Object.entries(obj)) {
      this.traverse(value, [...currentPath, key], callback);
    }
  }
}
```

### 3. Replay Engine

**File**: `core/workflow/replayEngine.ts`

```typescript
/**
 * Executes workflow replays
 */
export class ReplayEngine {
  private execution: ReplayExecution | null = null;
  private isPaused = false;
  private cancelRequested = false;

  /**
   * Execute a workflow with given configuration
   */
  async execute(
    workflow: Workflow,
    config: ReplayConfig,
    callbacks?: ReplayCallbacks
  ): Promise<ReplayExecution> {
    // Initialize execution record
    this.execution = {
      runId: this.generateExecutionId(),
      workflowId: workflow.metadata.id,
      workflowVersion: workflow.version,
      startedAt: new Date().toISOString(),
      status: "running",
      parameters: config.parameters,
      config: config,
      stepResults: [],
    };

    try {
      // Pre-flight checks
      await this.preflightChecks(workflow, config);

      // Execute each step
      for (let i = 0; i < workflow.steps.length; i++) {
        // Check for pause/cancel
        await this.checkPauseCancel();

        const step = workflow.steps[i];

        // Prompt user if in confirmation mode
        if (config.executionMode === "confirmation") {
          const shouldContinue = await callbacks?.onStepConfirmation?.(step, i);
          if (!shouldContinue) {
            this.execution.status = "canceled";
            break;
          }
        }

        // Skip in preview mode
        if (config.executionMode === "preview") {
          this.execution.stepResults.push({
            stepId: step.id,
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            status: "skipped",
            duration: 0,
          });
          continue;
        }

        // Execute step
        callbacks?.onStepStart?.(step, i);
        const result = await this.executeStep(step, config, workflow);
        this.execution.stepResults.push(result);
        callbacks?.onStepComplete?.(step, i, result);

        // Handle errors
        if (result.status === "error") {
          const shouldContinue = await this.handleStepError(
            step,
            result,
            config,
            callbacks
          );

          if (!shouldContinue) {
            this.execution.status = "failed";
            break;
          }
        }
      }

      // Update final status
      if (this.execution.status === "running") {
        const allSucceeded = this.execution.stepResults.every(
          r => r.status === "success" || r.status === "skipped"
        );
        this.execution.status = allSucceeded ? "completed" : "partial";
      }

      this.execution.completedAt = new Date().toISOString();

      // Update workflow statistics
      await this.updateWorkflowStatistics(workflow, this.execution);

      // Save execution history
      await ReplayHistory.save(this.execution);

      return this.execution;

    } catch (error) {
      this.execution.status = "failed";
      this.execution.error = error as Error;
      this.execution.completedAt = new Date().toISOString();

      await ReplayHistory.save(this.execution);
      throw error;
    }
  }

  /**
   * Execute a single workflow step
   */
  private async executeStep(
    step: WorkflowStep,
    config: ReplayConfig,
    workflow: Workflow
  ): Promise<StepExecutionResult> {
    const result: StepExecutionResult = {
      stepId: step.id,
      startedAt: new Date().toISOString(),
      status: "success",
      retryCount: 0,
    };

    try {
      // Apply parameters to step arguments
      const injectedArgs = ParameterInjector.inject(
        step.parsedArgs,
        config.parameters
      );

      // Prepare context items with parameter injection
      const contextItems = await this.prepareContextItems(
        step.contextItems,
        config
      );

      // Build tool call with injected arguments
      const toolCall: ToolCall = {
        ...step.toolCall,
        function: {
          ...step.toolCall.function,
          arguments: JSON.stringify(injectedArgs),
        },
      };

      // Execute tool call (using existing execution infrastructure)
      const startTime = Date.now();
      const output = await this.executeToolCall(
        toolCall,
        contextItems,
        config.workspaceDirectory || workflow.metadata.workspaceDirectory
      );
      const endTime = Date.now();

      result.completedAt = new Date().toISOString();
      result.duration = endTime - startTime;
      result.output = output;

      // Compare with expected output (if available)
      if (step.expectedOutput) {
        result.outputMatchesExpected = this.compareOutputs(
          output,
          step.expectedOutput
        );
      }

    } catch (error) {
      result.status = "error";
      result.error = error as Error;
      result.completedAt = new Date().toISOString();
    }

    return result;
  }

  /**
   * Execute tool call (delegates to existing infrastructure)
   */
  private async executeToolCall(
    toolCall: ToolCall,
    contextItems: ContextItemWithId[],
    workspaceDirectory: string
  ): Promise<ContextItem[]> {
    // Import existing tool call executor
    const { callTool } = await import("../tools/callTool");

    // Parse arguments
    const args = JSON.parse(toolCall.function.arguments);

    // Execute tool
    const result = await callTool(
      toolCall.function.name,
      args,
      {
        workspaceDirectory,
        contextItems,
        // ... other necessary context
      }
    );

    return result;
  }

  /**
   * Pre-flight checks before execution
   */
  private async preflightChecks(
    workflow: Workflow,
    config: ReplayConfig
  ): Promise<void> {
    // Validate all required parameters provided
    for (const param of workflow.parameters) {
      if (param.required && !(param.name in config.parameters)) {
        throw new Error(`Required parameter missing: ${param.name}`);
      }
    }

    // Validate parameter values
    for (const param of workflow.parameters) {
      const value = config.parameters[param.name];
      if (value !== undefined) {
        await this.validateParameter(param, value);
      }
    }

    // Check workspace exists
    const workspaceDir = config.workspaceDirectory || workflow.metadata.workspaceDirectory;
    const fs = await import("fs/promises");
    try {
      await fs.access(workspaceDir);
    } catch {
      throw new Error(`Workspace directory not found: ${workspaceDir}`);
    }

    // Check tool availability
    const { getAvailableTools } = await import("../tools/registry");
    const availableTools = getAvailableTools();

    for (const step of workflow.steps) {
      const toolName = step.toolCall.function.name;
      if (!availableTools.includes(toolName)) {
        throw new Error(`Required tool not available: ${toolName}`);
      }
    }
  }

  /**
   * Validate parameter value against rules
   */
  private async validateParameter(
    param: WorkflowParameter,
    value: any
  ): Promise<void> {
    // Type check
    if (param.type === "number" && typeof value !== "number") {
      throw new Error(`Parameter ${param.name} must be a number`);
    }

    if (param.type === "boolean" && typeof value !== "boolean") {
      throw new Error(`Parameter ${param.name} must be a boolean`);
    }

    if (param.type === "string" && typeof value !== "string") {
      throw new Error(`Parameter ${param.name} must be a string`);
    }

    // Additional validation rules
    if (param.validation) {
      const validation = param.validation;

      // Pattern matching
      if (validation.pattern && typeof value === "string") {
        const regex = new RegExp(validation.pattern);
        if (!regex.test(value)) {
          throw new Error(
            `Parameter ${param.name} doesn't match pattern: ${validation.pattern}`
          );
        }
      }

      // Number range
      if (typeof value === "number") {
        if (validation.min !== undefined && value < validation.min) {
          throw new Error(
            `Parameter ${param.name} must be >= ${validation.min}`
          );
        }
        if (validation.max !== undefined && value > validation.max) {
          throw new Error(
            `Parameter ${param.name} must be <= ${validation.max}`
          );
        }
      }

      // Enum values
      if (validation.options && !validation.options.includes(value)) {
        throw new Error(
          `Parameter ${param.name} must be one of: ${validation.options.join(", ")}`
        );
      }

      // File path validation
      if (param.type === "file_path") {
        const fs = await import("fs/promises");
        try {
          await fs.access(value);
        } catch {
          throw new Error(`File not found: ${value}`);
        }

        // Check file extension
        if (validation.fileExtensions) {
          const ext = value.split(".").pop()?.toLowerCase();
          if (!validation.fileExtensions.includes(ext || "")) {
            throw new Error(
              `File must have extension: ${validation.fileExtensions.join(", ")}`
            );
          }
        }
      }
    }
  }

  /**
   * Handle step execution error
   */
  private async handleStepError(
    step: WorkflowStep,
    result: StepExecutionResult,
    config: ReplayConfig,
    callbacks?: ReplayCallbacks
  ): Promise<boolean> {
    // Check error handling mode
    switch (config.errorHandling) {
      case "fail_fast":
        return false; // Stop execution

      case "continue":
        return true; // Continue to next step

      case "prompt":
        // Ask user what to do
        const action = await callbacks?.onStepError?.(step, result);

        switch (action) {
          case "retry":
            // Retry the step
            result.retryCount = (result.retryCount || 0) + 1;
            const retryResult = await this.executeStep(step, config, { metadata: {} } as Workflow);
            Object.assign(result, retryResult);
            return retryResult.status !== "error"; // Continue if retry succeeded

          case "skip":
            result.status = "skipped";
            return true; // Continue to next step

          case "abort":
            return false; // Stop execution

          default:
            return false;
        }

      default:
        return false;
    }
  }

  /**
   * Check for pause/cancel requests
   */
  private async checkPauseCancel(): Promise<void> {
    if (this.cancelRequested) {
      throw new Error("Replay canceled by user");
    }

    while (this.isPaused) {
      await new Promise(resolve => setTimeout(resolve, 100));
      if (this.cancelRequested) {
        throw new Error("Replay canceled by user");
      }
    }
  }

  /**
   * Pause replay execution
   */
  pause(): void {
    this.isPaused = true;
  }

  /**
   * Resume replay execution
   */
  resume(): void {
    this.isPaused = false;
  }

  /**
   * Cancel replay execution
   */
  cancel(): void {
    this.cancelRequested = true;
    this.isPaused = false; // Unpause if paused
  }

  /**
   * Compare actual output with expected output
   */
  private compareOutputs(
    actual: ContextItem[],
    expected: StepExpectedOutput
  ): boolean {
    // Simple comparison based on content hash
    const actualHash = this.hashOutput(actual);
    return actualHash === expected.contentHash;
  }

  /**
   * Hash output for comparison
   */
  private hashOutput(output?: ContextItem[]): string {
    if (!output || output.length === 0) return "";

    const crypto = require("crypto");
    const content = output.map(item => item.content).join("\n");
    return crypto.createHash("sha256").update(content).digest("hex");
  }

  /**
   * Update workflow statistics after execution
   */
  private async updateWorkflowStatistics(
    workflow: Workflow,
    execution: ReplayExecution
  ): Promise<void> {
    workflow.statistics.totalRuns++;

    if (execution.status === "completed") {
      workflow.statistics.successfulRuns++;
      workflow.statistics.lastSuccessAt = execution.completedAt;
    } else if (execution.status === "failed") {
      workflow.statistics.failedRuns++;
    }

    workflow.statistics.lastRunAt = execution.completedAt;

    // Update average duration
    const duration = new Date(execution.completedAt!).getTime() -
                    new Date(execution.startedAt).getTime();

    if (workflow.statistics.avgDuration) {
      workflow.statistics.avgDuration =
        (workflow.statistics.avgDuration * (workflow.statistics.totalRuns - 1) + duration) /
        workflow.statistics.totalRuns;
    } else {
      workflow.statistics.avgDuration = duration;
    }

    // Add execution to history (keep last 100)
    workflow.statistics.executions.unshift(execution);
    workflow.statistics.executions = workflow.statistics.executions.slice(0, 100);

    // Save updated workflow
    await WorkflowStorage.save(workflow);
  }

  private generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async prepareContextItems(
    items: ContextItemWithId[] | undefined,
    config: ReplayConfig
  ): Promise<ContextItemWithId[]> {
    if (!items) return [];

    // Apply context overrides from config
    return items.map(item => {
      const override = config.contextOverrides?.find(
        o => o.originalItemId === item.id
      );

      if (override) {
        return {
          ...item,
          content: override.newContent || item.content,
          name: override.newPath || item.name,
        };
      }

      return item;
    });
  }
}

/**
 * Callbacks for replay execution
 */
interface ReplayCallbacks {
  onStepStart?: (step: WorkflowStep, index: number) => void;
  onStepComplete?: (step: WorkflowStep, index: number, result: StepExecutionResult) => void;
  onStepConfirmation?: (step: WorkflowStep, index: number) => Promise<boolean>;
  onStepError?: (step: WorkflowStep, result: StepExecutionResult) => Promise<"retry" | "skip" | "abort">;
}
```

---

## API Specifications

### Workflow Manager API

**File**: `core/workflow/manager.ts`

```typescript
/**
 * Main API for workflow management
 */
export class WorkflowManager {
  /**
   * Save a new workflow
   */
  static async saveWorkflow(workflow: Workflow): Promise<void> {
    await WorkflowStorage.save(workflow);
    await WorkflowIndex.update(workflow);
  }

  /**
   * Load a workflow by ID
   */
  static async loadWorkflow(workflowId: string): Promise<Workflow> {
    return await WorkflowStorage.load(workflowId);
  }

  /**
   * Get all workflows (index only)
   */
  static async getAllWorkflows(filters?: WorkflowFilters): Promise<WorkflowIndexEntry[]> {
    const index = await WorkflowIndex.load();
    return this.applyFilters(index.workflows, filters);
  }

  /**
   * Update workflow metadata
   */
  static async updateMetadata(
    workflowId: string,
    updates: Partial<WorkflowMetadata>
  ): Promise<void> {
    const workflow = await this.loadWorkflow(workflowId);
    workflow.metadata = { ...workflow.metadata, ...updates };
    workflow.metadata.lastModified = new Date().toISOString();
    await this.saveWorkflow(workflow);
  }

  /**
   * Delete a workflow
   */
  static async deleteWorkflow(workflowId: string): Promise<void> {
    await WorkflowStorage.delete(workflowId);
    await WorkflowIndex.remove(workflowId);
  }

  /**
   * Export workflow to file
   */
  static async exportWorkflow(workflowId: string): Promise<ExportedWorkflow> {
    const workflow = await this.loadWorkflow(workflowId);
    const exporter = new WorkflowExporter();
    return exporter.export(workflow);
  }

  /**
   * Import workflow from file
   */
  static async importWorkflow(
    exportedWorkflow: ExportedWorkflow
  ): Promise<WorkflowImportResult> {
    const importer = new WorkflowImporter();
    return importer.import(exportedWorkflow);
  }

  /**
   * Search workflows
   */
  static async searchWorkflows(query: string): Promise<WorkflowIndexEntry[]> {
    const index = await WorkflowIndex.load();
    return this.searchIndex(index.workflows, query);
  }

  /**
   * Get workflow statistics
   */
  static async getStatistics(workflowId: string): Promise<WorkflowStatistics> {
    const workflow = await this.loadWorkflow(workflowId);
    return workflow.statistics;
  }

  private static applyFilters(
    workflows: WorkflowIndexEntry[],
    filters?: WorkflowFilters
  ): WorkflowIndexEntry[] {
    let filtered = workflows;

    if (filters?.tags && filters.tags.length > 0) {
      filtered = filtered.filter(w =>
        filters.tags!.some(tag => w.tags.includes(tag))
      );
    }

    if (filters?.starred !== undefined) {
      filtered = filtered.filter(w => w.starred === filters.starred);
    }

    if (filters?.showArchived === false) {
      filtered = filtered.filter(w => !w.archived);
    }

    return filtered;
  }

  private static searchIndex(
    workflows: WorkflowIndexEntry[],
    query: string
  ): WorkflowIndexEntry[] {
    const lowerQuery = query.toLowerCase();

    return workflows.filter(w =>
      w.name.toLowerCase().includes(lowerQuery) ||
      w.description.toLowerCase().includes(lowerQuery) ||
      w.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }
}

interface WorkflowFilters {
  tags?: string[];
  starred?: boolean;
  showArchived?: boolean;
}
```

---

## Storage Layer

**File**: `core/util/workflows.ts`

```typescript
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

/**
 * Workflow storage directory
 */
const WORKFLOWS_DIR = path.join(os.homedir(), ".continue", "workflows");
const WORKFLOWS_INDEX_FILE = path.join(WORKFLOWS_DIR, "index.json");

/**
 * Workflow storage operations
 */
export class WorkflowStorage {
  /**
   * Initialize storage directory
   */
  static async initialize(): Promise<void> {
    try {
      await fs.mkdir(WORKFLOWS_DIR, { recursive: true });

      // Create index if doesn't exist
      try {
        await fs.access(WORKFLOWS_INDEX_FILE);
      } catch {
        const emptyManifest: WorkflowManifest = {
          version: "1.0",
          workflows: [],
          collections: [],
          lastUpdated: new Date().toISOString(),
        };
        await fs.writeFile(
          WORKFLOWS_INDEX_FILE,
          JSON.stringify(emptyManifest, null, 2)
        );
      }
    } catch (error) {
      console.error("Failed to initialize workflow storage:", error);
      throw error;
    }
  }

  /**
   * Save workflow to disk
   */
  static async save(workflow: Workflow): Promise<void> {
    await this.initialize();

    const filename = `${workflow.metadata.id}.json`;
    const filepath = path.join(WORKFLOWS_DIR, filename);

    // Atomic write using temp file + rename
    const tempPath = `${filepath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(workflow, null, 2));
    await fs.rename(tempPath, filepath);
  }

  /**
   * Load workflow from disk
   */
  static async load(workflowId: string): Promise<Workflow> {
    await this.initialize();

    const filename = `${workflowId}.json`;
    const filepath = path.join(WORKFLOWS_DIR, filename);

    try {
      const content = await fs.readFile(filepath, "utf-8");
      return JSON.parse(content) as Workflow;
    } catch (error) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }
  }

  /**
   * Delete workflow from disk
   */
  static async delete(workflowId: string): Promise<void> {
    const filename = `${workflowId}.json`;
    const filepath = path.join(WORKFLOWS_DIR, filename);

    try {
      await fs.unlink(filepath);
    } catch (error) {
      // Ignore if file doesn't exist
    }
  }

  /**
   * List all workflow files
   */
  static async listAll(): Promise<string[]> {
    await this.initialize();

    try {
      const files = await fs.readdir(WORKFLOWS_DIR);
      return files
        .filter(f => f.endsWith(".json") && f !== "index.json")
        .map(f => f.replace(".json", ""));
    } catch (error) {
      return [];
    }
  }
}

/**
 * Workflow index operations (for fast lookups)
 */
export class WorkflowIndex {
  /**
   * Load index
   */
  static async load(): Promise<WorkflowManifest> {
    await WorkflowStorage.initialize();

    try {
      const content = await fs.readFile(WORKFLOWS_INDEX_FILE, "utf-8");
      return JSON.parse(content) as WorkflowManifest;
    } catch (error) {
      // Return empty manifest if load fails
      return {
        version: "1.0",
        workflows: [],
        collections: [],
        lastUpdated: new Date().toISOString(),
      };
    }
  }

  /**
   * Update index with workflow
   */
  static async update(workflow: Workflow): Promise<void> {
    const manifest = await this.load();

    // Find or create entry
    let entry = manifest.workflows.find(w => w.id === workflow.metadata.id);

    if (entry) {
      // Update existing
      Object.assign(entry, this.createIndexEntry(workflow));
    } else {
      // Add new
      entry = this.createIndexEntry(workflow);
      manifest.workflows.push(entry);
    }

    manifest.lastUpdated = new Date().toISOString();

    // Save index
    await this.save(manifest);
  }

  /**
   * Remove workflow from index
   */
  static async remove(workflowId: string): Promise<void> {
    const manifest = await this.load();

    manifest.workflows = manifest.workflows.filter(w => w.id !== workflowId);
    manifest.lastUpdated = new Date().toISOString();

    await this.save(manifest);
  }

  /**
   * Save index to disk
   */
  private static async save(manifest: WorkflowManifest): Promise<void> {
    const tempPath = `${WORKFLOWS_INDEX_FILE}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(manifest, null, 2));
    await fs.rename(tempPath, WORKFLOWS_INDEX_FILE);
  }

  /**
   * Create index entry from workflow
   */
  private static createIndexEntry(workflow: Workflow): WorkflowIndexEntry {
    const successRate = workflow.statistics.totalRuns > 0
      ? workflow.statistics.successfulRuns / workflow.statistics.totalRuns
      : 0;

    return {
      id: workflow.metadata.id,
      name: workflow.metadata.name,
      description: workflow.metadata.description,
      tags: workflow.metadata.tags,
      createdAt: workflow.metadata.createdAt,
      lastModified: workflow.metadata.lastModified,
      lastRunAt: workflow.statistics.lastRunAt,
      successRate: successRate,
      totalRuns: workflow.statistics.totalRuns,
      starred: workflow.metadata.starred || false,
      archived: workflow.metadata.archived || false,
    };
  }
}

/**
 * Replay execution history storage
 */
export class ReplayHistory {
  private static HISTORY_FILE = path.join(WORKFLOWS_DIR, "replay_history.json");

  /**
   * Save replay execution
   */
  static async save(execution: ReplayExecution): Promise<void> {
    const history = await this.loadAll();

    // Add new execution
    history.push(execution);

    // Keep last 1000 executions
    if (history.length > 1000) {
      history.shift();
    }

    // Save
    const tempPath = `${this.HISTORY_FILE}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(history, null, 2));
    await fs.rename(tempPath, this.HISTORY_FILE);
  }

  /**
   * Load all execution history
   */
  static async loadAll(): Promise<ReplayExecution[]> {
    try {
      const content = await fs.readFile(this.HISTORY_FILE, "utf-8");
      return JSON.parse(content) as ReplayExecution[];
    } catch {
      return [];
    }
  }

  /**
   * Get executions for specific workflow
   */
  static async getForWorkflow(workflowId: string): Promise<ReplayExecution[]> {
    const all = await this.loadAll();
    return all.filter(e => e.workflowId === workflowId);
  }
}
```

---

## Security Considerations

### 1. Workflow Sanitization

```typescript
/**
 * Sanitizes workflows to remove sensitive data before export/sharing
 */
export class WorkflowSanitizer {
  private sensitiveKeywords = [
    "apikey", "api_key", "token", "secret", "password",
    "credential", "auth", "private", "key"
  ];

  /**
   * Sanitize workflow
   */
  async sanitize(workflow: Workflow): Promise<Workflow> {
    const sanitized = JSON.parse(JSON.stringify(workflow)); // Deep clone

    // Sanitize workspace paths
    sanitized.metadata.workspaceDirectory = this.sanitizePath(
      workflow.metadata.workspaceDirectory
    );

    // Sanitize each step
    for (const step of sanitized.steps) {
      step.parsedArgs = this.sanitizeObject(step.parsedArgs);

      // Sanitize context items
      if (step.contextItems) {
        for (const item of step.contextItems) {
          item.name = this.sanitizePath(item.name);
          item.content = this.sanitizeContent(item.content);
        }
      }

      // Remove actual outputs (keep only summary)
      if (step.expectedOutput) {
        delete step.expectedOutput.outputItems;
      }
    }

    return sanitized;
  }

  /**
   * Sanitize object recursively
   */
  private sanitizeObject(obj: any): any {
    if (typeof obj !== "object" || obj === null) {
      return obj;
    }

    const sanitized: any = Array.isArray(obj) ? [] : {};

    for (const [key, value] of Object.entries(obj)) {
      // Check if key looks sensitive
      if (this.isSensitiveKey(key)) {
        sanitized[key] = "[REDACTED]";
        continue;
      }

      // Recursively sanitize
      if (typeof value === "object") {
        sanitized[key] = this.sanitizeObject(value);
      } else if (typeof value === "string") {
        sanitized[key] = this.sanitizeString(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Check if key name indicates sensitive data
   */
  private isSensitiveKey(key: string): boolean {
    const lowerKey = key.toLowerCase();
    return this.sensitiveKeywords.some(keyword => lowerKey.includes(keyword));
  }

  /**
   * Sanitize string value
   */
  private sanitizeString(value: string): string {
    // Redact URLs with auth
    value = value.replace(
      /:\/\/[^:]+:[^@]+@/g,
      "://[REDACTED]:[REDACTED]@"
    );

    // Redact bearer tokens
    value = value.replace(
      /Bearer\s+[\w\-\.]+/gi,
      "Bearer [REDACTED]"
    );

    // Redact API keys (common patterns)
    value = value.replace(
      /[a-zA-Z0-9]{32,}/g,
      (match) => {
        // Only redact if looks like hex/base64
        if (/^[a-fA-F0-9]{32,}$/.test(match) || /^[a-zA-Z0-9+/=]{32,}$/.test(match)) {
          return "[REDACTED]";
        }
        return match;
      }
    );

    return value;
  }

  /**
   * Sanitize file path to remove absolute paths
   */
  private sanitizePath(filepath: string): string {
    // Convert to relative path if possible
    // Replace home directory with ~
    const home = os.homedir();
    if (filepath.startsWith(home)) {
      return filepath.replace(home, "~");
    }

    // Replace username in path
    filepath = filepath.replace(/\/Users\/[^/]+\//g, "/Users/[USER]/");
    filepath = filepath.replace(/\/home\/[^/]+\//g, "/home/[USER]/");
    filepath = filepath.replace(/C:\\Users\\[^\\]+\\/g, "C:\\Users\\[USER]\\");

    return filepath;
  }

  /**
   * Sanitize content (similar to string but more aggressive)
   */
  private sanitizeContent(content: string): string {
    // Apply string sanitization first
    let sanitized = this.sanitizeString(content);

    // Truncate if very long (keep first 1000 chars)
    if (sanitized.length > 1000) {
      sanitized = sanitized.substring(0, 1000) + "\n... [TRUNCATED]";
    }

    return sanitized;
  }
}
```

### 2. Import Validation

```typescript
/**
 * Validates imported workflows for security
 */
export class WorkflowImporter {
  /**
   * Import and validate workflow
   */
  async import(exported: ExportedWorkflow): Promise<WorkflowImportResult> {
    const result: WorkflowImportResult = {
      success: false,
      errors: [],
      warnings: [],
      requiresManualConfiguration: false,
      missingDependencies: [],
    };

    // Validate structure
    const structureErrors = this.validateStructure(exported);
    if (structureErrors.length > 0) {
      result.errors.push(...structureErrors);
      return result;
    }

    // Check compatibility
    if (exported.version !== "1.0") {
      result.warnings.push(
        `Workflow version ${exported.version} may not be fully compatible`
      );
    }

    // Check tool availability
    const missingTools = await this.checkToolAvailability(exported);
    if (missingTools.length > 0) {
      result.missingDependencies.push(...missingTools);
      result.requiresManualConfiguration = true;
    }

    // Convert to internal format
    try {
      const workflow = this.convertToWorkflow(exported);
      result.workflow = workflow;
      result.success = true;
    } catch (error) {
      result.errors.push(`Conversion failed: ${error.message}`);
    }

    return result;
  }

  /**
   * Validate exported workflow structure
   */
  private validateStructure(exported: ExportedWorkflow): string[] {
    const errors: string[] = [];

    if (!exported.metadata || !exported.metadata.name) {
      errors.push("Missing required field: metadata.name");
    }

    if (!exported.parameters || !Array.isArray(exported.parameters)) {
      errors.push("Missing or invalid field: parameters");
    }

    if (!exported.steps || !Array.isArray(exported.steps)) {
      errors.push("Missing or invalid field: steps");
    }

    // Validate each step
    if (exported.steps) {
      for (let i = 0; i < exported.steps.length; i++) {
        const step = exported.steps[i];
        if (!step.name || !step.toolCall) {
          errors.push(`Invalid step at index ${i}: missing name or toolCall`);
        }
      }
    }

    return errors;
  }

  /**
   * Check if required tools are available
   */
  private async checkToolAvailability(exported: ExportedWorkflow): Promise<string[]> {
    const { getAvailableTools } = await import("../tools/registry");
    const availableTools = getAvailableTools();

    const missing: string[] = [];

    for (const step of exported.steps) {
      const toolName = step.toolCall.function.name;
      if (!availableTools.includes(toolName)) {
        if (!missing.includes(toolName)) {
          missing.push(toolName);
        }
      }
    }

    return missing;
  }

  /**
   * Convert exported workflow to internal format
   */
  private convertToWorkflow(exported: ExportedWorkflow): Workflow {
    const workflow: Workflow = {
      version: exported.version,
      metadata: {
        id: `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: `${exported.metadata.name} (imported)`,
        description: exported.metadata.description,
        tags: [...exported.metadata.tags, "imported"],
        createdAt: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        workspaceDirectory: "", // Will be set at replay time
        sourceSessionId: "", // No source session for imported workflows
        starred: false,
        archived: false,
      },
      parameters: exported.parameters,
      steps: exported.steps.map((step, i) => ({
        ...step,
        id: `step_${i + 1}`,
        contextItems: [],
      })),
      statistics: {
        totalRuns: 0,
        successfulRuns: 0,
        failedRuns: 0,
        executions: [],
      },
    };

    return workflow;
  }
}
```

---

## Performance Optimization

### 1. Lazy Loading

```typescript
/**
 * Lazy-loads workflow content on demand
 */
export class LazyWorkflowLoader {
  private cache = new Map<string, Workflow>();
  private indexCache?: WorkflowManifest;

  /**
   * Get workflow index (cached)
   */
  async getIndex(): Promise<WorkflowManifest> {
    if (!this.indexCache) {
      this.indexCache = await WorkflowIndex.load();
    }
    return this.indexCache;
  }

  /**
   * Get workflow (with caching)
   */
  async getWorkflow(workflowId: string): Promise<Workflow> {
    if (this.cache.has(workflowId)) {
      return this.cache.get(workflowId)!;
    }

    const workflow = await WorkflowStorage.load(workflowId);
    this.cache.set(workflowId, workflow);

    // Limit cache size
    if (this.cache.size > 50) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    return workflow;
  }

  /**
   * Invalidate cache
   */
  invalidate(workflowId?: string): void {
    if (workflowId) {
      this.cache.delete(workflowId);
    } else {
      this.cache.clear();
      this.indexCache = undefined;
    }
  }
}
```

### 2. Pagination

```typescript
/**
 * Paginated workflow library results
 */
export interface PaginatedWorkflows {
  workflows: WorkflowIndexEntry[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export class WorkflowPaginator {
  /**
   * Get paginated workflows
   */
  static async getPage(
    page: number,
    pageSize: number,
    filters?: WorkflowFilters
  ): Promise<PaginatedWorkflows> {
    const allWorkflows = await WorkflowManager.getAllWorkflows(filters);

    const start = page * pageSize;
    const end = start + pageSize;

    return {
      workflows: allWorkflows.slice(start, end),
      total: allWorkflows.length,
      page,
      pageSize,
      hasMore: end < allWorkflows.length,
    };
  }
}
```

---

## Testing Strategy

### Unit Tests

```typescript
// test/workflow/capture.test.ts
describe("WorkflowCapture", () => {
  test("detects replay-worthy session", () => {
    const session = createMockSession({
      toolCalls: 5,
      allSuccessful: true,
      duration: 10 * 60 * 1000, // 10 minutes
    });

    expect(WorkflowCapture.isReplayWorthy(session)).toBe(true);
  });

  test("rejects session with too few tool calls", () => {
    const session = createMockSession({
      toolCalls: 2,
      allSuccessful: true,
      duration: 10 * 60 * 1000,
    });

    expect(WorkflowCapture.isReplayWorthy(session)).toBe(false);
  });

  test("captures workflow with parameters", async () => {
    const session = createMockSession({
      toolCalls: 3,
      args: { code: "console.log('hello')", targetFile: "test.ts" },
    });

    const workflow = await WorkflowCapture.captureFromSession(session, {
      name: "Test Workflow",
    });

    expect(workflow.parameters.length).toBeGreaterThan(0);
    expect(workflow.steps.length).toBe(3);
  });
});

// test/workflow/parameterDetection.test.ts
describe("ParameterDetector", () => {
  test("detects file path parameters", async () => {
    const toolCalls = [
      createMockToolCall({
        args: { code: "...", targetFile: "/path/to/file.ts" },
      }),
    ];

    const candidates = await ParameterDetector.detect(
      toolCalls,
      createMockSession()
    );

    expect(candidates).toContainEqual(
      expect.objectContaining({
        suggestedName: "targetFile",
        suggestedType: "file_path",
      })
    );
  });
});

// test/workflow/replayEngine.test.ts
describe("ReplayEngine", () => {
  test("executes workflow successfully", async () => {
    const workflow = createMockWorkflow({ steps: 3 });
    const config: ReplayConfig = {
      workflowId: workflow.metadata.id,
      parameters: { targetFile: "test.ts" },
      executionMode: "auto",
      errorHandling: "fail_fast",
    };

    const engine = new ReplayEngine();
    const execution = await engine.execute(workflow, config);

    expect(execution.status).toBe("completed");
    expect(execution.stepResults.length).toBe(3);
  });

  test("handles step errors correctly", async () => {
    const workflow = createMockWorkflow({
      steps: 3,
      failAtStep: 2,
    });

    const config: ReplayConfig = {
      workflowId: workflow.metadata.id,
      parameters: {},
      executionMode: "auto",
      errorHandling: "fail_fast",
    };

    const engine = new ReplayEngine();
    const execution = await engine.execute(workflow, config);

    expect(execution.status).toBe("failed");
    expect(execution.stepResults.length).toBe(2);
  });
});
```

### Integration Tests

```typescript
// test/workflow/integration.test.ts
describe("Workflow Integration", () => {
  test("end-to-end: capture, save, replay", async () => {
    // 1. Create session with tool calls
    const session = await createRealSession();

    // 2. Capture workflow
    const workflow = await WorkflowCapture.captureFromSession(session, {
      name: "Integration Test Workflow",
    });

    // 3. Save workflow
    await WorkflowManager.saveWorkflow(workflow);

    // 4. Load workflow
    const loaded = await WorkflowManager.loadWorkflow(workflow.metadata.id);
    expect(loaded).toEqual(workflow);

    // 5. Replay workflow
    const engine = new ReplayEngine();
    const execution = await engine.execute(loaded, {
      workflowId: loaded.metadata.id,
      parameters: extractDefaultParameters(loaded),
      executionMode: "auto",
      errorHandling: "fail_fast",
    });

    expect(execution.status).toBe("completed");
  });

  test("export and import workflow", async () => {
    // 1. Create and save workflow
    const workflow = createMockWorkflow();
    await WorkflowManager.saveWorkflow(workflow);

    // 2. Export
    const exported = await WorkflowManager.exportWorkflow(workflow.metadata.id);

    // 3. Import
    const importResult = await WorkflowManager.importWorkflow(exported);
    expect(importResult.success).toBe(true);
    expect(importResult.workflow).toBeDefined();

    // 4. Verify imported workflow is different ID but same content
    expect(importResult.workflow!.metadata.id).not.toBe(workflow.metadata.id);
    expect(importResult.workflow!.metadata.name).toContain("imported");
  });
});
```

---

## Implementation Phases

### Phase 1: MVP (6 weeks)

**Week 1-2: Core Data Models & Storage**
- [ ] Define TypeScript interfaces
- [ ] Implement WorkflowStorage class
- [ ] Implement WorkflowIndex class
- [ ] Add unit tests for storage

**Week 3-4: Capture & Basic Replay**
- [ ] Implement WorkflowCapture class
- [ ] Implement basic ReplayEngine (no parameterization)
- [ ] Add save workflow UI (manual trigger)
- [ ] Add unit tests for capture and replay

**Week 5-6: Basic Library UI**
- [ ] Implement workflow library sidebar panel
- [ ] Add workflow list view
- [ ] Add replay button (no config)
- [ ] Add delete workflow functionality
- [ ] Integration testing

**Deliverables**:
- Can manually save session as workflow
- Can view workflows in sidebar
- Can replay exact workflow in same context
- Workflows persist across sessions

### Phase 2: Parameterization (4 weeks)

**Week 1-2: Parameter Detection**
- [ ] Implement FilePathDetectionStrategy
- [ ] Implement VariableNameDetectionStrategy
- [ ] Implement StringLiteralDetectionStrategy
- [ ] Implement ConfigValueDetectionStrategy
- [ ] Add unit tests for each strategy

**Week 3: Parameter UI**
- [ ] Create parameter confirmation dialog (during capture)
- [ ] Create replay configuration modal
- [ ] Add parameter input fields with validation
- [ ] Add context-aware default suggestions

**Week 4: Integration & Testing**
- [ ] Integrate parameterization with capture flow
- [ ] Integrate parameterization with replay flow
- [ ] End-to-end testing
- [ ] Bug fixes and refinements

**Deliverables**:
- Parameters auto-detected during capture
- Can configure parameters before replay
- Can replay with different inputs
- 80% parameter detection accuracy

### Phase 3: Sharing & Management (4 weeks)

**Week 1: Export/Import**
- [ ] Implement WorkflowSanitizer
- [ ] Implement WorkflowExporter
- [ ] Implement WorkflowImporter with validation
- [ ] Add export/import UI

**Week 2: Organization**
- [ ] Add tags and filtering
- [ ] Add search functionality
- [ ] Add star/favorite feature
- [ ] Add archive feature
- [ ] Implement collections (folders)

**Week 3: Workflow Details & Analytics**
- [ ] Create workflow detail view
- [ ] Add execution history display
- [ ] Add success rate and statistics
- [ ] Add step-by-step breakdown

**Week 4: Polish**
- [ ] Improve UI/UX based on feedback
- [ ] Add sorting options
- [ ] Add bulk operations
- [ ] Performance optimizations

**Deliverables**:
- Can export/import workflows
- Can organize workflows with tags/collections
- Comprehensive workflow detail view
- Can share workflows between users

### Phase 4: Advanced Features (6 weeks)

**Week 1-2: Execution Modes**
- [ ] Implement confirmation mode
- [ ] Implement preview mode (dry run)
- [ ] Add pause/resume functionality
- [ ] Add step-by-step progress indicator

**Week 3-4: Error Handling**
- [ ] Implement error recovery strategies
- [ ] Add retry logic
- [ ] Add skip step option
- [ ] Improve error messages and user guidance

**Week 5: Workflow Editing**
- [ ] Add metadata editing
- [ ] Add step reordering
- [ ] Add step add/remove
- [ ] Add argument editing

**Week 6: Integration & Testing**
- [ ] End-to-end testing
- [ ] Performance testing with large workflows
- [ ] Bug fixes and optimizations

**Deliverables**:
- Multiple execution modes
- Robust error handling
- Can edit workflows
- 85% replay success rate

### Phase 5: Polish & Scale (4 weeks)

**Week 1: Performance**
- [ ] Implement lazy loading
- [ ] Add pagination
- [ ] Optimize workflow library loading
- [ ] Add caching layer

**Week 2: Documentation**
- [ ] Write user documentation
- [ ] Create example workflows
- [ ] Add in-app help/tooltips
- [ ] Create video tutorials

**Week 3: Migration & Compatibility**
- [ ] Add format version detection
- [ ] Implement migration utilities
- [ ] Test backward compatibility
- [ ] Add upgrade path documentation

**Week 4: Final Polish**
- [ ] UI/UX refinements
- [ ] Bug fixes
- [ ] Performance tuning
- [ ] Prepare for release

**Deliverables**:
- Production-ready quality
- Comprehensive documentation
- Example workflow library
- Migration support

---

## Open Technical Questions

1. **Sandbox State Persistence**:
   - How do we handle `globalThis` state between workflow steps?
   - Should we snapshot sandbox state at each step?
   - **Proposed**: Initially ignore sandbox state, document limitation

2. **MCP Bridge Logging**:
   - Should we log all MCP requests/responses for replay?
   - How much data is too much?
   - **Proposed**: Add optional detailed logging flag, off by default

3. **Workflow Versioning**:
   - How do we handle workflows when tool schemas change?
   - Should we version-lock workflows to Code Mode versions?
   - **Proposed**: Store Code Mode version, warn on incompatibility

4. **LLM Integration for Adaptation**:
   - Should replays allow LLM to adapt steps?
   - Or strict execution only?
   - **Proposed**: v1 is strict execution, v2 explores adaptive replay

5. **Replay in Different Workspace**:
   - How do we handle file references when replaying in different repo?
   - **Proposed**: Parameter validation with helpful errors, allow relative paths

6. **Large Workflow Performance**:
   - What's the maximum number of steps we should support?
   - How do we optimize very long workflows?
   - **Proposed**: No hard limit, but recommend breaking into sub-workflows

---

## Success Criteria

### Technical Success Criteria

- [ ] Workflow capture success rate >95%
- [ ] Replay success rate >85% (for deterministic workflows)
- [ ] Parameter detection accuracy >80%
- [ ] Workflow library loads <1s with 100+ workflows
- [ ] Replay initialization <2s
- [ ] Zero data loss (atomic writes, error handling)
- [ ] All critical paths have >80% test coverage

### User Experience Success Criteria

- [ ] Workflow save flow takes ≤3 clicks
- [ ] Replay configuration is intuitive (user testing)
- [ ] Error messages are actionable
- [ ] UI responsive and polished
- [ ] Documentation comprehensive and clear

### Product Success Criteria

- [ ] >30% of sessions result in saved workflow
- [ ] >50% of users create ≥1 workflow within first week
- [ ] >85% replay success rate
- [ ] >20% of workflows shared/exported
- [ ] Positive user feedback (NPS >40)

---

## Appendix: File Structure

```
core/
├── workflow/
│   ├── capture.ts          # Workflow capture from sessions
│   ├── manager.ts          # Main workflow API
│   ├── replayEngine.ts     # Replay execution engine
│   ├── parameterDetection.ts  # Parameter detection strategies
│   ├── parameterInjector.ts   # Parameter injection/substitution
│   ├── sanitizer.ts        # Workflow sanitization
│   ├── exporter.ts         # Workflow export
│   ├── importer.ts         # Workflow import
│   └── index.ts            # Public API exports
│
├── util/
│   ├── workflows.ts        # Workflow storage layer
│   └── ...
│
└── index.d.ts              # Type definitions

gui/
├── src/
│   ├── components/
│   │   └── workflows/
│   │       ├── WorkflowLibrary/
│   │       │   ├── WorkflowLibrary.tsx
│   │       │   ├── WorkflowCard.tsx
│   │       │   ├── WorkflowSearch.tsx
│   │       │   └── WorkflowFilters.tsx
│   │       ├── WorkflowDetail/
│   │       │   ├── WorkflowDetail.tsx
│   │       │   ├── StepList.tsx
│   │       │   └── WorkflowStats.tsx
│   │       ├── WorkflowReplay/
│   │       │   ├── ReplayConfig.tsx
│   │       │   ├── ParameterInput.tsx
│   │       │   └── ReplayProgress.tsx
│   │       ├── WorkflowCapture/
│   │       │   ├── SaveWorkflowDialog.tsx
│   │       │   └── ParameterConfirmation.tsx
│   │       └── WorkflowExport/
│   │           ├── ExportDialog.tsx
│   │           └── ImportDialog.tsx
│   │
│   ├── redux/
│   │   └── slices/
│   │       └── workflowSlice.ts
│   │
│   └── hooks/
│       └── useWorkflow.ts
│
└── ...

test/
├── workflow/
│   ├── capture.test.ts
│   ├── parameterDetection.test.ts
│   ├── replayEngine.test.ts
│   ├── storage.test.ts
│   └── integration.test.ts
└── ...
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-11-17 | Code Mode Team | Initial technical specifications |

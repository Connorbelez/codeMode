export interface ClaudeCodeAgentMetadata {
  author?: string;
  version?: string;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
  license?: string;
  repository?: string;
}

export interface ClaudeCodeAgentDefinition {
  name: string;
  description: string;
  systemMessage?: string;
  prompt: string;
  metadata?: ClaudeCodeAgentMetadata;
}

export type AgentNamingStrategy = "preserve" | "prefix" | "suffix";
export type AgentConflictResolution = "skip" | "rename" | "overwrite";
export type AgentStatus = "active" | "error" | "disabled";

export interface AgentImportConfig {
  enabled: boolean;
  importPaths: string[];
  autoReload: boolean;
  namingStrategy: AgentNamingStrategy;
  namePrefix?: string;
  nameSuffix?: string;
  conflictResolution: AgentConflictResolution;
}

export interface ImportedAgentRecord {
  id: string;
  sourcePath: string;
  importedAt: string;
  lastModified: string;
  promptFilePath: string;
  agentDef: ClaudeCodeAgentDefinition;
  status: AgentStatus;
  errorMessage?: string;
}

export interface AgentImportResult {
  success: number;
  failed: number;
  errors: Array<{ path: string; error: string }>;
}

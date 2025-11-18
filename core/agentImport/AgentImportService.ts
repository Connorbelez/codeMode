import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import * as YAML from "yaml";
import type { IDE } from "../index.js";
import { parseAgentFile, validateAgentDefinition } from "./parseAgent.js";
import type {
  AgentImportConfig,
  AgentImportResult,
  ClaudeCodeAgentDefinition,
  ImportedAgentRecord,
} from "./types.js";

interface ConfigHandler {
  reloadConfig(reason: string): Promise<void>;
}

export class AgentImportService {
  private watchers: Map<string, fs.FSWatcher> = new Map();
  private importedAgents: Map<string, ImportedAgentRecord> = new Map();
  private config: AgentImportConfig;
  private changeDebounceTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private ide: IDE,
    private configHandler: ConfigHandler,
  ) {
    this.config = {
      enabled: false,
      importPaths: [],
      autoReload: true,
      namingStrategy: "preserve",
      conflictResolution: "rename",
    };
  }

  async initialize(config: AgentImportConfig): Promise<void> {
    this.config = config;

    if (!config.enabled) {
      console.log("[AgentImport] Agent import is disabled");
      return;
    }

    console.log("[AgentImport] Initializing agent import service");

    // Shutdown existing watchers
    await this.shutdown();

    // Initial import
    await this.importAllAgents();

    // Setup file watchers
    if (config.autoReload) {
      this.setupWatchers();
    }
  }

  async importAllAgents(): Promise<AgentImportResult> {
    const agentFiles: string[] = [];

    // Collect all agent files from import paths
    for (const importPath of this.config.importPaths) {
      try {
        const exists = await this.pathExists(importPath);
        if (!exists) {
          console.warn(`[AgentImport] Import path does not exist: ${importPath}`);
          continue;
        }

        const files = await this.listAgentFiles(importPath);
        agentFiles.push(...files);
      } catch (error) {
        console.error(`[AgentImport] Error listing files in ${importPath}:`, error);
      }
    }

    console.log(`[AgentImport] Found ${agentFiles.length} agent files to import`);

    // Clear existing agents
    this.importedAgents.clear();

    // Import all agent files
    const importResults = await Promise.allSettled(
      agentFiles.map((f) => this.importAgentFile(f)),
    );

    // Count results
    const successful = importResults.filter((r) => r.status === "fulfilled").length;
    const failed = importResults.filter((r) => r.status === "rejected").length;

    const errors: Array<{ path: string; error: string }> = [];
    importResults.forEach((result, index) => {
      if (result.status === "rejected") {
        errors.push({
          path: agentFiles[index],
          error: result.reason?.message || String(result.reason),
        });
      }
    });

    console.log(
      `[AgentImport] Import complete: ${successful} succeeded, ${failed} failed`,
    );

    if (errors.length > 0) {
      console.error("[AgentImport] Import errors:", errors);
    }

    return { success: successful, failed, errors };
  }

  private async listAgentFiles(dirPath: string): Promise<string[]> {
    const files = await this.ide.listDir(dirPath);
    return files
      .filter(
        (f) =>
          f.endsWith(".json") || f.endsWith(".md") || f.endsWith(".markdown"),
      )
      .map((f) => path.join(dirPath, f));
  }

  async importAgentFile(sourcePath: string): Promise<ImportedAgentRecord> {
    try {
      const content = await this.ide.readFile(sourcePath);
      const agentDef = await parseAgentFile(sourcePath, content);

      if (!agentDef) {
        throw new Error(`Failed to parse agent file: ${sourcePath}`);
      }

      // Validate agent definition
      const validationErrors = validateAgentDefinition(agentDef);
      if (validationErrors.length > 0) {
        throw new Error(`Validation errors: ${validationErrors.join(", ")}`);
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

      console.log(`[AgentImport] Successfully imported agent: ${agentDef.name}`);

      return record;
    } catch (error) {
      console.error(`[AgentImport] Failed to import ${sourcePath}:`, error);
      throw error;
    }
  }

  private convertToPromptFile(agentDef: ClaudeCodeAgentDefinition): string {
    const preamble: any = {
      name: this.applyNamingStrategy(agentDef.name),
      description: agentDef.description,
      version: 2,
    };

    // Add metadata fields if present
    if (agentDef.metadata) {
      Object.assign(preamble, agentDef.metadata);
    }

    let body = "";
    if (agentDef.systemMessage) {
      body += `<system>\n${agentDef.systemMessage}\n</system>\n\n`;
    }
    body += agentDef.prompt;

    return `${YAML.stringify(preamble)}---\n${body}`;
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
    const baseDir =
      workspaceDirs.length > 0 ? workspaceDirs[0] : os.homedir();

    const importDir = path.join(baseDir, ".continue", "imported-agents");

    // Ensure directory exists
    await this.ensureDir(importDir);

    const finalName = this.applyNamingStrategy(agentName);
    const baseName = `${finalName}.prompt`;
    let filePath = path.join(importDir, baseName);

    // Handle conflicts
    if (await this.pathExists(filePath)) {
      switch (this.config.conflictResolution) {
        case "skip":
          throw new Error(`Agent already exists: ${agentName}`);
        case "rename":
          let counter = 1;
          while (await this.pathExists(filePath)) {
            filePath = path.join(
              importDir,
              `${finalName}.${String(counter).padStart(3, "0")}.prompt`,
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
    console.log("[AgentImport] Setting up file watchers");

    for (const importPath of this.config.importPaths) {
      try {
        if (!fs.existsSync(importPath)) {
          console.warn(
            `[AgentImport] Cannot watch non-existent path: ${importPath}`,
          );
          continue;
        }

        const watcher = fs.watch(
          importPath,
          { recursive: false },
          (eventType, filename) => {
            if (!filename) return;

            const fullPath = path.join(importPath, filename);

            // Debounce file changes
            const existingTimer = this.changeDebounceTimers.get(fullPath);
            if (existingTimer) {
              clearTimeout(existingTimer);
            }

            const timer = setTimeout(() => {
              this.changeDebounceTimers.delete(fullPath);

              if (eventType === "change" || eventType === "rename") {
                void this.handleFileChange(fullPath);
              }
            }, 300); // 300ms debounce

            this.changeDebounceTimers.set(fullPath, timer);
          },
        );

        this.watchers.set(importPath, watcher);
        console.log(`[AgentImport] Watching: ${importPath}`);
      } catch (error) {
        console.error(`[AgentImport] Failed to watch ${importPath}:`, error);
      }
    }
  }

  private async handleFileChange(filePath: string): Promise<void> {
    console.log(`[AgentImport] File changed: ${filePath}`);

    // Check if file still exists
    const exists = await this.pathExists(filePath);

    if (!exists) {
      // File was deleted
      await this.handleFileRemoved(filePath);
      return;
    }

    // Check if it's an agent file
    const ext = path.extname(filePath).toLowerCase();
    if (![".json", ".md", ".markdown"].includes(ext)) {
      return;
    }

    try {
      await this.importAgentFile(filePath);

      // Trigger config reload
      await this.configHandler.reloadConfig("agent-import-update");

      // Notify user
      void this.ide.showToast(
        "info",
        `Agent updated: ${path.basename(filePath)}`,
      );
    } catch (error) {
      console.error(`[AgentImport] Failed to reload agent:`, error);
      void this.ide.showToast(
        "error",
        `Failed to reload agent: ${error.message}`,
      );
    }
  }

  private async handleFileRemoved(filePath: string): Promise<void> {
    console.log(`[AgentImport] File removed: ${filePath}`);

    // Find and remove corresponding prompt file
    const record = Array.from(this.importedAgents.values()).find(
      (r) => r.sourcePath === filePath,
    );

    if (record) {
      try {
        await this.ide.deleteFile(record.promptFilePath);
        this.importedAgents.delete(record.id);

        await this.configHandler.reloadConfig("agent-import-removed");

        void this.ide.showToast(
          "info",
          `Agent removed: ${record.agentDef.name}`,
        );
      } catch (error) {
        console.error(`[AgentImport] Failed to remove agent:`, error);
      }
    }
  }

  async createNewAgent(
    agentDef: ClaudeCodeAgentDefinition,
  ): Promise<ImportedAgentRecord> {
    // Validate agent definition
    const validationErrors = validateAgentDefinition(agentDef);
    if (validationErrors.length > 0) {
      throw new Error(`Validation errors: ${validationErrors.join(", ")}`);
    }

    const workspaceDirs = await this.ide.getWorkspaceDirs();
    const baseDir =
      workspaceDirs.length > 0 ? workspaceDirs[0] : os.homedir();

    // Create in .continue/imported-agents
    const importDir = path.join(baseDir, ".continue", "imported-agents");
    await this.ensureDir(importDir);

    // Save as JSON
    const sourcePath = path.join(importDir, `${agentDef.name}.json`);
    const agentJson = JSON.stringify(agentDef, null, 2);
    await this.ide.writeFile(sourcePath, agentJson);

    // Import the agent
    const record = await this.importAgentFile(sourcePath);

    // Trigger config reload
    await this.configHandler.reloadConfig("agent-import-created");

    return record;
  }

  async updateAgent(
    id: string,
    updates: Partial<ClaudeCodeAgentDefinition>,
  ): Promise<ImportedAgentRecord> {
    const record = this.importedAgents.get(id);
    if (!record) {
      throw new Error(`Agent not found: ${id}`);
    }

    // Merge updates
    const updatedAgentDef: ClaudeCodeAgentDefinition = {
      ...record.agentDef,
      ...updates,
    };

    // Validate
    const validationErrors = validateAgentDefinition(updatedAgentDef);
    if (validationErrors.length > 0) {
      throw new Error(`Validation errors: ${validationErrors.join(", ")}`);
    }

    // Update source file
    const ext = path.extname(record.sourcePath).toLowerCase();
    let content: string;

    if (ext === ".json") {
      content = JSON.stringify(updatedAgentDef, null, 2);
    } else {
      // Markdown format
      const preamble: any = {
        name: updatedAgentDef.name,
        description: updatedAgentDef.description,
        ...(updatedAgentDef.metadata || {}),
      };

      let body = "";
      if (updatedAgentDef.systemMessage) {
        body += `<system>\n${updatedAgentDef.systemMessage}\n</system>\n\n`;
      }
      body += updatedAgentDef.prompt;

      content = `---\n${YAML.stringify(preamble)}---\n\n${body}`;
    }

    await this.ide.writeFile(record.sourcePath, content);

    // Reimport
    const updatedRecord = await this.importAgentFile(record.sourcePath);

    // Trigger config reload
    await this.configHandler.reloadConfig("agent-import-updated");

    return updatedRecord;
  }

  async deleteAgent(id: string): Promise<void> {
    const record = this.importedAgents.get(id);
    if (!record) {
      throw new Error(`Agent not found: ${id}`);
    }

    // Delete source file
    await this.ide.deleteFile(record.sourcePath);

    // Delete prompt file
    await this.ide.deleteFile(record.promptFilePath);

    // Remove from map
    this.importedAgents.delete(id);

    // Trigger config reload
    await this.configHandler.reloadConfig("agent-import-deleted");
  }

  async toggleAgentStatus(id: string, enabled: boolean): Promise<void> {
    const record = this.importedAgents.get(id);
    if (!record) {
      throw new Error(`Agent not found: ${id}`);
    }

    if (enabled) {
      // Re-enable: recreate prompt file
      const promptContent = this.convertToPromptFile(record.agentDef);
      await this.ide.writeFile(record.promptFilePath, promptContent);
      record.status = "active";
    } else {
      // Disable: remove prompt file but keep record
      await this.ide.deleteFile(record.promptFilePath);
      record.status = "disabled";
    }

    // Trigger config reload
    await this.configHandler.reloadConfig("agent-import-toggled");
  }

  async shutdown(): Promise<void> {
    console.log("[AgentImport] Shutting down agent import service");

    // Clear debounce timers
    for (const timer of this.changeDebounceTimers.values()) {
      clearTimeout(timer);
    }
    this.changeDebounceTimers.clear();

    // Close watchers
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
  }

  getImportedAgents(): ImportedAgentRecord[] {
    return Array.from(this.importedAgents.values());
  }

  // Helper methods for IDE operations
  private async pathExists(p: string): Promise<boolean> {
    try {
      await this.ide.readFile(p);
      return true;
    } catch {
      return false;
    }
  }

  private async ensureDir(dirPath: string): Promise<void> {
    // Try to read the directory, if it fails, create it
    try {
      await this.ide.listDir(dirPath);
    } catch {
      // Directory doesn't exist, create it
      // Note: IDE interface doesn't have makeDir, so we'll use fs directly
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    }
  }
}

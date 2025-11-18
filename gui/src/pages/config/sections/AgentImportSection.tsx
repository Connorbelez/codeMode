import { FolderPlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useContext, useEffect, useState } from "react";
import { Button, Card, EmptyState } from "../../../components/ui";
import { IdeMessengerContext } from "../../../context/IdeMessenger";
import { useAppDispatch, useAppSelector } from "../../../redux/hooks";
import { updateConfig } from "../../../redux/slices/configSlice";
import { modifyAnyConfigWithSharedConfig } from "../../../util/sharedConfig";
import { ConfigHeader } from "../components/ConfigHeader";
import { UserSetting } from "../components/UserSetting";
import { AgentCard } from "../components/AgentCard";
import { AgentCreationDialog } from "../components/AgentCreationDialog";

interface ImportedAgentRecord {
  id: string;
  sourcePath: string;
  importedAt: string;
  lastModified: string;
  promptFilePath: string;
  agentDef: {
    name: string;
    description: string;
    systemMessage?: string;
    prompt: string;
    metadata?: {
      author?: string;
      version?: string;
      tags?: string[];
    };
  };
  status: "active" | "error" | "disabled";
  errorMessage?: string;
}

interface ClaudeCodeAgentDefinition {
  name: string;
  description: string;
  systemMessage?: string;
  prompt: string;
}

export function AgentImportSection() {
  const ideMessenger = useContext(IdeMessengerContext);
  const dispatch = useAppDispatch();
  const config = useAppSelector((state) => state.config.config);

  const [importedAgents, setImportedAgents] = useState<ImportedAgentRecord[]>(
    [],
  );
  const [isLoading, setIsLoading] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingAgent, setEditingAgent] = useState<ImportedAgentRecord | null>(
    null,
  );

  useEffect(() => {
    loadImportedAgents();
  }, []);

  async function loadImportedAgents() {
    try {
      const agents = await ideMessenger.request(
        "agentImport/getImportedAgents",
        undefined,
      );
      setImportedAgents(agents);
    } catch (error) {
      console.error("Failed to load imported agents:", error);
    }
  }

  const agentImportConfig = config.agentImport || {
    enabled: false,
    importPaths: [],
    autoReload: true,
    namingStrategy: "preserve" as const,
    conflictResolution: "rename" as const,
  };

  function updateAgentImportConfig(updates: Partial<typeof agentImportConfig>) {
    const updatedAgentImport = { ...agentImportConfig, ...updates };
    const updatedConfig = {
      ...config,
      agentImport: updatedAgentImport,
    };

    // Optimistic update
    dispatch(updateConfig(updatedConfig));

    // Note: The actual config update would need to be persisted to the config file
    // This might require a new protocol message or using the existing config update mechanism
  }

  async function handleAddImportPath() {
    try {
      // Request directory selection from IDE
      const path = await ideMessenger.request("getDirectoryPath", undefined);
      if (path) {
        await ideMessenger.request("agentImport/addImportPath", { path });
        await loadImportedAgents();

        // Update local config
        updateAgentImportConfig({
          importPaths: [...agentImportConfig.importPaths, path],
        });
      }
    } catch (error) {
      console.error("Failed to add import path:", error);
    }
  }

  async function handleRemoveImportPath(path: string) {
    try {
      await ideMessenger.request("agentImport/removeImportPath", { path });

      // Update local config
      updateAgentImportConfig({
        importPaths: agentImportConfig.importPaths.filter((p) => p !== path),
      });
    } catch (error) {
      console.error("Failed to remove import path:", error);
    }
  }

  async function handleReimportAll() {
    setIsLoading(true);
    try {
      const result = await ideMessenger.request(
        "agentImport/reimportAll",
        undefined,
      );
      void ideMessenger.post("showToast", {
        message: `Imported ${result.success} agents (${result.failed} failed)`,
        type: result.failed > 0 ? "warning" : "success",
      });
      await loadImportedAgents();
    } catch (error) {
      void ideMessenger.post("showToast", {
        message: `Failed to reimport agents: ${error.message}`,
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCreateNewAgent(agent: ClaudeCodeAgentDefinition) {
    try {
      await ideMessenger.request("agentImport/createNewAgent", agent);
      await loadImportedAgents();
      void ideMessenger.post("showToast", {
        message: `Agent "${agent.name}" created successfully`,
        type: "success",
      });
    } catch (error) {
      throw new Error(`Failed to create agent: ${error.message}`);
    }
  }

  async function handleUpdateAgent(agent: ClaudeCodeAgentDefinition) {
    if (!editingAgent) return;

    try {
      await ideMessenger.request("agentImport/updateAgent", {
        id: editingAgent.id,
        updates: agent,
      });
      await loadImportedAgents();
      setEditingAgent(null);
      void ideMessenger.post("showToast", {
        message: `Agent "${agent.name}" updated successfully`,
        type: "success",
      });
    } catch (error) {
      throw new Error(`Failed to update agent: ${error.message}`);
    }
  }

  async function handleDeleteAgent(id: string, name: string) {
    if (
      !confirm(`Are you sure you want to delete the agent "${name}"? This cannot be undone.`)
    ) {
      return;
    }

    try {
      await ideMessenger.request("agentImport/deleteAgent", { id });
      await loadImportedAgents();
      void ideMessenger.post("showToast", {
        message: `Agent "${name}" deleted successfully`,
        type: "success",
      });
    } catch (error) {
      void ideMessenger.post("showToast", {
        message: `Failed to delete agent: ${error.message}`,
        type: "error",
      });
    }
  }

  async function handleToggleAgent(id: string, enabled: boolean) {
    try {
      await ideMessenger.request("agentImport/toggleAgentStatus", {
        id,
        enabled,
      });
      await loadImportedAgents();
    } catch (error) {
      void ideMessenger.post("showToast", {
        message: `Failed to toggle agent: ${error.message}`,
        type: "error",
      });
    }
  }

  return (
    <div className="space-y-6">
      <ConfigHeader
        title="Agent Import"
        subtext="Import custom agents from Claude Code"
        showAddButton={false}
      />

      {/* Configuration Settings */}
      <Card>
        <UserSetting
          type="toggle"
          title="Enable Agent Import"
          description="Automatically import agents from configured directories"
          value={agentImportConfig.enabled}
          onChange={(enabled) => updateAgentImportConfig({ enabled })}
        />

        <UserSetting
          type="toggle"
          title="Auto Reload"
          description="Watch for changes and automatically reload agents"
          value={agentImportConfig.autoReload}
          onChange={(autoReload) => updateAgentImportConfig({ autoReload })}
        />

        <UserSetting
          type="select"
          title="Naming Strategy"
          description="How to name imported agents"
          value={agentImportConfig.namingStrategy}
          options={[
            { label: "Preserve Original", value: "preserve" },
            { label: "Add Prefix", value: "prefix" },
            { label: "Add Suffix", value: "suffix" },
          ]}
          onChange={(namingStrategy: any) =>
            updateAgentImportConfig({ namingStrategy })
          }
        />

        {agentImportConfig.namingStrategy === "prefix" && (
          <UserSetting
            type="input"
            title="Name Prefix"
            description="Prefix to add to agent names (e.g., 'cc-')"
            value={agentImportConfig.namePrefix || ""}
            onChange={(namePrefix) => updateAgentImportConfig({ namePrefix })}
          />
        )}

        {agentImportConfig.namingStrategy === "suffix" && (
          <UserSetting
            type="input"
            title="Name Suffix"
            description="Suffix to add to agent names (e.g., '-imported')"
            value={agentImportConfig.nameSuffix || ""}
            onChange={(nameSuffix) => updateAgentImportConfig({ nameSuffix })}
          />
        )}

        <UserSetting
          type="select"
          title="Conflict Resolution"
          description="What to do when agent name conflicts occur"
          value={agentImportConfig.conflictResolution}
          options={[
            { label: "Skip (don't import)", value: "skip" },
            { label: "Rename (add number)", value: "rename" },
            { label: "Overwrite", value: "overwrite" },
          ]}
          onChange={(conflictResolution: any) =>
            updateAgentImportConfig({ conflictResolution })
          }
        />
      </Card>

      {/* Import Paths */}
      <div>
        <ConfigHeader
          title="Import Paths"
          subtext="Directories containing agent definitions"
          onAddClick={handleAddImportPath}
          addButtonTooltip="Add Import Path"
          variant="sm"
        />

        <div className="space-y-2">
          {agentImportConfig.importPaths.length === 0 ? (
            <EmptyState
              title="No import paths configured"
              description="Click the + button to add a directory containing agent definitions"
            />
          ) : (
            agentImportConfig.importPaths.map((path, index) => (
              <Card key={index} className="flex items-center justify-between">
                <span className="text-sm font-mono text-foreground truncate flex-1">
                  {path}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveImportPath(path)}
                >
                  <TrashIcon className="h-4 w-4" />
                </Button>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Imported Agents */}
      <div>
        <ConfigHeader
          title="Imported Agents"
          subtext={`${importedAgents.length} agent${importedAgents.length !== 1 ? "s" : ""} imported`}
          onAddClick={() => setShowCreateDialog(true)}
          addButtonTooltip="Create New Agent"
          variant="sm"
        />

        <div className="flex gap-2 mb-4">
          <Button
            variant="outline"
            size="lg"
            onClick={handleReimportAll}
            disabled={isLoading}
          >
            {isLoading ? "Reimporting..." : "Reimport All"}
          </Button>
        </div>

        <div className="space-y-2">
          {importedAgents.length === 0 ? (
            <EmptyState
              title="No agents imported"
              description="Add an import path or create a new agent to get started"
            />
          ) : (
            importedAgents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                onEdit={() => setEditingAgent(agent)}
                onDelete={() => handleDeleteAgent(agent.id, agent.agentDef.name)}
                onToggle={(enabled) => handleToggleAgent(agent.id, enabled)}
              />
            ))
          )}
        </div>
      </div>

      {/* Create/Edit Dialog */}
      <AgentCreationDialog
        open={showCreateDialog || editingAgent !== null}
        onClose={() => {
          setShowCreateDialog(false);
          setEditingAgent(null);
        }}
        onSave={editingAgent ? handleUpdateAgent : handleCreateNewAgent}
        initialValues={editingAgent?.agentDef}
        title={editingAgent ? "Edit Agent" : "Create New Agent"}
      />
    </div>
  );
}

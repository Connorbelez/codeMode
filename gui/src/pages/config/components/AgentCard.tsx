import { useState } from "react";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";

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
      createdAt?: string;
      updatedAt?: string;
      license?: string;
      repository?: string;
    };
  };
  status: "active" | "error" | "disabled";
  errorMessage?: string;
}

interface AgentCardProps {
  agent: ImportedAgentRecord;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (enabled: boolean) => void;
}

export function AgentCard({ agent, onEdit, onDelete, onToggle }: AgentCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isActive = agent.status === "active";

  const getStatusColor = (status: ImportedAgentRecord["status"]) => {
    switch (status) {
      case "active":
        return "text-green-500";
      case "error":
        return "text-red-500";
      case "disabled":
        return "text-gray-500";
      default:
        return "text-gray-400";
    }
  };

  return (
    <Card className="hover:bg-input transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="font-semibold text-foreground truncate">
              {agent.agentDef.name}
            </h3>
            <span
              className={`text-xs font-medium ${getStatusColor(agent.status)}`}
            >
              {agent.status}
            </span>
            {agent.agentDef.metadata?.tags?.map((tag) => (
              <span
                key={tag}
                className="text-xs px-2 py-0.5 rounded bg-border text-description"
              >
                {tag}
              </span>
            ))}
          </div>

          <p className="text-sm text-description mb-2 line-clamp-2">
            {agent.agentDef.description}
          </p>

          <div className="text-xs text-description space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Slash command:</span>
              <code className="font-mono bg-border px-1 rounded">
                /{agent.agentDef.name}
              </code>
            </div>

            {isExpanded && (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Source:</span>
                  <code className="font-mono text-xs truncate max-w-md">
                    {agent.sourcePath}
                  </code>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Last modified:</span>
                  <span>{new Date(agent.lastModified).toLocaleString()}</span>
                </div>
                {agent.agentDef.metadata?.author && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Author:</span>
                    <span>{agent.agentDef.metadata.author}</span>
                  </div>
                )}
                {agent.agentDef.metadata?.version && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Version:</span>
                    <span>{agent.agentDef.metadata.version}</span>
                  </div>
                )}
              </>
            )}
          </div>

          {agent.errorMessage && (
            <div className="mt-2 text-sm text-red-500 bg-red-500/10 rounded px-2 py-1">
              Error: {agent.errorMessage}
            </div>
          )}

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs text-description hover:text-foreground mt-2"
          >
            {isExpanded ? "Show less" : "Show more"}
          </button>
        </div>

        <div className="flex gap-2 ml-4 flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={onEdit}>
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onToggle(!isActive)}
          >
            {isActive ? "Disable" : "Enable"}
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </div>
    </Card>
  );
}

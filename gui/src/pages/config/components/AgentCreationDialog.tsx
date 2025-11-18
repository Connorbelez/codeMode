import { useState, useEffect } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { Button } from "../../../components/ui/Button";

interface ClaudeCodeAgentDefinition {
  name: string;
  description: string;
  systemMessage?: string;
  prompt: string;
  metadata?: {
    author?: string;
    version?: string;
    tags?: string[];
  };
}

interface AgentCreationDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (agent: ClaudeCodeAgentDefinition) => Promise<void>;
  initialValues?: Partial<ClaudeCodeAgentDefinition>;
  title?: string;
}

export function AgentCreationDialog({
  open,
  onClose,
  onSave,
  initialValues,
  title = "Create New Agent",
}: AgentCreationDialogProps) {
  const [name, setName] = useState(initialValues?.name || "");
  const [description, setDescription] = useState(
    initialValues?.description || "",
  );
  const [systemMessage, setSystemMessage] = useState(
    initialValues?.systemMessage || "",
  );
  const [prompt, setPrompt] = useState(initialValues?.prompt || "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && initialValues) {
      setName(initialValues.name || "");
      setDescription(initialValues.description || "");
      setSystemMessage(initialValues.systemMessage || "");
      setPrompt(initialValues.prompt || "");
    }
  }, [open, initialValues]);

  const handleSave = async () => {
    // Validation
    if (!name.trim()) {
      setError("Agent name is required");
      return;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      setError(
        "Agent name must contain only letters, numbers, hyphens, and underscores",
      );
      return;
    }

    if (!description.trim()) {
      setError("Description is required");
      return;
    }

    if (!prompt.trim()) {
      setError("Prompt is required");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await onSave({
        name: name.trim(),
        description: description.trim(),
        systemMessage: systemMessage.trim() || undefined,
        prompt: prompt.trim(),
      });

      // Reset form
      setName("");
      setDescription("");
      setSystemMessage("");
      setPrompt("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save agent");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setError(null);
    onClose();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleCancel}
    >
      <div
        className="bg-editor rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <button
            onClick={handleCancel}
            className="text-description hover:text-foreground"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-500 px-4 py-2 rounded">
              {error}
            </div>
          )}

          {/* Agent Name */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Agent Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="code-reviewer"
              className="w-full px-3 py-2 bg-input border border-border rounded text-foreground focus:outline-none focus:border-primary"
            />
            <p className="text-xs text-description mt-1">
              This will be the slash command name (e.g., /{name || "agent-name"}
              )
            </p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Description <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Reviews code for bugs and improvements"
              className="w-full px-3 py-2 bg-input border border-border rounded text-foreground focus:outline-none focus:border-primary"
            />
          </div>

          {/* System Message */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              System Message <span className="text-description">(Optional)</span>
            </label>
            <textarea
              value={systemMessage}
              onChange={(e) => setSystemMessage(e.target.value)}
              placeholder="You are an expert code reviewer..."
              rows={3}
              className="w-full px-3 py-2 bg-input border border-border rounded text-foreground focus:outline-none focus:border-primary resize-y"
            />
          </div>

          {/* Prompt Template */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Prompt Template <span className="text-red-500">*</span>
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={`Review the following code:\n\n@currentFile\n\nProvide feedback on...`}
              rows={8}
              className="w-full px-3 py-2 bg-input border border-border rounded text-foreground focus:outline-none focus:border-primary font-mono text-sm resize-y"
            />
            <p className="text-xs text-description mt-1">
              Use @file, @codebase, @currentFile to reference context
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <Button variant="ghost" onClick={handleCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={!name || !description || !prompt || isSaving}
          >
            {isSaving ? "Saving..." : "Save Agent"}
          </Button>
        </div>
      </div>
    </div>
  );
}

import * as path from "path";
import { parsePromptFile } from "../promptFiles/parsePromptFile.js";
import type { ClaudeCodeAgentDefinition } from "./types.js";

export async function parseAgentFile(
  filePath: string,
  content: string,
): Promise<ClaudeCodeAgentDefinition | null> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".json") {
    return parseJsonAgent(content);
  } else if (ext === ".md" || ext === ".markdown") {
    return parseMarkdownAgent(filePath, content);
  }

  return null;
}

function parseJsonAgent(content: string): ClaudeCodeAgentDefinition {
  try {
    const json = JSON.parse(content);

    // Validate required fields
    if (!json.name || typeof json.name !== "string") {
      throw new Error("Invalid agent definition: missing or invalid 'name' field");
    }

    if (!json.prompt || typeof json.prompt !== "string") {
      throw new Error("Invalid agent definition: missing or invalid 'prompt' field");
    }

    return {
      name: json.name,
      description: json.description || json.name,
      systemMessage: json.systemMessage,
      prompt: json.prompt,
      metadata: json.metadata,
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON: ${error.message}`);
    }
    throw error;
  }
}

function parseMarkdownAgent(
  filePath: string,
  content: string,
): ClaudeCodeAgentDefinition {
  try {
    // Use existing prompt file parser
    const parsed = parsePromptFile(filePath, content);

    // Extract metadata from preamble if it was parsed
    let metadata: ClaudeCodeAgentDefinition["metadata"];

    // The parsePromptFile may have additional fields in the parsed object
    // that we can use as metadata
    const parsedAny = parsed as any;
    if (parsedAny.author || parsedAny.version || parsedAny.tags || parsedAny.license) {
      metadata = {
        author: parsedAny.author,
        version: parsedAny.version,
        tags: parsedAny.tags,
        createdAt: parsedAny.createdAt,
        updatedAt: parsedAny.updatedAt,
        license: parsedAny.license,
        repository: parsedAny.repository,
      };
    }

    return {
      name: parsed.name,
      description: parsed.description,
      systemMessage: parsed.systemMessage,
      prompt: parsed.prompt,
      metadata,
    };
  } catch (error) {
    throw new Error(`Failed to parse markdown agent: ${error.message}`);
  }
}

export function validateAgentDefinition(
  agent: ClaudeCodeAgentDefinition,
): string[] {
  const errors: string[] = [];

  // Name validation
  if (!agent.name || agent.name.trim().length === 0) {
    errors.push("Agent name is required");
  } else if (!/^[a-zA-Z0-9_-]+$/.test(agent.name)) {
    errors.push(
      "Agent name must contain only letters, numbers, hyphens, and underscores",
    );
  }

  // Prompt validation
  if (!agent.prompt || agent.prompt.trim().length === 0) {
    errors.push("Agent prompt is required");
  }

  // Description validation
  if (!agent.description || agent.description.trim().length === 0) {
    errors.push("Agent description is required");
  }

  return errors;
}

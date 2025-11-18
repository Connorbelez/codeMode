#!/usr/bin/env node

// MUST be the first import - intercepts console/stdout/stderr before any dependencies load
import "./init.js";

import { Command } from "commander";

import { chat } from "./commands/chat.js";
import { login } from "./commands/login.js";
import { logout } from "./commands/logout.js";
import { listSessionsCommand } from "./commands/ls.js";
import { remoteTest } from "./commands/remote-test.js";
import { remote } from "./commands/remote.js";
import { serve } from "./commands/serve.js";
import {
  worktreeCleanup,
  worktreeCreate,
  worktreeDiff,
  worktreeList,
  worktreeMerge,
  worktreeRemove,
  worktreeStatus,
  worktreeValidate,
} from "./commands/worktree.js";
import {
  handleValidationErrors,
  validateFlags,
} from "./flags/flagValidator.js";
import { configureConsoleForHeadless, safeStderr } from "./init.js";
import { sentryService } from "./sentry.js";
import { addCommonOptions, mergeParentOptions } from "./shared-options.js";
import { posthogService } from "./telemetry/posthogService.js";
import { gracefulExit } from "./util/exit.js";
import { logger } from "./util/logger.js";
import { readStdinSync } from "./util/stdin.js";
import { getVersion } from "./version.js";

// TUI lifecycle and two-stage exit state management
let tuiUnmount: (() => void) | null;
let showExitMessage: boolean;
let exitMessageCallback: (() => void) | null;
let lastCtrlCTime: number;

// Initialize state immediately to avoid temporal dead zone issues with exported functions
(function initializeTUIState() {
  tuiUnmount = null;
  showExitMessage = false;
  exitMessageCallback = null;
  lastCtrlCTime = 0;
})();

// Register TUI cleanup function for graceful shutdown
export function setTUIUnmount(unmount: () => void) {
  tuiUnmount = unmount;
}

// Register callback to trigger UI updates when exit message state changes
export function setExitMessageCallback(callback: () => void) {
  exitMessageCallback = callback;
}

// Sets up SIGINT handler that requires double Ctrl+C within 1 second to exit
export function enableSigintHandler() {
  // Remove all existing SIGINT listeners first
  process.removeAllListeners("SIGINT");

  process.on("SIGINT", async () => {
    const now = Date.now();
    const timeSinceLastCtrlC = now - lastCtrlCTime;

    if (timeSinceLastCtrlC <= 1000 && lastCtrlCTime !== 0) {
      // Second Ctrl+C within 1 second - exit
      showExitMessage = false;
      if (tuiUnmount) {
        tuiUnmount();
      }
      await gracefulExit(0);
    } else {
      // First Ctrl+C or too much time elapsed - show exit message
      lastCtrlCTime = now;
      showExitMessage = true;
      if (exitMessageCallback) {
        exitMessageCallback();
      }

      // Hide message after 1 second
      setTimeout(() => {
        showExitMessage = false;
        if (exitMessageCallback) {
          exitMessageCallback();
        }
      }, 1000);
    }
  });
}

// Check if "ctrl+c to exit" message should be displayed
export function shouldShowExitMessage(): boolean {
  return showExitMessage;
}

// Add global error handlers to prevent uncaught errors from crashing the process
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at:", { promise, reason });
  sentryService.captureException(
    reason instanceof Error ? reason : new Error(String(reason)),
    {
      promise: String(promise),
    },
  );
  // Don't exit the process, just log the error
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception:", error);
  sentryService.captureException(error);
  // Don't exit the process, just log the error
});

// keyboard interruption handler for non-TUI flows
process.on("SIGINT", async () => {
  await gracefulExit(130);
});

const program = new Command();

program
  .name("cn")
  .description(
    "Continue CLI - AI-powered development assistant. Starts an interactive session by default, use -p/--print for non-interactive output.",
  )
  .version(getVersion(), "-v, --version", "Display version number");

// Root command - chat functionality (default)
// Add common options to the root command
addCommonOptions(program)
  .argument("[prompt]", "Optional prompt to send to the assistant")
  .option("-p, --print", "Print response and exit (useful for pipes)")
  .option(
    "--format <format>",
    "Output format for headless mode (json). Only works with -p/--print flag.",
  )
  .option(
    "--silent",
    "Strip <think></think> tags and excess whitespace from output. Only works with -p/--print flag.",
  )
  .option("--resume", "Resume from last session")
  .option("--fork <sessionId>", "Fork from an existing session ID")
  .action(async (prompt, options) => {
    // Telemetry: record command invocation
    await posthogService.capture("cliCommand", { command: "cn" });
    // Handle piped input - detect it early and decide on mode
    let stdinInput = null;

    if (!options.print) {
      // Check if there's piped input available
      stdinInput = readStdinSync();
      if (stdinInput) {
        // Use piped input as the initial prompt
        if (prompt) {
          // Combine stdin and prompt argument
          prompt = `${stdinInput}\n\n${prompt}`;
        } else {
          // Only stdin input, use as initial prompt
          prompt = stdinInput;
        }

        // We have piped input but want to use TUI mode
        // Store a flag to pass custom stdin to TUI
        (options as any).hasPipedInput = true;
      }
    }

    // Configure console overrides FIRST, before any other logging
    const isHeadless = options.print;
    configureConsoleForHeadless(isHeadless);
    logger.configureHeadlessMode(isHeadless);

    // Validate all command line flags
    const validation = validateFlags({
      print: options.print,
      format: options.format,
      silent: options.silent,
      readonly: options.readonly,
      auto: options.auto,
      config: options.config,
      resume: options.resume,
      fork: options.fork,
      allow: options.allow,
      ask: options.ask,
      exclude: options.exclude,
      isRootCommand: true,
      commandName: "cn",
    });

    if (!validation.isValid) {
      handleValidationErrors(validation.errors);
    }

    if (options.verbose) {
      logger.setLevel("debug");
      const logPath = logger.getLogPath();
      const sessionId = logger.getSessionId();
      // In headless mode, suppress these verbose logs
      if (!isHeadless) {
        console.log(`Verbose logging enabled (session: ${sessionId})`);
        console.log(`Logs: ${logPath}`);
        console.log(
          `Filter this session: grep '\\[${sessionId}\\]' ${logPath}`,
        );
      }
      logger.debug("Verbose logging enabled");
    }

    // Handle piped input for headless mode (only if we haven't already read it)
    if (options.print && !stdinInput) {
      const headlessStdinInput = readStdinSync();
      if (headlessStdinInput) {
        if (prompt) {
          // Combine stdin and prompt argument - stdin comes first in XML block
          prompt = `<stdin>\n${headlessStdinInput}\n</stdin>\n\n${prompt}`;
        } else {
          // Only stdin input, use as-is
          prompt = headlessStdinInput;
        }
      }
    }

    // In headless mode, ensure we have a prompt unless using --agent flag
    // Agent files can provide their own prompts
    if (options.print && !prompt && !options.agent) {
      safeStderr(
        "Error: A prompt is required when using the -p/--print flag, unless --prompt or --agent is provided.\n\n",
      );
      safeStderr("Usage examples:\n");
      safeStderr('  cn -p "please review my current git diff"\n');
      safeStderr('  echo "hello" | cn -p\n');
      safeStderr('  cn -p "analyze the code in src/"\n');
      safeStderr("  cn -p --agent my-org/my-agent\n");
      safeStderr("  cn -p --prompt my-org/my-prompt\n");
      await gracefulExit(1);
    }

    // Map --print to headless mode
    options.headless = options.print;
    options.print = undefined;
    await chat(prompt, options);
  });

// Login subcommand
program
  .command("login")
  .description("Authenticate with Continue")
  .action(async () => {
    // Telemetry: record command invocation
    await posthogService.capture("cliCommand", { command: "login" });
    await login();
  });

// Logout subcommand
program
  .command("logout")
  .description("Log out from Continue")
  .action(async () => {
    // Telemetry: record command invocation
    await posthogService.capture("cliCommand", { command: "logout" });
    await logout();
  });

// List sessions subcommand
program
  .command("ls")
  .description("List recent chat sessions and select one to resume")
  .option("--json", "Output in JSON format")
  .action(async (options) => {
    // Telemetry: record command invocation
    await posthogService.capture("cliCommand", { command: "ls" });
    await listSessionsCommand({
      format: options.json ? "json" : undefined,
    });
  });

// Remote subcommand
addCommonOptions(
  program
    .command("remote [prompt]", { hidden: true })
    .description("Launch a remote instance of the cn agent"),
)
  .option(
    "--url <url>",
    "Connect directly to the specified URL instead of creating a new remote environment",
  )
  .option(
    "--id <id>",
    "Connect to an existing remote agent by id and establish a tunnel",
  )
  .option(
    "--idempotency-key <key>",
    "Idempotency key for session management - allows resuming existing sessions",
  )
  .option(
    "-s, --start",
    "Create remote environment and print connection details without starting TUI",
  )
  .option(
    "--branch <branch>",
    "Specify the git branch name to use in the remote environment",
  )
  .option(
    "--repo <url>",
    "Specify the repository URL to use in the remote environment",
  )
  .action(async (prompt: string | undefined, options) => {
    // Telemetry: record command invocation
    await posthogService.capture("cliCommand", {
      command: "remote",
      flagS: options.start,
    });
    await remote(prompt, options);
  });

// Serve subcommand
program
  .command("serve [prompt]", { hidden: true })
  .description("Start an HTTP server with /state and /message endpoints")
  .option(
    "--timeout <seconds>",
    "Inactivity timeout in seconds (default: 300)",
    "300",
  )
  .option("--port <port>", "Port to run the server on (default: 8000)", "8000")
  .option(
    "--id <storageId>",
    "Upload session snapshots to Continue-managed storage using the provided identifier",
  )
  .action(async (prompt, options) => {
    // Telemetry: record command invocation
    await posthogService.capture("cliCommand", { command: "serve" });
    // Merge parent options with subcommand options
    const mergedOptions = mergeParentOptions(program, options);

    if (mergedOptions.verbose) {
      logger.setLevel("debug");
      logger.debug("Verbose logging enabled");
    }

    await serve(prompt, mergedOptions);
  });

// Remote test subcommand (for development)
program
  .command("remote-test [prompt]")
  .description("Test remote TUI mode with a local server")
  .option("--url <url>", "Server URL (default: http://localhost:8000)")
  .action(async (prompt: string | undefined, options) => {
    // Telemetry: record command invocation
    await posthogService.capture("cliCommand", { command: "remote-test" });
    await remoteTest(prompt, options.url);
  });

// Worktree commands
const worktree = program
  .command("worktree")
  .description("Manage git worktrees for isolated workspaces");

// Worktree create
worktree
  .command("create")
  .description("Create a new worktree")
  .option("--base-branch <branch>", "Base branch to create from")
  .option("--branch-name <name>", "Custom branch name")
  .option("--description <text>", "Description for this worktree")
  .option("--agent-session-id <id>", "Agent session ID")
  .action(async (options) => {
    await posthogService.capture("cliCommand", { command: "worktree create" });
    await worktreeCreate(options);
  });

// Worktree list
worktree
  .command("list")
  .alias("ls")
  .description("List all worktrees")
  .option("--status <status>", "Filter by status")
  .option("--format <format>", "Output format (table|json)")
  .action(async (options) => {
    await posthogService.capture("cliCommand", { command: "worktree list" });
    await worktreeList(options);
  });

// Worktree diff
worktree
  .command("diff <source> <target>")
  .description("Show diff between worktrees or branches")
  .option("--stat", "Show only statistics")
  .option("--name-only", "Show only file names")
  .action(async (source, target, options) => {
    await posthogService.capture("cliCommand", { command: "worktree diff" });
    await worktreeDiff({ source, target, ...options });
  });

// Worktree merge
worktree
  .command("merge <session-id>")
  .description("Merge worktree back to parent branch")
  .option(
    "--strategy <strategy>",
    "Merge strategy (squash|merge|rebase|fast-forward)",
  )
  .option("--target <branch>", "Target branch (default: parent branch)")
  .option("--message <text>", "Commit message")
  .option("--delete", "Delete worktree after merge")
  .option("--run-tests", "Run tests before merging")
  .option("--force", "Force merge even with conflicts")
  .action(async (sessionId, options) => {
    await posthogService.capture("cliCommand", { command: "worktree merge" });
    await worktreeMerge({
      sessionId,
      strategy: options.strategy,
      targetBranch: options.target,
      message: options.message,
      deleteAfterMerge: options.delete,
      runTests: options.runTests,
      force: options.force,
    });
  });

// Worktree remove
worktree
  .command("remove <session-id>")
  .alias("rm")
  .description("Remove a worktree")
  .option("--force", "Force removal even with uncommitted changes")
  .option("--delete-branch", "Delete the git branch as well")
  .action(async (sessionId, options) => {
    await posthogService.capture("cliCommand", { command: "worktree remove" });
    await worktreeRemove({
      sessionId,
      force: options.force,
      deleteBranch: options.deleteBranch,
    });
  });

// Worktree cleanup
worktree
  .command("cleanup")
  .description("Clean up old worktrees based on retention policy")
  .option("--dry-run", "Show what would be removed without removing")
  .action(async (options) => {
    await posthogService.capture("cliCommand", { command: "worktree cleanup" });
    await worktreeCleanup(options);
  });

// Worktree status
worktree
  .command("status <session-id>")
  .description("Show detailed status of a worktree")
  .action(async (sessionId) => {
    await posthogService.capture("cliCommand", { command: "worktree status" });
    await worktreeStatus({ sessionId });
  });

// Worktree validate
worktree
  .command("validate [session-id]")
  .description("Validate worktree state and optionally repair")
  .option("--all", "Validate all worktrees")
  .option("--repair", "Attempt to repair issues")
  .action(async (sessionId, options) => {
    await posthogService.capture("cliCommand", {
      command: "worktree validate",
    });
    await worktreeValidate({
      sessionId,
      all: options.all,
      repair: options.repair,
    });
  });

// Handle unknown commands
program.on("command:*", () => {
  console.error(`Error: Unknown command '${program.args.join(" ")}'\n`);
  program.outputHelp();
  void gracefulExit(1);
});

export async function runCli(): Promise<void> {
  // Parse arguments and handle errors
  try {
    program.parse();
  } catch (error) {
    console.error(error);
    sentryService.captureException(
      error instanceof Error ? error : new Error(String(error)),
    );
    process.exit(1);
  }

  process.on("SIGTERM", async () => {
    await gracefulExit(0);
  });
}

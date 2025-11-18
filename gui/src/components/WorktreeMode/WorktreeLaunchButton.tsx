import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { useMemo, useState } from "react";
import { WorktreeLaunchControl } from "./types";

interface WorktreeLaunchButtonProps extends WorktreeLaunchControl {}

export function WorktreeLaunchButton({
  enabled,
  busy,
  options,
  onEnabledChange,
  onOptionsChange,
}: WorktreeLaunchButtonProps) {
  const [showOptions, setShowOptions] = useState(false);
  const descriptionValue = options.description ?? "";
  const baseBranchValue = options.baseBranch ?? "";
  const busyLabel = useMemo(() => {
    if (!busy) {
      return null;
    }
    return "Creating worktree…";
  }, [busy]);

  return (
    <div className="text-description flex flex-col gap-1 text-xs">
      <style>{`
        @keyframes gradient-flow {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        @keyframes glow-pulse {
          0%, 100% { 
            box-shadow: 0 0 10px rgba(0, 255, 0, 0.3), 0 0 20px rgba(0, 206, 209, 0.2);
          }
          50% { 
            box-shadow: 0 0 20px rgba(0, 255, 0, 0.5), 0 0 40px rgba(0, 206, 209, 0.4);
          }
        }
        @keyframes icon-spin {
          0% { transform: rotate(0deg) scale(0.8); }
          50% { transform: rotate(180deg) scale(1.2); }
          100% { transform: rotate(360deg) scale(1); }
        }
      `}</style>

      <div className="flex items-center gap-2">
        <div className="flex select-none items-center gap-2.5">
          {/* Slider Switch */}
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="Toggle Launch in Worktree (opens new window)"
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!busy) {
                onEnabledChange(!enabled);
              }
            }}
            className={`focus:ring-accent focus:ring-offset-background peer inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              busy ? "cursor-not-allowed opacity-50" : "cursor-pointer"
            } ${
              enabled
                ? "bg-gradient-to-r from-green-500 via-cyan-500 to-blue-500"
                : "bg-input hover:bg-input-hover"
            }`}
            style={
              enabled
                ? {
                    backgroundSize: "200% 100%",
                    animation: "gradient-flow 3s linear infinite",
                  }
                : undefined
            }
          >
            {/* Slider Thumb */}
            <span
              className={`bg-background pointer-events-none relative inline-flex h-5 w-5 items-center justify-center rounded-full shadow-lg ring-0 transition-transform duration-300 ease-in-out ${
                enabled ? "translate-x-5" : "translate-x-0"
              }`}
            >
              {/* Icon inside thumb */}
              <span
                className="flex items-center justify-center"
                style={
                  enabled
                    ? {
                        animation: "icon-spin 0.5s ease-out",
                      }
                    : undefined
                }
              >
                {enabled ? (
                  <svg
                    className="h-3 w-3 text-green-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                ) : (
                  <svg
                    className="text-description-muted h-3 w-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                )}
              </span>
            </span>
          </button>
        </div>

        {/* <button
          type="button"
          className={`hover:text-foreground ${enabled ? "text-description" : "text-description-muted"} transition-colors disabled:cursor-not-allowed`}
          disabled={!enabled || busy}
          onClick={() => setShowOptions((value) => !value)}
          aria-label="Configure worktree options"
        >
          <Cog6ToothIcon className="h-4 w-4" />
        </button> */}

        {!enabled && busy && (
          <span className="text-error flex items-center gap-1 text-xs">
            <ExclamationTriangleIcon className="h-3.5 w-3.5" />
            Wait for current worktree
          </span>
        )}
      </div>

      {/* {enabled && showOptions && (
        <div className="border-border bg-input space-y-2 rounded border px-3 py-2">
          <label className="text-foreground block text-xs font-semibold">
            Description
            <input
              type="text"
              className="border-border bg-background text-foreground placeholder:text-description focus:ring-accent mt-1 w-full rounded border px-2 py-1.5 text-xs focus:outline-none focus:ring-2"
              placeholder="Optional summary for the worktree"
              value={descriptionValue}
              onChange={(event) =>
                onOptionsChange({ description: event.target.value })
              }
            />
          </label>
          <label className="text-foreground block text-xs font-semibold">
            Base Branch
            <input
              type="text"
              className="border-border bg-background text-foreground placeholder:text-description focus:ring-accent mt-1 w-full rounded border px-2 py-1.5 text-xs focus:outline-none focus:ring-2"
              placeholder="Defaults to current branch"
              value={baseBranchValue}
              onChange={(event) =>
                onOptionsChange({ baseBranch: event.target.value })
              }
            />
          </label>
        </div>
      )} */}
    </div>
  );
}

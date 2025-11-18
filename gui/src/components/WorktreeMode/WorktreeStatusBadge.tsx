import type { WorktreeAgentStatus, WorktreeStatus } from "core/worktree/types";

const STATUS_LABELS: Record<WorktreeAgentStatus, string> = {
  working: "Working",
  idle: "Idle",
  completed: "Merged",
  error: "Attention",
};

const STATUS_STYLES: Record<WorktreeAgentStatus, string> = {
  working: "border-blue-500/40 bg-blue-500/10 text-blue-200",
  idle: "border-amber-400/40 bg-amber-400/10 text-amber-100",
  completed: "border-success bg-success/10 text-success",
  error: "border-error bg-error/10 text-error",
};

export function mapStatusToAgentStatus(
  status: WorktreeStatus,
): WorktreeAgentStatus {
  switch (status) {
    case "creating":
    case "active":
    case "merging":
      return "working";
    case "idle":
      return "idle";
    case "merged":
      return "completed";
    default:
      return "error";
  }
}

interface WorktreeStatusBadgeProps {
  status: WorktreeAgentStatus;
}

export function WorktreeStatusBadge({ status }: WorktreeStatusBadgeProps) {
  return (
    <span
      className={`text-2xs inline-flex items-center rounded-full border px-2 py-0.5 font-semibold uppercase tracking-wide ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

import {
  ArrowsRightLeftIcon,
  CheckCircleIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import type {
  WorktreeAgentStatus,
  WorktreeSessionWithStats,
  WorktreeStatus,
} from "core/worktree/types";
import { memo, useMemo } from "react";
import { Button } from "../ui";
import { WorktreeDiffStats } from "./WorktreeDiffStats";
import {
  WorktreeStatusBadge,
  mapStatusToAgentStatus,
} from "./WorktreeStatusBadge";

export type WorktreeActionType = "switch" | "merge" | "remove";

interface WorktreeSessionCardProps {
  session: WorktreeSessionWithStats;
  onSwitch: (session: WorktreeSessionWithStats) => void;
  onMerge: (session: WorktreeSessionWithStats) => void;
  onRemove: (session: WorktreeSessionWithStats) => void;
  busyAction?: { type: WorktreeActionType; sessionId: string } | null;
}

function formatRelative(date: Date | string): string {
  const value = date instanceof Date ? date : new Date(date);
  const diffMs = Date.now() - value.getTime();
  if (diffMs < 60_000) {
    return "Just now";
  }
  if (diffMs < 3_600_000) {
    return `${Math.floor(diffMs / 60_000)}m ago`;
  }
  if (diffMs < 86_400_000) {
    return `${Math.floor(diffMs / 3_600_000)}h ago`;
  }
  return `${Math.floor(diffMs / 86_400_000)}d ago`;
}

function getStatus(session: WorktreeSessionWithStats): WorktreeAgentStatus {
  if (session.agentStatus) {
    return session.agentStatus;
  }
  return mapStatusToAgentStatus(session.status as WorktreeStatus);
}

function WorktreeSessionCardComponent({
  session,
  onSwitch,
  onMerge,
  onRemove,
  busyAction,
}: WorktreeSessionCardProps) {
  const status = useMemo(() => getStatus(session), [session]);
  const createdLabel = useMemo(
    () => formatRelative(session.createdAt),
    [session.createdAt],
  );
  const metadataLabel = useMemo(() => {
    if (!session.metadata?.lastRefreshedAt) {
      return "";
    }
    return `Updated ${formatRelative(session.metadata.lastRefreshedAt)}`;
  }, [session.metadata?.lastRefreshedAt]);

  const isBusy =
    busyAction?.sessionId === session.id ? busyAction.type : undefined;

  const disableAll = Boolean(isBusy);

  return (
    <div className="border-border bg-background text-foreground flex flex-col gap-2 rounded border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            <span>{session.branchName}</span>
            <span className="text-description text-2xs">
              from {session.parentBranch}
            </span>
          </div>
          {session.description && (
            <p className="text-description text-xs">{session.description}</p>
          )}
          <p className="text-description text-2xs">
            Created {createdLabel} · {session.worktreePath}
          </p>
        </div>
        <WorktreeStatusBadge status={status} />
      </div>

      <div className="flex flex-col gap-1">
        <WorktreeDiffStats stats={session.diffStats} />
        {metadataLabel && (
          <span className="text-description text-2xs">{metadataLabel}</span>
        )}
      </div>

      <div className="text-description text-2xs flex flex-wrap gap-3">
        <span>
          {session.metadata.filesChanged} files changed ·{" "}
          {session.metadata.hasUncommittedChanges
            ? "Uncommitted changes present"
            : "Clean"}
        </span>
        {session.metadata.hasUnpushedCommits && (
          <span>Unpushed commits pending</span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex items-center gap-1"
          disabled={disableAll}
          onClick={() => onSwitch(session)}
        >
          <ArrowsRightLeftIcon className="h-3.5 w-3.5" />
          Switch
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex items-center gap-1"
          disabled={disableAll || status === "completed"}
          onClick={() => onMerge(session)}
        >
          <CheckCircleIcon className="h-3.5 w-3.5" />
          Merge
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-error flex items-center gap-1"
          disabled={disableAll}
          onClick={() => onRemove(session)}
        >
          <TrashIcon className="h-3.5 w-3.5" />
          Remove
        </Button>
      </div>
    </div>
  );
}

export const WorktreeSessionCard = memo(WorktreeSessionCardComponent);

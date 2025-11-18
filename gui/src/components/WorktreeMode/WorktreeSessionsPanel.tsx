import { ArrowPathIcon, ChevronDownIcon } from "@heroicons/react/24/outline";
import type { WorktreeSessionWithStats } from "core/worktree/types";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { IdeMessengerContext } from "../../context/IdeMessenger";
import { useWebviewListener } from "../../hooks/useWebviewListener";
import { Button } from "../ui";
import { WorktreeActionType, WorktreeSessionCard } from "./WorktreeSessionCard";

type SuccessMessage<T> = { status: "success"; content: T };
type ErrorMessage = { status: "error"; error?: string };

function isSuccessMessage<T>(result: unknown): result is SuccessMessage<T> {
  return (
    typeof result === "object" &&
    result !== null &&
    (result as any).status === "success"
  );
}

function isErrorMessage(result: unknown): result is ErrorMessage {
  return (
    typeof result === "object" &&
    result !== null &&
    (result as any).status === "error"
  );
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

type UiWorktreeSession = WorktreeSessionWithStats & { isActive?: boolean };

function hydrateSession(session: UiWorktreeSession): UiWorktreeSession {
  return {
    ...session,
    createdAt: toDate(session.createdAt),
    lastAccessedAt: toDate(session.lastAccessedAt),
    metadata: {
      ...session.metadata,
      lastRefreshedAt: toDate(session.metadata.lastRefreshedAt),
    },
    diffStats: session.diffStats
      ? {
          ...session.diffStats,
          lastChecked: session.diffStats.lastChecked
            ? toDate(session.diffStats.lastChecked)
            : undefined,
        }
      : undefined,
  };
}

function sortSessions(sessions: UiWorktreeSession[]): UiWorktreeSession[] {
  return [...sessions].sort(
    (a, b) =>
      toDate(b.lastAccessedAt).getTime() - toDate(a.lastAccessedAt).getTime(),
  );
}

interface WorktreeSessionsPanelProps {
  className?: string;
}

export function WorktreeSessionsPanel({
  className,
}: WorktreeSessionsPanelProps) {
  const ideMessenger = useContext(IdeMessengerContext);
  const [sessions, setSessions] = useState<UiWorktreeSession[]>([]);
  const [expanded, setExpanded] = useState(true);
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [actionState, setActionState] = useState<{
    type: WorktreeActionType;
    sessionId: string;
  } | null>(null);

  const fetchSessions = useCallback(
    async (options?: { silent?: boolean }) => {
      if (options?.silent) {
        setIsRefreshing(true);
      } else {
        setLoading(true);
      }
      try {
        const result = await ideMessenger.request("worktree/list", undefined);
        if (isSuccessMessage<UiWorktreeSession[]>(result)) {
          const hydrated = result.content.map((session) =>
            hydrateSession(session),
          );
          setSessions(sortSessions(hydrated));
          setError(null);
        } else if (isErrorMessage(result)) {
          setError(result.error ?? "Failed to load worktrees");
        }
      } catch (err) {
        setError((err as Error).message ?? "Failed to load worktrees");
      } finally {
        if (options?.silent) {
          setIsRefreshing(false);
        } else {
          setLoading(false);
          setHasLoaded(true);
        }
      }
    },
    [ideMessenger],
  );

  useEffect(() => {
    if (!expanded) {
      return;
    }
    void fetchSessions();
    const interval = setInterval(() => {
      void fetchSessions({ silent: true });
    }, 10_000);
    return () => clearInterval(interval);
  }, [expanded, fetchSessions]);

  useWebviewListener(
    "worktree/statusUpdate",
    async (data) => {
      const normalized = hydrateSession(data);
      setSessions((prev) => {
        const existing = prev.findIndex(
          (session) => session.id === normalized.id,
        );
        if (existing >= 0) {
          const copy = [...prev];
          copy[existing] = normalized;
          return sortSessions(copy);
        }
        return sortSessions([normalized, ...prev]);
      });
    },
    [],
  );

  const handleAction = useCallback(
    async (type: WorktreeActionType, session: UiWorktreeSession) => {
      setActionState({ type, sessionId: session.id });
      try {
        if (type === "switch") {
          const response = await ideMessenger.request("worktree/switch", {
            sessionId: session.id,
            openInNewWindow: true,
          });
          if (isErrorMessage(response)) {
            throw new Error(response.error ?? "Failed to open worktree");
          }
          ideMessenger.post("showToast", [
            "info",
            `Opened ${session.branchName} in new window`,
          ]);
        } else if (type === "merge") {
          const response = await ideMessenger.request("worktree/merge", {
            sessionId: session.id,
          });
          if (isErrorMessage(response)) {
            throw new Error(response.error ?? "Failed to merge worktree");
          }
          ideMessenger.post("showToast", [
            "info",
            `Merged ${session.branchName}`,
          ]);
        } else if (type === "remove") {
          const response = await ideMessenger.request("worktree/remove", {
            sessionId: session.id,
            force: true,
          });
          if (isErrorMessage(response)) {
            throw new Error(response.error ?? "Failed to remove worktree");
          }
          setSessions((prev) =>
            prev.filter((existing) => existing.id !== session.id),
          );
          ideMessenger.post("showToast", [
            "info",
            `Removed ${session.branchName}`,
          ]);
        }
        await fetchSessions({ silent: true });
      } catch (err) {
        const message = (err as Error).message ?? "Worktree action failed";
        ideMessenger.post("showToast", ["error", message]);
      } finally {
        setActionState(null);
      }
    },
    [fetchSessions, ideMessenger],
  );

  const handleReturnToMain = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const response = await ideMessenger.request("worktree/resetActive", {});
      if (isErrorMessage(response)) {
        throw new Error(response.error ?? "Failed to switch to main workspace");
      }
      ideMessenger.post("showToast", ["info", "Using main workspace"]);
      await fetchSessions({ silent: true });
    } catch (err) {
      const message =
        (err as Error).message ?? "Failed to switch to main workspace";
      ideMessenger.post("showToast", ["error", message]);
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchSessions, ideMessenger]);

  const panelClassName = useMemo(
    () => `border-border bg-input/40 rounded border ${className ?? ""}`.trim(),
    [className],
  );

  const hasActiveSession = useMemo(
    () => sessions.some((session) => session.isActive),
    [sessions],
  );

  const content = useMemo(() => {
    if (error) {
      return <div className="text-error text-sm">{error}</div>;
    }

    if (loading && !hasLoaded) {
      return (
        <div className="text-description flex items-center gap-2 text-sm">
          <ArrowPathIcon className="h-4 w-4 animate-spin" />
          Loading worktrees…
        </div>
      );
    }

    if (sessions.length === 0) {
      return (
        <div className="text-description text-sm">
          No worktrees yet. Enable “Launch in Worktree” above to create one.
        </div>
      );
    }

    return sessions.map((session) => (
      <WorktreeSessionCard
        key={session.id}
        session={session}
        busyAction={actionState}
        onSwitch={(current) => void handleAction("switch", current)}
        onMerge={(current) => void handleAction("merge", current)}
        onRemove={(current) => void handleAction("remove", current)}
      />
    ));
  }, [sessions, loading, hasLoaded, error, actionState, handleAction]);

  return (
    <div className={panelClassName}>
      <div className="flex items-center justify-between px-3 py-2">
        <div>
          <p className="text-description text-2xs uppercase tracking-wide">
            Worktrees
          </p>
          <h3 className="text-foreground text-sm font-semibold">
            Active Sessions
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {hasActiveSession && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleReturnToMain()}
            >
              Main workspace
            </Button>
          )}
          {isRefreshing && (
            <ArrowPathIcon className="text-description h-4 w-4 animate-spin" />
          )}
          <Button
            variant="icon"
            size="sm"
            aria-label="Refresh worktrees"
            onClick={() => fetchSessions()}
          >
            <ArrowPathIcon className="h-3 w-3" />
          </Button>
          <Button
            variant="icon"
            size="sm"
            aria-label={expanded ? "Collapse" : "Expand"}
            onClick={() => setExpanded((value) => !value)}
          >
            <ChevronDownIcon
              className={`h-3.5 w-3.5 transition-transform ${expanded ? "" : "-rotate-90"}`}
            />
          </Button>
        </div>
      </div>
      {expanded && (
        <div className="border-border flex flex-col gap-2 border-t px-3 py-2">
          {content}
        </div>
      )}
    </div>
  );
}

import type { WorktreeDiffSummary } from "core/worktree/types";

interface WorktreeDiffStatsProps {
  stats?: WorktreeDiffSummary;
}

const STALE_THRESHOLD_MS = 20_000;

function isStale(stats?: WorktreeDiffSummary): boolean {
  if (!stats?.lastChecked) {
    return false;
  }
  const timestamp =
    stats.lastChecked instanceof Date
      ? stats.lastChecked.getTime()
      : new Date(stats.lastChecked).getTime();
  return Date.now() - timestamp > STALE_THRESHOLD_MS;
}

export function WorktreeDiffStats({ stats }: WorktreeDiffStatsProps) {
  if (!stats) {
    return <span className="text-description text-2xs">Diff pending…</span>;
  }

  return (
    <div className="text-2xs text-description flex flex-wrap items-center gap-2">
      <span>{stats.filesChanged} files</span>
      <span className="text-success font-semibold">+{stats.linesAdded}</span>
      <span className="text-error font-semibold">-{stats.linesRemoved}</span>
      {isStale(stats) && <span className="text-warning">stale</span>}
    </div>
  );
}

export interface WorktreeLaunchOptions {
  baseBranch?: string;
  description?: string;
}

export interface WorktreeLaunchControl {
  enabled: boolean;
  busy?: boolean;
  options: WorktreeLaunchOptions;
  onEnabledChange: (value: boolean) => void;
  onOptionsChange: (options: Partial<WorktreeLaunchOptions>) => void;
}

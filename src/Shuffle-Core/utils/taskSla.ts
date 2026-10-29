/**
 * Task SLA and SLO attainment helpers. Pure functions so dashboards, task
 * boards and tests share one rule set.
 *
 * Task SLA: each task category has a "complete within" target in minutes,
 * measured from task creation. A task is overdue when it is still open past
 * its target, or was completed later than its target.
 *
 * SLO attainment: share (0-100) of items that met their SLA. Items without a
 * target are ignored. Returns null when nothing can be measured.
 */
import { isSlaBreached, type SlaIncident, type SlaTargets } from './slaBreach';

const MIN = 60_000;

export type TaskSlaTargets = Partial<Record<string, number>> & { general?: number };

export interface SlaTask {
  category?: string;
  completed: boolean;
  createdAt: number;
  completedAt?: number;
  disabled?: boolean;
}

export const taskSlaTargetFor = (category: string | undefined, targets: TaskSlaTargets): number | undefined => {
  const key = (category || '').toLowerCase();
  return (key && targets[key]) || targets.general;
};

/** Milliseconds until the task's target (negative when past). Undefined when no target. */
export const taskSlaRemainingMs = (task: SlaTask, targets: TaskSlaTargets, now = Date.now()): number | undefined => {
  if (!task.createdAt) return undefined;
  const t = taskSlaTargetFor(task.category, targets);
  if (!t) return undefined;
  const end = task.completed && task.completedAt ? task.completedAt : now;
  return task.createdAt + t * MIN - end;
};

export const isTaskOverdue = (task: SlaTask, targets: TaskSlaTargets, now = Date.now()): boolean => {
  if (task.disabled) return false;
  const r = taskSlaRemainingMs(task, targets, now);
  return r !== undefined && r < 0;
};

export const taskSloAttainment = (tasks: SlaTask[], targets: TaskSlaTargets, now = Date.now()): number | null => {
  let measured = 0;
  let met = 0;
  for (const t of tasks) {
    if (t.disabled || taskSlaRemainingMs(t, targets, now) === undefined) continue;
    measured++;
    if (!isTaskOverdue(t, targets, now)) met++;
  }
  return measured === 0 ? null : (met / measured) * 100;
};

export const incidentSloAttainment = (incidents: SlaIncident[], targets: SlaTargets, now = Date.now()): number | null => {
  let measured = 0;
  let met = 0;
  for (const inc of incidents) {
    if (!inc.createdTs) continue;
    measured++;
    if (!isSlaBreached(inc, targets, now)) met++;
  }
  return measured === 0 ? null : (met / measured) * 100;
};

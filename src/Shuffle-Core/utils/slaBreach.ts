/**
 * SLA breach check shared by dashboards and sample data.
 *
 * Targets are per severity in minutes. Severities without a target use the
 * `fallback` row. An incident breaches when its first response or its
 * resolution took longer than the target, or when it is still waiting for
 * either one past the target.
 */
export interface SlaTargetMinutes {
  respondMinutes: number;
  resolveMinutes: number;
}
export type SlaTargets = Partial<Record<string, SlaTargetMinutes>> & { fallback?: SlaTargetMinutes };

export interface SlaIncident {
  status: string;
  severity: string;
  createdTs: number;
  respondedTs?: number;
  resolvedTs?: number;
}

const MIN = 60_000;

export const isResolvedStatus = (status: string) => {
  const s = (status || '').toLowerCase();
  return s === 'resolved' || s === 'closed';
};

export const slaTargetFor = (severity: string, targets: SlaTargets): SlaTargetMinutes | undefined =>
  targets[(severity || '').toLowerCase()] || targets.fallback;

export const isSlaBreached = (inc: SlaIncident, targets: SlaTargets, now = Date.now()): boolean => {
  if (!inc.createdTs) return false;
  const t = slaTargetFor(inc.severity, targets);
  if (!t) return false;
  const resolved = isResolvedStatus(inc.status);
  const respondLimit = t.respondMinutes * MIN;
  const resolveLimit = t.resolveMinutes * MIN;
  if (inc.respondedTs) {
    if (inc.respondedTs - inc.createdTs > respondLimit) return true;
  } else if (!resolved && now - inc.createdTs > respondLimit) {
    return true;
  }
  if (inc.resolvedTs) {
    if (inc.resolvedTs - inc.createdTs > resolveLimit) return true;
  } else if (!resolved && now - inc.createdTs > resolveLimit) {
    return true;
  }
  return false;
};

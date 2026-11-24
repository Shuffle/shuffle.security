/**
 * Hook to fetch and cache agent activity for the incidents context.
 *
 * Polling strategy (detail context only):
 *   - Active @AIAgent mention awaiting a reply  → every 5s
 *   - A run is currently in-flight              → every 5s
 *   - Otherwise                                  → every 60s
 * List/non-detail callers do not poll; they rely on a 60s staleTime.
 */

import { useEffect, useMemo } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { searchAgentActivity, AgentRun } from '@/services/agentActivity';
import { getAgentRunsForIncident } from '@/lib/agentParsers';

const AGENT_RUNS_QUERY_KEY = ['agent-activity-incidents'];

// Monotonic per-incident cache of matched agent runs. The search endpoint
// only returns the most recent ~100 executions, so an older matching run
// can scroll off the window between polls — which used to make the "Agent"
// count flap from N back to 0. We keep every run we have ever matched for
// a given incident, keyed by execution_id, and union it with the freshest
// results on every render.
const stickyRuns = new Map<string, Map<string, AgentRun>>();

export interface IncidentRunsWindow {
  /** ISO timestamp; usually the incident's created time (minus a small pad). */
  startTime?: string;
  /** ISO timestamp; usually the last "change" event on the incident (plus a pad).
   *  Omit to search up to "now" (e.g. when a run is still in-flight). */
  endTime?: string;
}

export const useIncidentAgentRuns = (
  incidentKey?: string,
  hasPendingAgentMention = false,
  window: IncidentRunsWindow = {},
  /** Org the incident lives in. Required for sub-org incidents, otherwise the
   *  search runs against the active org and returns nothing. */
  orgId?: string,
) => {
  const isDetailContext = !!incidentKey;
  const { startTime, endTime } = window;

  const { data: allRuns = [], isLoading, error, refetch } = useQuery<AgentRun[]>({
    queryKey: [...AGENT_RUNS_QUERY_KEY, incidentKey || '_global', startTime || '', endTime || '', orgId || 'active'],
    queryFn: async () => {
      const result = await searchAgentActivity({
        limit: isDetailContext ? 100 : 50,
        startTime,
        endTime,
        ...(orgId ? { orgId } : {}),
      });
      return result.success ? result.runs : [];
    },
    staleTime: isDetailContext ? 0 : 60_000,
    refetchInterval: isDetailContext
      ? (query) => {
          if (hasPendingAgentMention) return 5_000;
          // Only this incident's runs decide fast polling; busy runs
          // elsewhere in the org must not keep this page polling every 5s.
          const allData = (query.state.data as AgentRun[] | undefined) || [];
          const runs = incidentKey ? getAgentRunsForIncident(allData, incidentKey) : [];
          const hasInFlight = runs.some((r) => {
            const s = (r.status || '').toUpperCase();
            return s === 'EXECUTING' || s === 'WAITING' || s === 'RUNNING';
          });
          return hasInFlight ? 5_000 : 60_000;
        }
      : false,
    refetchOnWindowFocus: isDetailContext,
    gcTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });

  const freshMatches = useMemo(
    () => (incidentKey ? getAgentRunsForIncident(allRuns, incidentKey) : []),
    [allRuns, incidentKey],
  );

  // Fold fresh matches into the sticky cache so a run we have already
  // associated with this incident never disappears from the count just
  // because it aged out of the recent-100 search window.
  const runsForIncident = useMemo(() => {
    if (!incidentKey) return [] as AgentRun[];
    let bucket = stickyRuns.get(incidentKey);
    if (!bucket) {
      bucket = new Map();
      stickyRuns.set(incidentKey, bucket);
    }
    for (const run of freshMatches) {
      const id = (run as any)?.execution_id;
      if (id) bucket.set(String(id), run);
    }
    // Return newest first (by started_at when present, else insertion order).
    return Array.from(bucket.values()).sort((a: any, b: any) => {
      const ta = Date.parse(a?.started_at || '') || 0;
      const tb = Date.parse(b?.started_at || '') || 0;
      return tb - ta;
    });
  }, [incidentKey, freshMatches]);

  // Never let the sticky cache grow unbounded — cap each incident at 200.
  useEffect(() => {
    if (!incidentKey) return;
    const bucket = stickyRuns.get(incidentKey);
    if (bucket && bucket.size > 200) {
      const excess = bucket.size - 200;
      const keys = Array.from(bucket.keys()).slice(0, excess);
      keys.forEach((k) => bucket!.delete(k));
    }
  }, [incidentKey, runsForIncident.length]);

  return {
    allRuns,
    runsForIncident,
    isLoading,
    error,
    refetch,
  };
};


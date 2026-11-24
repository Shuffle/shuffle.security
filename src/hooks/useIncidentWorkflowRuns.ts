/**
 * Hook to fetch workflow executions related to a specific incident.
 *
 * Uses the same `POST /api/v1/workflows/search` endpoint as agent activity
 * but with an empty workflow_id so results span every workflow the caller
 * can see. Results are then filtered client-side to those that mention the
 * incident id in any of their argument / result text fields.
 *
 * This is the counterpart to `useIncidentAgentRuns` — where that hook is
 * scoped to AI Agent runs, this one surfaces every OTHER workflow execution
 * that touched the incident (datastore triggers, enrichment workflows,
 * indicator-check runs, forward-to-tool runs, etc.).
 */

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { searchAgentActivity, AgentRun } from '@/services/agentActivity';
import { collectRunText, parseDatastoreReference, isIncidentReference } from '@/lib/agentParsers';

const runMatchesIncident = (run: AgentRun, incidentKey?: string): boolean => {
  if (!incidentKey) return false;
  const ref = parseDatastoreReference(run);
  if (ref && isIncidentReference(ref) && ref.key === incidentKey) return true;
  const haystack = collectRunText(run).toLowerCase();
  return !!haystack && haystack.includes(incidentKey.toLowerCase());
};

const WORKFLOW_RUNS_QUERY_KEY = ['workflow-activity-incidents'];

export interface IncidentRunsWindow {
  startTime?: string;
  endTime?: string;
}

export const useIncidentWorkflowRuns = (
  incidentKey?: string,
  hasInFlight = false,
  window: IncidentRunsWindow = {},
  /** Org the incident lives in. Required for sub-org incidents, otherwise the
   *  search runs against the active org and returns nothing. */
  orgId?: string,
) => {
  const isDetailContext = !!incidentKey;
  const { startTime, endTime } = window;

  const { data: allRuns = [], isLoading, error, refetch } = useQuery<AgentRun[]>({
    queryKey: [...WORKFLOW_RUNS_QUERY_KEY, incidentKey || '_global', startTime || '', endTime || '', orgId || 'active'],
    queryFn: async () => {
      // Empty workflow_id → search across every workflow the user can see.
      const result = await searchAgentActivity({
        workflowId: '',
        limit: 100,
        startTime,
        endTime,
        ...(orgId ? { orgId } : {}),
      });
      return result.success ? result.runs : [];
    },
    staleTime: isDetailContext ? 0 : 60_000,
    refetchInterval: isDetailContext
      ? (query) => {
          if (hasInFlight) return 5_000;
          // Only this incident's runs decide fast polling.
          const runs = ((query.state.data as AgentRun[] | undefined) || []).filter((run) =>
            runMatchesIncident(run, incidentKey),
          );
          const anyRunning = runs.some((r) => {
            const s = (r.status || '').toUpperCase();
            return s === 'EXECUTING' || s === 'WAITING' || s === 'RUNNING';
          });
          return anyRunning ? 10_000 : 60_000;
        }
      : false,
    refetchOnWindowFocus: isDetailContext,
    gcTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });

  const runsForIncident = allRuns.filter((run) => runMatchesIncident(run, incidentKey));

  return { allRuns, runsForIncident, isLoading, error, refetch };
};

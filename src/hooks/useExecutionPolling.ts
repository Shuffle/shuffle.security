/**
 * useExecutionPolling
 *
 * Polls /api/v1/streams/results for a given execution_id while the run is
 * still in-progress (EXECUTING / WAITING). Returns a "live" version of the
 * AgentRun that swaps in fresh server data only when something actually
 * changed — so the view does not flicker / re-render on every poll tick.
 */

import { useEffect, useRef, useState } from 'react';
import { getApiUrl, getAuthHeader } from '@/Shuffle-Core/api';
import type { AgentRun } from '@/services/agentActivity';

const IN_PROGRESS_STATUSES = new Set(['EXECUTING', 'WAITING']);

const isInProgress = (status?: string) =>
  IN_PROGRESS_STATUSES.has((status || '').toUpperCase());

interface Options {
  /** Polling interval in ms. Defaults to 3000. */
  intervalMs?: number;
  /** When false, polling is paused (e.g. drawer closed). Defaults to true. */
  enabled?: boolean;
}

/**
 * Returns the latest known version of `run`. Internally polls the streams API
 * while the run is in-progress. The returned object reference is preserved
 * unless the underlying data has materially changed (status, decisions length,
 * results length, completed_at) — preventing unnecessary re-renders.
 */
export const useExecutionPolling = (
  run: AgentRun | null | undefined,
  { intervalMs = 3000, enabled = true }: Options = {}
): AgentRun | null | undefined => {
  const [liveRun, setLiveRun] = useState<AgentRun | null | undefined>(run);
  const liveRef = useRef<AgentRun | null | undefined>(run);

  // Sync when the parent swaps to a different run (different execution_id).
  useEffect(() => {
    if (!run) {
      setLiveRun(run);
      liveRef.current = run;
      return;
    }
    if (!liveRef.current || liveRef.current.execution_id !== run.execution_id) {
      setLiveRun(run);
      liveRef.current = run;
    }
  }, [run?.execution_id, run]);

  useEffect(() => {
    if (!enabled || !run?.execution_id) return;
    if (!isInProgress(liveRef.current?.status || run.status)) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const resp = await fetch(getApiUrl('/api/v1/streams/results'), {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader(),
          },
          body: JSON.stringify({
            execution_id: run.execution_id,
            authorization: run.execution_id,
          }),
        });

        if (cancelled) return;

        if (resp.ok) {
          const text = await resp.text();
          if (text && text !== '{}' && text !== 'null') {
            try {
              const data = JSON.parse(text) as Partial<AgentRun> & Record<string, unknown>;
              const prev = liveRef.current;
              const merged: AgentRun = {
                ...(prev || ({} as AgentRun)),
                ...(data as AgentRun),
                execution_id: run.execution_id,
              };

              // Only update if something materially changed — avoids re-renders.
              const changed =
                !prev ||
                prev.status !== merged.status ||
                prev.completed_at !== merged.completed_at ||
                (prev.results?.length || 0) !== (merged.results?.length || 0) ||
                (prev.decisions?.length || 0) !== (merged.decisions?.length || 0) ||
                prev.result !== merged.result;

              if (changed) {
                liveRef.current = merged;
                setLiveRun(merged);
              }
            } catch {
              /* malformed response — ignore */
            }
          }
        }
      } catch {
        /* network error — keep polling */
      }

      if (cancelled) return;
      if (!isInProgress(liveRef.current?.status)) return;
      timer = setTimeout(poll, intervalMs);
    };

    timer = setTimeout(poll, intervalMs);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [run?.execution_id, enabled, intervalMs, liveRun?.status]);

  return liveRun;
};

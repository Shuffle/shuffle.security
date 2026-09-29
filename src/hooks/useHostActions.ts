import { useCallback, useRef, useState } from 'react';
import { toast } from '@/lib/toast';
import { getApiUrl, getAuthHeader } from '@/Shuffle-Core/api';
import { terminalStorageKey, readStoredSession } from '@/utils/terminalStorageKey';

// localStorage caps — must mirror the per-entry truncation so a single huge
// screenshot can't blow out quota and lose the rest of the session.
const MAX_OUTPUT_CHARS = 20000;
const MAX_ERROR_CHARS = 2000;
const IMAGE_PREFIXES = ['iVBORw0KGgo', '/9j/', 'R0lGOD', 'UklGR'];
const looksLikeBase64Image = (s: string | undefined): boolean => {
  if (!s) return false;
  const trimmed = s.trim();
  const head = trimmed.slice(0, 16);
  if (IMAGE_PREFIXES.some(p => head.startsWith(p))) return true;
  if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && /"(?:image|image_base64|imageBase64|screenshot|screenshot_base64|png|jpeg|jpg|b64|base64|data)"\s*:\s*"(?:data:image\/[a-z+.-]+;base64,)?(?:iVBORw0KGgo|\/9j\/|R0lGOD|UklGR)/i.test(trimmed)) return true;
  return false;
};
const TRUNCATION_MARKER = '…[truncated ';
export const isOutputTruncated = (s: string | undefined): boolean => !!s && s.includes(TRUNCATION_MARKER);
const truncate = (s: string | undefined, n: number): string | undefined => {
  if (!s) return s;
  if (looksLikeBase64Image(s)) return s; // never split a base64 image
  return s.length > n ? s.slice(0, n) + `\n…[truncated ${s.length - n} chars]` : s;
};

/**
 * Shared hook for executing response actions on a sensor host.
 *
 * Owns:
 *  - per-host action history (with localStorage persistence)
 *  - per-host abort + polling state
 *  - the irreversible `script:disable_rce` confirm gate
 *  - the run + 30 min poll loop against /api/v1/apps/sensors/run
 *
 * Used by both the host list view (VulnAssetsPage) and the standalone
 * /monitors/:id page (MonitorDetailPage) so they stay perfectly in sync.
 */

export type ActionDebugEntry = {
  entryId: string;
  hostUuid: string;
  actionName: string;
  /**
   * The exact command string sent to the backend (e.g. `script:screenshot frikky`
   * or `remote_control {"actions":[…]}`). Used to repopulate the input when
   * the user presses ArrowUp in the terminal — `actionName` is only the
   * display label and would otherwise lose the parameters.
   */
  commandText?: string;
  hostname: string;
  status: 'sending' | 'polling' | 'success' | 'error';
  requestBody: object;
  responseStatus?: number;
  responseBody?: string;
  startedAt: number;
  finishedAt?: number;
  error?: string;
  executionId?: string;
  authorization?: string;
  /** Parsed output from results[0].result.output */
  actionOutput?: string;
  /** Whether the action result reported success */
  actionSuccess?: boolean;
};

export type PendingDisableRce = {
  actionId: string;
  actionName: string;
  hostname: string;
  groupName: string;
  hostUuid: string;
  isPredefined: boolean;
};

const parseActionResult = (data: unknown): { success: boolean; output: string | null; error: string | null } => {
  try {
    if (!data || typeof data !== 'object') return { success: true, output: null, error: null };
    const obj = data as Record<string, unknown>;
    const results = obj.results as Array<{ result?: string }> | undefined;
    const firstResult = results?.[0]?.result;
    if (!firstResult || typeof firstResult !== 'string') return { success: true, output: null, error: null };
    const parsed = JSON.parse(firstResult);
    return {
      success: parsed.success !== false,
      output: typeof parsed.output === 'string' ? parsed.output : null,
      error: typeof parsed.error === 'string' ? parsed.error : null,
    };
  } catch {
    return { success: true, output: null, error: null };
  }
};

/**
 * Newer remote control runners return the full output directly in a top-level
 * `result` field instead of an execution stub. Returns null when the response
 * does not carry a usable direct result (→ fall back to execution polling).
 */
const parseDirectRunResult = (
  data: unknown,
): { success: boolean; output: string | null; error: string | null } | null => {
  if (!data || typeof data !== 'object') return null;
  const raw = (data as Record<string, unknown>).result;
  if (raw === undefined || raw === null || raw === '') return null;

  let inner: unknown = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try { inner = JSON.parse(trimmed); } catch { return { success: true, output: trimmed, error: null }; }
  }
  if (!inner || typeof inner !== 'object') {
    return { success: true, output: String(inner), error: null };
  }
  const o = inner as Record<string, unknown>;
  const output =
    typeof o.output === 'string' ? o.output :
    typeof o.result === 'string' ? o.result :
    JSON.stringify(inner, null, 2);
  return {
    success: o.success !== false,
    output,
    error: typeof o.error === 'string' ? o.error : null,
  };
};

interface UseHostActionsOptions {
  /** Optional callback fired after each action completes — typically refetches the host list. */
  onActionComplete?: () => void;
}

export const useHostActions = ({ onActionComplete }: UseHostActionsOptions = {}) => {
  const [actionHistoryMap, setActionHistoryMap] = useState<Map<string, ActionDebugEntry[]>>(new Map());
  const [actionExecuting, setActionExecuting] = useState<Set<string>>(new Set());
  const [pendingDisableRce, setPendingDisableRce] = useState<PendingDisableRce | null>(null);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const pollingActiveRef = useRef<Map<string, boolean>>(new Map());

  /** Hydrate actionHistoryMap from localStorage for a single host (called lazily on popover open) */
  const hydrateHost = useCallback((hostUuid: string) => {
    setActionHistoryMap(prev => {
      if ((prev.get(hostUuid) || []).length > 0) return prev;
      try {
        const stored = readStoredSession(hostUuid);
        if (Array.isArray(stored) && stored.length > 0) {
          const next = new Map(prev);
          next.set(hostUuid, stored.map((e: any, i: number) => ({
            entryId: e.entryId || `${e.startedAt || i}-${Math.random().toString(36).slice(2, 8)}`,
            actionName: e.actionName || '',
            commandText: e.commandText,
            status: e.status || 'error',
            startedAt: e.startedAt || 0,
            finishedAt: e.finishedAt,
            executionId: e.executionId,
            authorization: e.authorization,
            actionOutput: e.actionOutput,
            error: e.error,
            hostUuid,
            hostname: '',
            requestBody: {},
          } as ActionDebugEntry)));
          return next;
        }
      } catch { /* ignore */ }
      return prev;
    });
  }, []);

  const getCommandHistory = useCallback((hostUuid: string): string[] => {
    try {
      const stored = readStoredSession(hostUuid);
      if (!Array.isArray(stored) || stored.length === 0) {
        const old = JSON.parse(localStorage.getItem(`cmd_history_${hostUuid}`) || '[]');
        if (Array.isArray(old) && old.length > 0) return old;
        return [];
      }
      const cmds: string[] = [];
      for (let i = stored.length - 1; i >= 0; i--) {
        // Prefer the exact command text — falls back to actionName for legacy
        // entries persisted before commandText was introduced.
        const cmd = stored[i]?.commandText || stored[i]?.actionName;
        if (cmd) cmds.push(cmd);
      }
      return cmds;
    } catch { return []; }
  }, []);

  const getLatestDebug = useCallback((hostUuid: string): ActionDebugEntry | undefined => {
    const history = actionHistoryMap.get(hostUuid);
    return history?.[history.length - 1];
  }, [actionHistoryMap]);

  const pushHostDebug = useCallback((hostUuid: string, entry: ActionDebugEntry) => {
    setActionHistoryMap(prev => {
      const next = new Map(prev);
      const existing = next.get(hostUuid) || [];
      next.set(hostUuid, [...existing, entry]);
      return next;
    });
    try {
      const key = terminalStorageKey(hostUuid);
      const stored = readStoredSession(hostUuid);
      const persistEntry = {
        entryId: entry.entryId,
        actionName: entry.actionName,
        commandText: entry.commandText,
        status: entry.status,
        startedAt: entry.startedAt,
        finishedAt: entry.finishedAt,
        executionId: entry.executionId,
        authorization: entry.authorization,
      };
      const dupIdx = stored.findIndex((e: any) => e?.entryId && e.entryId === entry.entryId);
      if (dupIdx >= 0) stored[dupIdx] = { ...stored[dupIdx], ...persistEntry }; else stored.push(persistEntry);
      if (stored.length > 200) stored.splice(0, stored.length - 200);
      localStorage.setItem(key, JSON.stringify(stored));
    } catch { /* ignore */ }
  }, []);

  const updateHostDebug = useCallback((hostUuid: string, targetEntryId: string, update: Partial<ActionDebugEntry>) => {
    setActionHistoryMap(prev => {
      const history = prev.get(hostUuid);
      if (!history || history.length === 0) return prev;
      const idx = history.findIndex(e => e.entryId === targetEntryId);
      if (idx < 0) return prev;
      const next = new Map(prev);
      const latest = { ...history[idx], ...update };
      const updated = [...history];
      updated[idx] = latest;
      next.set(hostUuid, updated);

      if (latest.status === 'success' || latest.status === 'error') {
        try {
          const key = terminalStorageKey(hostUuid);
          const stored = readStoredSession(hostUuid);
          const persistShape = {
            entryId: latest.entryId,
            actionName: latest.actionName,
            commandText: latest.commandText,
            status: latest.status,
            startedAt: latest.startedAt,
            finishedAt: latest.finishedAt,
            executionId: latest.executionId,
            authorization: latest.authorization,
            actionOutput: truncate(latest.actionOutput, MAX_OUTPUT_CHARS),
            error: truncate(latest.error, MAX_ERROR_CHARS),
          };
          const sIdx = stored.findIndex((e: any) => e.entryId === latest.entryId);
          if (sIdx >= 0) {
            stored[sIdx] = { ...stored[sIdx], ...persistShape };
          } else {
            stored.push(persistShape);
            if (stored.length > 200) stored.splice(0, stored.length - 200);
          }
          try {
            localStorage.setItem(key, JSON.stringify(stored));
          } catch {
            // Quota — progressively shrink and retry.
            for (const limit of [50, 25, 10, 5, 1]) {
              try {
                const shrunk = stored.slice(-limit).map((e: any) => ({
                  ...e,
                  actionOutput: truncate(e.actionOutput, 2000),
                  error: truncate(e.error, 500),
                }));
                localStorage.setItem(key, JSON.stringify(shrunk));
                break;
              } catch { /* keep shrinking */ }
            }
          }
        } catch { /* ignore */ }
      }
      return next;
    });
  }, []);

  // Loading state for sideload (re-fetch full result for a stored entry).
  const [loadingEntries, setLoadingEntries] = useState<Set<string>>(new Set());

  const removeHistoryEntry = useCallback((hostUuid: string, entryId: string) => {
    setActionHistoryMap(prev => {
      const history = prev.get(hostUuid);
      if (!history) return prev;
      const next = new Map(prev);
      next.set(hostUuid, history.filter(e => e.entryId !== entryId));
      return next;
    });
    try {
      const key = terminalStorageKey(hostUuid);
      const stored = readStoredSession(hostUuid).filter((e: any) => e?.entryId !== entryId);
      localStorage.setItem(key, JSON.stringify(stored));
    } catch { /* ignore */ }
  }, []);

  const fetchEntryResult = useCallback(async (hostUuid: string, entry: ActionDebugEntry) => {
    if (!entry.executionId || !entry.authorization) return;
    setLoadingEntries(prev => { const n = new Set(prev); n.add(entry.entryId); return n; });
    try {
      const resp = await fetch(getApiUrl('/api/v1/streams/results'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ execution_id: entry.executionId, authorization: entry.authorization }),
      });
      if (!resp.ok) return;
      const text = await resp.text();
      if (!text || text === '{}' || text === 'null') return;
      let pollData: unknown = null;
      try { pollData = JSON.parse(text); } catch { /* not JSON */ }
      const result = parseActionResult(pollData);
      updateHostDebug(hostUuid, entry.entryId, {
        actionOutput: result.output || undefined,
        error: result.error || undefined,
        actionSuccess: result.success,
      });
    } catch { /* ignore */ } finally {
      setLoadingEntries(prev => { const n = new Set(prev); n.delete(entry.entryId); return n; });
    }
  }, [updateHostDebug]);


  const executeHostAction = useCallback(async (
    actionId: string,
    actionName: string,
    hostname: string,
    groupName: string,
    hostUuid: string,
    isPredefined = false,
    skipConfirm = false,
  ) => {
    const normalized = (isPredefined ? `script:${actionId}` : actionId).trim().toLowerCase();
    if (!skipConfirm && normalized === 'script:disable_rce') {
      setPendingDisableRce({ actionId, actionName, hostname, groupName, hostUuid, isPredefined });
      return;
    }

    const controller = new AbortController();
    abortControllersRef.current.set(hostUuid, controller);
    pollingActiveRef.current.set(hostUuid, true);

    setActionExecuting(prev => new Set(prev).add(hostUuid));
    const requestBody = {
      app_id: 'sensors',
      app_name: 'sensors',
      name: 'run_action',
      parameters: [
        { name: 'action', value: isPredefined ? `script:${actionId}` : actionId },
        { name: 'hosts', value: hostname },
        { name: 'sensor_group', value: groupName },
      ],
    };
    const entryId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    pushHostDebug(hostUuid, {
      entryId,
      hostUuid,
      actionName,
      commandText: isPredefined ? `script:${actionId}` : actionId,
      hostname,
      status: 'sending',
      requestBody,
      startedAt: Date.now(),
    });

    try {
      const resp = await fetch(getApiUrl('/api/v1/apps/sensors/run'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      const text = await resp.text().catch(() => '');
      if (!resp.ok) {
        updateHostDebug(hostUuid, entryId, { status: 'error', responseStatus: resp.status, responseBody: text, finishedAt: Date.now(), error: text || `HTTP ${resp.status}` });
        toast.error('Action failed', { description: text || `HTTP ${resp.status}` });
        return;
      }

      let parsed: unknown = null;
      try { parsed = JSON.parse(text); } catch { /* not JSON */ }

      // 1) Preferred: the runner returned the full result directly.
      const direct = parseDirectRunResult(parsed);
      if (direct) {
        updateHostDebug(hostUuid, entryId, {
          status: direct.success ? 'success' : 'error',
          responseStatus: resp.status,
          responseBody: text,
          executionId: (parsed as any)?.execution_id as string | undefined,
          authorization: (parsed as any)?.authorization as string | undefined,
          finishedAt: Date.now(),
          actionOutput: direct.output || undefined,
          actionSuccess: direct.success,
          error: direct.success ? undefined : (direct.error || direct.output || 'Action reported failure'),
        });
        return;
      }

      // 2) Fallback: execution stub → poll /api/v1/streams/results.
      if (
        parsed && typeof parsed === 'object' && parsed !== null &&
        typeof (parsed as Record<string, unknown>).execution_id === 'string' &&
        (parsed as Record<string, unknown>).execution_id
      ) {
        const execId = (parsed as Record<string, unknown>).execution_id as string;
        updateHostDebug(hostUuid, entryId, { status: 'polling', responseStatus: resp.status, responseBody: text, executionId: execId, authorization: ((parsed as any).authorization as string) || execId });

        const maxAttempts = 900; // 30 minutes
        const intervalMs = 2000;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          if (!pollingActiveRef.current.get(hostUuid)) return;
          await new Promise<void>(resolve => {
            const timer = setTimeout(resolve, intervalMs);
            controller.signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
          });
          if (!pollingActiveRef.current.get(hostUuid)) return;
          try {
            const pollResp = await fetch(getApiUrl('/api/v1/streams/results'), {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
              body: JSON.stringify({ execution_id: execId, authorization: execId }),
              signal: controller.signal,
            });
            if (!pollResp.ok) {
              if (pollResp.status >= 400 && pollResp.status < 500) {
                updateHostDebug(hostUuid, entryId, { status: 'error', responseBody: `Poll error ${pollResp.status}`, finishedAt: Date.now(), error: `HTTP ${pollResp.status}` });
                toast.error('Action failed', { description: `Poll error ${pollResp.status}` });
                return;
              }
              continue;
            }
            const pollText = await pollResp.text();
            if (!pollText || pollText === '{}' || pollText === 'null') continue;

            let pollData: unknown = null;
            try { pollData = JSON.parse(pollText); } catch { /* not JSON */ }

            if (pollData && typeof pollData === 'object') {
              const st = (pollData as Record<string, unknown>).status;
              if (st === 'EXECUTING' || st === 'WAITING') continue;
            }

            const result = parseActionResult(pollData);
            updateHostDebug(hostUuid, entryId, {
              status: result.success ? 'success' : 'error',
              responseBody: pollText,
              finishedAt: Date.now(),
              actionOutput: result.output || undefined,
              actionSuccess: result.success,
              error: result.success ? undefined : (result.error || result.output || 'Action reported failure'),
            });
            // Result + error are already surfaced in the action output panel — no toast needed.
            return;
          } catch {
            if (!pollingActiveRef.current.get(hostUuid)) return;
            continue;
          }
        }
        if (pollingActiveRef.current.get(hostUuid)) {
          updateHostDebug(hostUuid, entryId, { status: 'error', finishedAt: Date.now(), error: 'Timed out waiting for execution result (30 min).' });
          toast.error('Action timed out', { description: 'No result after 30 minutes.' });
        }
      } else {
        updateHostDebug(hostUuid, entryId, { status: 'success', responseStatus: resp.status, responseBody: text, finishedAt: Date.now() });
      }
    } catch (err) {
      if (!pollingActiveRef.current.get(hostUuid)) return;
      const msg = err instanceof Error ? err.message : 'Request error';
      updateHostDebug(hostUuid, entryId, { status: 'error', finishedAt: Date.now(), error: msg });
      toast.error('Action failed', { description: msg });
    } finally {
      pollingActiveRef.current.delete(hostUuid);
      abortControllersRef.current.delete(hostUuid);
      setActionExecuting(prev => { const next = new Set(prev); next.delete(hostUuid); return next; });
      onActionComplete?.();
    }
  }, [pushHostDebug, updateHostDebug, onActionComplete]);

  const abortHostAction = useCallback((hostUuid: string) => {
    pollingActiveRef.current.set(hostUuid, false);
    const controller = abortControllersRef.current.get(hostUuid);
    if (controller) controller.abort();
    abortControllersRef.current.delete(hostUuid);

    const debugEntry = getLatestDebug(hostUuid);
    if (debugEntry?.executionId) {
      fetch(getApiUrl(`/api/v1/workflows/${debugEntry.executionId}/executions/${debugEntry.executionId}/abort`), {
        method: 'GET',
        credentials: 'include',
        headers: { ...getAuthHeader() },
      }).catch(() => { /* best effort */ });
    }
    if (debugEntry?.entryId) {
      updateHostDebug(hostUuid, debugEntry.entryId, { status: 'error', finishedAt: Date.now(), error: 'Aborted by user' });
    }
  }, [getLatestDebug, updateHostDebug]);

  const confirmDisableRce = useCallback(() => {
    const p = pendingDisableRce;
    setPendingDisableRce(null);
    if (p) executeHostAction(p.actionId, p.actionName, p.hostname, p.groupName, p.hostUuid, p.isPredefined, true);
  }, [pendingDisableRce, executeHostAction]);

  return {
    actionHistoryMap,
    actionExecuting,
    loadingEntries,
    pendingDisableRce,
    setPendingDisableRce,
    confirmDisableRce,
    executeHostAction,
    abortHostAction,
    hydrateHost,
    getCommandHistory,
    removeHistoryEntry,
    fetchEntryResult,
  };
};

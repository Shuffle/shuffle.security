/**
 * Shared host monitor table — the EXACT row UI used on /monitors and /assets.
 * Owns all internal state (sorting, expansion, action execution, history,
 * terminal popover, custom action input) so callers just pass `hosts` and
 * an optional `onRefresh` callback.
 *
 * Both /monitors (VulnAssetsPage) and /assets (AssetsPage) render this so
 * any future column / dot / action work happens in one place.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from '@/lib/router-compat';
import {
  ChevronRight, HardDrive, Lock, Package, FileCode, Zap, Activity, Laptop,
  Play, Loader2, Maximize2, Terminal, CheckCircle2, ShieldX, Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/lib/toast';
import { getApiUrl, getAuthHeader } from '@/Shuffle-MCPs/api';
import { HostDetailPanel } from './HostDetailPanel';
import { HostActionChips, getActiveUser as sharedGetActiveUser, inferAgentPrivilege } from './hostActionDefinitions';
import { DEMO_HOST_HOSTNAME } from '@/services/demoLiveEnvironment';
import { terminalStorageKey, readStoredSession, registerHostIdentity } from '@/utils/terminalStorageKey';
import { hostUrlSegment } from '@/utils/hostUrlSegment';
import { ActionOutputView } from './ActionOutputView';
import { HostNameDisplay } from '@/components/monitors/HostNameDisplay';
import { AddHostDialog, MonitoringGroupLike } from './AddHostDialog';
import { fetchHostSupplements, mergeHosts } from '@/lib/mergeMonitorHosts';


// ── Helpers (identical to the originals on VulnAssetsPage) ─────────────────
const TABLE_GRID_TEMPLATE = '2rem minmax(130px, 1.3fr) 3.5rem 3.5rem 4.5rem 4rem 4rem 5rem minmax(70px, 0.7fr) minmax(110px, 0.9fr) 68px';

const OsIcon = ({
  os,
  platform,
  kernel,
  hostname,
  size = 14,
  className = '',
}: {
  os?: string;
  platform?: string;
  kernel?: string;
  hostname?: string;
  size?: number;
  className?: string;
}) => {
  const text = `${os || ''} ${platform || ''} ${kernel || ''} ${hostname || ''}`.toLowerCase();
  if (text.includes('darwin') || text.includes('mac') || text.includes('ios') || text.includes('apple') || text.includes('osx')) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} className={className} fill="currentColor">
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
      </svg>
    );
  }
  if (text.includes('windows') || text.includes('win') || text.includes('microsoft')) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} className={className} fill="currentColor">
        <path d="M3 12V6.5l8-1.1V12H3zm10 0V5.2l8-1.2V12h-8zM3 13h8v6.7l-8-1.1V13zm10 0h8v6.9l-8 1.2V13z"/>
      </svg>
    );
  }
  if (text.includes('linux') || text.includes('ubuntu') || text.includes('debian') || text.includes('centos') || text.includes('redhat') || text.includes('fedora') || text.includes('arch') || text.includes('alpine')) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} className={className} fill="currentColor" aria-label="Linux">
        <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.077 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.132 1.884 1.071.771-.06 1.592-.536 2.257-1.306.631-.765 1.683-1.084 2.378-1.503.348-.199.629-.469.649-.853.023-.4-.2-.811-.714-1.376v-.097l-.003-.003c-.17-.2-.25-.535-.338-.926-.085-.401-.182-.786-.492-1.046h-.003c-.059-.054-.123-.067-.188-.135a.357.357 0 00-.19-.064c.431-1.278.264-2.55-.173-3.694-.533-1.41-1.465-2.638-2.175-3.483-.796-1.005-1.576-1.957-1.56-3.368.026-2.152.236-6.133-3.544-6.139zm.484 14.35c.296 0 .523.043.682.13.158.085.226.214.205.387l-.022.135-.13.612c-.097.456-.222.823-.376 1.103a1.31 1.31 0 01-.602.59c-.247.118-.566.176-.957.176s-.71-.058-.957-.176a1.31 1.31 0 01-.602-.59c-.154-.28-.28-.647-.376-1.103l-.13-.612-.022-.135c-.02-.173.047-.302.205-.387.16-.087.387-.13.682-.13zm-2.31-7.45c.27 0 .493.092.67.276.176.184.265.41.265.677 0 .268-.089.494-.265.678a.886.886 0 01-.67.276.886.886 0 01-.67-.276.945.945 0 01-.265-.678c0-.267.089-.493.265-.677a.886.886 0 01.67-.276zm4.62 0c.267 0 .493.092.67.276.176.184.264.41.264.677 0 .268-.088.494-.264.678a.886.886 0 01-.67.276.886.886 0 01-.67-.276.945.945 0 01-.266-.678c0-.267.09-.493.266-.677a.886.886 0 01.67-.276z"/>
      </svg>
    );
  }
  return <Laptop size={size} className={className} />;
};

const fmtRaw = (value: unknown): string => {
  if (value === undefined) return '(field not set)';
  if (value === null) return 'null';
  if (value === '') return '"" (empty string)';
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch { return String(value); }
};

const parseResponseActionsState = (value: unknown): { enabled: boolean; mode: 'full' | 'controlled' | null } => {
  const raw = String(value ?? '').toLowerCase().trim();
  const enabled = value !== undefined && value !== null && raw !== '' && raw !== 'false' && raw !== '0' && raw !== 'no' && raw !== 'off';
  return { enabled, mode: enabled ? (raw.includes('full') ? 'full' : 'controlled') : null };
};

const countActiveProcesses = (host: MonitorHost): number => {
  const v = (host as { process_list?: unknown }).process_list;
  return Array.isArray(v) ? v.length : 0;
};

// Active-user detection now lives in ./hostActionDefinitions so every host
// action surface (popover, detail page, full terminal) computes the same
// "current user" for the Screenshot chip.
const getActiveUser = (host: MonitorHost): string | null => sharedGetActiveUser(host);

const triState = (v: unknown): 'on' | 'off' | 'empty' => {
  if (v === true || v === 'true' || v === 'TRUE') return 'on';
  if (v === false || v === 'false' || v === 'FALSE' || v === '0' || v === 0 || v === 'no' || v === 'off') return 'off';
  return 'empty';
};

// ── Types ───────────────────────────────────────────────────────────────────
export interface MonitorHost {
  uuid: string;
  hostname: string;
  os?: string;
  arch?: string;
  serial?: string;
  checkin?: number;
  hd_encrypted?: boolean | string;
  automatic_screen_lock_enabled?: boolean | string;
  installed_software?: unknown[];
  code_scanner?: unknown[];
  response_actions?: boolean | string;
  log_forwarding?: string;
  groupName?: string;
  [key: string]: unknown;
}

type ActionDebugEntry = {
  entryId: string;
  hostUuid: string;
  actionName: string;
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
  actionOutput?: string;
  actionSuccess?: boolean;
};

export interface MonitorHostTableProps {
  hosts: MonitorHost[];
  /** Called after a successful action to let the parent reload data. */
  onRefresh?: () => void;
  /** If true, renders the Add Host button in the header bar and empty state. Defaults to true. */
  showAddHost?: boolean;
  /** Optional monitoring group information for binding new host deployments directly to this group. */
  group?: MonitoringGroupLike;
  /** Custom title for the card header. Defaults to 'Host Monitors' (or group name if specific). */
  title?: string;
  /** Custom subtitle for the card header. Defaults to 'Deploy lightweight monitors on endpoints to check compliance & posture'. */
  subtitle?: string;
  /** If true, hides the top card header bar (used in nested contexts like AssetsPage). Defaults to false. */
  hideHeader?: boolean;
  /** Optional organization ID for datastore posture queries. Falls back to localStorage userinfo/shuffle_user_info. */
  orgId?: string;
}

// ── Component ──────────────────────────────────────────────────────────────
export const MonitorHostTable = ({
  hosts,
  onRefresh,
  showAddHost = true,
  group,
  title,
  subtitle,
  hideHeader = false,
  orgId,
}: MonitorHostTableProps) => {
  const navigate = useNavigate();
  const [expandedHosts, setExpandedHosts] = useState<Set<string>>(new Set());
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [actionExecuting, setActionExecuting] = useState<Set<string>>(new Set());
  const [actionHistoryMap, setActionHistoryMap] = useState<Map<string, ActionDebugEntry[]>>(new Map());
  const [pendingDisableRce, setPendingDisableRce] = useState<null | { actionId: string; actionName: string; hostname: string; groupName: string; hostUuid: string; isPredefined: boolean }>(null);
  const [customAction, setCustomAction] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [addHostOpen, setAddHostOpen] = useState(false);
  
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const pollingActiveRef = useRef<Map<string, boolean>>(new Map());

  // Register hostname+arch identity for every host so storage keys match
  // those used by the full /monitors/:id/terminal page.
  useEffect(() => {
    for (const h of hosts) {
      if (h.uuid && h.hostname) {
        registerHostIdentity(h.uuid, { hostname: h.hostname, arch: h.arch });
      }
    }
  }, [hosts]);

  // Broadcast a "demo object in view" signal whenever a demo-seeded host row
  // is currently expanded. The DemoTourDrawer listens to this and surfaces
  // the glowing "Re-open demo tour" pill so the user is not left wondering
  // whether the FIN-LAPTOP-04 row is real data.
  useEffect(() => {
    const expandedDemo = Array.from(expandedHosts).some(rowKey => {
      const uuid = rowKey.startsWith('uuid:') ? rowKey.slice(5) : '';
      if (uuid && /^demo-/i.test(uuid)) return true;
      const matched = hosts.find(h => `uuid:${h.uuid}` === rowKey || rowKey.includes(`::${(h.hostname || '').toLowerCase()}::`));
      return !!matched && /^demo-/i.test(String(matched.uuid || ''));
    });
    window.dispatchEvent(
      new CustomEvent('demo-object-context', { detail: { active: expandedDemo } }),
    );
    return () => {
      window.dispatchEvent(
        new CustomEvent('demo-object-context', { detail: { active: false } }),
      );
    };
  }, [expandedHosts, hosts]);

  const [supplementedHosts, setSupplementedHosts] = useState<MonitorHost[]>(hosts);

  useEffect(() => {
    // If hosts are empty or already have detailed software/posture fields, keep them
    const needsSupplement = hosts.some(h =>
      h.hd_encrypted === undefined &&
      h.automatic_screen_lock_enabled === undefined &&
      (!h.installed_software || (Array.isArray(h.installed_software) && h.installed_software.length === 0))
    );

    if (!needsSupplement || hosts.length === 0) {
      setSupplementedHosts(hosts);
      return;
    }

    let isMounted = true;
    fetchHostSupplements(orgId).then(supplements => {
      if (!isMounted) return;
      const merged = mergeHosts(hosts as any[], supplements);
      setSupplementedHosts(merged as MonitorHost[]);
    }).catch(err => {
      console.warn('[MonitorHostTable] Failed to load supplements:', err);
      if (isMounted) setSupplementedHosts(hosts);
    });

    return () => { isMounted = false; };
  }, [hosts, orgId]);

  const toggleSort = (col: string) => {
    if (sortCol === col) {
      if (sortAsc) setSortAsc(false);
      else { setSortCol(null); setSortAsc(true); }
    } else { setSortCol(col); setSortAsc(true); }
  };
  const sortArrow = (col: string) => sortCol === col ? (sortAsc ? ' ↑' : ' ↓') : '';

  const defaultSort = (a: MonitorHost, b: MonitorHost) => {
    const ca = a.checkin || 0, cb = b.checkin || 0;
    if (cb !== ca) return cb - ca;
    return (a.hostname || '').localeCompare(b.hostname || '');
  };
  const allHosts = !sortCol ? [...supplementedHosts].sort(defaultSort) : [...supplementedHosts].sort((a, b) => {
    let cmp = 0;
    switch (sortCol) {
      case 'os': cmp = (a.os || '').localeCompare(b.os || ''); break;
      case 'hostname': cmp = (a.hostname || '').localeCompare(b.hostname || ''); break;
      case 'hd': cmp = Number(a.hd_encrypted === true || a.hd_encrypted === 'true') - Number(b.hd_encrypted === true || b.hd_encrypted === 'true'); break;
      case 'screenlock': cmp = Number(a.automatic_screen_lock_enabled === true || a.automatic_screen_lock_enabled === 'true') - Number(b.automatic_screen_lock_enabled === true || b.automatic_screen_lock_enabled === 'true'); break;
      case 'software': cmp = (Array.isArray(a.installed_software) ? a.installed_software.length : 0) - (Array.isArray(b.installed_software) ? b.installed_software.length : 0); break;
      case 'codescan': cmp = (Array.isArray(a.code_scanner) ? a.code_scanner.length : 0) - (Array.isArray(b.code_scanner) ? b.code_scanner.length : 0); break;
      case 'response': cmp = Number(parseResponseActionsState(a.response_actions).enabled) - Number(parseResponseActionsState(b.response_actions).enabled); break;
      case 'processes': cmp = countActiveProcesses(a) - countActiveProcesses(b); break;
      case 'group': cmp = (a.groupName || '').localeCompare(b.groupName || ''); break;
      case 'checkin': cmp = (a.checkin || 0) - (b.checkin || 0); break;
    }
    return sortAsc ? cmp : -cmp;
  });

  // ── Action history (localStorage-backed) ──────────────────────────────────
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

  const getLatestDebug = (hostUuid: string): ActionDebugEntry | undefined => {
    const history = actionHistoryMap.get(hostUuid);
    return history?.[history.length - 1];
  };

  const pushHostDebug = (hostUuid: string, entry: ActionDebugEntry) => {
    setActionHistoryMap(prev => {
      const next = new Map(prev);
      const existing = next.get(hostUuid) || [];
      next.set(hostUuid, [...existing, entry]);
      return next;
    });
    try {
      const key = terminalStorageKey(hostUuid);
      const stored = readStoredSession(hostUuid);
      const newRow = {
        entryId: entry.entryId, actionName: entry.actionName, status: entry.status,
        startedAt: entry.startedAt, finishedAt: entry.finishedAt,
        executionId: entry.executionId, authorization: entry.authorization,
      };
      const dupIdx = stored.findIndex((e: any) => e?.entryId && e.entryId === entry.entryId);
      if (dupIdx >= 0) stored[dupIdx] = { ...stored[dupIdx], ...newRow }; else stored.push(newRow);
      if (stored.length > 200) stored.splice(0, stored.length - 200);
      localStorage.setItem(key, JSON.stringify(stored));
    } catch { /* ignore */ }
  };

  const updateHostDebug = (hostUuid: string, targetEntryId: string, update: Partial<ActionDebugEntry>) => {
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
          // Persist actionOutput + error so the full-screen terminal page shows
          // the same output rows as the inline popover (both share this key).
          const persistFields = {
            status: latest.status, finishedAt: latest.finishedAt,
            executionId: latest.executionId, authorization: latest.authorization,
            actionOutput: latest.actionOutput, error: latest.error,
          };
          const sIdx = stored.findIndex((e: any) => e.entryId === latest.entryId);
          if (sIdx >= 0) {
            stored[sIdx] = { ...stored[sIdx], ...persistFields };
          } else {
            stored.push({ entryId: latest.entryId, actionName: latest.actionName, startedAt: latest.startedAt, ...persistFields });
            if (stored.length > 200) stored.splice(0, stored.length - 200);
          }
          localStorage.setItem(key, JSON.stringify(stored));
        } catch { /* ignore */ }
      }
      return next;
    });
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
    } catch { return { success: true, output: null, error: null }; }
  };

  /**
   * Newer remote control runners return the full output directly in a top-level
   * `result` field. Returns null when there is no usable direct result, so the
   * caller falls back to execution_id polling.
   */
  const parseDirectRunResult = (data: unknown): { success: boolean; output: string | null; error: string | null } | null => {
    if (!data || typeof data !== 'object') return null;
    const raw = (data as Record<string, unknown>).result;
    if (raw === undefined || raw === null || raw === '') return null;
    let inner: unknown = raw;
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (!trimmed) return null;
      try { inner = JSON.parse(trimmed); } catch { return { success: true, output: trimmed, error: null }; }
    }
    if (!inner || typeof inner !== 'object') return { success: true, output: String(inner), error: null };
    const o = inner as Record<string, unknown>;
    const output =
      typeof o.output === 'string' ? o.output :
      typeof o.result === 'string' ? o.result :
      JSON.stringify(inner, null, 2);
    return { success: o.success !== false, output, error: typeof o.error === 'string' ? o.error : null };
  };

  const executeHostAction = async (actionId: string, actionName: string, hostname: string, groupName: string, hostUuid: string, isPredefined = false, skipConfirm = false) => {
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
      app_id: 'sensors', app_name: 'sensors', name: 'run_action',
      parameters: [
        { name: 'action', value: isPredefined ? `script:${actionId}` : actionId },
        { name: 'hosts', value: hostname },
        { name: 'sensor_group', value: groupName },
      ],
    };
    const entryId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    pushHostDebug(hostUuid, { entryId, hostUuid, actionName, hostname, status: 'sending', requestBody, startedAt: Date.now() });
    try {
      const resp = await fetch(getApiUrl('/api/v1/apps/sensors/run'), {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(requestBody), signal: controller.signal,
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
      if (parsed && typeof parsed === 'object' && parsed !== null && typeof (parsed as Record<string, unknown>).execution_id === 'string' && (parsed as Record<string, unknown>).execution_id) {
        const execId = (parsed as Record<string, unknown>).execution_id as string;
        updateHostDebug(hostUuid, entryId, { status: 'polling', responseStatus: resp.status, responseBody: text, executionId: execId, authorization: ((parsed as any).authorization as string) || execId });
        const maxAttempts = 900;
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
              method: 'POST', credentials: 'include',
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
            const parsedRes = parseActionResult(pollData);
            updateHostDebug(hostUuid, entryId, {
              status: parsedRes.success ? 'success' : 'error',
              responseBody: pollText, finishedAt: Date.now(),
              actionOutput: parsedRes.output || undefined,
              actionSuccess: parsedRes.success,
              error: parsedRes.success ? undefined : (parsedRes.error || parsedRes.output || 'Action reported failure'),
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
      onRefresh?.();
    }
  };

  const abortHostAction = (hostUuid: string) => {
    pollingActiveRef.current.set(hostUuid, false);
    const controller = abortControllersRef.current.get(hostUuid);
    if (controller) controller.abort();
    abortControllersRef.current.delete(hostUuid);
    const debugEntry = getLatestDebug(hostUuid);
    if (debugEntry?.executionId) {
      fetch(getApiUrl(`/api/v1/workflows/${debugEntry.executionId}/executions/${debugEntry.executionId}/abort`), {
        method: 'GET', credentials: 'include', headers: { ...getAuthHeader() },
      }).catch(() => { /* best effort */ });
    }
    if (debugEntry?.entryId) {
      updateHostDebug(hostUuid, debugEntry.entryId, { status: 'error', finishedAt: Date.now(), error: 'Aborted by user' });
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <div
        className="border border-border rounded-lg overflow-hidden bg-card"
        style={{
          border: '1px solid hsl(var(--border))',
          borderRadius: 8,
          overflow: 'hidden',
          backgroundColor: 'hsl(var(--card))',
        }}
      >
        {!hideHeader && (
          <div
            className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-card"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 20px',
              borderBottom: '1px solid hsl(var(--border))',
              backgroundColor: 'hsl(var(--card))',
            }}
          >
            <div className="flex items-center gap-3" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  backgroundColor: 'rgba(249, 115, 22, 0.15)',
                  color: '#f97316',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Laptop size={18} />
              </div>
              <div>
                <div className="flex items-center gap-2" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="text-sm font-semibold text-foreground" style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                    {title || (group?.name && group.name !== 'Monitored Hosts' ? `${group.name} - Host Monitors` : 'Host Monitors')}
                  </span>
                  <span
                    className="text-xs text-muted-foreground font-mono"
                    style={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))' }}
                  >
                    ({allHosts.length} {allHosts.length === 1 ? 'host' : 'hosts'})
                  </span>
                </div>
                <p
                  className="text-xs text-muted-foreground"
                  style={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))', margin: '2px 0 0 0' }}
                >
                  {subtitle || 'Deploy lightweight monitors on endpoints to check compliance & posture'}
                </p>
              </div>
            </div>
            {showAddHost && (
              <div className="flex items-center gap-1.5" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 h-8 text-xs"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32, fontSize: '0.75rem' }}
                  onClick={() => setAddHostOpen(true)}
                >
                  <Plus size={13} />
                  Add Host
                </Button>
              </div>
            )}
          </div>
        )}
        {/* Table scroll container */}
        <div style={{ width: '100%', overflowX: 'auto' }}>
          <div style={{ minWidth: 920 }}>
            {/* Table header */}
            <div
              className="grid gap-2 px-5 py-2.5 border-b border-border bg-muted/30 items-center select-none"
              style={{
                display: 'grid',
                gridTemplateColumns: TABLE_GRID_TEMPLATE,
                gap: 8,
                columnGap: 8,
                padding: '8px 20px',
                borderBottom: '1px solid hsl(var(--border))',
                backgroundColor: 'hsla(var(--muted), 0.3)',
                alignItems: 'center',
              }}
            >
              <TooltipProvider delayDuration={200}>
                <Tooltip><TooltipTrigger asChild>
                  <span className="text-xs font-semibold text-muted-foreground cursor-pointer flex items-center justify-center gap-1" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }} onClick={() => toggleSort('os')}>
                    OS{sortArrow('os')}
                  </span>
                </TooltipTrigger><TooltipContent>Sort by Operating System</TooltipContent></Tooltip>
              </TooltipProvider>
              <span className="text-xs font-semibold text-muted-foreground cursor-pointer" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} onClick={() => toggleSort('hostname')}>
                Hostname{sortArrow('hostname')}
              </span>
              <TooltipProvider delayDuration={200}><Tooltip><TooltipTrigger asChild>
                <span className="text-xs font-semibold text-muted-foreground cursor-pointer" style={{ display: 'block', textAlign: 'center', width: '100%' }} onClick={() => toggleSort('hd')}>Disk{sortArrow('hd')}</span>
              </TooltipTrigger><TooltipContent side="bottom" className="max-w-[200px]"><p className="font-semibold text-xs">HD Encrypted</p><p className="text-[0.65rem] text-muted-foreground">Click to sort</p></TooltipContent></Tooltip></TooltipProvider>
              <TooltipProvider delayDuration={200}><Tooltip><TooltipTrigger asChild>
                <span className="text-xs font-semibold text-muted-foreground cursor-pointer" style={{ display: 'block', textAlign: 'center', width: '100%' }} onClick={() => toggleSort('screenlock')}>Lock{sortArrow('screenlock')}</span>
              </TooltipTrigger><TooltipContent side="bottom" className="max-w-[200px]"><p className="font-semibold text-xs">Screenlock</p><p className="text-[0.65rem] text-muted-foreground">Click to sort</p></TooltipContent></Tooltip></TooltipProvider>
              <TooltipProvider delayDuration={200}><Tooltip><TooltipTrigger asChild>
                <span className="text-xs font-semibold text-muted-foreground cursor-pointer" style={{ display: 'block', textAlign: 'center', width: '100%' }} onClick={() => toggleSort('software')}>Software{sortArrow('software')}</span>
              </TooltipTrigger><TooltipContent side="bottom" className="max-w-[200px]"><p className="font-semibold text-xs">Installed Software</p><p className="text-[0.65rem] text-muted-foreground">Click to sort by count</p></TooltipContent></Tooltip></TooltipProvider>
              <TooltipProvider delayDuration={200}><Tooltip><TooltipTrigger asChild>
                <span className="text-xs font-semibold text-muted-foreground cursor-pointer" style={{ display: 'block', textAlign: 'center', width: '100%' }} onClick={() => toggleSort('codescan')}>Code{sortArrow('codescan')}</span>
              </TooltipTrigger><TooltipContent side="bottom" className="max-w-[200px]"><p className="font-semibold text-xs">Code Package Scanner</p><p className="text-[0.65rem] text-muted-foreground">Click to sort by count</p></TooltipContent></Tooltip></TooltipProvider>
              <TooltipProvider delayDuration={200}><Tooltip><TooltipTrigger asChild>
                <span className="text-xs font-semibold text-muted-foreground cursor-pointer" style={{ display: 'block', textAlign: 'center', width: '100%' }} onClick={() => toggleSort('processes')}>Procs{sortArrow('processes')}</span>
              </TooltipTrigger><TooltipContent side="bottom" className="max-w-[200px]"><p className="font-semibold text-xs">Active Processes</p><p className="text-[0.65rem] text-muted-foreground">Click to sort by count</p></TooltipContent></Tooltip></TooltipProvider>
              <TooltipProvider delayDuration={200}><Tooltip><TooltipTrigger asChild>
                <span className="text-xs font-semibold text-muted-foreground cursor-pointer" style={{ display: 'block', textAlign: 'center', width: '100%' }} onClick={() => toggleSort('response')}>Response{sortArrow('response')}</span>
              </TooltipTrigger><TooltipContent side="bottom" className="max-w-[200px]"><p className="font-semibold text-xs">Response Actions</p><p className="text-[0.65rem] text-muted-foreground">Click to sort</p></TooltipContent></Tooltip></TooltipProvider>
              <span className="text-xs font-semibold text-muted-foreground cursor-pointer" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} onClick={() => toggleSort('group')}>
                Group{sortArrow('group')}
              </span>
              <span className="text-xs font-semibold text-muted-foreground cursor-pointer" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} onClick={() => toggleSort('checkin')}>
                Last Check-in{sortArrow('checkin')}
              </span>
              <span className="text-xs font-semibold text-muted-foreground" style={{ display: 'block', textAlign: 'right', width: '100%', paddingRight: 4 }}>
                Actions
              </span>
            </div>
        {/* Host rows */}
        {allHosts.length === 0 ? (
          <div className="px-5 py-12 flex flex-col items-center justify-center text-center gap-3">
            <Laptop size={32} className="text-muted-foreground/30" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">No hosts registered yet</p>
              <p className="text-xs text-muted-foreground max-w-sm">
                Deploy a lightweight monitor on an endpoint to start checking posture and compliance.
              </p>
            </div>
            {(showAddHost || group) && (
              <Button
                size="sm"
                className="gap-1.5 mt-2"
                onClick={() => setAddHostOpen(true)}
              >
                <Plus size={14} />
                Add Host
              </Button>
            )}
          </div>
        ) : (
          allHosts.map((host, idx) => {
          const checkinDate = host.checkin ? new Date(host.checkin * 1000) : null;
          const isRecent = checkinDate ? (Date.now() - checkinDate.getTime()) < 5 * 60 * 1000 : false;
          const hdState = triState(host.hd_encrypted);
          const hdEncrypted = hdState === 'on';
          const screenlockState = triState(host.automatic_screen_lock_enabled);
          const screenlockOn = screenlockState === 'on';
          const softwareCount = Array.isArray(host.installed_software) ? host.installed_software.length : 0;
          const codeScanCount = Array.isArray(host.code_scanner) ? host.code_scanner.length : 0;
          const responseActionsRaw = host.response_actions;
          const responseActionsState = parseResponseActionsState(responseActionsRaw);
          const responseActionsOn = responseActionsState.enabled;
          const responseActionsMode = responseActionsState.mode;
          const activeProcessesCount = countActiveProcesses(host);
          // Stable per-row key: uuid when present, otherwise groupId+hostname+idx.
          // Avoids collapsing all uuid-less rows into a single expansion entry.
          const rowKey = (host.uuid && String(host.uuid).trim())
            ? `uuid:${host.uuid}`
            : `gh:${(host as any).groupId || ''}::${(host.hostname || '').toLowerCase()}::${idx}`;
          const isExpanded = expandedHosts.has(rowKey);
          const toggleExpanded = () => {
            setExpandedHosts(prev => {
              const next = new Set(prev);
              if (next.has(rowKey)) next.delete(rowKey);
              else next.add(rowKey);
              return next;
            });
          };
          const getDotColorStyle = (s?: 'on' | 'off' | 'empty', isOn?: boolean, customColor?: string) => {
            if (s === 'off') return 'hsl(var(--severity-critical, 0 84% 60%))';
            if (!isOn) return 'rgba(140, 140, 140, 0.3)';
            if (customColor === 'medium' || customColor?.includes('medium')) return 'hsl(var(--severity-medium, 45 93% 47%))';
            if (customColor === 'high' || customColor?.includes('high')) return 'hsl(var(--severity-high, 12 92% 52%))';
            return 'hsl(var(--severity-low, 142 71% 45%))';
          };
          const CheckDot = ({ on, tip, color, state }: { on: boolean; tip: string; color?: string; state?: 'on' | 'off' | 'empty' }) => {
            const dotColor = state === 'off'
              ? 'bg-[hsl(var(--severity-critical))]'
              : on
                ? (color || 'bg-[hsl(var(--severity-low))]')
                : 'bg-muted-foreground/30';
            const dotBg = getDotColorStyle(state, on, color);
            return (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex justify-center items-center" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%' }}>
                      <div
                        className={`w-2.5 h-2.5 rounded-full ${dotColor}`}
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          backgroundColor: dotBg,
                          flexShrink: 0,
                        }}
                      />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{tip}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          };
          return (
            <div key={rowKey}>
              <div
                className="grid gap-2 px-5 py-3 border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors items-center cursor-pointer"
                style={{
                  display: 'grid',
                  gridTemplateColumns: TABLE_GRID_TEMPLATE,
                  gap: 8,
                  columnGap: 8,
                  padding: '12px 20px',
                  borderBottom: '1px solid hsl(var(--border))',
                  alignItems: 'center',
                }}
                onClick={toggleExpanded}
              >
                <div className="flex items-center justify-center" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <OsIcon
                    os={host.os}
                    platform={host.platform as string}
                    kernel={host.kernel as string}
                    hostname={host.hostname}
                    size={14}
                    className="text-muted-foreground"
                  />
                </div>
                <div className="flex flex-col min-w-0" style={{ minWidth: 0 }}>
                  <div className="flex items-center gap-2 min-w-0" style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <ChevronRight size={14} className={`text-muted-foreground shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                    <HostNameDisplay
                      hostname={host.hostname}
                      className="text-sm font-medium text-foreground truncate"
                    />
                    {(host.hostname || '').toLowerCase() === DEMO_HOST_HOSTNAME.toLowerCase() && (
                      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border border-border bg-muted/40 text-muted-foreground">
                        Demo
                      </span>
                    )}
                  </div>

                </div>
                <CheckDot on={hdEncrypted} state={hdState} tip={`hd_encrypted = ${fmtRaw(host.hd_encrypted)}`} />
                <CheckDot on={screenlockOn} state={screenlockState} tip={`automatic_screen_lock_enabled = ${fmtRaw(host.automatic_screen_lock_enabled)}`} />
                <CheckDot
                  on={softwareCount > 0}
                  color={softwareCount === 1 ? 'bg-[hsl(var(--severity-medium))]' : undefined}
                  tip={Array.isArray(host.installed_software)
                    ? `installed_software: ${softwareCount} ${softwareCount === 1 ? 'item (likely incomplete inventory)' : 'items'}`
                    : `installed_software = ${fmtRaw(host.installed_software)}`}
                />
                <CheckDot
                  on={codeScanCount > 0}
                  tip={Array.isArray(host.code_scanner)
                    ? `code_scanner: ${codeScanCount} ${codeScanCount === 1 ? 'project' : 'projects'}`
                    : `code_scanner = ${fmtRaw(host.code_scanner)}`}
                />
                <CheckDot
                  on={activeProcessesCount > 0}
                  tip={activeProcessesCount > 0
                    ? `process_list: ${activeProcessesCount} active ${activeProcessesCount === 1 ? 'process' : 'processes'}`
                    : 'No active processes reported'}
                />
                <CheckDot
                  on={responseActionsOn}
                  tip={`response_actions = ${fmtRaw(responseActionsRaw)}`}
                  color={responseActionsMode === 'full' ? 'bg-[hsl(var(--severity-high))]' : 'bg-[hsl(var(--severity-low))]'}
                />
                <span className="text-xs text-muted-foreground truncate" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>{host.groupName}</span>
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-1.5 cursor-help" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'help' }}>
                        <div
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${isRecent ? 'bg-green-500' : 'bg-muted-foreground/40'}`}
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            backgroundColor: isRecent ? '#22c55e' : 'rgba(150, 150, 150, 0.4)',
                            flexShrink: 0,
                          }}
                        />
                        <span className="text-xs text-muted-foreground" style={{ fontSize: 12 }}>
                          {checkinDate ? checkinDate.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      {checkinDate ? (() => {
                        const now = Date.now();
                        const diff = now - checkinDate.getTime();
                        const seconds = Math.floor(diff / 1000);
                        const mins = Math.floor(diff / 60000);
                        const hrs = Math.floor(mins / 60);
                        const days = Math.floor(hrs / 24);
                        let relativeTime = '';
                        if (seconds < 60) relativeTime = `${seconds} second${seconds !== 1 ? 's' : ''} ago`;
                        else if (mins < 60) relativeTime = `${mins} minute${mins !== 1 ? 's' : ''} ago`;
                        else if (hrs < 24) relativeTime = `${hrs} hour${hrs !== 1 ? 's' : ''} ago`;
                        else relativeTime = `${days} day${days !== 1 ? 's' : ''} ago`;
                        const exactTime = checkinDate.toLocaleString(undefined, {
                          year: 'numeric', month: 'short', day: 'numeric',
                          hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
                        });
                        return (
                          <div className="text-xs">
                            <div className="font-semibold">{exactTime}</div>
                            <div className="text-muted-foreground">({relativeTime})</div>
                          </div>
                        );
                      })() : '—'}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                {/* Actions popover */}
                <div
                  className="flex items-center justify-end gap-1.5"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, width: '100%' }}
                  onClick={e => e.stopPropagation()}
                >
                  {responseActionsOn ? (
                    <Popover
                      onOpenChange={(open) => {
                        if (open) hydrateHost(host.uuid);
                      }}
                    >
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary">
                          {actionExecuting.has(host.uuid) ? (
                            <Loader2 size={14} className="animate-spin text-primary" />
                          ) : (
                            <Play size={14} />
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" side="left" collisionPadding={16} className="w-[34rem] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] overflow-auto p-0" onClick={e => e.stopPropagation()}>
                        {(() => {
                          const hostHistory = actionHistoryMap.get(host.uuid) || [];
                          const actionDebug = hostHistory[hostHistory.length - 1];
                          const isRunning = actionDebug && (actionDebug.status === 'sending' || actionDebug.status === 'polling');
                          const finishedHistory = hostHistory.filter(e => e.status === 'success' || e.status === 'error');
                          const isFull = responseActionsMode === 'full';
                          return (
                            <div className="flex flex-col" style={{ maxHeight: 'min(70vh, 32rem)' }}>
                              {/* Header */}
                              <div className="px-3 py-2 border-b border-border flex items-center gap-2 shrink-0">
                                <Terminal size={12} className="text-muted-foreground" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold text-foreground truncate">
                                    <HostNameDisplay hostname={host.hostname} />
                                  </p>
                                  <p className="text-[0.6rem] text-muted-foreground">{responseActionsMode === 'full' ? 'Full control (RCE)' : 'Controlled'}</p>
                                </div>

                                <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => navigate(`/monitors/${encodeURIComponent(hostUrlSegment(host))}/terminal`, { state: { hostname: host.hostname, groupName: host.groupName, mode: responseActionsMode || 'controlled' } })}>
                                  <Maximize2 size={10} />
                                </Button>
                                {isRunning && <Loader2 size={12} className="animate-spin text-primary shrink-0" />}
                              </div>
                              {/* Scrollable session log */}
                              <div className="flex-1 overflow-y-auto min-h-0" ref={(el) => { if (el) el.scrollTop = el.scrollHeight; }}>
                                {finishedHistory.map((entry, i) => {
                                  const isLatest = i === finishedHistory.length - 1;
                                  return (
                                    <div key={entry.entryId || i} className={`border-b border-border/50 last:border-b-0 ${isLatest ? 'bg-primary/5 ring-1 ring-inset ring-primary/20' : ''}`}>
                                      <div className={`px-3 py-1.5 flex items-center gap-2 ${isLatest ? 'bg-primary/10' : 'bg-muted/20'}`}>
                                        <span className="text-[0.6rem] font-mono text-primary">$</span>
                                        <span className="text-[0.65rem] font-mono font-medium text-foreground flex-1 truncate">{entry.actionName}</span>
                                        {entry.status === 'success' ? (
                                          <CheckCircle2 size={10} className="text-[hsl(var(--severity-low))] shrink-0" />
                                        ) : (
                                          <ShieldX size={10} className="text-destructive shrink-0" />
                                        )}
                                        <span className="text-[0.55rem] text-muted-foreground font-mono shrink-0">
                                          {new Date(entry.startedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                        </span>
                                        <span className="text-[0.55rem] text-muted-foreground font-mono shrink-0">
                                          {entry.finishedAt ? `${Math.round((entry.finishedAt - entry.startedAt) / 1000)}s` : ''}
                                        </span>
                                      </div>
                                      {(entry.actionOutput || entry.error) && (
                                        <div className="px-3 py-1.5">
                                          {entry.actionOutput && (
                                            <ActionOutputView
                                              output={entry.actionOutput}
                                              className="text-[0.6rem] font-mono text-foreground/80 whitespace-pre-wrap break-words max-h-28 overflow-y-auto"
                                            />
                                          )}
                                          {entry.error && (
                                            <pre className="text-[0.6rem] font-mono text-destructive whitespace-pre-wrap break-words">{entry.error}</pre>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                                {isRunning && actionDebug && (
                                  <div className="border-b border-border/50">
                                    <div className="px-3 py-1.5 flex items-center gap-2 bg-muted/20">
                                      <span className="text-[0.6rem] font-mono text-primary">$</span>
                                      <span className="text-[0.65rem] font-mono font-medium text-foreground flex-1 truncate">{actionDebug.actionName}</span>
                                      <Loader2 size={10} className="animate-spin text-primary shrink-0" />
                                    </div>
                                    <div className="px-3 py-1.5 flex items-center justify-between">
                                      <span className="text-[0.6rem] text-muted-foreground">
                                        {actionDebug.status === 'sending' ? 'Sending…' : 'Waiting for result…'}
                                      </span>
                                      <Button variant="ghost" size="sm" className="h-5 px-2 text-[0.6rem] shrink-0 border border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive" onClick={() => abortHostAction(host.uuid)}>
                                        Stop
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </div>
                              {/* Predefined action chips (shared definition) */}
                              <div className="px-3 py-2 border-t border-border/50 shrink-0">
                                <HostActionChips
                                  activeUser={getActiveUser(host)}
                                  agentPrivilege={inferAgentPrivilege(host)}
                                  arch={`${host.os || ''} ${host.arch || ''} ${host.hostname || ''}`}
                                  size="compact"
                                  onRun={({ actionId, displayName }) =>
                                    executeHostAction(actionId, displayName, host.hostname, host.groupName || '', host.uuid, true)
                                  }
                                />
                              </div>
                              {/* Command input */}
                              <div className="px-3 py-2 border-t border-border shrink-0">
                                <div className="flex gap-1.5 items-center">
                                  <span className="text-[0.65rem] font-mono text-primary shrink-0">$</span>
                                  <Input
                                    placeholder={isFull ? 'Type command…' : 'Custom action…'}
                                    value={customAction}
                                    onChange={e => setCustomAction(e.target.value)}
                                    className="h-7 text-xs flex-1 font-mono"
                                    ref={el => { if (el) requestAnimationFrame(() => el.focus()); }}
                                    onKeyDown={e => {
                                      const hostEntries = actionHistoryMap.get(host.uuid) || [];
                                      const history = [...hostEntries].reverse().map(e => e.actionName).filter(Boolean);
                                      if (e.key === 'Enter' && customAction.trim()) {
                                        setHistoryIndex(-1);
                                        executeHostAction(customAction.trim(), customAction.trim(), host.hostname, host.groupName || '', host.uuid);
                                        setCustomAction('');
                                      } else if (e.key === 'ArrowUp') {
                                        e.preventDefault();
                                        setHistoryIndex(prev => {
                                          const next = Math.min(prev + 1, history.length - 1);
                                          if (next >= 0) setCustomAction(history[next]);
                                          return next;
                                        });
                                      } else if (e.key === 'ArrowDown') {
                                        e.preventDefault();
                                        setHistoryIndex(prev => {
                                          const next = prev - 1;
                                          if (next < 0) { setCustomAction(''); return -1; }
                                          setCustomAction(history[next]);
                                          return next;
                                        });
                                      }
                                    }}
                                  />
                                  <Button
                                    size="icon" variant="ghost" className="h-7 w-7 shrink-0"
                                    disabled={!customAction.trim()}
                                    onClick={() => {
                                      if (customAction.trim()) {
                                        executeHostAction(customAction.trim(), customAction.trim(), host.hostname, host.groupName || '', host.uuid);
                                        setCustomAction('');
                                      }
                                    }}
                                  >
                                    <Play size={12} />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </PopoverContent>
                    </Popover>
                  ) : (
                    <TooltipProvider delayDuration={200}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground opacity-40 cursor-not-allowed" disabled>
                            <Play size={14} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="left">
                          <p className="text-xs">Response Actions not enabled on this host</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary"
                          onClick={(e) => {
                            const segment = hostUrlSegment(host);
                            if (!segment) return;
                            const path = `/monitors/${encodeURIComponent(segment)}`;
                            if (e.ctrlKey || e.metaKey) window.open(path, '_blank');
                            else navigate(path);
                          }}
                        >
                          <Maximize2 size={14} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="left">
                        <p className="text-xs">Explore monitor</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
              {/* Expanded detail panel — shared with /monitors/:id via HostDetailPanel */}
              {isExpanded && (
                <HostDetailPanel
                  host={host as any}
                  variant="inline"
                  collapsibleSections
                  hostUuid={host.uuid}
                  hostname={host.hostname}
                  groupName={host.groupName}
                  mode={responseActionsMode || 'controlled'}
                />
              )}
            </div>
          );
        })
      )}
          </div>
        </div>
      </div>

      <AlertDialog open={!!pendingDisableRce} onOpenChange={(o) => { if (!o) setPendingDisableRce(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable Remote Code Execution?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you 100% sure? This will disable RCE on <span className="font-mono text-foreground">{pendingDisableRce?.hostname}</span>.
              You will <strong>not</strong> be able to turn it back on without restarting the agent on the host.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const p = pendingDisableRce;
                setPendingDisableRce(null);
                if (p) executeHostAction(p.actionId, p.actionName, p.hostname, p.groupName, p.hostUuid, p.isPredefined, true);
              }}
            >
              Yes, disable RCE
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AddHostDialog
        open={addHostOpen}
        onOpenChange={setAddHostOpen}
        group={group}
        onHostDetected={onRefresh}
        onRefresh={onRefresh}
      />
    </>
  );
};

export default MonitorHostTable;

/**
 * AgentsView — full-page "/agents" experience as a reusable Shuffle-MCPs view.
 *
 * Self-contained equivalent of the legacy AgentsPage in Shuffle Security:
 * an AgentUI on top, list of past agent runs below, plus the execution
 * drawer and an "editing schedule" banner.
 *
 * Scheduling, activity list, execution drawer, schedule edit save, and Local
 * LLM configuration are handled internally. Hosts can still override slots and
 * handlers when they need custom behavior.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import AgentUI from '@/Shuffle-MCPs/components/AgentUI';
import AgentActivityList from '@/Shuffle-MCPs/components/AgentActivityList';
import type { AgentUsecaseFilter } from '@/Shuffle-MCPs/components/AgentActivityList';
import AgentExecutionDrawer from '@/Shuffle-MCPs/components/AgentExecutionDrawer';
import AgentRunDrawer, { type AgentRunDrawerTab } from '@/Shuffle-MCPs/components/AgentRunDrawer';
import LocalLLMConfig from '@/Shuffle-Core/components/LocalLLMConfig';
import type { AgentRun } from '@/Shuffle-MCPs/agentActivity';
import type { AgentUIApp, AgentUIProps } from '@/Shuffle-MCPs/components/AgentUI';
import { scheduleAgentRun, updateAgentScheduleConfig } from '@/Shuffle-MCPs/agentActivity';
import { toast } from '@/Shuffle-Core/toast';
import type { ShuffleHostProps } from '@/Shuffle-Core/host-props';
import { useSyncHostBaseUrl } from '@/Shuffle-Core/useSyncHostBaseUrl';
import { API_CONFIG } from '@/Shuffle-Core/api';

export interface AgentsViewProps extends ShuffleHostProps {
  /**
   * Optional scheduler override. When omitted, AgentsView creates the scheduled
   * AI Agent workflow directly through the Shuffle API.
   */
  onSchedule?: NonNullable<AgentUIProps['onSchedule']>;
  /** Optional Shuffle API key. Falls back to the shared API config/session. */
  apiKey?: string;
  /** Optional Shuffle Org ID — sent as the `Org-Id` header on library fetches. */
  orgId?: string;
  /** Override max content width of the inner stack. Defaults to 820. */
  maxWidth?: number;
  /**
   * Optional handler for the "Choose LLM" chip. Forwarded to the embedded
   * AgentUI. When omitted, AgentsView mounts its own internal
   * `AgentRunDrawer` and opens it on the Local LLM tab — so the chip
   * always does *something*, even on hosts that haven't wired a picker.
   * Pass this prop to override with your own LLM picker, or set
   * `hideChooseLLM` to remove the chip entirely.
   */
  onChooseLLM?: () => void;
  /** Hide the "Choose LLM" chip in the embedded AgentUI. */
  hideChooseLLM?: boolean;
  /**
   * Content rendered inside the built-in AgentRunDrawer's Local LLM tab
   * when no `onChooseLLM` is provided. Use to plug in your own local LLM
   * config form. When omitted, the built-in Local LLM configuration UI is shown.
   */
  localLLMSlot?: React.ReactNode;
  /** Content for the built-in AgentRunDrawer's Permissions tab. Optional. */
  permissionsSlot?: React.ReactNode;
  /** Pre-fill the starter chip row on mount (e.g. from persisted host state). When omitted, AgentsView restores its own persisted selection from localStorage (24h TTL). */
  initialApps?: AgentUIApp[];
  /** Called whenever the chip row under the prompt changes. When omitted, AgentsView still persists internally. */
  onAppsChange?: (apps: AgentUIApp[]) => void;
  /** Disable AgentsView's internal localStorage persistence of the chip row. */
  disableAppsPersistence?: boolean;
  /** Storage key for internal chip-row persistence. Defaults to `shuffle-agents-selected-apps`. */
  appsStorageKey?: string;
  /** Usecase-backed agent types shown in the activity list filter dropdown. */
  usecaseFilters?: AgentUsecaseFilter[];
  /** Per-skill readiness CTAs forwarded to the embedded AgentUI. */
  presetCtas?: AgentUIProps['presetCtas'];
  /** Custom renderer for the tool search drawer (forwarded to AgentUI) */
  renderToolDrawer?: AgentUIProps['renderToolDrawer'];
  /** Custom renderer for the app detail drawer (forwarded to AgentUI and AgentActivityList) */
  renderAppDetailDrawer?: AgentUIProps['renderAppDetailDrawer'];
}

const APPS_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const DEFAULT_APPS_STORAGE_KEY = 'shuffle-agents-selected-apps';

const readPersistedApps = (storageKey: string): AgentUIApp[] | undefined => {
  try {
    if (typeof window === 'undefined') return undefined;
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { savedAt?: number; apps?: AgentUIApp[] };
    if (!parsed?.savedAt || !Array.isArray(parsed.apps) || parsed.apps.length === 0) return undefined;
    if (Date.now() - parsed.savedAt > APPS_TTL_MS) {
      window.localStorage.removeItem(storageKey);
      return undefined;
    }
    return parsed.apps.filter((a) => a && typeof a.name === 'string');
  } catch {
    return undefined;
  }
};

// Resolve a 'system'/'auto'/undefined theme to a concrete 'light' | 'dark'
// so the embedded MCP library does not re-detect via DOM ancestors and pick
// up an unrelated scope (which made /agents flicker between modes).
const resolveTheme = (theme?: 'light' | 'dark' | 'system'): 'light' | 'dark' | undefined => {
  if (theme === 'light' || theme === 'dark') return theme;
  if (typeof window === 'undefined' || !window.matchMedia) return theme as undefined;
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return undefined;
  }
};

const AgentsView = ({
  onSchedule,
  maxWidth = 820,
  onChooseLLM,
  hideChooseLLM,
  localLLMSlot,
  permissionsSlot,
  initialApps,
  onAppsChange,
  disableAppsPersistence,
  appsStorageKey = DEFAULT_APPS_STORAGE_KEY,
  usecaseFilters,
  presetCtas,
  globalUrl = API_CONFIG.baseUrl,
  isLoaded,
  isLoggedIn,
  userdata,
  serverside,
  theme,
  colorMode,
  apiKey,
  orgId,
  renderToolDrawer,
  renderAppDetailDrawer,
}: AgentsViewProps) => {
  useSyncHostBaseUrl(globalUrl);

  // Resolve once on mount; theme prop changes still flow through.
  const resolvedTheme = useMemo(() => resolveTheme(theme), [theme]);

  // Hydrate chip row from caller, else from our own localStorage.
  const hydratedInitialApps = useMemo<AgentUIApp[]>(() => {
    if (initialApps && initialApps.length > 0) return initialApps;
    if (disableAppsPersistence) return [];
    return readPersistedApps(appsStorageKey) ?? [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [selectedRun, setSelectedRun] = useState<AgentRun | null>(null);
  const [agentView, setAgentView] = useState<'start' | 'simple' | 'detailed'>('start');
  const [prefill, setPrefill] = useState<{ input: string; apps: AgentUIApp[]; key: number }>({
    input: '',
    apps: hydratedInitialApps,
    key: 0,
  });
  const [editing, setEditing] = useState<{ workflowId: string; name: string } | null>(null);

  // Internal persistence of the chip row (24h TTL). Forwards to host onAppsChange.
  const handleAppsChange = useCallback((apps: AgentUIApp[]) => {
    if (onAppsChange) {
      try { onAppsChange(apps); } catch { /* host handler error — ignore */ }
    }
    if (disableAppsPersistence) return;
    try {
      if (typeof window === 'undefined') return;
      if (!apps || apps.length === 0) {
        window.localStorage.removeItem(appsStorageKey);
        return;
      }
      const slim: AgentUIApp[] = apps
        .filter((a) => a && typeof a.name === 'string')
        .map((a) => ({ name: a.name, id: a.id, icon: a.icon }));
      window.localStorage.setItem(
        appsStorageKey,
        JSON.stringify({ savedAt: Date.now(), apps: slim }),
      );
    } catch {
      /* localStorage unavailable — ignore */
    }
  }, [onAppsChange, disableAppsPersistence, appsStorageKey]);
  // Reference to keep linter happy when persistence is disabled and no host handler.
  useEffect(() => { /* no-op */ }, [handleAppsChange]);


  // Built-in fallback drawer for "Choose LLM" / Permissions when the host
  // didn't wire its own handler. Ensures the chip is never a dead click.
  const [builtInDrawer, setBuiltInDrawer] = useState<{ open: boolean; tab: AgentRunDrawerTab }>({
    open: false,
    tab: 'localLLM',
  });

  // Listen for the global `agent-drawer-open` event so CTAs inside AgentUI
  // (e.g. the "Change LLM" button in AgentRunDiagnosisBanner) can open the
  // built-in fallback drawer on hosts that do not mount their own listener.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ tab?: AgentRunDrawerTab }>).detail;
      setBuiltInDrawer({ open: true, tab: (detail?.tab ?? 'localLLM') as AgentRunDrawerTab });
    };
    window.addEventListener('agent-drawer-open', handler as EventListener);
    return () => window.removeEventListener('agent-drawer-open', handler as EventListener);
  }, []);

  const effectiveSchedule = useCallback<NonNullable<AgentUIProps['onSchedule']>>(
    async (info) => {
      if (onSchedule) return onSchedule(info);
      await scheduleAgentRun({ ...info, apiKey, apiBaseUrl: globalUrl, orgId });
    },
    [onSchedule, apiKey, globalUrl, orgId],
  );

  const effectiveLocalLLMSlot = useMemo(
    () => localLLMSlot ?? (
      <LocalLLMConfig
        open={builtInDrawer.open}
        globalUrl={globalUrl}
        userdata={userdata}
        isLoaded={isLoaded}
        isLoggedIn={isLoggedIn}
        serverside={serverside}
        theme={resolvedTheme}
        colorMode={colorMode}
      />
    ),
    [localLLMSlot, builtInDrawer.open, globalUrl, userdata, isLoaded, isLoggedIn, serverside, resolvedTheme, colorMode],
  );

  const handleChooseLLM = useCallback(() => {
    if (onChooseLLM) {
      onChooseLLM();
      return;
    }
    setBuiltInDrawer({ open: true, tab: 'localLLM' });
  }, [onChooseLLM]);


  // Scroll to the activity list when arriving at /agents#agent-activity
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash !== '#agent-activity') return;
    const tryScroll = () => {
      const el = document.getElementById('agent-activity');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    const t = window.setTimeout(tryScroll, 150);
    return () => window.clearTimeout(t);
  }, []);

  const handleEditWorkflow = useCallback(
    ({ workflowId, name, prompt, apps }: { workflowId: string; name: string; prompt: string; apps: Array<{ name: string; id?: string }> }) => {
      setEditing({ workflowId, name });
      setPrefill((prev) => ({
        input: prompt,
        apps: apps.map((a) => ({ name: a.name, id: a.id })),
        key: prev.key + 1,
      }));
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [],
  );

  const handleSaveEdit = useCallback<NonNullable<AgentUIProps['submitOverride']>>(
    async ({ input, apps }) => {
      if (!editing) return;
      try {
        await updateAgentScheduleConfig(
          editing.workflowId,
          { prompt: input, apps: apps.map((a) => ({ name: a.name, id: a.id })) },
        );
        toast({ title: 'Schedule updated', description: `Saved changes to "${editing.name}".` });
        setEditing(null);
      } catch (e) {
        toast({
          title: 'Failed to save changes',
          description: e instanceof Error ? e.message : String(e),
          variant: 'destructive',
        });
      }
    },
    [editing],
  );

  return (
    <Box sx={{ minHeight: { xs: 'calc(100dvh - 76px - 24px - env(safe-area-inset-bottom, 0px))', md: '100%' }, width: '100%', px: { xs: 1.25, md: 4 }, pt: { xs: 1, md: '5vh' }, pb: { xs: 2, md: 6 }, boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <Stack spacing={{ xs: 2.5, md: 6 }} sx={{ maxWidth, mx: 'auto', width: '100%', flex: { xs: 1, md: 'unset' }, minHeight: { xs: 0 } }}>

        {editing && (
          <Box
            sx={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2,
              p: 1.5, borderRadius: 2,
              border: '1px solid hsl(var(--primary) / 0.4)',
              bgcolor: 'hsl(var(--primary) / 0.08)',
            }}
          >
            <Typography sx={{ fontSize: '0.85rem', color: 'hsl(var(--foreground))' }}>
              Editing schedule: <strong>{editing.name}</strong>
            </Typography>
            <Typography
              component="button"
              onClick={() => { setEditing(null); setPrefill((p) => ({ input: '', apps: [], key: p.key + 1 })); }}
              sx={{
                all: 'unset', cursor: 'pointer', fontSize: '0.8rem',
                color: 'hsl(var(--muted-foreground))',
                '&:hover': { color: 'hsl(var(--foreground))' },
              }}
            >
              Cancel
            </Typography>
          </Box>
        )}
        <Box sx={{ flex: { xs: 1, md: 'unset' }, display: { xs: 'flex', md: 'block' }, flexDirection: { xs: 'column' }, justifyContent: { xs: 'center' }, minHeight: { xs: 0 } }}>
          <AgentUI
            key={prefill.key}
            maxWidth={maxWidth}
            apiBaseUrl={globalUrl}
            onViewChange={setAgentView}
            onSchedule={effectiveSchedule}
            apiKey={apiKey}
            orgId={orgId}
            userId={userdata?.id}
            isSupport={userdata?.support === true || userdata?.support === 'true'}
            onChooseLLM={handleChooseLLM}
            hideChooseLLM={hideChooseLLM}
            defaultInput={prefill.input}
            defaultApps={prefill.apps.length > 0 ? prefill.apps : undefined}
            submitOverride={editing ? handleSaveEdit : undefined}
            submitLabel={editing ? 'Save' : undefined}
            submitTooltip={editing ? '⌘+Enter to save' : undefined}
            disableSchedule={Boolean(editing)}
            disableScheduleTooltip={editing ? 'Scheduling is disabled while editing an existing schedule' : undefined}
            theme={resolvedTheme}
            colorMode={colorMode}
            onAppsChange={handleAppsChange}
            presetCtas={presetCtas}
            renderToolDrawer={renderToolDrawer}
            renderAppDetailDrawer={renderAppDetailDrawer}
          />
        </Box>
        {agentView === 'start' && (
          <Box id="agent-activity" sx={{ pt: { xs: 4, md: '8vh' }, display: { xs: 'none', md: 'block' }, scrollMarginTop: 80 }}>
            <AgentActivityList
              apiBaseUrl={globalUrl}
              apiKey={apiKey}
              orgId={orgId}
              onRunClick={setSelectedRun}
              onEditWorkflow={handleEditWorkflow}
              usecaseFilters={usecaseFilters}
              renderAppDetailDrawer={renderAppDetailDrawer}
              top={25}
              limit={25}
            />
          </Box>
        )}
      </Stack>

      <AgentExecutionDrawer
        open={selectedRun !== null}
        onClose={() => setSelectedRun(null)}
        run={selectedRun}
        apiBaseUrl={globalUrl}
        onSchedule={effectiveSchedule}
        apiKey={apiKey}
        orgId={orgId}
        isSupport={userdata?.support === true || userdata?.support === 'true'}
        theme={resolvedTheme}
        colorMode={colorMode}
      />

      <AgentRunDrawer
        open={builtInDrawer.open}
        onClose={() => setBuiltInDrawer((s) => ({ ...s, open: false }))}
        initialTab={builtInDrawer.tab}
        globalUrl={globalUrl}
        localLLMSlot={effectiveLocalLLMSlot}
        permissionsSlot={permissionsSlot}
        theme={resolvedTheme}
        colorMode={colorMode}
        agentUIProps={{ onSchedule: effectiveSchedule, apiBaseUrl: globalUrl, apiKey, orgId, theme: resolvedTheme, colorMode }}
      />
    </Box>
  );
};

export default AgentsView;

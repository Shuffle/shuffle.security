/**
 * CombinedDashboard — single surface that mirrors the host `/dashboard`
 * page's tabbed layout: a "Security Operations" view (DashboardOverview)
 * and an "Automation" view (AutomationDashboard), switched via a shared
 * SegmentedControl header that also exposes the date range, mode
 * (workflows/apps), granularity (daily/monthly), and a refresh button.
 *
 * Self-sufficient: when mounted with just the standard Shuffle-Core host
 * props (`serverside`, `isLoaded`, `isLoggedIn`, `userdata`, `globalUrl`,
 * `theme`) this component fetches everything the inner dashboards need:
 *   - Incidents       -> `useDatastore({ category: INCIDENTS })`
 *   - Vulnerabilities -> raw list_cache fetch + inline severity tallying
 *   - Sensors / Hosts -> `/api/v1/getenvironments`
 *
 * Any data prop the caller passes explicitly wins over the internally
 * fetched value, so this stays a drop-in replacement for the single-org
 * branch of the host `/dashboard` page.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, CircularProgress, FormControl, IconButton, InputLabel, ListSubheader, MenuItem, Select, Tooltip as MuiTooltip, Typography } from '@mui/material';
import { RefreshCw as RefreshIcon, X as CloseIcon, Download as DownloadIcon } from 'lucide-react';
import { useDatastore } from '../../hooks/useDatastore';
import { DATASTORE_CATEGORIES } from '@shuffleio/shuffle-mcps';
import { getApiUrl, getAuthHeader } from '../../api';
import DashboardOverview, { type OverviewProps } from './DashboardOverview';
import AutomationDashboard, { type AutomationDashboardProps, AUTOMATION_RANGE_OPTIONS } from './AutomationDashboard';
import AgentsDashboard from './AgentsDashboard';
import VulnerabilitiesDashboard from './VulnerabilitiesDashboard';
import { SegmentedControl } from '../ui/segmented-control';
import type { ShuffleCoreHostProps } from '../../types/host-props';
import { useSyncHostBaseUrl } from '../../useSyncHostBaseUrl';
import { UsecaseDrawer } from '../../views/Usecases';
import { buildDashboardPdf, captureNode, type DashboardStatsSummary } from './exportDashboardPdf';


type VulnCounts = { critical: number; high: number; medium: number; low: number; info: number };
const EMPTY_VULNS: VulnCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };

export interface CombinedDashboardProps
  extends ShuffleCoreHostProps,
    Partial<Omit<OverviewProps, keyof ShuffleCoreHostProps | 'days'>>,
    Partial<Omit<AutomationDashboardProps, keyof ShuffleCoreHostProps | 'gran' | 'customRange' | 'onRangeSelect' | 'days'>> {
  /** Default tab on first mount. Persisted to localStorage thereafter.
   *  Defaults to 'automation' for standalone/embedded consumers; the Shuffle
   *  Security host passes 'security' explicitly. */
  defaultTab?: DashboardTab;
}

/** Available dashboard surfaces, grouped in the header dropdown under
 *  "Security" (Security Operations, Vulnerabilities) and "Automation"
 *  (Automation, Agents). */
export type DashboardTab = 'security' | 'vulnerabilities' | 'automation' | 'agents';
export const DASHBOARD_TABS: DashboardTab[] = ['security', 'vulnerabilities', 'automation', 'agents'];
export const TAB_LABELS: Record<DashboardTab, string> = {
  security: 'Security Operations',
  vulnerabilities: 'Vulnerabilities',
  automation: 'Automation',
  agents: 'Agents',
};

// ── helpers (mirrors DashboardPage.overviewIncidents transform) ─────────────
const SEV_MAP: Record<number, string> = { 1: 'informational', 2: 'low', 3: 'medium', 4: 'high', 5: 'critical', 6: 'critical' };
const STATUS_MAP: Record<number, string> = { 1: 'new', 2: 'in_progress', 3: 'resolved', 4: 'on_hold' };
const STATUS_SYNONYMS: Record<string, string> = {
  open: 'new', created: 'new', pending: 'new', reported: 'new',
  inprogress: 'in_progress', active: 'in_progress', investigating: 'in_progress',
  working: 'in_progress', assigned: 'in_progress', acknowledged: 'in_progress',
  closed: 'resolved', done: 'resolved', complete: 'resolved', completed: 'resolved',
  fixed: 'resolved', remediated: 'resolved', mitigated: 'resolved',
};
const normalizeTs = (t: unknown): number => {
  if (!t) return 0;
  const n = typeof t === 'string' ? Number(t) : (typeof t === 'number' ? t : 0);
  if (!n || isNaN(n) || n <= 0) {
    if (typeof t === 'string') {
      const d = new Date(t).getTime();
      return isNaN(d) ? 0 : d;
    }
    return 0;
  }
  if (n < 1e12) return n * 1000;
  if (n < 1e15) return n;
  if (n < 1e18) return n / 1000;
  return n / 1e6;
};

const fmtShort = (ms: number) => {
  const d = new Date(ms);
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  return `${M} ${d.getDate()}`;
};

const CombinedDashboard = ({
  defaultTab = 'automation',
  // Overview data overrides (when supplied, used as-is)
  incidents: incidentsProp,
  incidentsLoading: incidentsLoadingProp,
  vulnSeverityCounts: vulnSeverityCountsProp,
  vulnLoading: vulnLoadingProp,
  monitorHostCount: monitorHostCountProp,
  runningSensorCount: runningSensorCountProp,
  monitorsLoading: monitorsLoadingProp,
  // Automation-specific (callers may pre-control)
  orgId,
  displayName,
  headerLeft,
  refreshKey: refreshKeyProp,
  // Host props — forwarded to both inner dashboards
  ...host
}: CombinedDashboardProps) => {
  useSyncHostBaseUrl(host.globalUrl);

  // ── Shared filter state (mirrors DashboardPage) ──────────────────────────
  const [tab, setTab] = useState<DashboardTab>(() => {
    try {
      const stored = localStorage.getItem('shuffle_dashboard_tab') as DashboardTab | null;
      if (stored && DASHBOARD_TABS.includes(stored)) return stored;
    } catch { /* noop */ }
    return defaultTab;
  });
  useEffect(() => { try { localStorage.setItem('shuffle_dashboard_tab', tab); } catch { /* noop */ } }, [tab]);

  const [days, setDays] = useState<string>('30');
  const [gran, setGran] = useState<'daily' | 'monthly'>('daily');
  const [mode, setMode] = useState<'workflows' | 'apps'>('workflows');
  const [customRange, setCustomRange] = useState<{ fromMs: number; toMs: number } | null>(null);
  const [internalRefreshKey, setInternalRefreshKey] = useState(0);
  // Inline usecase drawer — opened by DashboardOverview's "Set up X" CTAs so
  // the user configures ingestion right here without leaving /dashboard.
  const [openUsecaseId, setOpenUsecaseId] = useState<string | null>(null);

  // ── Incidents ─────────────────────────────────────────────────────────────
  const { items: incidentItems, isLoading: incidentsFetching, fetchItems, hasFetched } = useDatastore({
    category: DATASTORE_CATEGORIES.INCIDENTS,
  });
  useEffect(() => { if (!hasFetched && incidentsProp === undefined) fetchItems(); }, [hasFetched, fetchItems, incidentsProp]);

  const fetchedIncidents = useMemo(() => {
    const out: { status: string; severity: string; createdTs: number }[] = [];
    const seen = new Set<string>();
    for (const item of incidentItems) {
      try {
        if (!item.value || (typeof item.value === 'string' && item.value.length > 5_000_000)) continue;
        const data = typeof item.value === 'string' ? JSON.parse(item.value) : item.value;
        const customAttrs = data?.metadata?.extensions?.custom_attributes;
        const severityId = data?.severity_id;
        const severity = (data?.severity || SEV_MAP[severityId] || 'medium').toString().toLowerCase();
        const rawStatus = (data?.status || customAttrs?.status || STATUS_MAP[data?.status_id] || 'new').toString().toLowerCase().trim().replace(/[\s-]+/g, '_');
        const status = STATUS_SYNONYMS[rawStatus] || STATUS_SYNONYMS[rawStatus.replace(/_/g, '')] || rawStatus;
        const createdTs = normalizeTs(data?.created_time) || normalizeTs((item as { created?: number }).created);
        const dedupeKey = (item.key || '').includes('::') ? item.key.split('::').pop()! : item.key;
        if (dedupeKey && seen.has(dedupeKey)) continue;
        if (dedupeKey) seen.add(dedupeKey);
        out.push({ status, severity, createdTs });
      } catch { /* skip */ }
    }
    return out;
  }, [incidentItems]);

  // ── Vulnerabilities ──────────────────────────────────────────────────────
  const [fetchedVulns, setFetchedVulns] = useState<VulnCounts>(EMPTY_VULNS);
  const [vulnsFetching, setVulnsFetching] = useState<boolean>(vulnSeverityCountsProp === undefined);
  useEffect(() => {
    if (vulnSeverityCountsProp !== undefined) { setVulnsFetching(false); return; }
    let cancelled = false;
    (async () => {
      setVulnsFetching(true);
      try {
        const url = getApiUrl('/api/v2/vulns?skip_fields=false&top=100');
        const res = await fetch(url, { method: 'GET', credentials: 'include', headers: { 'Content-Type': 'application/json', ...getAuthHeader() } });
        if (!res.ok) { if (!cancelled) { setFetchedVulns(EMPTY_VULNS); setVulnsFetching(false); } return; }
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.keys || data.data || []);
        const counts: VulnCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
        for (const item of list) {
          try {
            const v = item?.value != null ? (typeof item.value === 'string' ? JSON.parse(item.value) : item.value) : item;
            const sevRaw = (v?.severity || v?.database_specific?.severity || '').toString().toLowerCase();
            let sev: keyof VulnCounts = 'info';
            if (sevRaw.startsWith('crit')) sev = 'critical';
            else if (sevRaw.startsWith('high') || sevRaw === 'severe') sev = 'high';
            else if (sevRaw.startsWith('mod') || sevRaw.startsWith('med')) sev = 'medium';
            else if (sevRaw.startsWith('low')) sev = 'low';
            counts[sev]++;
          } catch { /* skip */ }
        }
        if (!cancelled) { setFetchedVulns(counts); setVulnsFetching(false); }
      } catch {
        if (!cancelled) { setFetchedVulns(EMPTY_VULNS); setVulnsFetching(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [vulnSeverityCountsProp, internalRefreshKey]);

  // ── Sensors / Host monitors ──────────────────────────────────────────────
  const [fetchedSensorCount, setFetchedSensorCount] = useState<number | null>(null);
  const [fetchedHostCount, setFetchedHostCount] = useState<number | null>(null);
  const [monitorsFetching, setMonitorsFetching] = useState<boolean>(
    monitorHostCountProp === undefined && runningSensorCountProp === undefined
  );
  useEffect(() => {
    if (monitorHostCountProp !== undefined && runningSensorCountProp !== undefined) { setMonitorsFetching(false); return; }
    let cancelled = false;
    (async () => {
      setMonitorsFetching(true);
      try {
        const res = await fetch(getApiUrl('/api/v1/getenvironments'), {
          credentials: 'include',
          headers: { ...getAuthHeader() },
        });
        if (!res.ok) { if (!cancelled) { setFetchedSensorCount(0); setFetchedHostCount(0); setMonitorsFetching(false); } return; }
        const envs = await res.json();
        const now = Math.floor(Date.now() / 1000);
        const runningEnvs = Array.isArray(envs) ? envs.filter(
          (e: any) => e.Type === 'onprem' && e.checkin > 0 && (now - e.checkin) < 300 && e.data_lake?.enabled === true
        ) : [];
        let hostCount = 0;
        if (Array.isArray(envs)) {
          for (const e of envs) if (!e.archived && Array.isArray(e.sensor_hosts)) hostCount += e.sensor_hosts.length;
        }
        if (!cancelled) {
          setFetchedSensorCount(runningEnvs.length);
          setFetchedHostCount(hostCount);
          setMonitorsFetching(false);
        }
      } catch {
        if (!cancelled) { setFetchedSensorCount(0); setFetchedHostCount(0); setMonitorsFetching(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [monitorHostCountProp, runningSensorCountProp, internalRefreshKey]);

  // ── Resolve effective values (caller overrides win) ──────────────────────
  const eIncidents = incidentsProp ?? fetchedIncidents;
  const eIncidentsLoading = incidentsLoadingProp ?? (incidentsProp === undefined ? incidentsFetching : false);
  const eVulns = vulnSeverityCountsProp ?? fetchedVulns;
  const eVulnLoading = vulnLoadingProp ?? (vulnSeverityCountsProp === undefined ? vulnsFetching : false);
  const eHostCount = monitorHostCountProp !== undefined ? monitorHostCountProp : fetchedHostCount;
  const eSensorCount = runningSensorCountProp !== undefined ? runningSensorCountProp : fetchedSensorCount;
  const eMonitorsLoading = monitorsLoadingProp ?? monitorsFetching;

  const handleRefresh = () => {
    setInternalRefreshKey(k => k + 1);
    try { fetchItems(); } catch { /* noop */ }
  };

  // ── PDF export ────────────────────────────────────────────────────────────
  const dashboardRef = useRef<HTMLDivElement | null>(null);
  const [exporting, setExporting] = useState(false);

  const customRangeLabel = customRange
    ? `${fmtShort(customRange.fromMs)} → ${fmtShort(customRange.toMs)}`
    : null;

  const [exportStatus, setExportStatus] = useState<string>('');

  /** Resolve once the dashboard node has no shimmer/skeleton placeholders left
   *  (or the timeout expires), so captures never grab half-loaded charts. */
  const waitForDashboardReady = async (timeoutMs = 20000) => {
    const started = Date.now();
    let stableFrames = 0;
    while (Date.now() - started < timeoutMs) {
      const node = dashboardRef.current;
      const pending = node
        ? node.querySelectorAll('[data-dashboard-loading], .MuiSkeleton-root').length
        : 1;
      if (pending === 0) {
        stableFrames += 1;
        // Require the "loaded" state to hold for a few polls so charts that
        // mount right after their data lands are painted too.
        if (stableFrames >= 3) break;
      } else {
        stableFrames = 0;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    // Let recharts finish its enter animation before the screenshot.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise((r) => setTimeout(r, 600));
    try { await (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts?.ready; } catch { /* noop */ }
  };

  const handleExportPdf = async () => {
    if (exporting) return;
    setExporting(true);
    setExportStatus('Loading dashboard data…');
    const originalTab = tab;
    try {
      // Capture whichever tab is mounted first, then flip, wait, capture again.
      const captureCurrent = async (): Promise<string | null> => {
        if (!dashboardRef.current) return null;
        try { return await captureNode(dashboardRef.current); } catch { return null; }
      };

      let securityImage: string | null = null;
      let automationImage: string | null = null;

      setTab('security');
      setExportStatus('Loading Security Operations…');
      await waitForDashboardReady();
      setExportStatus('Capturing Security Operations…');
      securityImage = await captureCurrent();

      setTab('automation');
      setExportStatus('Loading Automation…');
      await waitForDashboardReady();
      setExportStatus('Capturing Automation…');
      automationImage = await captureCurrent();

      setTab(originalTab);

      // Stats summary derived from the same data the dashboards render.
      const byStatus: Record<string, number> = {};
      const bySeverity: Record<string, number> = {};
      eIncidents.forEach((i) => {
        byStatus[i.status] = (byStatus[i.status] || 0) + 1;
        bySeverity[i.severity] = (bySeverity[i.severity] || 0) + 1;
      });

      const stats: DashboardStatsSummary = {
        orgName: displayName || (host.userdata as { active_org?: { name?: string } } | undefined)?.active_org?.name || 'Unknown org',
        rangeLabel: customRangeLabel ?? `Last ${days} days`,
        incidents: { total: eIncidents.length, byStatus, bySeverity },
        vulnerabilities: eVulns,
        monitors: { hostCount: eHostCount, runningSensors: eSensorCount },
      };

      setExportStatus('Generating PDF…');
      await buildDashboardPdf({ securityImage, automationImage, stats });
    } finally {
      setExporting(false);
      setExportStatus('');
    }
  };



  const sharedHeader = (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', minHeight: 36 }}>
        <FormControl size="small" sx={{ minWidth: 210 }}>
          <Select
            value={tab}
            onChange={(e) => setTab(e.target.value as DashboardTab)}
            inputProps={{ 'aria-label': 'Dashboard view' }}
            sx={{
              height: 36,
              borderRadius: '999px',
              fontSize: '0.85rem',
              fontWeight: 600,
              '& .MuiOutlinedInput-notchedOutline': { borderColor: 'hsl(var(--border))' },
            }}
            MenuProps={{ PaperProps: { sx: { mt: 0.5, borderRadius: '10px' } } }}
          >
            <ListSubheader sx={{ fontSize: '0.68rem', letterSpacing: '0.08em', textTransform: 'uppercase', lineHeight: 2.4, color: 'hsl(var(--muted-foreground))', bgcolor: 'transparent' }}>
              Security
            </ListSubheader>
            <MenuItem value="security">{TAB_LABELS.security}</MenuItem>
            <MenuItem value="vulnerabilities">{TAB_LABELS.vulnerabilities}</MenuItem>
            <ListSubheader sx={{ fontSize: '0.68rem', letterSpacing: '0.08em', textTransform: 'uppercase', lineHeight: 2.4, color: 'hsl(var(--muted-foreground))', bgcolor: 'transparent' }}>
              Automation
            </ListSubheader>
            <MenuItem value="automation">{TAB_LABELS.automation}</MenuItem>
            <MenuItem value="agents">{TAB_LABELS.agents}</MenuItem>
          </Select>
        </FormControl>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: customRangeLabel ? 220 : 130 }}>
          <InputLabel>Last</InputLabel>
          <Select
            label="Last"
            value={customRange ? '__custom__' : days}
            onChange={(e) => {
              const v = String(e.target.value);
              if (v === '__custom__') return;
              setCustomRange(null);
              setDays(v);
            }}
            renderValue={() => customRangeLabel ?? (AUTOMATION_RANGE_OPTIONS.find(o => o.value === days)?.label ?? `${days} days`)}
            endAdornment={customRange ? (
              <IconButton
                size="small"
                onMouseDown={(e) => { e.stopPropagation(); }}
                onClick={(e) => { e.stopPropagation(); setCustomRange(null); }}
                sx={{ mr: 3, p: 0.25, color: 'hsl(var(--muted-foreground))' }}
                aria-label="Clear custom range"
              >
                <CloseIcon size={14} />
              </IconButton>
            ) : undefined}
          >
            {customRangeLabel && (
              <MenuItem value="__custom__" disabled>{customRangeLabel} (custom)</MenuItem>
            )}
            {AUTOMATION_RANGE_OPTIONS.map(o => (
              <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <Box sx={{ alignSelf: 'flex-end', opacity: tab === 'automation' ? 1 : 0.5, pointerEvents: tab === 'automation' ? 'auto' : 'none' }}>
          <SegmentedControl
            ariaLabel="Mode"
            value={mode}
            onChange={(v) => setMode(v as 'workflows' | 'apps')}
            options={[
              { value: 'workflows', label: 'Workflows', disabled: tab !== 'automation' },
              { value: 'apps', label: 'Apps', disabled: tab !== 'automation' },
            ]}
          />
        </Box>
        <Box sx={{ alignSelf: 'flex-end' }}>
          <SegmentedControl
            ariaLabel="Granularity"
            value={gran}
            onChange={(v) => setGran(v as 'daily' | 'monthly')}
            options={[{ value: 'daily', label: 'Daily' }, { value: 'monthly', label: 'Monthly' }]}
          />
        </Box>
        <MuiTooltip title="Refresh">
          <IconButton
            size="small"
            onClick={handleRefresh}
            sx={{ color: 'hsl(var(--muted-foreground))', alignSelf: 'flex-end', width: 36, height: 36, borderRadius: '8px' }}
          >
            <RefreshIcon size={16} />
          </IconButton>
        </MuiTooltip>
        <MuiTooltip title={exporting ? (exportStatus || 'Generating PDF…') : 'Download dashboard as PDF'}>
          <span>
            <IconButton
              size="small"
              onClick={handleExportPdf}
              disabled={exporting}
              sx={{ color: 'hsl(var(--muted-foreground))', alignSelf: 'flex-end', width: 36, height: 36, borderRadius: '8px' }}
            >
              {exporting ? <CircularProgress size={16} sx={{ color: 'hsl(var(--muted-foreground))' }} /> : <DownloadIcon size={16} />}
            </IconButton>
          </span>
        </MuiTooltip>


      </Box>
    </Box>
  );

  return (
    <Box sx={{ maxWidth: 1100, width: '100%', mx: 'auto', pt: '25px', display: 'flex', flexDirection: 'column', gap: 3 }}>
      {sharedHeader}
      <Box ref={dashboardRef}>
        {tab === 'agents' ? (
          <AgentsDashboard
            {...host}
            orgId={orgId ?? undefined}
            days={parseInt(days, 10) || 30}
            gran={gran}
            customRange={customRange}
            onRangeSelect={(fromMs, toMs) => setCustomRange({ fromMs, toMs })}
            refreshKey={(refreshKeyProp ?? 0) + internalRefreshKey}
          />
        ) : tab === 'vulnerabilities' ? (
          <VulnerabilitiesDashboard
            {...host}
            orgId={orgId ?? undefined}
            days={parseInt(days, 10) || 30}
            gran={gran}
            customRange={customRange}
            onRangeSelect={(fromMs, toMs) => setCustomRange({ fromMs, toMs })}
            refreshKey={(refreshKeyProp ?? 0) + internalRefreshKey}
          />
        ) : tab === 'automation' ? (
          <AutomationDashboard
            {...host}
            orgId={orgId}
            displayName={displayName}
            headerLeft={headerLeft}
            days={days}
            onDaysChange={setDays}
            gran={gran}
            onGranChange={setGran}
            mode={mode}
            onModeChange={setMode}
            refreshKey={(refreshKeyProp ?? 0) + internalRefreshKey}
            hideRefresh
            customRange={customRange}
            onRangeSelect={(fromMs, toMs) => setCustomRange({ fromMs, toMs })}
          />
        ) : (
          <DashboardOverview
            {...host}
            incidents={eIncidents}
            incidentsLoading={eIncidentsLoading}
            vulnSeverityCounts={eVulns}
            vulnLoading={eVulnLoading}
            monitorHostCount={eHostCount}
            runningSensorCount={eSensorCount}
            monitorsLoading={eMonitorsLoading}
            days={parseInt(days, 10) || 30}
            gran={gran}
            customRange={customRange}
            onRangeSelect={(fromMs, toMs) => setCustomRange({ fromMs, toMs })}
            onOpenUsecase={(flowId) => setOpenUsecaseId(flowId)}
          />
        )}
      </Box>

      {/* Export progress — rendered OUTSIDE the captured node so it never
       *  ends up in the screenshots. */}
      {exporting && (
        <Box
          sx={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 10050,
            display: 'flex',
            alignItems: 'center',
            gap: 1.25,
            px: 2,
            py: 1.25,
            borderRadius: '10px',
            bgcolor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            boxShadow: '0 8px 24px hsl(var(--background) / 0.6)',
          }}
        >
          <CircularProgress size={16} sx={{ color: 'hsl(var(--primary))' }} />
          <Typography sx={{ fontSize: 13, color: 'hsl(var(--foreground))' }}>
            {exportStatus || 'Preparing PDF export…'}
          </Typography>
        </Box>
      )}

      {/* Inline usecase drawer — opens in-place from the Security Operations
       *  setup CTAs instead of redirecting to /usecases. Receives the SAME
       *  host props (globalUrl, userdata, isLoaded, isLoggedIn, theme) we
       *  thread through the rest of Shuffle-Core. */}
      <UsecaseDrawer
        open={openUsecaseId !== null}
        onClose={() => setOpenUsecaseId(null)}
        flowId={openUsecaseId}
        globalUrl={host.globalUrl}
        userdata={host.userdata}
        isLoaded={host.isLoaded}
        isLoggedIn={host.isLoggedIn}
        theme={host.theme as 'light' | 'dark' | 'system' | undefined}
      />
    </Box>
  );
};

export default CombinedDashboard;

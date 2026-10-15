/**
 * Signed-out /dashboard — the real dashboards and header bar, fed with
 * sample data so visitors can explore every view before signing in.
 */
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Box, Typography, Button } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from '@/lib/router-compat';
import {
  ExportReportDialog, REPORT_SECTIONS, buildSectionTable, buildDashboardPdf, captureNode,
  type DashboardTab, type ReportSectionId, type ReportTable,
} from '@/Shuffle-Core';
import { DATASTORE_CATEGORIES } from '@/Shuffle-Core/datastore';
import { DEFAULT_SLA_CONFIG } from '@/hooks/useSlaConfig';
import { DashboardOverview } from '@/components/dashboard/DashboardOverview';
import { AutomationDashboard } from '@/components/dashboard/AutomationDashboard';
import { AgentsDashboard } from '@/components/dashboard/AgentsDashboard';
import { VulnerabilitiesDashboard } from '@/components/dashboard/VulnerabilitiesDashboard';
import { DashboardHeaderBar } from '@/components/dashboard/DashboardHeaderBar';
import { SAMPLE_ORG_ID, buildSampleIncidents, buildSampleVulns, installDashboardSampleFetch } from '@/lib/dashboardSampleData';

const GuestDashboardPage = () => {
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<DashboardTab>('security');
  const [days, setDays] = useState('30');
  const [customRange, setCustomRange] = useState<{ fromMs: number; toMs: number } | null>(null);
  const [mode, setMode] = useState<'workflows' | 'apps'>('workflows');
  const [gran, setGran] = useState<'daily' | 'monthly'>('daily');
  const [refreshKey, setRefreshKey] = useState(0);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportStatus, setExportStatus] = useState('');
  const dashboardRef = useRef<HTMLDivElement>(null);

  // Answer dashboard API calls with sample data while this page is open.
  useLayoutEffect(() => {
    const restore = installDashboardSampleFetch();
    setReady(true);
    return () => {
      restore();
      // Do not leave sample workflows cached for after sign-in.
      queryClient.removeQueries({ queryKey: ['workflows'] });
    };
  }, [queryClient]);

  const incidents = useMemo(() => buildSampleIncidents(), []);
  const vulnSeverityCounts = useMemo(() => {
    const c = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const k of buildSampleVulns().keys) {
      const sev = JSON.parse(k.value).severity as keyof typeof c;
      c[sev] += 1;
    }
    return c;
  }, []);

  const dayCount = parseInt(days, 10) || 30;
  const onRangeSelect = (fromMs: number, toMs: number) => setCustomRange({ fromMs, toMs });
  const rangeLabel = customRange
    ? `${new Date(customRange.fromMs).toLocaleDateString()} - ${new Date(customRange.toMs).toLocaleDateString()}`
    : `Last ${dayCount} days`;

  // Same report as the signed-in dashboard export, built from the sample data.
  const handleExport = async (sections: ReportSectionId[]) => {
    setExportOpen(false);
    const originalTab = tab;
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const capture = async () => {
      if (!dashboardRef.current) return null;
      try { return await captureNode(dashboardRef.current); } catch { return null; }
    };
    try {
      let securityImage: string | null = null;
      let automationImage: string | null = null;
      const includeDashboards = sections.includes('dashboards');
      if (includeDashboards) {
        setExportStatus('Capturing Security Operations');
        setTab('security'); await wait(1500); securityImage = await capture();
        setExportStatus('Capturing Automation');
        setTab('automation'); await wait(1500); automationImage = await capture();
        setTab(originalTab);
      }
      const toMs = customRange ? customRange.toMs : Date.now();
      const fromMs = customRange ? customRange.fromMs : toMs - dayCount * 86_400_000;
      const userdata = {
        username: 'demo@shuffle.security',
        active_org: { id: SAMPLE_ORG_ID, name: 'Sample tenant', region: 'eu', subscription_type: 'Sample' },
      };
      const tables: ReportTable[] = [];
      for (const def of REPORT_SECTIONS) {
        if (def.id === 'dashboards' || !sections.includes(def.id)) continue;
        setExportStatus(`Loading ${def.label.toLowerCase()}`);
        try {
          const table = await buildSectionTable(def.id, {
            fromMs, toMs, orgId: SAMPLE_ORG_ID, userdata, incidentsCategory: DATASTORE_CATEGORIES.INCIDENTS,
          });
          if (table) tables.push(table);
        } catch (err) {
          tables.push({
            title: def.label,
            note: `This section could not be loaded: ${err instanceof Error ? err.message : 'unknown error'}.`,
            columns: [{ header: 'Status', width: 1 }],
            rows: [],
          });
        }
      }
      const byStatus: Record<string, number> = {};
      const bySeverity: Record<string, number> = {};
      incidents.forEach((i) => {
        byStatus[i.status] = (byStatus[i.status] || 0) + 1;
        bySeverity[i.severity] = (bySeverity[i.severity] || 0) + 1;
      });
      setExportStatus('Generating PDF');
      await buildDashboardPdf({
        securityImage, automationImage, includeStats: includeDashboards, tables,
        stats: {
          orgName: 'Sample tenant', rangeLabel,
          incidents: { total: incidents.length, byStatus, bySeverity },
          vulnerabilities: vulnSeverityCounts,
          monitors: { hostCount: 13, runningSensors: 4 },
        },
      });
    } finally {
      setExportStatus('');
    }
  };

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto', px: { xs: 2, md: 4 }, py: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap',
        p: 2.5, borderRadius: 2, border: '1px solid hsl(var(--border))', bgcolor: 'hsl(var(--card))',
      }}>
        <Box>
          <Typography sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>You are viewing sample data</Typography>
          <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))' }}>
            Sign in to see the dashboard for your own tenant.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" onClick={() => setExportOpen(true)} disabled={!!exportStatus} sx={{ height: 36, textTransform: 'none' }}>
            {exportStatus ? `${exportStatus}...` : 'Export report'}
          </Button>
          <Button component={Link} to="/login?view=/dashboard" variant="contained" sx={{ height: 36, textTransform: 'none' }}>
            Sign in
          </Button>
        </Box>
      </Box>

      <DashboardHeaderBar
        tab={tab}
        onTabChange={setTab}
        days={days}
        onDaysChange={setDays}
        customRange={customRange}
        onClearCustomRange={() => setCustomRange(null)}
        mode={mode}
        onModeChange={setMode}
        gran={gran}
        onGranChange={setGran}
        onRefresh={() => setRefreshKey(k => k + 1)}
      />

      <ExportReportDialog open={exportOpen} rangeLabel={rangeLabel} onClose={() => setExportOpen(false)} onExport={handleExport} />

      <Box ref={dashboardRef}>
      {ready && (tab === 'agents' ? (
        <AgentsDashboard orgId={SAMPLE_ORG_ID} days={dayCount} gran={gran} customRange={customRange} onRangeSelect={onRangeSelect} refreshKey={refreshKey} />
      ) : tab === 'vulnerabilities' ? (
        <VulnerabilitiesDashboard orgId={SAMPLE_ORG_ID} days={dayCount} gran={gran} customRange={customRange} onRangeSelect={onRangeSelect} refreshKey={refreshKey} />
      ) : tab === 'automation' ? (
        <AutomationDashboard
          orgId={SAMPLE_ORG_ID}
          displayName="Sample tenant"
          isLoaded
          isLoggedIn
          days={days}
          onDaysChange={setDays}
          gran={gran}
          onGranChange={setGran}
          mode={mode}
          onModeChange={setMode}
          refreshKey={refreshKey}
          hideRefresh
          customRange={customRange}
          onRangeSelect={onRangeSelect}
        />
      ) : (
        <DashboardOverview
          incidents={incidents}
          vulnSeverityCounts={vulnSeverityCounts}
          monitorHostCount={13}
          runningSensorCount={4}
          days={dayCount}
          gran={gran}
          customRange={customRange}
          onRangeSelect={onRangeSelect}
          slaTargets={DEFAULT_SLA_CONFIG}
        />
      ))}
      </Box>
    </Box>
  );
};

export default GuestDashboardPage;

import React, { useMemo, useEffect, useState } from 'react';
import { Box } from '@mui/material';
import { useAuth } from '@/context/AuthContext';
import { useDatastore } from '@/hooks/useDatastore';
import { DATASTORE_CATEGORIES } from '@/Shuffle-Core/datastore';
import { useVulnerabilities } from '@/hooks/useVulnerabilities';
import { useHostMonitorCount } from '@/hooks/useHostMonitorCount';
import { useSlaConfig } from '@/hooks/useSlaConfig';
import { useSlaControls } from '@/hooks/useSlaControls';
import { DashboardOverview } from '@/components/dashboard/DashboardOverview';
import {
  SAMPLE_HOST_COUNT,
  buildSampleIncidents,
  buildSampleVulns,
  installDashboardSampleFetch,
} from '@/lib/dashboardSampleData';

interface DocIncidentDashboardProps {
  title?: string;
  subtitle?: string;
  days?: number;
}

export const DocIncidentDashboard: React.FC<DocIncidentDashboardProps> = ({
  days = 30,
}) => {
  const { isAuthenticated } = useAuth();
  const [ready, setReady] = useState(isAuthenticated);
  const [customRange, setCustomRange] = useState<{ fromMs: number; toMs: number } | null>(null);

  React.useLayoutEffect(() => {
    if (isAuthenticated) {
      setReady(true);
      return;
    }
    const restore = installDashboardSampleFetch();
    setReady(true);
    return () => {
      restore();
    };
  }, [isAuthenticated]);
  const {
    items,
    isLoading: incidentsLoading,
    fetchItems,
    hasFetched,
    hasMore: incidentsHasMore,
  } = useDatastore({
    category: DATASTORE_CATEGORIES.INCIDENTS,
  });
  const { severityCounts: vulnSeverityCounts, isLoading: vulnLoading } = useVulnerabilities({
    tab: 'assets',
  });
  const hostMonitorCount = useHostMonitorCount();
  const slaConfig = useSlaConfig();
  const slaControls = useSlaControls();

  useEffect(() => {
    if (isAuthenticated && !hasFetched) {
      fetchItems();
    }
  }, [isAuthenticated, hasFetched, fetchItems]);

  const parsedIncidents = useMemo(() => {
    const out: { status: string; severity: string; createdTs: number }[] = [];
    const sevMap: Record<number, string> = {
      1: 'informational',
      2: 'low',
      3: 'medium',
      4: 'high',
      5: 'critical',
      6: 'critical',
    };
    const statusMap: Record<number, string> = {
      1: 'new',
      2: 'in_progress',
      3: 'resolved',
      4: 'on_hold',
    };
    const STATUS_SYNONYMS: Record<string, string> = {
      open: 'new',
      created: 'new',
      pending: 'new',
      reported: 'new',
      inprogress: 'in_progress',
      active: 'in_progress',
      investigating: 'in_progress',
      working: 'in_progress',
      assigned: 'in_progress',
      acknowledged: 'in_progress',
      closed: 'resolved',
      done: 'resolved',
      complete: 'resolved',
      completed: 'resolved',
      fixed: 'resolved',
      remediated: 'resolved',
      mitigated: 'resolved',
    };

    const normalizeTs = (t: unknown): number => {
      if (!t) return 0;
      const n = typeof t === 'string' ? Number(t) : typeof t === 'number' ? t : 0;
      if (!n || isNaN(n) || n <= 0) {
        if (typeof t === 'string') {
          const d = new Date(t).getTime();
          return isNaN(d) ? 0 : d;
        }
        return 0;
      }
      if (n < 1e12) return n * 1000;
      if (n < 1e15) return n;
      if (n < 1e18) return n / 1e3;
      return n / 1e6;
    };

    const seen = new Set<string>();
    for (const item of items) {
      try {
        if (!item.value || (typeof item.value === 'string' && item.value.length > 5_000_000)) {
          continue;
        }
        const data = typeof item.value === 'string' ? JSON.parse(item.value) : item.value;
        const customAttrs = data?.metadata?.extensions?.custom_attributes;
        const severityId = data?.severity_id;
        const severity = (data?.severity || sevMap[severityId] || 'medium')
          .toString()
          .toLowerCase();
        const rawStatus = (
          data?.status ||
          customAttrs?.status ||
          statusMap[data?.status_id] ||
          'new'
        )
          .toString()
          .toLowerCase()
          .trim()
          .replace(/[\s-]+/g, '_');
        const status =
          STATUS_SYNONYMS[rawStatus] ||
          STATUS_SYNONYMS[rawStatus.replace(/_/g, '')] ||
          rawStatus;
        const createdTs =
          normalizeTs(data?.created_time) || normalizeTs((item as { created?: number }).created);
        const dedupeKey = (item.key || '').includes('::')
          ? item.key.split('::').pop()!
          : item.key;
        if (dedupeKey && seen.has(dedupeKey)) continue;
        if (dedupeKey) seen.add(dedupeKey);
        out.push({ status, severity, createdTs });
      } catch {
        /* skip malformed items */
      }
    }
    return out;
  }, [items]);

  const sampleIncidents = useMemo(() => buildSampleIncidents(), []);
  const sampleVulnCounts = useMemo(() => {
    const c = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const k of buildSampleVulns().keys) {
      const sev = JSON.parse(k.value).severity as keyof typeof c;
      if (sev in c) c[sev] += 1;
    }
    return c;
  }, []);

  const useSample = !isAuthenticated;

  if (!ready) return null;

  return (
    <Box sx={{ my: 4, '& > .MuiBox-root': { mb: 0 } }}>
      <DashboardOverview
        incidents={useSample ? sampleIncidents : parsedIncidents}
        slaTargets={slaControls.incidentSlaEnabled ? slaConfig : undefined}
        sloTargetPercent={slaControls.sloEnabled ? slaControls.incidentSloPercent : undefined}
        sloSlaTargets={slaConfig}
        incidentsLoading={useSample ? false : incidentsLoading}
        incidentsHasMore={useSample ? false : incidentsHasMore}
        vulnSeverityCounts={useSample ? sampleVulnCounts : vulnSeverityCounts}
        vulnLoading={useSample ? false : vulnLoading}
        monitorHostCount={useSample ? SAMPLE_HOST_COUNT : (hostMonitorCount ?? 0)}
        runningSensorCount={useSample ? 4 : undefined}
        monitorsLoading={useSample ? false : hostMonitorCount === null}
        days={days}
        gran="daily"
        customRange={customRange}
        onRangeSelect={(fromMs, toMs) => setCustomRange({ fromMs, toMs })}
      />
    </Box>
  );
};

export default DocIncidentDashboard;

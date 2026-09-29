import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWebhookStatus } from '@/hooks/useWebhookStatus';
import { useEnrichmentStatus } from '@/hooks/useEnrichmentStatus';
import { useAssignEscalateStatus } from '@/hooks/useAssignEscalateStatus';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { getDatastoreByCategory, DATASTORE_CATEGORIES } from '@/Shuffle-MCPs/datastore';
import { seedDefaultIOCTypes } from '@/hooks/useIOCTypes';
import { seedDefaultThreatFeeds } from '@/hooks/useThreatFeeds';
import {
  fetchIncidentsCategoryConfig,
  hasSecurityRulesEnabled,
  enableIncidentSecurityRules,
  getActiveOrgId,
} from '@/lib/defaultIncidentConfig';
import { toast } from '@/lib/toast';
import { UsecaseDrawer } from '@/Shuffle-Core';
import { API_CONFIG } from '@/Shuffle-MCPs/api';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import {
  AutomationReadinessCard,
  ReadinessItem,
} from '@/components/common/AutomationReadinessCard';

export interface AutomationReadinessBannerProps {
  /**
   * Fires whenever readiness transitions between empty (0/4 active) and
   * non-empty. The page uses this to decide whether to render the banner at
   * the top of the feed or docked below the charts.
   */
  onEmptyChange?: (empty: boolean) => void;
  atTop?: boolean;
}

export const AutomationReadinessBanner = ({
  onEmptyChange,
  atTop,
}: AutomationReadinessBannerProps = {}) => {
  const isAdmin = useIsAdmin();
  const webhook = useWebhookStatus();
  const enrichment = useEnrichmentStatus();
  const assign = useAssignEscalateStatus();
  const { userInfo } = useAuth();
  const { resolvedTheme } = useTheme();

  const [usecaseId, setUsecaseId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [enablingAll, setEnablingAll] = useState(false);

  const [defaultsReady, setDefaultsReady] = useState<boolean | null>(null);
  const [defaultsParts, setDefaultsParts] = useState<{
    iocs: boolean;
    feeds: boolean;
    rules: boolean;
  } | null>(null);

  const checkDefaults = useCallback(async () => {
    try {
      const [iocs, feeds, cfg] = await Promise.all([
        getDatastoreByCategory(DATASTORE_CATEGORIES.IOCS),
        getDatastoreByCategory(DATASTORE_CATEGORIES.THREAT_FEEDS),
        fetchIncidentsCategoryConfig().catch(() => null),
      ]);
      const hasIocs = !!(iocs.success && (iocs.data?.length || 0) > 0);
      const hasFeeds = !!(feeds.success && (feeds.data?.length || 0) > 0);
      const hasRules = hasSecurityRulesEnabled(cfg);
      setDefaultsParts({ iocs: hasIocs, feeds: hasFeeds, rules: hasRules });
      setDefaultsReady(hasIocs && hasFeeds && hasRules);
    } catch {
      setDefaultsParts(null);
      setDefaultsReady(null);
    }
  }, []);

  const enableDefaults = useCallback(async () => {
    await Promise.allSettled([
      seedDefaultIOCTypes(),
      seedDefaultThreatFeeds(),
      enableIncidentSecurityRules(),
    ]);
    await checkDefaults();
  }, [checkDefaults]);

  useEffect(() => {
    if (isAdmin) checkDefaults();
  }, [isAdmin, checkDefaults]);

  const allActive = useMemo(
    () => (webhook.enabled || webhook.hasSources) && enrichment.active && assign.active && defaultsReady === true,
    [webhook.enabled, webhook.hasSources, enrichment.active, assign.active, defaultsReady],
  );

  const isLoading =
    webhook.isLoading || enrichment.isLoading || assign.isLoading || defaultsReady === null;

  // "Empty" = nothing configured at all, once every check has resolved.
  const isEmpty =
    !isLoading && !webhook.enabled && !webhook.hasSources && !enrichment.active && !assign.active && defaultsReady !== true;

  useEffect(() => {
    if (isLoading) return;
    onEmptyChange?.(isAdmin && isEmpty);
  }, [onEmptyChange, isAdmin, isEmpty, isLoading]);

  const wrap = useCallback(
    async (key: string, fn: () => Promise<unknown>, verb: 'Enabled' | 'Disabled') => {
      setBusy(key);
      try {
        await fn();
        toast.success(`${verb}: ${key}`);
      } catch (err) {
        console.error('[automation-readiness]', verb.toLowerCase(), 'failed', key, err);
        toast.error(`Failed to ${verb.toLowerCase().replace(/d$/, '')} ${key}`);
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  const handleEnableAll = useCallback(async () => {
    setEnablingAll(true);
    setBusy('Default config');
    try {
      // Default config ALWAYS runs (and is verified) first — the other three
      // depend on IOC types, threat feeds and security rules being in place.
      await enableDefaults();
      setBusy(null);

      const tasks: Promise<unknown>[] = [];
      if (!enrichment.active) tasks.push(enrichment.enable());
      if (!assign.active) tasks.push(assign.enable());
      if (!webhook.enabled) tasks.push(webhook.enable());
      await Promise.allSettled(tasks);
      toast.success('All critical automations enabled');
    } catch (err) {
      console.error('[automation-readiness] enable all failed', err);
      toast.error('Failed to enable some automations');
    } finally {
      setBusy(null);
      setEnablingAll(false);
    }
  }, [enableDefaults, enrichment, assign, webhook]);

  // First-ever load per tenant: auto-enable "Default config"
  const autoRanRef = useRef(false);
  useEffect(() => {
    if (!isAdmin || isLoading || autoRanRef.current) return;
    if (defaultsReady === true) return;
    if (webhook.enabled || enrichment.active || assign.active) return;

    const orgId = getActiveOrgId();
    if (!orgId) return;
    const key = `shuffle-default-config-autoseed::${orgId}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, new Date().toISOString());
    } catch {
      return;
    }

    autoRanRef.current = true;
    setBusy('Default config');
    void enableDefaults()
      .catch((err) => console.error('[automation-readiness] auto default config failed', err))
      .finally(() => setBusy(null));
  }, [isAdmin, isLoading, defaultsReady, webhook.enabled, enrichment.active, assign.active, enableDefaults]);

  if (!isAdmin) return null;

  const items: ReadinessItem[] = [
    {
      id: 'Ingestion',
      label: 'Ingestion',
      active: webhook.enabled || webhook.hasSources,
      loading: webhook.isLoading,
      busy: busy === 'Ingestion',
      tooltip: 'Pushes alerts directly into incidents via webhook URL',
      checks: [
        {
          label: 'Ingest sources connected',
          active: webhook.hasSources,
          detail: 'No source apps are configured in the "Ingest Tickets" workflow.',
        },
        {
          label: '"Ingestion Webhook" workflow exists',
          active: webhook.exists,
          detail: 'No workflow named "Ingestion Webhook" was found for this tenant.',
        },
        {
          label: 'Webhook URL generated',
          active: !!webhook.url,
          detail: 'The workflow has no webhook trigger, so there is no URL to send alerts to.',
        },
        {
          label: 'Webhook trigger running',
          active: webhook.enabled,
          detail: 'The webhook trigger exists but is stopped, so nothing is being ingested.',
        },
      ],
      onEnable: () => wrap('Ingestion', () => webhook.enable(), 'Enabled'),
      onDisable: () => wrap('Ingestion', () => webhook.disable(), 'Disabled'),
      onOpenUsecase: () => setUsecaseId('siem_case_management_1'),
    },
    {
      id: 'Enrichment',
      label: 'Enrichment',
      active: enrichment.active,
      loading: enrichment.isLoading || enrichment.isEnabling,
      busy: busy === 'Enrichment',
      tooltip: 'Threat feeds + IOC extraction + Enrich automation',
      checks: enrichment.checks?.map((c) => ({
        label: c.orgId ? `${c.label} (tenant ${c.orgId.slice(0, 8)})` : c.label,
        active: c.active,
        detail: c.detail,
      })),
      onEnable: () => wrap('Enrichment', () => enrichment.enable(), 'Enabled'),
      onDisable: () => wrap('Enrichment', () => enrichment.disable(), 'Disabled'),
      onOpenUsecase: () => setUsecaseId('threat_intel_case_management_1'),
    },
    {
      id: 'Assign & Escalate',
      label: 'Assign & Escalate',
      active: assign.active,
      loading: assign.isLoading,
      busy: busy === 'Assign & Escalate',
      tooltip: 'Routes incidents to the on-call analyst and escalates',
      checks: assign.checks?.map((c) => ({
        label: c.orgId ? `${c.label} (tenant ${c.orgId.slice(0, 8)})` : c.label,
        active: c.active,
        detail: c.detail,
      })),
      onEnable: () => wrap('Assign & Escalate', () => assign.enable(), 'Enabled'),
      onDisable: () => wrap('Assign & Escalate', () => assign.disable(), 'Disabled'),
      onOpenUsecase: () => setUsecaseId('case_management_assign_escalate_1'),
    },
    {
      id: 'Default config',
      label: 'Default config',
      active: defaultsReady === true,
      loading: defaultsReady === null,
      busy: busy === 'Default config',
      tooltip: 'Default IOC types, threat feeds and incident security rules',
      checks: defaultsParts
        ? [
            {
              label: 'Default IOC types seeded',
              active: defaultsParts.iocs,
              detail: 'No IOC types found in the datastore.',
            },
            {
              label: 'Default threat feeds seeded',
              active: defaultsParts.feeds,
              detail: 'No threat feeds found in the datastore.',
            },
            {
              label: 'Security Rules enabled',
              active: defaultsParts.rules,
              detail: 'The Security Rules automation is disabled or has no rule set.',
            },
          ]
        : undefined,
      onEnable: () => wrap('Default config', () => enableDefaults(), 'Enabled'),
    },
  ];

  return (
    <>
      <AutomationReadinessCard
        title="Automation Readiness"
        items={items}
        allActive={allActive}
        isLoading={isLoading}
        isEnablingAll={enablingAll}
        onEnableAll={handleEnableAll}
        enableAllLabel="Enable all"
        atTop={atTop}
      />
      <UsecaseDrawer
        open={!!usecaseId}
        onClose={() => setUsecaseId(null)}
        flowId={usecaseId}
        globalUrl={API_CONFIG.baseUrl}
        userdata={userInfo as any}
        isLoaded={true}
        isLoggedIn={!!userInfo}
        theme={resolvedTheme}
      />
    </>
  );
};

export default AutomationReadinessBanner;

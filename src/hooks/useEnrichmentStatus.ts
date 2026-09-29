import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useWorkflows, useWorkflowsMulti, WorkflowSummary } from './useWorkflows';
import { CategoryAutomation, CategoryConfig, DATASTORE_CATEGORIES } from '@/Shuffle-Core/datastore';
import { getApiUrl, getAuthHeader } from '@/Shuffle-Core/api';

export interface EnrichmentStatusCheck {
  label: string;
  active: boolean;
  /** Technical detail explaining exactly what was checked and the observed
   *  result. Surfaced to support users in tooltips. */
  detail: string;
  /** When the check is scoped to a specific tenant (multi-org mode), the
   *  tenant id that produced the result. */
  orgId?: string;
}

export interface EnrichmentStatus {
  /** Overall: all conditions are met across every scoped tenant */
  active: boolean;
  /** Individual check results */
  checks: EnrichmentStatusCheck[];
  /** Whether data is still loading */
  isLoading: boolean;
  /** Enable all enrichment components (across every inactive scoped tenant) */
  enable: () => Promise<void>;
  /** Disable enrichment (across every scoped tenant) */
  disable: () => Promise<void>;
  /** Whether an enable/disable action is in progress */
  isEnabling: boolean;
  /** The current enable/disable action, used for accurate loading copy */
  action: 'enable' | 'disable' | null;
  /** Whether a disable action is in progress */
  isDisabling: boolean;
  /** Tenants currently missing enrichment (multi-org mode only) */
  inactiveOrgIds: string[];
}

const THREAT_FEEDS_WORKFLOW = 'Enable Threat feeds';
const IOC_EXTRACTION_WORKFLOW = 'Realtime IOC extraction';

const CATEGORY_CONFIG_CACHE_KEY = 'shuffle-enrichment-category-config';

const readCachedCategoryConfig = (orgId: string | null): CategoryConfig | null => {
  if (!orgId) return null;
  try {
    const raw = localStorage.getItem(`${CATEGORY_CONFIG_CACHE_KEY}::${orgId}`);
    return raw ? (JSON.parse(raw) as CategoryConfig) : null;
  } catch {
    return null;
  }
};

const writeCachedCategoryConfig = (orgId: string | null, cfg: CategoryConfig | null) => {
  if (!orgId || !cfg) return;
  try {
    localStorage.setItem(`${CATEGORY_CONFIG_CACHE_KEY}::${orgId}`, JSON.stringify(cfg));
  } catch {
    /* ignore quota */
  }
};

const getActiveOrgId = (): string | null => {
  try {
    const info = localStorage.getItem('shuffle_user_info');
    return info ? JSON.parse(info)?.active_org?.id ?? null : null;
  } catch { return null; }
};

/**
 * Fetch the category config for shuffle-security_incidents.
 * Throws on transport / non-OK responses so react-query can retry.
 * Falls back to the last cached config when the request can't be made
 * (e.g. no org id available).
 */
const fetchIncidentsCategoryConfig = async (orgIdArg?: string): Promise<CategoryConfig | null> => {
  const orgId = orgIdArg || getActiveOrgId();
  if (!orgId) return readCachedCategoryConfig(orgId);

  const url = getApiUrl(
    `/api/v1/orgs/${orgId}/list_cache?category=${encodeURIComponent(DATASTORE_CATEGORIES.INCIDENTS)}&top=1`,
  );
  const headers: Record<string, string> = { ...getAuthHeader() };
  if (orgIdArg) headers['Org-Id'] = orgIdArg;
  const res = await fetch(url, {
    credentials: 'include',
    headers,
  });
  if (!res.ok) {
    throw new Error(`list_cache responded with ${res.status}`);
  }
  const data = await res.json();
  const cfg = (data?.category_config as CategoryConfig | undefined) || null;
  if (cfg) writeCachedCategoryConfig(orgId, cfg);
  return cfg;
};

interface OrgEnrichmentDetails {
  hasThreatFeeds: boolean;
  hasIOCExtraction: boolean;
  hasEnrichEnabled: boolean;
  tfDetail: string;
  iocDetail: string;
  enrichDetail: string;
}

const computeOrgDetails = (
  workflows: WorkflowSummary[] | undefined,
  categoryConfig: CategoryConfig | null,
): OrgEnrichmentDetails => {
  const tfMatch = workflows?.find((w) => w.name === THREAT_FEEDS_WORKFLOW);
  const iocMatch = workflows?.find((w) => w.name === IOC_EXTRACTION_WORKFLOW);
  const automations: CategoryAutomation[] = categoryConfig?.automations || [];
  const enrichAutomation = automations.find(
    (a) => a.type === 'enrich' || a.name === 'Enrich',
  );

  const wfId = (w: { id?: string } | undefined) => (w?.id ? ` (id: ${w.id})` : '');
  const tfDetail = !tfMatch
    ? `No workflow named "${THREAT_FEEDS_WORKFLOW}" found in /api/v1/workflows for this tenant.`
    : tfMatch.background_processing === true
      ? `Workflow "${THREAT_FEEDS_WORKFLOW}" found with background_processing=true${wfId(tfMatch as { id?: string })}.`
      : `Workflow "${THREAT_FEEDS_WORKFLOW}" found but background_processing=${String((tfMatch as { background_processing?: boolean }).background_processing)}${wfId(tfMatch as { id?: string })}. Re-generate via /api/v2/workflows/generate to flip it on.`;

  const iocDetail = !iocMatch
    ? `No workflow named "${IOC_EXTRACTION_WORKFLOW}" found in /api/v1/workflows for this tenant.`
    : iocMatch.background_processing === true
      ? `Workflow "${IOC_EXTRACTION_WORKFLOW}" found with background_processing=true${wfId(iocMatch as { id?: string })}.`
      : `Workflow "${IOC_EXTRACTION_WORKFLOW}" found but background_processing=${String((iocMatch as { background_processing?: boolean }).background_processing)}${wfId(iocMatch as { id?: string })}. Re-generate via /api/v2/workflows/generate to flip it on.`;

  const hasThreatFeeds = !!tfMatch && tfMatch.background_processing === true;
  const hasIOCExtraction = !!iocMatch && iocMatch.background_processing === true;

  const categoryConfigMissing = !categoryConfig;
  const assumeEnrichFromWorkflows =
    categoryConfigMissing && hasThreatFeeds && hasIOCExtraction;
  const hasEnrichEnabled = assumeEnrichFromWorkflows
    ? true
    : !!enrichAutomation?.enabled;

  const enrichDetail = categoryConfigMissing
    ? assumeEnrichFromWorkflows
      ? `category_config not returned by /list_cache?category=${DATASTORE_CATEGORIES.INCIDENTS} (tenant has no incidents yet). Both background workflows are present, so Enrich automation is assumed Active.`
      : `category_config not returned by /list_cache?category=${DATASTORE_CATEGORIES.INCIDENTS} (tenant may not have any incidents yet, or the request failed).`
    : !enrichAutomation
      ? `category_config.automations on "${DATASTORE_CATEGORIES.INCIDENTS}" has no entry with type="enrich" or name="Enrich".`
      : enrichAutomation.enabled
        ? `Automation "${enrichAutomation.name || enrichAutomation.type}" on "${DATASTORE_CATEGORIES.INCIDENTS}" has enabled=true.`
        : `Automation "${enrichAutomation.name || enrichAutomation.type}" on "${DATASTORE_CATEGORIES.INCIDENTS}" exists but enabled=false.`;

  return {
    hasThreatFeeds,
    hasIOCExtraction,
    hasEnrichEnabled,
    tfDetail,
    iocDetail,
    enrichDetail,
  };
};

const runEnableForOrg = async (
  orgId: string | undefined,
): Promise<{ threatFeedsId: string | null }> => {
  const headers: Record<string, string> = { ...getAuthHeader(), 'Content-Type': 'application/json' };
  if (orgId) headers['Org-Id'] = orgId;
  const [r1, r2] = await Promise.all([
    fetch(getApiUrl('/api/v2/workflows/generate'), {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify({ label: 'Enable Threat feeds' }),
    }),
    fetch(getApiUrl('/api/v2/workflows/generate'), {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify({ label: 'Enable Threat feeds_webhook' }),
    }),
  ]);
  const parseId = async (res: Response): Promise<string | null> => {
    try {
      if (!res.ok) return null;
      const data = await res.json();
      return data?.id || data?.workflow_id || null;
    } catch {
      return null;
    }
  };
  const threatFeedsId = await parseId(r1);
  const webhookId = await parseId(r2);
  // Kick threat feeds immediately so ingestion starts.
  if (threatFeedsId) {
    try {
      const execHeaders: Record<string, string> = { ...getAuthHeader(), 'Content-Type': 'application/json' };
      if (orgId) execHeaders['Org-Id'] = orgId;
      await fetch(getApiUrl(`/api/v1/workflows/${threatFeedsId}/execute`), {
        method: 'POST',
        credentials: 'include',
        headers: execHeaders,
        body: JSON.stringify({ execution_source: 'enrichment-enable', start: '' }),
      });
    } catch (err) {
      console.warn('[enrichment] force-run Enable Threat feeds failed', err);
    }
  }
  void webhookId;
  return { threatFeedsId };
};

const runDisableForOrg = async (orgId: string | undefined): Promise<void> => {
  const headers: Record<string, string> = { ...getAuthHeader(), 'Content-Type': 'application/json' };
  if (orgId) headers['Org-Id'] = orgId;
  await Promise.all([
    fetch(getApiUrl('/api/v2/workflows/generate'), {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify({ label: 'Enable Threat feeds', action_name: 'disable' }),
    }),
    fetch(getApiUrl('/api/v2/workflows/generate'), {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify({ label: 'Enable Threat feeds_webhook', action_name: 'disable' }),
    }),
  ]);
};

/**
 * Check if automatic enrichment is fully active.
 *
 * Three conditions must ALL be true (per scoped tenant):
 * 1. A background_processing workflow named "Enable Threat feeds" exists
 * 2. A background_processing workflow named "Realtime IOC extraction" exists
 * 3. The "shuffle-security_incidents" category has the "Enrich" automation enabled
 *
 * @param categoryConfigOverride - Optionally pass an already-loaded CategoryConfig
 *   to avoid a redundant fetch. Ignored when `options.orgIds` is provided.
 * @param options.orgIds - When provided, validate enrichment across each of
 *   these tenants (used on incidents that live in multiple tenants). The
 *   status is Active only when every listed tenant is Active. `enable()` runs
 *   against every inactive tenant.
 */
export const useEnrichmentStatus = (
  categoryConfigOverride?: CategoryConfig | null,
  options?: { orgIds?: string[] },
): EnrichmentStatus => {
  const orgIds = useMemo(
    () => Array.from(new Set((options?.orgIds || []).filter(Boolean))),
    [options?.orgIds],
  );
  const multi = orgIds.length > 0;

  // ── Single-org (default) mode ────────────────────────────────────────
  const { data: singleWorkflows, isLoading: singleWfLoading, refetch: refetchSingleWorkflows } = useWorkflows();
  const queryClient = useQueryClient();
  const [pendingAction, setPendingAction] = useState<'enable' | 'disable' | null>(null);
  const [optimistic, setOptimistic] = useState<boolean | null>(null);

  const { data: fetchedConfig, isLoading: singleCfgLoading, isError: cfgError } = useQuery<CategoryConfig | null>({
    queryKey: ['enrichment-category-config'],
    queryFn: () => fetchIncidentsCategoryConfig(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: !multi && categoryConfigOverride === undefined,
    retry: 4,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });

  const resolvedFetched = useMemo<CategoryConfig | null>(() => {
    if (fetchedConfig) return fetchedConfig;
    if (cfgError) return readCachedCategoryConfig(getActiveOrgId());
    return fetchedConfig ?? null;
  }, [fetchedConfig, cfgError]);

  // ── Multi-org mode ──────────────────────────────────────────────────
  const { byOrg: multiWorkflows, isLoading: multiWfLoading, refetchAll: refetchMultiWorkflows } = useWorkflowsMulti(multi ? orgIds : []);
  const multiCfgQueries = useQueries({
    queries: (multi ? orgIds : []).map((oid) => ({
      queryKey: ['enrichment-category-config', oid],
      queryFn: () => fetchIncidentsCategoryConfig(oid),
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 2,
    })),
  });
  const multiCfgByOrg = useMemo(() => {
    const map: Record<string, CategoryConfig | null> = {};
    (multi ? orgIds : []).forEach((oid, idx) => {
      const q = multiCfgQueries[idx];
      map[oid] = (q?.data as CategoryConfig | null | undefined) || (q?.isError ? readCachedCategoryConfig(oid) : null);
    });
    return map;
  }, [multi, orgIds, multiCfgQueries]);
  const multiCfgLoading = multi && multiCfgQueries.some((q) => q.isLoading);

  const isLoading = multi
    ? (multiWfLoading || multiCfgLoading)
    : (singleWfLoading || (categoryConfigOverride === undefined && singleCfgLoading));

  const refetchAll = useCallback(async () => {
    if (multi) {
      await Promise.allSettled([
        refetchMultiWorkflows(),
        ...orgIds.map((oid) =>
          queryClient.invalidateQueries({ queryKey: ['enrichment-category-config', oid] }),
        ),
      ]);
    } else {
      await Promise.allSettled([
        refetchSingleWorkflows(),
        queryClient.invalidateQueries({ queryKey: ['enrichment-category-config'] }),
      ]);
    }
  }, [multi, orgIds, refetchMultiWorkflows, refetchSingleWorkflows, queryClient]);

  // Per-org details (multi) OR single-org aggregated details.
  const perOrgDetails = useMemo<Array<{ orgId: string; details: OrgEnrichmentDetails }>>(() => {
    if (multi) {
      return orgIds.map((oid) => ({
        orgId: oid,
        details: computeOrgDetails(multiWorkflows[oid], multiCfgByOrg[oid] || null),
      }));
    }
    const categoryConfig =
      categoryConfigOverride !== undefined ? categoryConfigOverride : resolvedFetched;
    return [{ orgId: '', details: computeOrgDetails(singleWorkflows, categoryConfig) }];
  }, [multi, orgIds, multiWorkflows, multiCfgByOrg, singleWorkflows, categoryConfigOverride, resolvedFetched]);

  const inactiveOrgIds = useMemo(() => {
    if (!multi) return [];
    return perOrgDetails
      .filter(({ details }) => !(details.hasThreatFeeds && details.hasIOCExtraction && details.hasEnrichEnabled))
      .map(({ orgId }) => orgId);
  }, [multi, perOrgDetails]);

  const computedActive = useMemo(() => {
    return perOrgDetails.every(({ details }) =>
      details.hasThreatFeeds && details.hasIOCExtraction && details.hasEnrichEnabled,
    );
  }, [perOrgDetails]);

  // Keeps the newest computed value readable from inside async polling loops.
  const computedActiveRef = useRef(computedActive);
  useEffect(() => { computedActiveRef.current = computedActive; }, [computedActive]);

  /**
   * Workflow generation is not instant server-side, so re-check a few times
   * instead of assuming success. If the target state never materialises we
   * drop the optimistic flag right away rather than showing a green row that
   * silently flips back minutes later.
   */
  const pollUntil = useCallback(async (target: boolean) => {
    for (let i = 0; i < 8; i++) {
      await refetchAll();
      if (computedActiveRef.current === target) return true;
      await new Promise((r) => setTimeout(r, 3000));
    }
    await refetchAll();
    return computedActiveRef.current === target;
  }, [refetchAll]);


  const enable = useCallback(async () => {
    setOptimistic(true);
    setPendingAction('enable');
    try {
      if (multi) {
        // Only enable in tenants that are currently inactive.
        const targets = inactiveOrgIds.length > 0 ? inactiveOrgIds : orgIds;
        await Promise.all(targets.map((oid) => runEnableForOrg(oid)));
      } else {
        await runEnableForOrg(undefined);
      }
      const ok = await pollUntil(true);
      if (!ok) {
        setOptimistic(null);
        throw new Error('Enrichment did not become active after enabling');
      }
    } catch (err) {
      setOptimistic(null);
      throw err;
    } finally {
      setPendingAction(null);
    }
  }, [multi, inactiveOrgIds, orgIds, pollUntil]);

  const disable = useCallback(async () => {
    setOptimistic(false);
    setPendingAction('disable');
    try {
      if (multi) {
        await Promise.all(orgIds.map((oid) => runDisableForOrg(oid)));
      } else {
        await runDisableForOrg(undefined);
      }
      const ok = await pollUntil(false);
      if (!ok) {
        setOptimistic(null);
        throw new Error('Enrichment is still active after disabling');
      }
    } catch (err) {
      setOptimistic(null);
      throw err;
    } finally {
      setPendingAction(null);
    }
  }, [multi, orgIds, pollUntil]);

  // Reconcile optimistic override once server-side state matches.
  useEffect(() => {
    if (optimistic === null) return;
    if (computedActive === optimistic) {
      setOptimistic(null);
      return;
    }
    if (pendingAction !== null) return;
    const t = setTimeout(() => setOptimistic(null), 15000);
    return () => clearTimeout(t);
  }, [optimistic, computedActive, pendingAction]);


  const checks = useMemo<EnrichmentStatusCheck[]>(() => {
    if (!multi) {
      const d = perOrgDetails[0]?.details;
      if (!d) return [];
      return [
        { label: 'Threat feeds', active: d.hasThreatFeeds, detail: d.tfDetail },
        { label: 'IOC extraction', active: d.hasIOCExtraction, detail: d.iocDetail },
        { label: 'Enrich automation', active: d.hasEnrichEnabled, detail: d.enrichDetail },
      ];
    }
    // In multi-org mode surface one row per tenant per check so support can
    // see exactly which tenant is missing what.
    const out: EnrichmentStatusCheck[] = [];
    for (const { orgId, details } of perOrgDetails) {
      out.push({ label: `Threat feeds (${orgId.slice(0, 8)})`, active: details.hasThreatFeeds, detail: details.tfDetail, orgId });
      out.push({ label: `IOC extraction (${orgId.slice(0, 8)})`, active: details.hasIOCExtraction, detail: details.iocDetail, orgId });
      out.push({ label: `Enrich automation (${orgId.slice(0, 8)})`, active: details.hasEnrichEnabled, detail: details.enrichDetail, orgId });
    }
    return out;
  }, [multi, perOrgDetails]);

  return {
    active: optimistic !== null ? optimistic : computedActive,
    checks,
    isLoading,
    enable,
    disable,
    isEnabling: pendingAction !== null,
    action: pendingAction,
    isDisabling: pendingAction === 'disable',
    inactiveOrgIds,
  };
};

/**
 * Standalone (non-hook) helper to check enrichment status from raw data.
 * Useful in contexts where hooks can't be called.
 */
export const checkEnrichmentStatus = (
  workflows: Array<{ name: string; background_processing?: boolean }>,
  categoryConfig: CategoryConfig | null | undefined,
): { active: boolean; checks: EnrichmentStatusCheck[] } => {
  const hasThreatFeeds = workflows.some(
    (w) => w.name === THREAT_FEEDS_WORKFLOW && w.background_processing === true,
  );
  const hasIOCExtraction = workflows.some(
    (w) => w.name === IOC_EXTRACTION_WORKFLOW && w.background_processing === true,
  );
  const automations: CategoryAutomation[] = categoryConfig?.automations || [];
  const enrichAutomation = automations.find(
    (a) => a.type === 'enrich' || a.name === 'Enrich',
  );
  const categoryConfigMissing = !categoryConfig;
  const assumeEnrichFromWorkflows =
    categoryConfigMissing && hasThreatFeeds && hasIOCExtraction;
  const hasEnrichEnabled = assumeEnrichFromWorkflows
    ? true
    : !!enrichAutomation?.enabled;

  const enrichDetail = assumeEnrichFromWorkflows
    ? `category_config not returned (no incidents yet). Both background workflows present — Enrich automation assumed Active.`
    : hasEnrichEnabled
      ? `Enrich automation enabled on "${DATASTORE_CATEGORIES.INCIDENTS}".`
      : `Enrich automation missing or disabled on "${DATASTORE_CATEGORIES.INCIDENTS}".`;

  const checks: EnrichmentStatusCheck[] = [
    { label: 'Threat feeds', active: hasThreatFeeds, detail: hasThreatFeeds ? `Workflow "${THREAT_FEEDS_WORKFLOW}" found with background_processing=true.` : `Workflow "${THREAT_FEEDS_WORKFLOW}" missing or background_processing!=true.` },
    { label: 'IOC extraction', active: hasIOCExtraction, detail: hasIOCExtraction ? `Workflow "${IOC_EXTRACTION_WORKFLOW}" found with background_processing=true.` : `Workflow "${IOC_EXTRACTION_WORKFLOW}" missing or background_processing!=true.` },
    { label: 'Enrich automation', active: hasEnrichEnabled, detail: enrichDetail },
  ];

  return {
    active: hasThreatFeeds && hasIOCExtraction && hasEnrichEnabled,
    checks,
  };
};

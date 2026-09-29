/**
 * useThreatIntelAutomationStatus — the single source of truth for whether
 * threat intelligence automations and catalogs are operational.
 *
 * Mirrors `useVulnerabilityAutomationStatus` and `AutomationReadinessBanner`,
 * providing standard readiness checks for "IOC feeds" and "Enrichment" usecases.
 *
 * Checks:
 *  1. Threat Feed Ingestion   — "Enable Threat feeds" workflow exists and runs in background
 *  2. Realtime IOC Extraction — "Realtime IOC extraction" workflow exists and runs in background
 *  3. Incident Enrichment     — "enrich" automation enabled on incidents datastore
 *  4. Default Catalog & Feeds — Default IOC types and threat feeds seeded in datastore
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useEnrichmentStatus } from '@/hooks/useEnrichmentStatus';
import { useWorkflows } from '@/hooks/useWorkflows';
import { getDatastoreByCategory, DATASTORE_CATEGORIES } from '@/Shuffle-Core/datastore';
import { seedDefaultIOCTypes } from '@/hooks/useIOCTypes';
import { seedDefaultThreatFeeds } from '@/hooks/useThreatFeeds';
import { getApiUrl, getAuthHeader } from '@/Shuffle-Core/api';
import { toast } from '@/lib/toast';

export type ThreatIntelCheckKey =
  | 'feed_ingestion'
  | 'ioc_extraction'
  | 'incident_enrichment'
  | 'catalog_defaults';

export interface ThreatIntelCheckPart {
  label: string;
  active: boolean;
  detail?: string;
}

export interface ThreatIntelCheck {
  key: ThreatIntelCheckKey;
  label: string;
  tooltip: string;
  active: boolean;
  parts?: ThreatIntelCheckPart[];
  busy: boolean;
  enable: () => Promise<void>;
  disable?: () => Promise<void>;
  usecaseId?: string;
}

export interface ThreatIntelAutomationStatus {
  checks: ThreatIntelCheck[];
  allActive: boolean;
  isLoading: boolean;
  isEnablingAll: boolean;
  enableAll: () => Promise<void>;
  refresh: () => Promise<void>;
}

export const useThreatIntelAutomationStatus = (): ThreatIntelAutomationStatus => {
  const queryClient = useQueryClient();
  const enrichment = useEnrichmentStatus();
  const { data: workflows = [], refetch: refetchWorkflows } = useWorkflows();

  const [defaultsReady, setDefaultsReady] = useState<boolean | null>(null);
  const [defaultsParts, setDefaultsParts] = useState<{ iocs: boolean; feeds: boolean } | null>(null);
  const [busyKey, setBusyKey] = useState<ThreatIntelCheckKey | null>(null);
  const [isEnablingAll, setIsEnablingAll] = useState(false);
  const [optimistic, setOptimistic] = useState<Partial<Record<ThreatIntelCheckKey, boolean>>>({});

  const checkDatastores = useCallback(async () => {
    try {
      const [iocs, feeds] = await Promise.all([
        getDatastoreByCategory(DATASTORE_CATEGORIES.IOCS),
        getDatastoreByCategory(DATASTORE_CATEGORIES.THREAT_FEEDS),
      ]);
      const hasIocs = !!(iocs.success && (iocs.data?.length || 0) > 0);
      const hasFeeds = !!(feeds.success && (feeds.data?.length || 0) > 0);
      setDefaultsParts({ iocs: hasIocs, feeds: hasFeeds });
      setDefaultsReady(hasIocs && hasFeeds);
    } catch {
      setDefaultsParts(null);
      setDefaultsReady(null);
    }
  }, []);

  useEffect(() => {
    checkDatastores();
  }, [checkDatastores]);

  const refresh = useCallback(async () => {
    await Promise.allSettled([
      refetchWorkflows(),
      checkDatastores(),
      queryClient.invalidateQueries({ queryKey: ['enrichment-category-config'] }),
    ]);
  }, [refetchWorkflows, checkDatastores, queryClient]);

  const tfWf = useMemo(
    () => workflows.find((w) => w.name === 'Enable Threat feeds'),
    [workflows],
  );
  const iocWf = useMemo(
    () => workflows.find((w) => w.name === 'Realtime IOC extraction'),
    [workflows],
  );

  const tfActive = tfWf ? tfWf.background_processing === true : false;
  const iocActive = iocWf ? iocWf.background_processing === true : false;

  const enrichCheck = enrichment.checks.find((c) => c.label.toLowerCase().includes('enrich'));
  const enrichActive = enrichCheck ? enrichCheck.active : enrichment.active;

  const runToggleWorkflow = useCallback(
    async (
      key: ThreatIntelCheckKey,
      next: boolean,
      label: string,
      additionalLabels: string[] = [],
    ) => {
      setBusyKey(key);
      setOptimistic((prev) => ({ ...prev, [key]: next }));
      try {
        const labelsToToggle = [label, ...additionalLabels];
        await Promise.all(
          labelsToToggle.map((lbl) =>
            fetch(getApiUrl('/api/v2/workflows/generate'), {
              method: 'POST',
              credentials: 'include',
              headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
              body: JSON.stringify({
                label: lbl,
                ...(next ? {} : { action_name: 'disable' }),
              }),
            }),
          ),
        );
        toast.success(`${next ? 'Enabled' : 'Disabled'} ${label}`);
        await new Promise((r) => setTimeout(r, 1200));
        await refresh();
      } catch (err) {
        console.error(`[threat-intel] failed to toggle ${label}`, err);
        toast.error(`Failed to ${next ? 'enable' : 'disable'} ${label}`);
      } finally {
        setBusyKey(null);
        setOptimistic((prev) => {
          const copy = { ...prev };
          delete copy[key];
          return copy;
        });
      }
    },
    [refresh],
  );

  const toggleFeedIngestion = useCallback(
    async (next: boolean) => {
      await runToggleWorkflow(
        'feed_ingestion',
        next,
        'Enable Threat feeds',
        ['Enable Threat feeds_webhook'],
      );
    },
    [runToggleWorkflow],
  );

  const toggleIocExtraction = useCallback(
    async (next: boolean) => {
      await runToggleWorkflow(
        'ioc_extraction',
        next,
        'Realtime IOC extraction',
      );
    },
    [runToggleWorkflow],
  );

  const toggleIncidentEnrichment = useCallback(
    async (next: boolean) => {
      setBusyKey('incident_enrichment');
      setOptimistic((prev) => ({ ...prev, incident_enrichment: next }));
      try {
        if (next) {
          await enrichment.enable();
          toast.success('Enabled Incident Enrichment');
        } else {
          await enrichment.disable();
          toast.success('Disabled Incident Enrichment');
        }
        await new Promise((r) => setTimeout(r, 1000));
        await refresh();
      } catch (err) {
        console.error('[threat-intel] failed to toggle enrichment', err);
        toast.error(`Failed to ${next ? 'enable' : 'disable'} Incident Enrichment`);
      } finally {
        setBusyKey(null);
        setOptimistic((prev) => {
          const copy = { ...prev };
          delete copy.incident_enrichment;
          return copy;
        });
      }
    },
    [enrichment, refresh],
  );

  const enableDefaults = useCallback(async () => {
    setBusyKey('catalog_defaults');
    setOptimistic((prev) => ({ ...prev, catalog_defaults: true }));
    try {
      await Promise.allSettled([
        seedDefaultIOCTypes(),
        seedDefaultThreatFeeds(),
      ]);
      toast.success('Default IOC types and threat feeds seeded');
      await checkDatastores();
    } catch (err) {
      console.error('[threat-intel] failed to seed defaults', err);
      toast.error('Failed to seed default catalog & feeds');
    } finally {
      setBusyKey(null);
      setOptimistic((prev) => {
        const copy = { ...prev };
        delete copy.catalog_defaults;
        return copy;
      });
    }
  }, [checkDatastores]);

  const enableAll = useCallback(async () => {
    setIsEnablingAll(true);
    try {
      await Promise.allSettled([
        seedDefaultIOCTypes(),
        seedDefaultThreatFeeds(),
      ]);
      await enrichment.enable();
      toast.success('All threat intelligence automations enabled');
      await new Promise((r) => setTimeout(r, 1500));
      await refresh();
    } catch (err) {
      console.error('[threat-intel] enable all failed', err);
      toast.error('Failed to enable some threat intelligence automations');
    } finally {
      setIsEnablingAll(false);
    }
  }, [enrichment, refresh]);

  const isResolved = (key: ThreatIntelCheckKey, real: boolean) =>
    optimistic[key] !== undefined ? !!optimistic[key] : real;

  const checks = useMemo<ThreatIntelCheck[]>(() => {
    const feedsActive = isResolved('feed_ingestion', tfActive);
    const extractionActive = isResolved('ioc_extraction', iocActive);
    const enrichmentActive = isResolved('incident_enrichment', enrichActive);
    const defaultsActive = isResolved('catalog_defaults', defaultsReady === true);

    return [
      {
        key: 'feed_ingestion',
        label: 'Threat feed ingestion',
        tooltip: 'Pulls external IOC feeds (OSINT, ISACs) into Shuffle datastores on a recurring schedule',
        active: feedsActive,
        busy: busyKey === 'feed_ingestion',
        usecaseId: 'threat_intel_ingest_1',
        parts: [
          {
            label: 'Workflow "Enable Threat feeds" exists',
            active: !!tfWf,
            detail: tfWf ? `Found workflow "${tfWf.name}"` : 'Workflow not found',
          },
          {
            label: 'Scheduled background processing active',
            active: !!tfWf?.background_processing,
            detail: tfWf?.background_processing ? 'Background schedule active' : 'Schedule stopped',
          },
        ],
        enable: () => toggleFeedIngestion(true),
        disable: () => toggleFeedIngestion(false),
      },
      {
        key: 'ioc_extraction',
        label: 'Realtime IOC extraction',
        tooltip: 'Extracts observables from security events and matches them against threat intelligence in realtime',
        active: extractionActive,
        busy: busyKey === 'ioc_extraction',
        usecaseId: 'threat_intel_case_management_1',
        parts: [
          {
            label: 'Workflow "Realtime IOC extraction" exists',
            active: !!iocWf,
            detail: iocWf ? `Found workflow "${iocWf.name}"` : 'Workflow not found',
          },
          {
            label: 'Realtime background processing active',
            active: !!iocWf?.background_processing,
            detail: iocWf?.background_processing ? 'Background extraction active' : 'Extraction stopped',
          },
        ],
        enable: () => toggleIocExtraction(true),
        disable: () => toggleIocExtraction(false),
      },
      {
        key: 'incident_enrichment',
        label: 'Incident enrichment',
        tooltip: 'Automatically correlates security incidents with matched threat intelligence',
        active: enrichmentActive,
        busy: busyKey === 'incident_enrichment',
        usecaseId: 'threat_intel_case_management_1',
        parts: [
          {
            label: 'Enrich automation configured',
            active: !!enrichCheck,
            detail: enrichCheck?.detail || 'Category automation on incidents',
          },
          {
            label: 'Automation enabled on incidents datastore',
            active: enrichActive,
            detail: enrichActive ? 'Enrich rule enabled' : 'Enrich rule disabled',
          },
        ],
        enable: () => toggleIncidentEnrichment(true),
        disable: () => toggleIncidentEnrichment(false),
      },
      {
        key: 'catalog_defaults',
        label: 'Default catalog & feeds',
        tooltip: 'Pre-configured schema types for IP, Domain, Hash, URL and curated OSINT feeds',
        active: defaultsActive,
        busy: busyKey === 'catalog_defaults',
        parts: defaultsParts
          ? [
              {
                label: 'Default IOC types seeded',
                active: defaultsParts.iocs,
                detail: defaultsParts.iocs ? 'IP, Domain, Hash, URL indicator schemas exist' : 'No schemas in datastore',
              },
              {
                label: 'Default threat feeds configured',
                active: defaultsParts.feeds,
                detail: defaultsParts.feeds ? 'Curated OSINT feed URLs registered' : 'No threat feeds in datastore',
              },
            ]
          : undefined,
        enable: () => enableDefaults(),
      },
    ];
  }, [
    tfActive,
    tfWf,
    iocActive,
    iocWf,
    enrichActive,
    enrichCheck,
    defaultsReady,
    defaultsParts,
    busyKey,
    optimistic,
    toggleFeedIngestion,
    toggleIocExtraction,
    toggleIncidentEnrichment,
    enableDefaults,
  ]);

  const allActive = checks.every((c) => c.active);
  const isLoading = enrichment.isLoading || defaultsReady === null;

  return {
    checks,
    allActive,
    isLoading,
    isEnablingAll: isEnablingAll || enrichment.isEnabling,
    enableAll,
    refresh,
  };
};

export default useThreatIntelAutomationStatus;

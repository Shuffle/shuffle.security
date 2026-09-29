import { useEffect, useRef, useState } from 'react';
import { useWorkflows } from './useWorkflows';
import { getApiUrl, getAuthHeader } from '@/Shuffle-Core/api';
import { findIngestTicketsWorkflow, extractWorkflowAppNames } from '@/Shuffle-Core/ingestionDetection';

export interface WebhookStatus {
  /** Whether the webhook workflow exists */
  exists: boolean;
  /** Whether the webhook trigger is active (not stopped) */
  enabled: boolean;
  /** The webhook URL (null if not found) */
  url: string | null;
  /** Whether the Ingest Tickets workflow has at least one source app */
  hasSources: boolean;
  /** Whether the workflows query is still loading */
  isLoading: boolean;
  /** Enable the webhook (creates/starts it) */
  enable: () => Promise<void>;
  /** Whether the enable action is in progress */
  isEnabling: boolean;
  /** Disable the webhook (removes/stops it) */
  disable: () => Promise<void>;
  /** Whether the disable action is in progress */
  isDisabling: boolean;
}

export const useWebhookStatus = (): WebhookStatus => {
  const { data: workflows, isLoading, refetch } = useWorkflows();
  const [isEnabling, setIsEnabling] = useState(false);
  const [isDisabling, setIsDisabling] = useState(false);
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const optimisticTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Same matching as the Ingest row so both views agree on what is enabled.
  const webhookWorkflow = workflows?.find((w: any) => {
    const name = (w?.name || '').toLowerCase().trim();
    if (name === 'ingestion webhook') return true;
    return name.includes('ingest') && name.includes('webhook') && !name.includes('vulnerab');
  });
  const ingestWorkflow = workflows ? findIngestTicketsWorkflow(workflows as any[]) : null;
  const hasSources = ingestWorkflow ? extractWorkflowAppNames(ingestWorkflow).size > 0 : false;

  let url: string | null = null;
  let trueEnabled = false;

  if (webhookWorkflow) {
    const trigger = (webhookWorkflow.triggers || []).find(
      (t: any) => t.trigger_type === 'WEBHOOK' || t.app_name === 'Webhook'
    );
    if (trigger) {
      const webhookId = trigger.id || trigger.trigger_id;
      if (webhookId) {
        url = getApiUrl(`/api/v1/hooks/webhook_${webhookId}`);
      }
      trueEnabled = (trigger.status || '').toLowerCase() !== 'stopped';
    }
  }

  // Clear optimistic override once the real data matches it.
  useEffect(() => {
    if (optimistic !== null && trueEnabled === optimistic) {
      setOptimistic(null);
      if (optimisticTimeoutRef.current) {
        clearTimeout(optimisticTimeoutRef.current);
        optimisticTimeoutRef.current = null;
      }
    }
  }, [optimistic, trueEnabled]);

  const armOptimistic = (next: boolean) => {
    setOptimistic(next);
    if (optimisticTimeoutRef.current) clearTimeout(optimisticTimeoutRef.current);
    // Safety net: release the optimistic lock if the backend never catches up.
    optimisticTimeoutRef.current = setTimeout(() => {
      setOptimistic(null);
      optimisticTimeoutRef.current = null;
    }, 15000);
  };

  const enable = async () => {
    setIsEnabling(true);
    armOptimistic(true);
    try {
      // Mirror the onboarding flow: ensure BOTH the polling "Ingest Tickets"
      // workflow and the "Ingest Tickets_webhook" trigger workflow exist.
      // Without the polling workflow, the webhook by itself is useless.
      const results = await Promise.allSettled([
        fetch(getApiUrl('/api/v2/workflows/generate'), {
          method: 'POST',
          credentials: 'include',
          headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ label: 'Ingest Tickets', category: 'cases' }),
        }),
        fetch(getApiUrl('/api/v2/workflows/generate'), {
          method: 'POST',
          credentials: 'include',
          headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ label: 'Ingest Tickets_webhook' }),
        }),
      ]);
      const anyOk = results.some((r) => r.status === 'fulfilled' && r.value.ok);
      if (!anyOk) throw new Error('Failed to enable ingestion');
      await new Promise((r) => setTimeout(r, 1500));
      await refetch();
    } finally {
      setIsEnabling(false);
    }
  };

  const disable = async () => {
    setIsDisabling(true);
    armOptimistic(false);
    try {
      // Remove BOTH workflows so ingestion is fully off.
      const results = await Promise.allSettled([
        fetch(getApiUrl('/api/v2/workflows/generate'), {
          method: 'POST',
          credentials: 'include',
          headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ label: 'Ingest Tickets', category: 'cases', action_name: 'remove' }),
        }),
        fetch(getApiUrl('/api/v2/workflows/generate'), {
          method: 'POST',
          credentials: 'include',
          headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ label: 'Ingest Tickets_webhook', action_name: 'remove' }),
        }),
      ]);
      const anyOk = results.some((r) => r.status === 'fulfilled' && r.value.ok);
      if (!anyOk) throw new Error('Failed to disable ingestion');
      await new Promise((r) => setTimeout(r, 1500));
      await refetch();
    } finally {
      setIsDisabling(false);
    }
  };

  const enabled = optimistic !== null ? optimistic : trueEnabled;

  return {
    exists: !!webhookWorkflow,
    hasSources,
    enabled,
    url,
    isLoading,
    enable,
    isEnabling,
    disable,
    isDisabling,
  };
};

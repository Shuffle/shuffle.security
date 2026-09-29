/**
 * Auto-propagation of "Automation for X" settings from a parent tenant to its
 * child tenants. Runs in the background on the frontend after the parent save.
 *
 * Per-automation-type toggle stored in org_settings.automation_propagation.
 * Default: enabled for "Security Rules", disabled for everything else.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { getApiUrl, getAuthHeader } from '@/Shuffle-MCPs/api';
import { tenantApiUrl, registerTenantRegions } from '@/lib/tenantApiUrl';

import { getDatastoreItem, setDatastoreItem, DATASTORE_CATEGORIES } from '@/Shuffle-MCPs/datastore';

export const PROPAGATABLE_AUTOMATIONS: { name: string; description: string }[] = [
  { name: 'Security Rules', description: 'Rules validated before an update is written.' },
  { name: 'Enrich', description: 'Automatic enrichment of new data.' },
  { name: 'Run AI Agent', description: 'AI agent prompts and assigned tools.' },
  { name: 'Run workflow', description: 'Workflows triggered on updates.' },
  { name: 'Send webhook', description: 'Webhook URL receiving updates.' },
];

const DEFAULTS: Record<string, boolean> = { 'Security Rules': true };
const LOCAL_KEY = 'shuffle-automation-propagation';
const DATASTORE_KEY = 'org_settings';

type PropagationMap = Record<string, boolean>;
const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cached: PropagationMap = { ...DEFAULTS };
let fetched = false;

const read = (): PropagationMap => {
  let raw: string | null = null;
  try { raw = localStorage.getItem(LOCAL_KEY); } catch { /* ignore */ }
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  try {
    cached = { ...DEFAULTS, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    cached = { ...DEFAULTS };
  }
  return cached;
};

const serverSnapshot = (): PropagationMap => DEFAULTS;

const loadFromServer = async () => {
  if (fetched) return;
  fetched = true;
  try {
    const res = await getDatastoreItem(DATASTORE_KEY, DATASTORE_CATEGORIES.CONFIGURATION);
    const val = res.success && res.item?.value
      ? (typeof res.item.value === 'string' ? JSON.parse(res.item.value) : res.item.value)
      : null;
    if (val?.automation_propagation && typeof val.automation_propagation === 'object') {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(val.automation_propagation));
      listeners.forEach((l) => l());
    }
  } catch {
    fetched = false;
  }
};

export const isPropagationEnabled = (name: string): boolean => read()[name] === true;

export function useAutomationPropagation(): PropagationMap {
  const value = useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    read,
    serverSnapshot,
  );
  useEffect(() => { void loadFromServer(); }, []);
  return value;
}

export async function setAutomationPropagation(name: string, enabled: boolean) {
  const next = { ...read(), [name]: enabled };
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
  try {
    let existing: Record<string, unknown> = {};
    const res = await getDatastoreItem(DATASTORE_KEY, DATASTORE_CATEGORIES.CONFIGURATION);
    if (res.success && res.item?.value) {
      existing = typeof res.item.value === 'string' ? JSON.parse(res.item.value) : res.item.value;
    }
    await setDatastoreItem(DATASTORE_KEY, { ...existing, automation_propagation: next }, DATASTORE_CATEGORIES.CONFIGURATION);
  } catch { /* local cache already set */ }
}

const fetchChildOrgIds = async (parentOrgId: string): Promise<string[]> => {
  const res = await fetch(getApiUrl(`/api/v1/orgs/${parentOrgId}/suborgs`), {
    credentials: 'include',
    headers: { ...getAuthHeader() },
  });
  if (!res.ok) return [];
  const data = await res.json();
  const orgs: any[] = Array.isArray(data) ? data : (data?.child_orgs || data?.orgs || data?.subOrgs || []);
  // Downwards only: never fan out to peers or the parent itself.
  registerTenantRegions(orgs);
  return orgs
    .filter((o) => o?.id && o.id !== parentOrgId && (!o.creator_org || o.creator_org === parentOrgId))
    .map((o) => o.id as string);
};

/**
 * Copy the enabled-for-propagation automations from the parent's saved list
 * into each child tenant's category config, leaving the child's other
 * automations and settings untouched. Fire-and-forget.
 */
export async function propagateAutomationsToChildren(
  parentOrgId: string,
  category: string,
  parentAutomations: Array<{ name: string; [k: string]: unknown }>,
): Promise<{ updated: number; failed: number }> {
  const toCopy = parentAutomations.filter((a) => isPropagationEnabled(a.name));
  if (toCopy.length === 0) return { updated: 0, failed: 0 };

  const children = await fetchChildOrgIds(parentOrgId).catch(() => []);
  let updated = 0;
  let failed = 0;

  await Promise.allSettled(children.map(async (childId) => {
    try {
      const headers = { ...getAuthHeader(), 'Org-Id': childId };
      const cfgRes = await fetch(
        tenantApiUrl(`/api/v1/orgs/${childId}/list_cache?category=${encodeURIComponent(category)}&top=1`, childId),
        { credentials: 'include', headers },
      );
      const cfg = cfgRes.ok ? (await cfgRes.json())?.category_config : null;
      const existing: any[] = Array.isArray(cfg?.automations) ? cfg.automations.map((a: any) => ({ ...a })) : [];
      for (const a of toCopy) {
        const idx = existing.findIndex((e) => e?.name === a.name);
        if (idx >= 0) existing[idx] = { ...a };
        else existing.push({ ...a });
      }
      const payload: Record<string, unknown> = { category, automations: existing };
      if (cfg?.settings) payload.settings = cfg.settings;
      const res = await fetch(tenantApiUrl('/api/v2/datastore/automate', childId), {
        method: 'POST',
        credentials: 'include',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`automate ${res.status}`);
      updated += 1;
    } catch (err) {
      failed += 1;
      console.error('[automation-propagation] child update failed', childId, err);
    }
  }));

  return { updated, failed };
}

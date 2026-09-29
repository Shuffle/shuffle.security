/**
 * Demo Mode service.
 *
 * Seeds sample data into the real Shuffle datastore as the user advances
 * through the tour — NOT all upfront. Each step has its own seed action,
 * tracked in localStorage so it only runs once per step.
 *
 * Cleanup is driven by a localStorage index of every key we wrote, plus a
 * safety-net scan for items tagged `metadata.extensions.custom_attributes.demo`.
 */

import { setDatastoreItems, setDatastoreItem, getDatastoreItem, deleteDatastoreItem, DATASTORE_CATEGORIES, getDatastoreByCategory } from '@/Shuffle-Core/datastore';
import { getApiUrl, getAuthHeader } from '@/Shuffle-Core/api';
import { safeLocalStorage } from '@/lib/ssr-storage';
import { restoreOriginalIngestTicketsApps } from '@/services/demoLiveEnvironment';
import { DEFAULT_THREAT_FEEDS, type ThreatFeed } from '@/hooks/useThreatFeeds';
import {
  buildDemoFocusIncident,
  buildDemoWazuhImplantIncident,
  buildDemoAssets,
  buildDemoUsers,
  buildDemoVulnerabilities,
  DEMO_FLAG_KEY,
  DEMO_ACTIVE_KEY,
  DEMO_SEEDED_STEPS_KEY,
  type DemoIocOverrides,
  type PendingObservable,
} from '@/lib/demoSeedData';

const VULNS_CATEGORY = 'shuffle-security_vulns';
const SENSORS_CATEGORY = 'shuffle-security_sensors';
const AGENTS_CATEGORY = 'shuffle-security_agents';
// Real-IOC categories populated by the backend's threat-feed parser. Keys
// are raw IPs / URLs; values are STIX 2.1 indicators. We pick from `ioc_url`
// (rather than `ioc_domain`) because URL feeds tend to carry richer, more
// reliably-typed entries — the host portion gives us the lure domain too.
const IOC_IP_CATEGORY = 'ioc_ipv4';
const IOC_URL_CATEGORY = 'ioc_url';
// Stash the IOC overrides chosen at step 1 so the Wazuh follow-up reuses
// the exact same IP + URL (correlations rely on byte-identical values).
const DEMO_IOC_OVERRIDES_KEY = 'shuffle_demo_ioc_overrides';
// Latest IOC pick audit, written by `pickRandomIocs` whenever it had to
// fall back. Surfaced to support users in the IncidentDetailPage banner so
// they can see exactly WHY no live indicator was usable. Schema is opaque
// to the rest of the app — only the audit banner reads it.
export const DEMO_IOC_AUDIT_KEY = 'shuffle_demo_ioc_audit';


interface SeededIndex {
  [category: string]: string[]; // category -> list of keys we wrote
}

const readIndex = (): SeededIndex => {
  try { return JSON.parse(safeLocalStorage.getItem(DEMO_FLAG_KEY) || '{}'); } catch { return {}; }
};
const writeIndex = (idx: SeededIndex) => safeLocalStorage.setItem(DEMO_FLAG_KEY, JSON.stringify(idx));

const readSeededSteps = (): string[] => {
  try { return JSON.parse(safeLocalStorage.getItem(DEMO_SEEDED_STEPS_KEY) || '[]'); } catch { return []; }
};
const writeSeededSteps = (steps: string[]) => safeLocalStorage.setItem(DEMO_SEEDED_STEPS_KEY, JSON.stringify(steps));

export const isDemoActive = (): boolean => safeLocalStorage.getItem(DEMO_ACTIVE_KEY) === 'true';

export const getDemoStats = () => {
  const idx = readIndex();
  // Sensor-datastore hosts surface on /monitors and read as assets to the
  // user, so include them in the asset count even before the dedicated
  // "assets" tour step seeds the OCSF asset records.
  const assetCount = (idx[DATASTORE_CATEGORIES.ASSETS]?.length || 0)
    + (idx[SENSORS_CATEGORY]?.length || 0);
  return {
    incidents: idx[DATASTORE_CATEGORIES.INCIDENTS]?.length || 0,
    assets: assetCount,
    users: idx[DATASTORE_CATEGORIES.USERS]?.length || 0,
  };
};

/**
 * Notify any open page that uses useDatastore for `category` to refetch.
 * Pages listen via `window.addEventListener('demo:refresh', ...)`.
 */
const broadcastRefresh = (category: string) => {
  try {
    window.dispatchEvent(new CustomEvent('demo:refresh', { detail: { category } }));
    if (category === DATASTORE_CATEGORIES.INCIDENTS) {
      [600, 1800, 3500].forEach(delay => {
        window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent('demo:refresh', { detail: { category } }));
        }, delay);
      });
    }
  } catch { /* SSR / older browsers */ }
};

const recordSeed = (category: string, keys: string[]) => {
  const idx = readIndex();
  // De-duplicate so callers (e.g. live-env init) can call this on every
  // demo start without inflating counts on repeat runs.
  const existing = new Set(idx[category] || []);
  for (const k of keys) existing.add(k);
  idx[category] = Array.from(existing);
  writeIndex(idx);
  safeLocalStorage.setItem(DEMO_ACTIVE_KEY, 'true');
};

/** Public wrapper so demoLiveEnvironment can register pre-tour seeds (e.g.
 * the sensor host injected at demo start) into the same cleanup index. */
export const recordDemoSeed = (category: string, keys: string[]) => recordSeed(category, keys);

/**
 * Server-side dedup: remove any existing demo incidents whose key matches
 * the given suffix predicate, OR whose payload looks like a demo item with
 * the matching marker. Local index is also pruned so cleanup stays accurate.
 *
 * This guards against duplicates when the local seed index has been wiped
 * (different browser, cleared storage, partial failure) — without this the
 * focus phishing or Wazuh implant incidents can accumulate every time the
 * user re-enters the tour or hits "Force generate".
 */
const wipeExistingDemoIncidents = async (
  matcher: (key: string, value: unknown) => boolean,
  opts?: { skipServerScan?: boolean },
): Promise<void> => {
  // 1. Local index — quick path
  try {
    const idx = readIndex();
    const existing = idx[DATASTORE_CATEGORIES.INCIDENTS] || [];
    const localMatches = existing.filter(k => matcher(k, null));
    if (localMatches.length > 0) {
      await Promise.allSettled(localMatches.map(k => deleteDatastoreItem(k, DATASTORE_CATEGORIES.INCIDENTS)));
      idx[DATASTORE_CATEGORIES.INCIDENTS] = existing.filter(k => !localMatches.includes(k));
      writeIndex(idx);
    }
  } catch { /* best-effort */ }

  // 2. Server scan — catches keys the local index never saw (e.g. different
  // browser / cleared storage / pipeline-assigned keys). This fetches the
  // ENTIRE incidents category, which is very expensive on tenants with
  // thousands of real incidents — callers driving the interactive
  // "Force generate" buttons should pass `skipServerScan: true` so the UI
  // stays responsive. The local index is authoritative for anything seeded
  // in the current browser session.
  if (opts?.skipServerScan) return;
  try {
    const res = await getDatastoreByCategory(DATASTORE_CATEGORIES.INCIDENTS);
    if (res.success && res.data) {
      const orphans = res.data.filter(item => {
        const key = typeof item.key === 'string' ? item.key : '';
        return matcher(key, item.value);
      });
      if (orphans.length > 0) {
        await Promise.allSettled(
          orphans.map(o => deleteDatastoreItem(o.key, DATASTORE_CATEGORIES.INCIDENTS)),
        );
      }
    }
  } catch { /* best-effort */ }
};

/**
 * Identify ANY demo phishing incident — focus key, batch1 numbered key, or
 * a payload tagged demo with a "Phishing email reported by …" title.
 *
 * We deliberately match the broader `demo-inc-phish-` prefix (not just
 * `-focus`) so re-seeding cleans up stragglers from earlier seeders /
 * sessions / browsers (e.g. `demo-inc-phish-<ts>-1` from buildDemoIncidentsBatch1).
 * Without this, repeat tour runs accumulate duplicate phishing incidents
 * in the datastore even though the focus dedup "succeeds".
 */
const isDemoFocusIncident = (key: string, value: unknown): boolean => {
  if (key.startsWith('demo-inc-phish-')) return true;
  if (!value || typeof value !== 'object') return false;
  const v = value as { metadata?: { extensions?: { custom_attributes?: { demo?: boolean } } }; finding_info?: { title?: string } };
  const isDemo = v?.metadata?.extensions?.custom_attributes?.demo === true;
  const title = v?.finding_info?.title || '';
  return isDemo && /Phishing email reported by/i.test(title);
};

/** Identify the demo Wazuh / Sliver implant follow-up incident. */
const isDemoWazuhIncident = (key: string, value: unknown): boolean => {
  // Cover both `-wazuh` (focus follow-up) and `demo-inc-malware-` keys
  // (buildDemoIncidentsBatch1) so old Sliver C2 incidents get cleaned up
  // before the new one lands.
  if (key.includes('-wazuh')) return true;
  if (key.startsWith('demo-inc-malware-')) return true;
  if (!value || typeof value !== 'object') return false;
  const v = value as { metadata?: { extensions?: { custom_attributes?: { demo?: boolean } } }; finding_info?: { title?: string } };
  const isDemo = v?.metadata?.extensions?.custom_attributes?.demo === true;
  const title = v?.finding_info?.title || '';
  return isDemo && /Sliver C2|implant beaconing/i.test(title);
};

/**
 * Identify ANY demo incident — used for catch-all sweeps. Matches the
 * `demo-` key prefix or the `custom_attributes.demo` payload flag.
 */
const isAnyDemoIncident = (key: string, value: unknown): boolean => {
  if (typeof key === 'string' && key.startsWith('demo-')) return true;
  if (!value || typeof value !== 'object') return false;
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value as string) : value;
    return (parsed as { metadata?: { extensions?: { custom_attributes?: { demo?: boolean } } } })
      ?.metadata?.extensions?.custom_attributes?.demo === true;
  } catch { return false; }
};

/**
 * Sweep orphan demo incidents from the datastore.
 *
 * Only runs when demo mode is NOT active — wipes every demo-flagged
 * incident left behind from a previous session. While demo IS active we
 * leave cleanup to the per-seeder dedup helpers (`wipeExistingDemoIncidents`)
 * to avoid racing with in-flight seeds (e.g. the `incidents-list` step that
 * writes the focus phishing incident the moment the user advances).
 *
 * Idempotent and best-effort. Returns the number of items deleted so callers
 * can refresh the UI when something actually changed.
 */
export const sweepOrphanDemoIncidents = async (): Promise<number> => {
  if (isDemoActive()) return 0;
  try {
    const res = await getDatastoreByCategory(DATASTORE_CATEGORIES.INCIDENTS);
    if (!res.success || !res.data) return 0;

    const orphans = res.data.filter(item => isAnyDemoIncident(item.key, item.value));
    if (orphans.length === 0) return 0;
    await Promise.allSettled(
      orphans.map(o => deleteDatastoreItem(o.key, DATASTORE_CATEGORIES.INCIDENTS)),
    );
    broadcastRefresh(DATASTORE_CATEGORIES.INCIDENTS);
    return orphans.length;
  } catch {
    return 0;
  }
};

// ─── IOC helpers ─────────────────────────────────────────────────────────────
// We want demo incidents to feature *real* IOCs from the user's threat feeds
// instead of made-up "example" values, so the IOC parser will (a) recognise
// them as known-bad and (b) link the incident to the actual STIX indicator.
//
// 1. `forceEnableDefaultThreatFeeds` writes the curated DEFAULT_THREAT_FEEDS
//    list into the threat-feeds datastore (no-op if already populated). This
//    causes the backend parser to start ingesting the feeds in the background.
// 2. `pickRandomIocs` reads `ioc_ip` / `ioc_domain` and picks one of each at
//    random. If the categories are empty (parser hasn't caught up yet) we
//    return undefined so the caller can fall back to static defaults.
// 3. The chosen pair is cached in localStorage so the Wazuh follow-up
//    incident reuses the exact same IP + domain → correlations match.

const readIocOverrides = (): DemoIocOverrides | null => {
  try {
    const raw = safeLocalStorage.getItem(DEMO_IOC_OVERRIDES_KEY);
    return raw ? JSON.parse(raw) as DemoIocOverrides : null;
  } catch { return null; }
};
const writeIocOverrides = (overrides: DemoIocOverrides) => {
  try { safeLocalStorage.setItem(DEMO_IOC_OVERRIDES_KEY, JSON.stringify(overrides)); } catch { /* ignore */ }
};
const clearIocOverrides = () => {
  try { safeLocalStorage.removeItem(DEMO_IOC_OVERRIDES_KEY); } catch { /* ignore */ }
};

/**
 * Promise published by the live-environment bootstrap that resolves once
 * `ioc_domain` has at least one entry (true) or we gave up polling
 * (false). The incidents-list step seeder awaits this before picking
 * IOCs so the focus incident features a *real* indicator instead of the
 * static fallback. Module-level so it survives across React renders.
 */
let pendingIndicatorReady: Promise<boolean> | null = null;
export const setPendingIndicatorReady = (p: Promise<boolean> | null) => {
  pendingIndicatorReady = p;
};
const awaitPendingIndicators = async (): Promise<void> => {
  if (!pendingIndicatorReady) return;
  try { await pendingIndicatorReady; } catch { /* fall through to fallback */ }
};

/** Label of the workflow that ingests the configured threat feeds. */
const THREAT_FEEDS_WORKFLOW_LABEL = 'Enable Threat feeds';
/** Session guard so we only kick the workflow once per demo run. */
const DEMO_THREAT_FEEDS_RAN_KEY = 'shuffle_demo_threat_feeds_workflow_ran';

/**
 * Look up "Enable Threat feeds" in the user's workflow list and POST
 * /execute. Fire-and-forget — used to populate the IOC datastores with
 * fresh entries shortly after we enable the feeds in the demo.
 */
const runEnableThreatFeedsWorkflow = async (): Promise<void> => {
  try {
    if (sessionStorage.getItem(DEMO_THREAT_FEEDS_RAN_KEY) === '1') return;
    const res = await fetch(getApiUrl('/api/v1/workflows'), {
      credentials: 'include',
      headers: { ...getAuthHeader() },
    });
    if (!res.ok) return;
    const data = await res.json();
    const workflows = Array.isArray(data) ? data : (data?.workflows || []);
    const wf = workflows.find(
      (w: { name?: string }) => typeof w?.name === 'string' && w.name === THREAT_FEEDS_WORKFLOW_LABEL,
    );
    const wfId = (wf as { id?: string } | undefined)?.id;
    if (!wfId) return;
    await fetch(getApiUrl(`/api/v1/workflows/${wfId}/execute`), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ execution_source: 'demo', start: '' }),
    });
    sessionStorage.setItem(DEMO_THREAT_FEEDS_RAN_KEY, '1');
  } catch (err) {
    console.warn('[demo] enable threat feeds workflow execute failed', err);
  }
};

/**
 * Ensure the user's threat feed list is populated with the curated defaults
 * AND that the "Enable Threat feeds" workflow has been kicked off so the
 * IOC datastores get freshly populated. Both steps are idempotent and
 * best-effort — failures are logged but never thrown.
 */
export const forceEnableDefaultThreatFeeds = async (): Promise<void> => {
  try {
    const existing = await getDatastoreByCategory(DATASTORE_CATEGORIES.THREAT_FEEDS);
    const alreadySeeded = existing.success && (existing.data?.length || 0) > 0;
    if (!alreadySeeded) {
      const items = DEFAULT_THREAT_FEEDS.map((feed: ThreatFeed) => ({
        key: feed.id,
        value: { ...feed, enabled: true },
      }));
      const res = await setDatastoreItems(items, DATASTORE_CATEGORIES.THREAT_FEEDS);
      if (!res.success) {
        console.warn('[demo] failed to seed default threat feeds', res.error);
      } else {
        broadcastRefresh(DATASTORE_CATEGORIES.THREAT_FEEDS);
      }
    }
    // Always (best-effort) run the workflow once per session so the IOC
    // categories get populated with fresh entries — even when the feed
    // list was already seeded by a previous session.
    void runEnableThreatFeedsWorkflow();
  } catch (err) {
    console.warn('[demo] forceEnableDefaultThreatFeeds error', err);
  }
};

const pickRandom = <T,>(arr: T[]): T | undefined => {
  if (!arr || arr.length === 0) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
};

/**
 * Static fallback pools used when the live `ioc_ip` / `ioc_domain` datastore
 * categories have not been populated yet (the threat-feed parser may take a
 * moment to catch up after we enable feeds at demo start). We still pick at
 * random so the demo gets some variety run-over-run.
 *
 * IPs are drawn from well-known abuse / TOR-exit ranges; domains follow
 * common phishing-lure naming patterns. Neither list is meant to be
 * authoritative — they exist purely so the demo never falls back to the
 * same static value twice in a row.
 */
const FALLBACK_IOC_IPS = [
  '185.220.101.47',
  '194.165.16.78',
  '45.137.21.134',
  '91.219.236.222',
  '103.232.86.14',
  '198.98.51.189',
  '141.98.10.63',
  '23.129.64.213',
];

// Defanged using the standard threat-intel convention (hxxp + [.]). These
// URLs are KNOWN MALICIOUS — they must never be live-clickable strings in
// the source tree. `refangUrl` reconstitutes them right before they are
// handed to the demo seeder so the actual incident still carries a real
// indicator value.
const FALLBACK_IOC_URLS_DEFANGED = [
  'hxxp://allegrolokalnie[.]pl48284725[.]cyou',
  'hxxps://it-support-portal[.]live/mfa-reset?u=schen',
  'hxxps://secure-login-helpdesk[.]com/verify',
  'hxxps://office365-verify[.]app/auth/login',
  'hxxps://onedrive-shared-doc[.]net/shared/file',
  'hxxps://mfa-reset-portal[.]cc/reset',
  'hxxps://corp-vpn-update[.]co/install',
  'hxxps://docusign-review[.]click/sign',
  'hxxps://sharepoint-secure[.]cloud/portal',
];

const refangUrl = (defanged: string): string =>
  defanged.replace(/^hxxps?/i, m => m.toLowerCase().replace('hxxp', 'http')).replace(/\[\.\]/g, '.');

const FALLBACK_IOC_URLS = FALLBACK_IOC_URLS_DEFANGED.map(refangUrl);

/** Marker query param appended to every fallback URL so support users can
 *  spot a non-live IOC at a glance — same `demo-fallback=true` convention
 *  used in the incident URL. Applied here once so the email body, observable
 *  list, and the STIX indicator we mirror into `ioc_url` all stay in sync. */
export const DEMO_FALLBACK_URL_PARAM = 'demo-fallback=true';
const tagFallbackUrl = (url: string): string => {
  if (!url) return url;
  if (url.includes('demo-fallback=')) return url;
  return url.includes('?') ? `${url}&${DEMO_FALLBACK_URL_PARAM}` : `${url}?${DEMO_FALLBACK_URL_PARAM}`;
};

/** Extract the host portion of a URL (best-effort). Returns undefined when
 *  the input is not a parseable absolute URL. */
const extractHost = (url: string): string | undefined => {
  try { return new URL(url).hostname || undefined; } catch { return undefined; }
};

/** A datastore key is "printable" only if every char is a normal ASCII
 *  printable. The threat-feeds parser sometimes stores indicator hashes /
 *  binary IDs as keys — those decode into garbled UTF-8 (replacement
 *  characters) and must NEVER be surfaced as a URL/IP in the demo. */
const isPrintableAscii = (s: string): boolean =>
  typeof s === 'string' && s.length > 0 && /^[\x20-\x7E]+$/.test(s);

/** True when `s` looks like a real http(s) URL we can safely render. */
const looksLikeUrl = (s: string | undefined): s is string => {
  if (!s || !isPrintableAscii(s)) return false;
  if (!/^https?:\/\//i.test(s)) return false;
  try { return Boolean(new URL(s).hostname); } catch { return false; }
};

/** True when `s` looks like a plain IPv4/IPv6 (printable, no garbage). */
const looksLikeIp = (s: string | undefined): s is string => {
  if (!s || !isPrintableAscii(s)) return false;
  // IPv4
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) return true;
  // Loose IPv6 — at least one colon, hex+colon only.
  if (/^[0-9a-fA-F:]+$/.test(s) && s.includes(':')) return true;
  return false;
};

/** Refang a defanged URL/host so the `looksLikeUrl` check accepts it. */
const refangCandidate = (s: string): string =>
  s.replace(/^hxxps?/i, m => m.toLowerCase().replace('hxxp', 'http'))
    .replace(/\[\.\]/g, '.')
    .replace(/\(\.\)/g, '.')
    .replace(/\[:\/\/\]/g, '://');

/** Best-effort: pull a URL out of a STIX 2.1 indicator pattern stored in
 *  the datastore item's value, e.g. `[url:value = 'http://evil/...']`.
 *  Also accepts `domain-name:value`, `network-traffic:dst_ref.value`, and
 *  the bare-string / `{value: ...}` / `{url: ...}` shapes Shuffle's
 *  threat-feed parser sometimes emits. */
const extractUrlFromStixValue = (value: unknown): string | undefined => {
  try {
    const obj = typeof value === 'string'
      ? (() => { try { return JSON.parse(value); } catch { return value; } })()
      : value;
    // 1. Plain string URL stored as the value.
    if (typeof obj === 'string') {
      const refanged = refangCandidate(obj.trim());
      if (looksLikeUrl(refanged)) return refanged;
      return undefined;
    }
    if (!obj || typeof obj !== 'object') return undefined;
    const o = obj as Record<string, unknown>;
    // 2. STIX 2.1 indicator pattern.
    const pattern = o.pattern;
    if (typeof pattern === 'string') {
      const m = pattern.match(/(?:url|domain-name|network-traffic[^:]*|ipv[46]-addr):[\w.-]*value\s*=\s*['"]([^'"]+)['"]/i);
      if (m) {
        const refanged = refangCandidate(m[1]);
        if (looksLikeUrl(refanged)) return refanged;
      }
    }
    // 3. Common ad-hoc fields used by simpler ingest paths.
    for (const k of ['url', 'value', 'indicator', 'observable', 'ioc']) {
      const v = o[k];
      if (typeof v === 'string') {
        const refanged = refangCandidate(v.trim());
        if (looksLikeUrl(refanged)) return refanged;
      }
    }
    return undefined;
  } catch { return undefined; }
};

/** Same idea for IPv4/IPv6 addresses inside a STIX pattern OR ad-hoc value. */
const extractIpFromStixValue = (value: unknown): string | undefined => {
  try {
    const obj = typeof value === 'string'
      ? (() => { try { return JSON.parse(value); } catch { return value; } })()
      : value;
    if (typeof obj === 'string') {
      return looksLikeIp(obj.trim()) ? obj.trim() : undefined;
    }
    if (!obj || typeof obj !== 'object') return undefined;
    const o = obj as Record<string, unknown>;
    const pattern = o.pattern;
    if (typeof pattern === 'string') {
      const m = pattern.match(/ipv[46]-addr:value\s*=\s*['"]([^'"]+)['"]/i);
      if (m && looksLikeIp(m[1])) return m[1];
    }
    for (const k of ['ip', 'value', 'indicator', 'observable', 'ioc']) {
      const v = o[k];
      if (typeof v === 'string' && looksLikeIp(v.trim())) return v.trim();
    }
    return undefined;
  } catch { return undefined; }
};

/** Per-item classification used by the IOC pick audit so support users can
 *  see *why* a given `ioc_url` row was not usable as a demo lure URL. */
type IocItemReason =
  | 'accepted-key'
  | 'accepted-value'
  | 'rejected-binary-key'
  | 'rejected-key-not-url'
  | 'rejected-value-no-url'
  | 'rejected-empty-value';

const classifyUrlItem = (item: { key: string; value?: unknown }): { reason: IocItemReason; pick?: string } => {
  if (looksLikeUrl(item.key)) return { reason: 'accepted-key', pick: item.key };
  const refangedKey = refangCandidate(item.key);
  if (looksLikeUrl(refangedKey)) return { reason: 'accepted-key', pick: refangedKey };
  const value = (item as { value?: unknown }).value;
  if (value === undefined || value === null || value === '') return { reason: 'rejected-empty-value' };
  const fromValue = extractUrlFromStixValue(value);
  if (fromValue) return { reason: 'accepted-value', pick: fromValue };
  if (!isPrintableAscii(item.key)) return { reason: 'rejected-binary-key' };
  if (!/^https?:\/\//i.test(item.key)) return { reason: 'rejected-key-not-url' };
  return { reason: 'rejected-value-no-url' };
};

const classifyIpItem = (item: { key: string; value?: unknown }): { reason: IocItemReason; pick?: string } => {
  if (looksLikeIp(item.key)) return { reason: 'accepted-key', pick: item.key };
  const value = (item as { value?: unknown }).value;
  if (value === undefined || value === null || value === '') return { reason: 'rejected-empty-value' };
  const fromValue = extractIpFromStixValue(value);
  if (fromValue) return { reason: 'accepted-value', pick: fromValue };
  if (!isPrintableAscii(item.key)) return { reason: 'rejected-binary-key' };
  return { reason: 'rejected-value-no-url' };
};

/** Audit entry written to localStorage when fallbacks are used so support
 *  users can read it back from the IncidentDetailPage banner. */
export interface DemoIocAudit {
  timestamp: string;
  ip: {
    fetched: boolean;
    httpError?: string;
    total: number;
    accepted: number;
    rejected: number;
    reasons: Partial<Record<IocItemReason, number>>;
    samples: Array<{ key: string; reason: IocItemReason }>;
    truncated?: boolean;
    usedFallback: boolean;
  };
  url: {
    fetched: boolean;
    httpError?: string;
    total: number;
    accepted: number;
    rejected: number;
    reasons: Partial<Record<IocItemReason, number>>;
    samples: Array<{ key: string; reason: IocItemReason }>;
    truncated?: boolean;
    usedFallback: boolean;
  };
}

const writeAudit = (audit: DemoIocAudit) => {
  try { safeLocalStorage.setItem(DEMO_IOC_AUDIT_KEY, JSON.stringify(audit)); } catch { /* ignore */ }
  // Always log the structured audit so support users see it in the console
  // even if they never open the banner.
  console.info('[demo:ioc-audit]', audit);
};

const pickFallbackIocs = (): DemoIocOverrides => {
  const out: DemoIocOverrides = { usedFallback: true };
  const ipKey = pickRandom(FALLBACK_IOC_IPS);
  if (ipKey) out.attackerIp = ipKey;
  const urlKey = pickRandom(FALLBACK_IOC_URLS);
  if (urlKey) {
    const tagged = tagFallbackUrl(urlKey);
    out.lureUrl = tagged;
    const host = extractHost(tagged);
    if (host) out.lureDomain = host;
  }
  return out;
};

/**
 * Build a minimal STIX 2.1 indicator object for a fallback URL and write it
 * to the `ioc_url` datastore so the demo's Known-IOC machinery surfaces the
 * URL exactly the same way as a live threat-feed entry. Best-effort —
 * failures are logged and swallowed so they never block incident seeding.
 */
const seedFallbackUrlIndicator = async (url: string): Promise<void> => {
  try {
    const nowIso = new Date().toISOString();
    const indicator = {
      type: 'indicator',
      spec_version: '2.1',
      id: `indicator--demo-fallback-${Math.random().toString(36).slice(2, 10)}`,
      created: nowIso,
      modified: nowIso,
      indicator_types: ['malicious-activity'],
      pattern: `[url:value = '${url.replace(/'/g, "\\'")}']`,
      pattern_type: 'stix',
      valid_from: nowIso,
      labels: ['demo-fallback'],
      external_references: [
        {
          source_name: 'Shuffle Security Demo',
          description: 'Static fallback IOC injected by demo mode (no live threat-feed indicator was available).',
        },
      ],
    };
    await setDatastoreItem(url, JSON.stringify(indicator), IOC_URL_CATEGORY);
    broadcastRefresh(IOC_URL_CATEGORY);
  } catch (err) {
    console.warn('[demo] seedFallbackUrlIndicator failed', err);
  }
};

/**
 * Pick a random IP from `ioc_ip` and a random URL from `ioc_url`.
 * If a category is empty (parser hasn't caught up yet), fall back to the
 * static pools above so the demo always gets some IOC variety. The lure
 * domain is derived from the URL's host so domain + URL stay consistent.
 */
export const pickRandomIocs = async (): Promise<DemoIocOverrides> => {
  const out: DemoIocOverrides = {};
  const audit: DemoIocAudit = {
    timestamp: new Date().toISOString(),
    ip:  { fetched: false, total: 0, accepted: 0, rejected: 0, reasons: {}, samples: [], usedFallback: false },
    url: { fetched: false, total: 0, accepted: 0, rejected: 0, reasons: {}, samples: [], usedFallback: false },
  };
  const tally = (
    bucket: DemoIocAudit['ip'] | DemoIocAudit['url'],
    items: Array<{ key: string; value?: unknown }>,
    classify: (it: { key: string; value?: unknown }) => { reason: IocItemReason; pick?: string },
  ): string[] => {
    const accepted: string[] = [];
    bucket.total = items.length;
    items.forEach((it) => {
      const c = classify(it);
      bucket.reasons[c.reason] = (bucket.reasons[c.reason] || 0) + 1;
      if (c.pick) {
        accepted.push(c.pick);
        bucket.accepted += 1;
      } else {
        bucket.rejected += 1;
        if (bucket.samples.length < 5) {
          bucket.samples.push({
            key: typeof it.key === 'string' ? it.key.slice(0, 64) : String(it.key),
            reason: c.reason,
          });
        }
      }
    });
    return accepted;
  };

  try {
    const ipRes = await getDatastoreByCategory(IOC_IP_CATEGORY);
    audit.ip.fetched = ipRes.success;
    if (!ipRes.success) audit.ip.httpError = ipRes.error || 'unknown';
    const items = (ipRes.success && ipRes.data) ? ipRes.data : [];
    const liveIps = tally(audit.ip, items, classifyIpItem);
    if (items.length === 100) audit.ip.truncated = true;
    if (liveIps.length === 0) audit.ip.usedFallback = true;
    const ipKey = pickRandom(liveIps.length > 0 ? liveIps : FALLBACK_IOC_IPS);
    if (ipKey) out.attackerIp = ipKey;
  } catch (err) {
    console.warn('[demo] pick ioc_ip failed', err);
    audit.ip.httpError = err instanceof Error ? err.message : String(err);
    audit.ip.usedFallback = true;
    const ipKey = pickRandom(FALLBACK_IOC_IPS);
    if (ipKey) out.attackerIp = ipKey;
  }

  try {
    const urlRes = await getDatastoreByCategory(IOC_URL_CATEGORY);
    audit.url.fetched = urlRes.success;
    if (!urlRes.success) audit.url.httpError = urlRes.error || 'unknown';
    const items = (urlRes.success && urlRes.data) ? urlRes.data : [];
    const liveUrls = tally(audit.url, items, classifyUrlItem);
    if (items.length === 100) audit.url.truncated = true;
    if (liveUrls.length === 0) audit.url.usedFallback = true;
    const rawUrl = pickRandom(liveUrls.length > 0 ? liveUrls : FALLBACK_IOC_URLS);
    if (rawUrl) {
      const urlKey = liveUrls.length > 0 ? rawUrl : tagFallbackUrl(rawUrl);
      out.lureUrl = urlKey;
      const host = extractHost(urlKey);
      if (host) out.lureDomain = host;
    }
  } catch (err) {
    console.warn('[demo] pick ioc_url failed', err);
    audit.url.httpError = err instanceof Error ? err.message : String(err);
    audit.url.usedFallback = true;
    const rawUrl = pickRandom(FALLBACK_IOC_URLS);
    if (rawUrl) {
      const urlKey = tagFallbackUrl(rawUrl);
      out.lureUrl = urlKey;
      const host = extractHost(urlKey);
      if (host) out.lureDomain = host;
    }
  }

  if (audit.ip.usedFallback || audit.url.usedFallback) out.usedFallback = true;
  // Always persist + console-log the audit so support users can read back
  // *exactly* why the demo did or did not use a live IOC. We log on success
  // too so a "this looks fine" run still has a paper trail.
  writeAudit(audit);
  return out;
};

/**
 * Resolve IOC overrides for the demo, preferring values cached at step 1 so
 * the focus + Wazuh incidents share the exact same IP/domain. When the cache
 * is a fallback pick we always re-attempt a live pick, so a stale fallback
 * never sticks across sessions once the threat-feed parser has caught up.
 */
const resolveIocOverrides = async (): Promise<DemoIocOverrides> => {
  const rawCached = readIocOverrides();
  // Defensive: an earlier run may have cached a binary/garbled value before
  // we added the printable-key validators. Drop any cached field that no
  // longer passes validation so we never re-render a corrupt URL.
  const cached: DemoIocOverrides | null = rawCached ? {
    attackerIp: looksLikeIp(rawCached.attackerIp) ? rawCached.attackerIp : undefined,
    lureUrl: looksLikeUrl(rawCached.lureUrl) ? rawCached.lureUrl : undefined,
    lureDomain: rawCached.lureDomain && isPrintableAscii(rawCached.lureDomain) ? rawCached.lureDomain : undefined,
    usedFallback: rawCached.usedFallback === true ? true : undefined,
  } : null;

  // If the cache is a complete LIVE pick, just reuse it — nothing to audit.
  if (cached?.attackerIp && cached?.lureUrl && cached?.lureDomain && !cached.usedFallback) {
    if (JSON.stringify(cached) !== JSON.stringify(rawCached)) writeIocOverrides(cached);
    return cached;
  }

  // If the cache is a complete FALLBACK pick, attempt a live re-pick once
  // before reusing it. This is the fix for "I know we have URLs in
  // ioc_url but the demo keeps using fallbacks" — a stale fallback would
  // otherwise persist indefinitely because the cache was complete.
  if (cached?.attackerIp && cached?.lureUrl && cached?.lureDomain && cached.usedFallback) {
    try {
      const live = await pickRandomIocs();
      if (!live.usedFallback && live.attackerIp && live.lureUrl && live.lureDomain) {
        writeIocOverrides(live);
        return live;
      }
    } catch (err) {
      console.warn('[demo] live re-pick on cached fallback failed', err);
    }
    // Live re-pick still hit fallback — keep the cache and re-seed the
    // STIX indicator so the URL the user sees stays in `ioc_url`.
    if (cached.lureUrl) void seedFallbackUrlIndicator(cached.lureUrl);
    return cached;
  }

  // Try a LIVE pick first with a short timeout — the datastore usually has
  // entries ready (the audit shows 100 accepted on each category) and the
  // user-visible cost of waiting ~1.5s is much lower than the cost of
  // stamping `demoFallback: true` on an incident that didn't need it.
  try {
    const live = await Promise.race<DemoIocOverrides | null>([
      pickRandomIocs(),
      new Promise<null>(resolve => setTimeout(() => resolve(null), 1500)),
    ]);
    if (live && !live.usedFallback && live.attackerIp && live.lureUrl && live.lureDomain) {
      writeIocOverrides(live);
      return live;
    }
  } catch (err) {
    console.warn('[demo] synchronous live IOC pick failed, falling back', err);
  }

  // Live pick timed out or returned a fallback — use the static pool so
  // incident creation isn't blocked further.
  const fresh = pickFallbackIocs();
  // Merge with whatever was cached (in case only one half resolved earlier).
  const merged: DemoIocOverrides = { ...cached, ...fresh };
  if (merged.attackerIp || merged.lureDomain) writeIocOverrides(merged);
  // Mirror the static fallback URL into the `ioc_url` datastore as a STIX
  // 2.1 indicator so Known-IOC chips light up exactly like a live feed.
  if (merged.usedFallback && merged.lureUrl) void seedFallbackUrlIndicator(merged.lureUrl);
  void awaitPendingIndicators().then(() => pickRandomIocs().then(live => {
    const existing = readIocOverrides();
    // If the live pick succeeded (no fallback), upgrade the cache —
    // otherwise only patch in any missing field.
    if (!live.usedFallback && live.attackerIp && live.lureUrl && live.lureDomain) {
      writeIocOverrides(live);
    } else if (!existing?.attackerIp || !existing?.lureUrl || !existing?.lureDomain) {
      writeIocOverrides({ ...merged, ...live });
    }
  }).catch(() => undefined));
  return merged;
};


/**
 * Demo enrichment scheduler.
 *
 * After a demo incident lands in the datastore, schedule the observables to
 * be added one-by-one in the background — exactly the way real Shuffle
 * enrichment runs after an incident is ingested. The first observable
 * shows up after a short delay, with each subsequent one a few seconds
 * later, so the user sees enrichments stream in on the timeline rather
 * than appearing pre-baked.
 *
 * Best-effort: any failure (incident not yet materialized via the webhook
 * pipeline, network blip, etc.) is logged and skipped — we never throw out
 * of a background timer.
 */
const FIRST_ENRICHMENT_DELAY_MS = 4000;
const ENRICHMENT_INTERVAL_MS = 3500;

// Kept for future use — no demo incident currently pre-bakes enrichments,
// but the helper stays available for any seeder that needs to drip observables
// onto a freshly-written incident over time.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const scheduleDemoObservableEnrichment = (
  key: string,
  observables: PendingObservable[],
): void => {
  if (!observables || observables.length === 0) return;

  observables.forEach((obs, idx) => {
    const delay = FIRST_ENRICHMENT_DELAY_MS + idx * ENRICHMENT_INTERVAL_MS;
    window.setTimeout(async () => {
      try {
        // Pull the latest incident state so we don't clobber edits the user
        // (or other background processes) made in the meantime.
        const fetched = await getDatastoreItem(key, DATASTORE_CATEGORIES.INCIDENTS);
        if (!fetched.success || !fetched.item) return;
        const raw = fetched.item.value;
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!parsed || typeof parsed !== 'object') return;

        const seenAt = new Date().toISOString();
        const existingEnrichments = Array.isArray(parsed.enrichments) ? parsed.enrichments : [];
        // De-dupe on (type+value) so re-runs don't pile duplicates on.
        const alreadyPresent = existingEnrichments.some((e: { type?: string; value?: string }) =>
          e?.type === obs.type && e?.value === obs.value,
        );
        if (alreadyPresent) return;

        const updated = {
          ...parsed,
          last_seen_time: seenAt,
          enrichments: [
            ...existingEnrichments,
            { type: obs.type, value: obs.value, first_seen: seenAt, last_seen: seenAt },
          ],
        };

        const res = await setDatastoreItem(key, updated, DATASTORE_CATEGORIES.INCIDENTS);
        if (res.success) {
          broadcastRefresh(DATASTORE_CATEGORIES.INCIDENTS);
        }
      } catch (err) {
        console.warn('[demo] background enrichment failed', { key, obs, err });
      }
    }, delay);
  });
};



// ─── Per-step seeders ────────────────────────────────────────────────────────
// Each returns the number of items written (or 0 if already seeded).

export const STEP_SEEDERS: Record<string, () => Promise<number>> = {
  // welcome — nothing
  welcome: async () => 0,

  // add-outlook / apps — no datastore writes; the user is just learning where to connect
  // tools. Real auth setup is intentionally not faked so cleanup stays simple.
  'add-outlook': async () => 0,
  apps: async () => 0,
  'ingest-webhook': async () => 0,

  // incidents list — seed ONLY the single "Phishing email reported by Diego
  // Ruiz" focus incident. The Wazuh / Sliver C2 follow-up arrives later once
  // the user is on the incident-detail step (see DemoCompletionWatcher), and
  // any other supporting incidents are seeded later still. We intentionally
  // do not drop the full batch here so the user is not overwhelmed on
  // arrival to /incidents.
  //
  // BACKGROUND: Force-enable the curated default threat feeds (no-op when
  // already populated) so the IOC parser starts ingesting real indicators
  // *before* the incident lands. We then try to pick a real IP + domain
  // from `ioc_ip` / `ioc_domain` so the incident's observables match known
  // IOCs out of the box — much more realistic than fake "example" values.
  'incidents-list': async () => {
    // Fire-and-forget: we don't want to block the UI on a feed write.
    void forceEnableDefaultThreatFeeds();
    // Dedup guard: the focus key embeds `now()` so a stale "already seeded"
    // marker (or a partially-failed previous run) would otherwise produce a
    // second "Phishing email reported by Diego Ruiz" with a different key.
    // The shared helper wipes both indexed keys AND any demo-tagged
    // incident on the server whose title matches — covering different
    // browsers / cleared storage / pipeline-renamed keys.
    await wipeExistingDemoIncidents(isDemoFocusIncident, { skipServerScan: true });

    // Try to pick real IOCs. If categories are empty (parser hasn't caught
    // up yet) the builder falls back to its static defaults.
    const overrides = await resolveIocOverrides();
    const item = buildDemoFocusIncident(overrides);
    const res = await setDatastoreItems([item], DATASTORE_CATEGORIES.INCIDENTS);
    if (!res.success) throw new Error(res.error || 'Failed to seed demo focus incident');
    recordSeed(DATASTORE_CATEGORIES.INCIDENTS, [item.key]);
    broadcastRefresh(DATASTORE_CATEGORIES.INCIDENTS);

    // Pre-seed associated demo assets, users, and vulnerabilities so
    // asset correlation, user context (Sarah Chen), and CVE-2024-5274 exist
    // across the platform when the incident is explored.
    try { await STEP_SEEDERS.assets(); } catch { /* best-effort */ }
    try { await STEP_SEEDERS.agent(); } catch { /* best-effort */ }
    try { await STEP_SEEDERS.vulnerabilities(); } catch { /* best-effort */ }

    return 1;
  },

  // incident-detail — no new data, user is exploring an existing one
  'incident-detail': async () => 0,

  // Step 3: assets
  assets: async () => {
    const items = buildDemoAssets();
    const res = await setDatastoreItems(items, DATASTORE_CATEGORIES.ASSETS);
    if (!res.success) throw new Error(res.error || 'Failed to seed demo assets');
    recordSeed(DATASTORE_CATEGORIES.ASSETS, items.map(i => i.key));
    broadcastRefresh(DATASTORE_CATEGORIES.ASSETS);
    return items.length;
  },

  // Step 4: vulnerabilities — seed CVE-2024-5274 (the Chrome RCE the
  // phishing link in the demo "exploits" against FIN-LAPTOP-04).
  vulnerabilities: async () => {
    const items = buildDemoVulnerabilities();
    const res = await setDatastoreItems(items, VULNS_CATEGORY);
    if (!res.success) throw new Error(res.error || 'Failed to seed demo vulnerabilities');
    recordSeed(VULNS_CATEGORY, items.map(i => i.key));
    broadcastRefresh(VULNS_CATEGORY);
    return items.length;
  },

  // Step 5: agent — seed users (used as stakeholders the agent acts on behalf of)
  agent: async () => {
    const items = buildDemoUsers();
    const res = await setDatastoreItems(items, DATASTORE_CATEGORIES.USERS);
    if (!res.success) throw new Error(res.error || 'Failed to seed demo users');
    recordSeed(DATASTORE_CATEGORIES.USERS, items.map(i => i.key));
    broadcastRefresh(DATASTORE_CATEGORIES.USERS);
    return items.length;
  },

  // Step 6 (correlations) — relies on existing data; no new seeds.
  correlations: async () => 0,

  // Step 7 (cve-host-pivot) — make sure the affected asset (FIN-LAPTOP-04)
  // and the exploited CVE (CVE-2024-5274) actually exist in the datastore so
  // the user can pivot from the CVE observable to a real host record. We
  // chain the existing assets + vulnerabilities seeders here so the pivot
  // step is self-contained and does not depend on earlier steps that no
  // longer exist in the tour.
  'cve-host-pivot': async () => {
    let added = 0;
    try { added += await STEP_SEEDERS.assets(); } catch { /* best-effort */ }
    try { added += await STEP_SEEDERS.vulnerabilities(); } catch { /* best-effort */ }
    return added;
  },

  wrap: async () => 0,
};

/**
 * Seed the data for a given tour step, if not already done.
 * Returns the number of items added (0 if step has no data or was already seeded).
 */
export const seedForStep = async (stepId: string): Promise<number> => {
  const seeded = readSeededSteps();
  // For data-bearing steps, treat the "already seeded" marker as stale if the
  // index has no record of any keys for the relevant category. This recovers
  // gracefully when demo data was wiped (manually, via cleanup, or a partial
  // failure) but the step marker is still present.
  const idx = readIndex();
  const looksEmpty = (() => {
    switch (stepId) {
      case 'incidents-list':
        return (idx[DATASTORE_CATEGORIES.INCIDENTS]?.length || 0) === 0;
      case 'assets':
        return (idx[DATASTORE_CATEGORIES.ASSETS]?.length || 0) === 0;
      case 'vulnerabilities':
        return (idx[VULNS_CATEGORY]?.length || 0) === 0;
      case 'agent':
        return (idx[DATASTORE_CATEGORIES.USERS]?.length || 0) === 0;
      default:
        return false;
    }
  })();
  if (seeded.includes(stepId) && !looksEmpty) {
    if (stepId !== 'incidents-list') return 0;
    const present = await countDemoFocusIncidents();
    if (present > 0) return 0;
    writeSeededSteps(seeded.filter(s => s !== stepId));
    const nextIdx = readIndex();
    delete nextIdx[DATASTORE_CATEGORIES.INCIDENTS];
    writeIndex(nextIdx);
  }

  const seeder = STEP_SEEDERS[stepId];
  if (!seeder) return 0;

  // Mark as seeded BEFORE running so concurrent calls don't double-seed.
  if (!seeded.includes(stepId)) writeSeededSteps([...seeded, stepId]);
  // Always set active so cleanup CTA appears even before any data lands
  safeLocalStorage.setItem(DEMO_ACTIVE_KEY, 'true');

  try {
    return await seeder();
  } catch (err) {
    // Roll back the marker so the step can be retried
    writeSeededSteps(readSeededSteps().filter(s => s !== stepId));
    throw err;
  }
};

export interface CleanupResult {
  success: boolean;
  deleted: number;
  failed: number;
}

/**
 * Count demo incidents currently present in the datastore.
 * Looks at items tagged with `metadata.extensions.custom_attributes.demo === true`
 * so this works even if the local seed index was wiped.
 */
export const countDemoIncidents = async (): Promise<number> => {
  try {
    const res = await getDatastoreByCategory(DATASTORE_CATEGORIES.INCIDENTS);
    if (!res.success || !res.data) return 0;
    return res.data.filter(item => {
      if (typeof item.key === 'string' && item.key.startsWith('demo-')) return true;
      try {
        const parsed = typeof item.value === 'string' ? JSON.parse(item.value) : item.value;
        return parsed?.metadata?.extensions?.custom_attributes?.demo === true;
      } catch { return false; }
    }).length;
  } catch { return 0; }
};

export const countDemoFocusIncidents = async (): Promise<number> => {
  try {
    const res = await getDatastoreByCategory(DATASTORE_CATEGORIES.INCIDENTS);
    if (!res.success || !res.data) return 0;
    return res.data.filter(item => isDemoFocusIncident(item.key, item.value)).length;
  } catch { return 0; }
};

/**
 * Force-recreate the demo incidents:
 *  1. Delete any existing demo incidents (indexed + safety scan).
 *  2. Clear the seeded marker for the incidents-list step.
 *  3. Re-run the incidents-list seeder.
 * Returns the number of incidents written.
 */
export const forceRecreateDemoIncidents = async (): Promise<number> => {
  // 1. Delete indexed demo incident keys
  const idx = readIndex();
  const indexedKeys = idx[DATASTORE_CATEGORIES.INCIDENTS] || [];
  if (indexedKeys.length > 0) {
    await Promise.allSettled(indexedKeys.map(k => deleteDatastoreItem(k, DATASTORE_CATEGORIES.INCIDENTS)));
  }

  // 2. Safety scan SKIPPED for performance: fetching the entire incidents
  // category to find orphan demo-tagged items is prohibitively slow on
  // tenants with thousands of real incidents (the user's primary complaint
  // when "Force generate" feels frozen). The local index is authoritative
  // for anything seeded in this browser session; cleanup of cross-browser
  // orphans is handled by the explicit "Clean up demo data" action.

  // 3. Clear the index entry + step marker so the seeder runs fresh
  const newIdx = readIndex();
  delete newIdx[DATASTORE_CATEGORIES.INCIDENTS];
  writeIndex(newIdx);
  writeSeededSteps(readSeededSteps().filter(s => s !== 'incidents-list'));
  broadcastRefresh(DATASTORE_CATEGORIES.INCIDENTS);

  // 4. Re-seed
  return await seedForStep('incidents-list');
};

/**
 * Force-create the single "focus" demo incident (Wazuh / Sliver C2 on
 * FIN-LAPTOP-04). Intended for the tour's "Force generate" button so the
 * user can focus on one incident first; the rest of the batch arrives later
 * for cross-correlation. Idempotent on the focus key suffix — wipes any
 * existing focus incident before writing the new one.
 *
 * Returns the number of incidents written (0 or 1).
 */
export const forceCreateSingleDemoIncident = async (): Promise<number> => {
  const key = await forceCreateSingleDemoIncidentReturningKey();
  return key ? 1 : 0;
};

/**
 * Same as `forceCreateSingleDemoIncident` but returns the freshly-written
 * datastore key so callers can navigate straight to it (used by
 * IncidentDetailPage's demo-aware "not found" recovery).
 */
export const forceCreateSingleDemoIncidentReturningKey = async (): Promise<string | null> => {
  // Wipe any prior focus incident so this stays a single, fresh item.
  // Uses the shared helper so duplicates can't slip in via a different
  // browser / cleared storage / pipeline-renamed key.
  // Skip the full-category server scan: callers hitting "Force generate"
  // expect immediate feedback, and the local index already covers anything
  // we seeded in this session.
  await wipeExistingDemoIncidents(isDemoFocusIncident, { skipServerScan: true });

  // Same as the step seeder: ensure feeds are enabled and reuse / pick real IOCs.
  void forceEnableDefaultThreatFeeds();
  const overrides = await resolveIocOverrides();
  const item = buildDemoFocusIncident(overrides);
  const res = await setDatastoreItems([item], DATASTORE_CATEGORIES.INCIDENTS);
  if (!res.success) throw new Error(res.error || 'Failed to create demo focus incident');
  recordSeed(DATASTORE_CATEGORIES.INCIDENTS, [item.key]);
  broadcastRefresh(DATASTORE_CATEGORIES.INCIDENTS);
  // The focus phishing incident lands "raw" — Shuffle will dynamically add
  // observables in the background once it analyses the incident.
  return item.key;
};

/**
 * Seed the follow-up Sliver C2 implant detection. Instead of writing the
 * incident directly to the datastore, this POSTs the OCSF payload to the
 * user's enabled "Ingestion Webhook" (set up in step #2 of the tour) — so
 * the incident actually flows through the real ingest pipeline they just
 * configured. Falls back to a direct datastore write if the webhook is not
 * available (e.g. the user disabled it).
 *
 * Idempotent on the wazuh key suffix — already-seeded calls are a no-op.
 * Returns the number of incidents written (0 or 1).
 */
export const seedDemoWazuhImplantIncident = async (): Promise<number> => {
  // Server-side dedup: skip seeding if a demo Wazuh / Sliver implant
  // incident already exists anywhere (local index OR backend), and wipe any
  // duplicates that crept in across sessions.
  // Local-index dedup only: fetching the entire incidents category just to
  // check for an existing Wazuh demo incident is too slow on large tenants.
  // The local index reliably tracks anything seeded in this session.
  try {
    const idx = readIndex();
    const existing = idx[DATASTORE_CATEGORIES.INCIDENTS] || [];
    const matches = existing.filter(k => isDemoWazuhIncident(k, null));
    if (matches.length > 0) {
      // Already seeded in this session — wipe extras and bail.
      const extras = matches.slice(1);
      if (extras.length > 0) {
        await Promise.allSettled(
          extras.map(k => deleteDatastoreItem(k, DATASTORE_CATEGORIES.INCIDENTS)),
        );
        idx[DATASTORE_CATEGORIES.INCIDENTS] = existing.filter(k => !extras.includes(k));
        writeIndex(idx);
      }
      return 0;
    }
  } catch { /* best-effort — fall through to seed */ }

  // Reuse the same IOC overrides chosen at step 1 so the IP + domain on the
  // Wazuh follow-up are byte-identical to the focus incident — required for
  // the correlation engine to link them.
  const overrides = await resolveIocOverrides();
  const item = buildDemoWazuhImplantIncident(overrides);

  // Try to resolve the Ingestion Webhook URL from the user's workflows.
  let webhookUrl: string | null = null;
  try {
    const wfRes = await fetch(getApiUrl('/api/v1/workflows'), {
      credentials: 'include',
      headers: { ...getAuthHeader() },
    });
    if (wfRes.ok) {
      const workflows = await wfRes.json();
      if (Array.isArray(workflows)) {
        const webhookWorkflow = workflows.find((w: { name?: string }) => w?.name === 'Ingestion Webhook');
        const triggers = (webhookWorkflow?.triggers || []) as Array<{
          id?: string;
          trigger_id?: string;
          trigger_type?: string;
          app_name?: string;
          status?: string;
        }>;
        const webhookTrigger = triggers.find(t => t.trigger_type === 'WEBHOOK' || t.app_name === 'Webhook');
        const triggerStopped = !webhookTrigger || (webhookTrigger.status || '').toLowerCase() === 'stopped';
        const hookId = webhookTrigger?.id || webhookTrigger?.trigger_id;
        if (hookId && !triggerStopped) {
          webhookUrl = getApiUrl(`/api/v1/hooks/webhook_${hookId}`);
        }
      }
    }
  } catch { /* best-effort — fall through to datastore write */ }

  if (webhookUrl) {
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.value),
      });
      if (res.ok) {
        // Record the key so cleanup still removes it once the pipeline
        // materializes it into the datastore.
        recordSeed(DATASTORE_CATEGORIES.INCIDENTS, [item.key]);
        broadcastRefresh(DATASTORE_CATEGORIES.INCIDENTS);
        // Like the focus phishing incident, the Wazuh / Sliver follow-up
        // lands "raw" — Shuffle is what actually surfaces observables in
        // the background, so the demo no longer pre-bakes them.
        return 1;
      }
    } catch { /* fall through to datastore write */ }
  }

  // Fallback: webhook unavailable — write directly to the datastore.
  const res = await setDatastoreItems([item], DATASTORE_CATEGORIES.INCIDENTS);
  if (!res.success) throw new Error(res.error || 'Failed to seed Sliver implant incident');
  recordSeed(DATASTORE_CATEGORIES.INCIDENTS, [item.key]);
  broadcastRefresh(DATASTORE_CATEGORIES.INCIDENTS);
  // No pre-baked enrichments — Shuffle is responsible for surfacing
  // observables on the Wazuh / Sliver follow-up incident.
  return 1;
};

/**
 * Delete every seeded item.
 *  1. Indexed deletions (keys we wrote, per category).
 *  2. Safety net: scan each category for items with demo: true and remove orphans.
 */
export const cleanupDemoData = async (): Promise<CleanupResult> => {
  const idx = readIndex();
  let deleted = 0;
  let failed = 0;

  for (const category of Object.keys(idx)) {
    const keys = idx[category] || [];
    const results = await Promise.allSettled(keys.map(k => deleteDatastoreItem(k, category)));
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.success) deleted++;
      else failed++;
    }
  }

  const safetyCategories = [
    DATASTORE_CATEGORIES.INCIDENTS,
    DATASTORE_CATEGORIES.ASSETS,
    DATASTORE_CATEGORIES.USERS,
    VULNS_CATEGORY,
    SENSORS_CATEGORY,
    AGENTS_CATEGORY,
    IOC_URL_CATEGORY,
  ];
  for (const category of safetyCategories) {
    try {
      // Paginate the full category — list_cache caps at 50 items per page for
      // INCIDENTS, so a single call would miss demo items past the first page
      // even though `countDemoIncidents` would still find some.
      const orphans: { key: string }[] = [];
      let cursor: string | undefined = undefined;
      let pageGuard = 0;
      do {
        const res: Awaited<ReturnType<typeof getDatastoreByCategory>> = await getDatastoreByCategory(category, cursor);
        if (!res.success || !res.data) {
          if (!res.success) {
            console.warn('[demo] cleanup safety scan failed', { category, error: res.error });
          }
          break;
        }
        for (const item of res.data) {
          // Primary signal: every demo key we write is prefixed with `demo-`
          // (e.g. demo-inc-login-…, demo-asset-…, demo-user-…). This is
          // reliable even when list_cache returns items without their full
          // value payload, where the metadata-tag check below silently misses.
          let isDemoItem = typeof item.key === 'string' && item.key.startsWith('demo-');
          if (!isDemoItem) {
            try {
              const parsed = typeof item.value === 'string' ? JSON.parse(item.value) : item.value;
              isDemoItem = parsed?.metadata?.extensions?.custom_attributes?.demo === true;
            } catch { /* skip */ }
          }
          if (isDemoItem) orphans.push({ key: item.key });
        }
        cursor = res.cursor && res.cursor !== cursor ? res.cursor : undefined;
        pageGuard += 1;
      } while (cursor && pageGuard < 50);

      if (orphans.length === 0) continue;
      console.info('[demo] cleanup found orphans', { category, count: orphans.length });
      const orphanResults = await Promise.allSettled(
        orphans.map(o => deleteDatastoreItem(o.key, category)),
      );
      for (const r of orphanResults) {
        if (r.status === 'fulfilled' && r.value.success) deleted++;
        else {
          failed++;
          if (r.status === 'rejected') {
            console.warn('[demo] cleanup delete rejected', { category, error: r.reason });
          } else if (!r.value.success) {
            console.warn('[demo] cleanup delete failed', { category, error: r.value.error });
          }
        }
      }
    } catch (err) {
      console.warn('[demo] cleanup safety scan threw', { category, err });
    }
  }

  // Restore the user's original "Ingest Tickets" apps (snapshotted at demo
  // start). Best-effort — never block cleanup on this.
  try {
    await restoreOriginalIngestTicketsApps();
  } catch (err) {
    console.warn('[demo] restore ingest tickets failed', err);
  }

  safeLocalStorage.removeItem(DEMO_FLAG_KEY);
  safeLocalStorage.removeItem(DEMO_ACTIVE_KEY);
  safeLocalStorage.removeItem(DEMO_SEEDED_STEPS_KEY);
  safeLocalStorage.removeItem('shuffle_demo_injected_apps');
  safeLocalStorage.removeItem('shuffle_demo_email_source');
  clearIocOverrides();
  try { sessionStorage.removeItem(DEMO_THREAT_FEEDS_RAN_KEY); } catch { /* ignore */ }

  console.info('[demo] cleanup complete', { deleted, failed });
  return { success: failed === 0, deleted, failed };
};

/**
 * Interactive Demo AI Agent Responder
 *
 * When a user comments in demo mode mentioning @AIAgent / @agent, or asks
 * about an observable from the timeline, this handler simulates the live
 * "Assign & Escalate" AI agent workflow. It waits ~2s (for natural pacing),
 * inspects the incident context, generates an authoritative SOC analyst triage
 * response, threads it as a reply under the comment, flips `ai_handled: true`,
 * and triggers/expedites the correlated Wazuh detection.
 */
export const handleDemoAgentComment = async (
  incidentId: string,
  userComment: string,
  commentId: string,
): Promise<void> => {
  // Wait ~2s for realistic agent processing
  await new Promise(resolve => setTimeout(resolve, 2000));

  try {
    const res = await getDatastoreItem(incidentId, DATASTORE_CATEGORIES.INCIDENTS);
    if (!res.success || !res.item) return;

    let ocsf: any = res.item.value;
    if (typeof ocsf === 'string') {
      try { ocsf = JSON.parse(ocsf); } catch { /* ignore */ }
    }
    if (!ocsf || typeof ocsf !== 'object') return;

    const activity: any[] = Array.isArray(ocsf.activity) ? [...ocsf.activity] : [];
    
    // Find parent comment and mark ai_handled: true
    const parentIndex = activity.findIndex(a => a.id === commentId);
    if (parentIndex >= 0) {
      activity[parentIndex] = {
        ...activity[parentIndex],
        ai_handled: true,
      };
    }

    // Determine context-appropriate response
    const lower = (userComment || '').toLowerCase();
    const isIpQuery = lower.includes('185.220.101.47') || lower.includes('ip') || lower.includes('known ioc');

    let replyContent = '';
    if (isIpQuery) {
      replyContent = `**AI Agent Threat Intelligence Assessment**:

* **Indicator**: IP \`185.220.101.47\` (Autonomous System: AS200052, Bulletproof Hosting)
* **Reputation Score**: Critical (98/100 across 14 threat intel feeds)
* **Observed Infrastructure**: Confirmed credential harvesting lure \`https://it-support-portal.live/mfa-reset?u=schen\` and command-and-control (C2) endpoint.
* **Correlated Detections**: The same IP was observed establishing reverse HTTPS beacons from host \`FIN-LAPTOP-04\` following Sarah Chen's interaction with the lure.

**Automated Containment Plan**:
1. [AUTOMATED] Edge firewall block rule dispatched for \`185.220.101.47/32\`.
2. [RECOMMENDED] Isolate endpoint \`FIN-LAPTOP-04\` via EDR to prevent lateral movement.
3. [RECOMMENDED] Revoke all active session tokens for user \`sarah.chen@example.com\`.`;
    } else {
      replyContent = `**AI Agent Triage & Correlation Summary**:

* **Threat Context**: Investigated credential harvesting campaign impersonating internal IT MFA enrollment (\`https://it-support-portal.live/mfa-reset?u=schen\`).
* **Identity Impact**: Sarah Chen (\`sarah.chen@example.com\`, Finance) confirmed clicking the link from workstation \`FIN-LAPTOP-04\`.
* **Vulnerability Exposure**: \`FIN-LAPTOP-04\` runs an outdated Chrome browser vulnerable to \`CVE-2024-5274\` (V8 Type Confusion RCE).
* **Critical Correlation**: Wazuh has flagged a correlated high-severity endpoint detection on \`FIN-LAPTOP-04\` — an unsigned binary \`msedge_proxy.exe\` establishing jittered C2 beacons to \`185.220.101.47\` (Sliver C2 signature).

**Recommended Immediate Next Steps**:
1. Isolate workstation \`FIN-LAPTOP-04\` via EDR immediately.
2. Invalidate active Okta and Microsoft 365 sessions for \`sarah.chen@example.com\`.
3. Pivot through the Correlations tab to review the shared lure URL and correlated Wazuh incident.`;
    }

    const replyId = `comment-agent-${Date.now()}`;
    const agentReply: any = {
      id: replyId,
      type: 'comment',
      user: 'AI Agent',
      is_agent: true,
      timestamp: Date.now(),
      content: replyContent,
      replyToId: commentId,
      ai_handled: true,
      details: {
        agent_model: 'Shuffle AI',
        confidence: 0.96,
      },
    };

    activity.push(agentReply);
    ocsf.activity = activity;
    if (ocsf.metadata?.extensions?.custom_attributes) {
      ocsf.metadata.extensions.custom_attributes.activity = activity;
    }

    await setDatastoreItem(incidentId, ocsf, DATASTORE_CATEGORIES.INCIDENTS);
    broadcastRefresh(DATASTORE_CATEGORIES.INCIDENTS);

    // Notify UI of updated incident
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('incident:refresh', { detail: { incidentId } }));
      window.dispatchEvent(new CustomEvent('demo:incident-agent-replied', { detail: { incidentId, replyId } }));
    }

    // Expedite Wazuh follow-up arrival if not already seeded
    void seedDemoWazuhImplantIncident().then((added) => {
      if (added > 0 && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('demo:wazuh-incident-arrived'));
        broadcastRefresh(DATASTORE_CATEGORIES.INCIDENTS);
      }
    });
  } catch (err) {
    console.warn('[demo] handleDemoAgentComment error', err);
  }
};

/**
 * Synthesizes client-side correlations between active demo incidents and threat intel.
 * This guarantees that even before the backend n-gram indexer finishes indexing,
 * or in offline standalone demo environments, the correlations tab immediately shows
 * the shared lure URL, IP, domain, and affected host linked between the Phishing incident
 * and the Wazuh Sliver C2 incident.
 */
export const getDemoCorrelations = (
  currentIncidentId: string,
  observables: Array<{ type: string; value: string }>,
): Array<{ key: string; amount: number; ref: string[] }> => {
  if (!isDemoActive()) return [];

  const idx = readIndex();
  const incidents = idx[DATASTORE_CATEGORIES.INCIDENTS] || [];
  // Find peer demo incident (if current is focus, peer is wazuh; if current is wazuh, peer is focus)
  const otherIncidents = incidents.filter(k => k.toLowerCase() !== currentIncidentId.toLowerCase());
  if (otherIncidents.length === 0) return [];

  const results: Array<{ key: string; amount: number; ref: string[] }> = [];

  for (const obs of observables) {
    if (!obs?.value) continue;
    const val = obs.value.trim();
    // Only correlate on relevant IOC observables: URL, IP, domain, host
    const isUrl = val.startsWith('http://') || val.startsWith('https://') || val.includes('mfa-reset');
    const isIp = val === '185.220.101.47';
    const isDomain = val.includes('it-support-portal.live');
    const isHost = val === 'FIN-LAPTOP-04';

    if (isUrl || isIp || isDomain || isHost) {
      const refs = [
        `shuffle-security_incidents|${currentIncidentId}`,
        ...otherIncidents.map(peerId => `shuffle-security_incidents|${peerId}`),
      ];

      // Add threat feed ref if it's a known IOC
      if (isUrl) refs.push(`ioc_url|${val}`);
      if (isIp) refs.push(`ioc_ipv4|${val}`);
      if (isHost) refs.push(`shuffle-security_assets|${val}`);

      results.push({
        key: val,
        amount: refs.length,
        ref: refs,
      });
    }
  }

  return results;
};



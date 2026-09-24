import { DATASTORE_CATEGORIES, getDatastoreItem } from '@/Shuffle-MCPs/datastore';
import { getApiUrl, getAuthHeader } from '@/Shuffle-MCPs/api';
import type { Observable, OCSFIncidentFinding } from '@/config/ocsfIncidentSchema';

import { toCanonicalIncidentId } from '@/lib/incidentUrl';

export interface SearchableIncident {
  id: string;
  title?: string;
  source?: string;
  severity: string;
  status: string;
  assignee?: string | null;
  tlp?: string;
  pap?: string;
  references?: string[];
  observables?: Observable[];
  tasks?: Array<{ id: string; title?: string; description?: string; assignee?: string; completed?: boolean }>;
  labels?: string[];
  orgId?: string;
  orgName?: string;
  rawOCSF?: OCSFIncidentFinding | Record<string, any>;
  [key: string]: any;
}

/**
 * Common noise keys returned by correlations or entered as queries that
 * yield overly broad or unhelpful matches.
 */
export const NOISE_CORRELATION_KEYS = new Set([
  'new',
  'in_progress',
  'resolved',
  'escalated',
  'closed',
  'open',
  'pending',
  'critical',
  'high',
  'medium',
  'low',
  'informational',
  'info',
  'warning',
  'error',
  'unknown',
  'none',
  'null',
  'undefined',
  'true',
  'false',
]);

/**
 * Converts any namespaced key (e.g. `org::category::id` or `cat|id`) to its raw entity id.
 */
export const toRawIncidentKey = (key: string): string => {
  if (!key) return '';
  const decoded = toCanonicalIncidentId(key);
  if (decoded.includes('::')) {
    const parts = decoded.split('::').filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : decoded;
  }
  if (decoded.includes('|')) {
    const parts = decoded.split('|').filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : decoded;
  }
  if (decoded.includes('/')) {
    const parts = decoded.split('/').filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : decoded;
  }
  return decoded;
};

/**
 * Builds a comprehensive, unified lowercased text blob containing all searchable
 * fields from an incident record.
 */
export const buildIncidentSearchBlob = (incident: SearchableIncident): string => {
  const parts: string[] = [
    incident.id,
    toRawIncidentKey(incident.id),
    incident.title || '',
    incident.source || '',
    incident.assignee || '',
    incident.severity || '',
    incident.status || '',
    incident.status ? incident.status.replace(/_/g, ' ') : '',
    incident.tlp || '',
    incident.pap || '',
    incident.orgName || '',
    incident.orgId || '',
  ];

  // Labels and tags
  if (incident.labels && incident.labels.length > 0) {
    parts.push(...incident.labels);
  }

  // Observables and IOCs
  if (incident.observables && incident.observables.length > 0) {
    for (const obs of incident.observables) {
      if (obs?.value) parts.push(String(obs.value));
      if (obs?.type) parts.push(String(obs.type));
      if ((obs as any)?.name) parts.push(String((obs as any).name));
    }
  }

  // Tasks
  if (incident.tasks && incident.tasks.length > 0) {
    for (const task of incident.tasks) {
      if (task?.title) parts.push(task.title);
      if (task?.description) parts.push(task.description);
      if (task?.assignee) parts.push(task.assignee);
    }
  }

  // References and external links
  if (incident.references && incident.references.length > 0) {
    parts.push(...incident.references);
  }

  // Deep extraction from raw OCSF payload
  const raw = incident.rawOCSF as any;
  if (raw && typeof raw === 'object') {
    if (raw.desc) parts.push(String(raw.desc));
    if (raw.message) parts.push(String(raw.message));
    if (raw.finding_uid && raw.finding_uid !== incident.id) parts.push(String(raw.finding_uid));
    if (raw.finding_info?.desc) parts.push(String(raw.finding_info.desc));
    if (raw.finding_info?.message) parts.push(String(raw.finding_info.message));
    if (raw.finding_info?.title && raw.finding_info.title !== incident.title) {
      parts.push(String(raw.finding_info.title));
    }
    if (raw.analytic?.name) parts.push(String(raw.analytic.name));
    if (raw.category_name) parts.push(String(raw.category_name));
    if (raw.class_name) parts.push(String(raw.class_name));

    // Email metadata if phishing
    if (raw.email?.subject) parts.push(String(raw.email.subject));
    if (raw.email?.from) parts.push(String(raw.email.from));
    if (raw.email?.to) {
      parts.push(Array.isArray(raw.email.to) ? raw.email.to.join(' ') : String(raw.email.to));
    }

    // Host & device info
    if (raw.device?.hostname) parts.push(String(raw.device.hostname));
    if (raw.device?.ip) parts.push(String(raw.device.ip));

    // Actor / user info
    if (raw.actor?.user?.name) parts.push(String(raw.actor.user.name));
    if (raw.actor?.user?.uid) parts.push(String(raw.actor.user.uid));

    // Custom extension attributes
    const customAttrs = raw.metadata?.extensions?.custom_attributes;
    if (customAttrs && typeof customAttrs === 'object') {
      if (customAttrs.external_id) parts.push(String(customAttrs.external_id));
      if (customAttrs.ticket_id) parts.push(String(customAttrs.ticket_id));
      if (customAttrs.ticket_url) parts.push(String(customAttrs.ticket_url));
      if (customAttrs.thread_id) parts.push(String(customAttrs.thread_id));
    }
  }

  return parts.filter(Boolean).join(' ').toLowerCase();
};

/**
 * WeakMap cache holding memoized lowercased search blobs for incident objects.
 * Guarantees each incident is parsed and lowercased at most once across renders.
 */
const incidentSearchBlobCache = new WeakMap<object, string>();

/**
 * Retrieves the memoized search blob for an incident.
 */
export const getIncidentSearchBlob = (incident: SearchableIncident): string => {
  let blob = incidentSearchBlobCache.get(incident);
  if (!blob) {
    blob = buildIncidentSearchBlob(incident);
    incidentSearchBlobCache.set(incident, blob);
  }
  return blob;
};

/**
 * Evaluates whether an incident matches a search query across all tokens.
 * Multi-token queries (e.g. "phishing critical") require every token to match (AND logic).
 */
export const matchIncidentSearchText = (
  incident: SearchableIncident,
  searchTokens: string[],
): boolean => {
  if (searchTokens.length === 0) return true;
  const blob = getIncidentSearchBlob(incident);
  for (let i = 0; i < searchTokens.length; i++) {
    if (!blob.includes(searchTokens[i])) {
      return false;
    }
  }
  return true;
};

/**
 * Queries the platform correlations API (/api/v2/correlations) for matching incident IDs.
 * Searches both datastore text correlations and observable value correlations in parallel.
 */
export const queryIncidentCorrelations = async (
  query: string,
  currentOrgId?: string | null,
  signal?: AbortSignal,
): Promise<string[]> => {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length < 2) return [];

  const lowerQuery = trimmed.toLowerCase();
  if (NOISE_CORRELATION_KEYS.has(lowerQuery)) return [];

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...getAuthHeader(),
    ...(currentOrgId ? { 'Org-Id': currentOrgId } : {}),
  };

  // Run datastore text correlation and value correlation concurrently
  const requests = [
    fetch(getApiUrl('/api/v2/correlations'), {
      method: 'POST',
      credentials: 'include',
      headers,
      signal,
      body: JSON.stringify({
        type: 'datastore',
        key: trimmed,
        category: DATASTORE_CATEGORIES.INCIDENTS,
      }),
    }),
    fetch(getApiUrl('/api/v2/correlations'), {
      method: 'POST',
      credentials: 'include',
      headers,
      signal,
      body: JSON.stringify({
        type: 'value',
        key: lowerQuery,
      }),
    }),
  ];

  const results = await Promise.allSettled(requests);
  const matchedIncidentIds = new Set<string>();

  for (const res of results) {
    if (res.status !== 'fulfilled' || !res.value.ok) continue;

    try {
      const data = await res.value.json();
      const rawCorrelationData = Array.isArray(data)
        ? data
        : data.correlations || data.data || [];
      const correlationData = Array.isArray(rawCorrelationData) ? rawCorrelationData : [];

      for (const item of correlationData) {
        if (!item || typeof item !== 'object') continue;
        if (typeof item.key === 'string' && NOISE_CORRELATION_KEYS.has(item.key.toLowerCase())) {
          continue;
        }
        if (!Array.isArray(item.ref)) continue;

        for (const ref of item.ref) {
          if (typeof ref !== 'string') continue;
          if (
            ref.includes('shuffle-security_incidents') ||
            ref.includes(DATASTORE_CATEGORIES.INCIDENTS) ||
            ref.includes('incidents')
          ) {
            const rawId = toRawIncidentKey(ref);
            if (rawId && !NOISE_CORRELATION_KEYS.has(rawId.toLowerCase())) {
              matchedIncidentIds.add(rawId);
            }
          }
        }
      }
    } catch {
      // Ignore JSON parse errors from non-standard responses
    }
  }

  return Array.from(matchedIncidentIds);
};

/**
 * Fetches datastore records for any correlated incident IDs that are not yet loaded
 * in the active frontend dataset, converting them via the page's parser.
 */
export const fetchMissingCorrelatedIncidents = async <T>(
  missingIds: string[],
  parseFn: (item: any) => T | null,
  maxFetch = 15,
): Promise<T[]> => {
  if (!missingIds || missingIds.length === 0) return [];

  const targets = missingIds.slice(0, maxFetch);
  const fetched = await Promise.allSettled(
    targets.map(async (id) => {
      const rawId = toRawIncidentKey(id);
      const resp = await getDatastoreItem(rawId, DATASTORE_CATEGORIES.INCIDENTS);
      if (resp.success && resp.item) {
        return parseFn(resp.item);
      }
      return null;
    }),
  );

  const out: T[] = [];
  for (const r of fetched) {
    if (r.status === 'fulfilled' && r.value) {
      out.push(r.value);
    }
  }
  return out;
};

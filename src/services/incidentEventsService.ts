/**
 * Incident Events Service
 *
 * Manages incident events stored independently in the `shuffle-security_events`
 * datastore category with keys formatted as `${incidentId}_${eventId}`.
 * Provides extraction from unmapped source payloads and cross-incident correlation.
 */

import {
  getDatastoreByCategory,
  setDatastoreItem,
  setDatastoreItems,
  deleteDatastoreItem,
  DATASTORE_CATEGORIES,
} from '@/Shuffle-MCPs/datastore';
import {
  IncidentEvent,
  createEventKey,
  parseEventKey,
  generateEventFingerprint,
} from '@/config/ocsfIncidentSchema';

/** Simple deterministic string hash for stable ID generation */
const quickHash = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36).slice(0, 8);
};

/** Normalize severity strings or numbers to standard OCSF-aligned levels */
const normalizeSeverity = (
  rawSeverity: unknown,
): { severity: IncidentEvent['severity']; severity_id: number } => {
  if (typeof rawSeverity === 'number') {
    if (rawSeverity >= 5) return { severity: 'critical', severity_id: 5 };
    if (rawSeverity === 4) return { severity: 'high', severity_id: 4 };
    if (rawSeverity === 3) return { severity: 'medium', severity_id: 3 };
    if (rawSeverity === 2) return { severity: 'low', severity_id: 2 };
    return { severity: 'informational', severity_id: 1 };
  }

  const s = String(rawSeverity || '').trim().toLowerCase();
  if (s.includes('crit') || s === '5') return { severity: 'critical', severity_id: 5 };
  if (s.includes('high') || s.includes('error') || s === '4') return { severity: 'high', severity_id: 4 };
  if (s.includes('med') || s.includes('warn') || s === '3') return { severity: 'medium', severity_id: 3 };
  if (s.includes('low') || s === '2') return { severity: 'low', severity_id: 2 };
  return { severity: 'informational', severity_id: 1 };
};

/**
 * Load all events for a given incident from `shuffle-security_events`.
 * Also scans the category to discover cross-incident correlations where
 * events share identical fingerprints or source UIDs.
 */
export const loadIncidentEvents = async (
  incidentId: string,
  orgId?: string,
): Promise<{
  events: IncidentEvent[];
  allOrgEventsCount: number;
  error?: string;
}> => {
  if (!incidentId) return { events: [], allOrgEventsCount: 0 };

  try {
    const res = await getDatastoreByCategory(
      DATASTORE_CATEGORIES.EVENTS,
      undefined,
      1000,
      orgId,
    );

    if (!res.success && res.error) {
      return { events: [], allOrgEventsCount: 0, error: res.error };
    }

    const items = res.data || [];
    const parsedEvents: IncidentEvent[] = [];
    const allOrgEvents: IncidentEvent[] = [];

    // Map of fingerprint -> incident IDs for correlation
    const fingerprintToIncidents = new Map<string, Set<string>>();

    for (const item of items) {
      if (!item.value) continue;
      let eventObj: any;
      try {
        eventObj = typeof item.value === 'string' ? JSON.parse(item.value) : item.value;
      } catch {
        continue;
      }

      if (!eventObj || typeof eventObj !== 'object') continue;

      const parsedKey = parseEventKey(item.key);
      const incId = eventObj.incident_id || parsedKey?.incidentId || '';
      const eventId = eventObj.id || parsedKey?.eventId || item.key;
      const compositeKey = item.key || createEventKey(incId, eventId);

      const fp = eventObj.fingerprint || generateEventFingerprint(eventObj);

      const normalized: IncidentEvent = {
        ...eventObj,
        key: compositeKey,
        id: eventId,
        incident_id: incId,
        fingerprint: fp,
      };

      allOrgEvents.push(normalized);

      // Track fingerprint occurrences across incidents
      if (fp && incId) {
        if (!fingerprintToIncidents.has(fp)) {
          fingerprintToIncidents.set(fp, new Set());
        }
        fingerprintToIncidents.get(fp)!.add(incId);
      }

      if (incId === incidentId || item.key.startsWith(`${incidentId}_`)) {
        parsedEvents.push(normalized);
      }
    }

    // Annotate events with cross-incident correlations
    for (const ev of parsedEvents) {
      if (ev.fingerprint && fingerprintToIncidents.has(ev.fingerprint)) {
        const matchingIncidents = Array.from(fingerprintToIncidents.get(ev.fingerprint)!).filter(
          (otherId) => otherId !== incidentId,
        );
        if (matchingIncidents.length > 0) {
          ev.correlated_incident_ids = matchingIncidents;
        }
      }
    }

    // Sort by timestamp desc (newest first)
    parsedEvents.sort((a, b) => {
      const timeA = typeof a.time === 'number' ? a.time : (a.time ? new Date(a.time).getTime() : 0);
      const timeB = typeof b.time === 'number' ? b.time : (b.time ? new Date(b.time).getTime() : 0);
      return timeB - timeA;
    });

    return {
      events: parsedEvents,
      allOrgEventsCount: allOrgEvents.length,
    };
  } catch (err: any) {
    console.error('[IncidentEventsService] Failed to load events:', err);
    return { events: [], allOrgEventsCount: 0, error: err?.message || 'Failed to load events' };
  }
};

/**
 * Save or update a single incident event in `shuffle-security_events`
 */
export const saveIncidentEvent = async (
  event: IncidentEvent,
  orgId?: string,
): Promise<{ success: boolean; key: string; error?: string }> => {
  if (!event.incident_id || !event.id) {
    return { success: false, key: '', error: 'Missing incident_id or event id' };
  }

  const key = event.key || createEventKey(event.incident_id, event.id);
  const fingerprint = event.fingerprint || generateEventFingerprint(event);

  const payload: IncidentEvent = {
    ...event,
    key,
    fingerprint,
  };

  const res = await setDatastoreItem(key, payload, DATASTORE_CATEGORIES.EVENTS, orgId);
  return {
    success: !!res.success,
    key,
    error: res.error,
  };
};

/**
 * Bulk save multiple incident events in `shuffle-security_events`
 */
export const bulkSaveIncidentEvents = async (
  events: IncidentEvent[],
  orgId?: string,
): Promise<{ success: boolean; error?: string; count: number }> => {
  if (!events || events.length === 0) return { success: true, count: 0 };

  const items = events.map((event) => {
    const key = event.key || createEventKey(event.incident_id, event.id);
    const fp = event.fingerprint || generateEventFingerprint(event);
    const value: IncidentEvent = {
      ...event,
      key,
      fingerprint: fp,
    };
    return { key, value };
  });

  const res = await setDatastoreItems(items, DATASTORE_CATEGORIES.EVENTS);
  return {
    success: !!res.success,
    error: res.error,
    count: items.length,
  };
};

/**
 * Delete an incident event from `shuffle-security_events`
 */
export const deleteIncidentEvent = async (
  key: string,
  orgId?: string,
): Promise<{ success: boolean; error?: string }> => {
  if (!key) return { success: false, error: 'Missing key' };
  const res = await deleteDatastoreItem(key, DATASTORE_CATEGORIES.EVENTS, orgId);
  return {
    success: !!res.success,
    error: res.error,
  };
};

/**
 * Checks whether an unmapped raw payload contains extractable events or logs.
 */
export const hasExtractableEvents = (unmappedOriginal: any): boolean => {
  if (!unmappedOriginal) return false;
  let root = unmappedOriginal;

  if (typeof root === 'string') {
    try {
      root = JSON.parse(root);
    } catch {
      return false;
    }
  }

  if (Array.isArray(root)) return root.length > 0;
  if (!root || typeof root !== 'object') return false;

  const candidateArrays = [
    root.events,
    root.results,
    root.records,
    root.logs,
    root.alerts,
    root.items,
    root.rows,
    root.findings,
    root.entries,
    root.data,
    root.hits?.hits,
    root.payload?.events,
    root.payload?.results,
    root.payload?.records,
  ];

  return candidateArrays.some((arr) => Array.isArray(arr) && arr.length > 0);
};

/**
 * Extract structured `IncidentEvent[]` records from raw provider data in `unmapped_original`.
 */
export const extractEventsFromUnmapped = (
  incidentId: string,
  unmappedOriginal: any,
  defaultSource?: string,
): IncidentEvent[] => {
  if (!incidentId || !unmappedOriginal) return [];

  let root = unmappedOriginal;
  if (typeof root === 'string') {
    try {
      root = JSON.parse(root);
    } catch {
      return [];
    }
  }

  // Find candidate array
  let rawList: any[] = [];
  if (Array.isArray(root)) {
    rawList = root;
  } else if (root && typeof root === 'object') {
    const candidateKeys = [
      'events',
      'results',
      'records',
      'logs',
      'alerts',
      'items',
      'rows',
      'findings',
      'entries',
      'data',
    ];

    for (const k of candidateKeys) {
      if (Array.isArray(root[k]) && root[k].length > 0) {
        rawList = root[k];
        break;
      }
    }

    if (rawList.length === 0 && Array.isArray(root.hits?.hits)) {
      rawList = root.hits.hits.map((h: any) => h._source || h);
    }

    if (rawList.length === 0 && root.payload && typeof root.payload === 'object') {
      for (const k of candidateKeys) {
        if (Array.isArray(root.payload[k]) && root.payload[k].length > 0) {
          rawList = root.payload[k];
          break;
        }
      }
    }

    // Fallback: if the root itself looks like a single event object
    if (rawList.length === 0 && (root.event_id || root.id || root.timestamp || root.action || root.name)) {
      rawList = [root];
    }
  }

  const extracted: IncidentEvent[] = [];

  rawList.forEach((rawItem, index) => {
    if (!rawItem || typeof rawItem !== 'object') return;

    // Time discovery
    const rawTime =
      rawItem.timestamp ||
      rawItem.time ||
      rawItem['@timestamp'] ||
      rawItem.created_time ||
      rawItem.event_time ||
      rawItem.EventTime ||
      rawItem.created ||
      rawItem.date ||
      rawItem.datetime;

    const time = rawTime ? (typeof rawTime === 'string' || typeof rawTime === 'number' ? rawTime : String(rawTime)) : new Date().toISOString();

    // Source discovery
    const source =
      rawItem.source ||
      rawItem.product ||
      rawItem.vendor ||
      rawItem.sourcetype ||
      rawItem.app ||
      rawItem.provider ||
      defaultSource ||
      'Source Telemetry';

    // Type discovery
    const type =
      rawItem.type ||
      rawItem.event_type ||
      rawItem.category ||
      rawItem.class ||
      rawItem.activity_name ||
      rawItem.log_name ||
      'event';

    // Action / Title discovery
    const action =
      rawItem.action ||
      rawItem.name ||
      rawItem.title ||
      rawItem.description ||
      rawItem.message ||
      rawItem.headline ||
      `Event ${index + 1}`;

    // Severity discovery
    const rawSev =
      rawItem.severity ||
      rawItem.severity_id ||
      rawItem.level ||
      rawItem.priority ||
      rawItem.alert_level;
    const { severity, severity_id } = normalizeSeverity(rawSev);

    // UID / ID
    const rawUid =
      rawItem.id ||
      rawItem.uid ||
      rawItem.event_id ||
      rawItem.alert_id ||
      rawItem.uuid ||
      `evt_${index + 1}_${quickHash(JSON.stringify(rawItem))}`;

    const eventId = String(rawUid);
    const key = createEventKey(incidentId, eventId);

    const eventRecord: IncidentEvent = {
      key,
      id: eventId,
      incident_id: incidentId,
      time,
      source: String(source),
      type: String(type),
      action: String(action),
      severity,
      severity_id,
      status: 'relevant',
      tags: Array.isArray(rawItem.tags) ? rawItem.tags.map(String) : [],
      message: typeof rawItem.message === 'string' ? rawItem.message : (typeof rawItem.description === 'string' ? rawItem.description : undefined),
      raw: rawItem,
    };

    eventRecord.fingerprint = generateEventFingerprint(eventRecord);
    extracted.push(eventRecord);
  });

  return extracted;
};

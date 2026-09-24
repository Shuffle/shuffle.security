/**
 * Cross-reference incident merging.
 *
 * Instead of destructively folding a source incident into a target (the
 * legacy `smartMerge` approach), we store a symmetric pointer array on
 * each side and cross-load the linked payloads at render time.
 *
 *   related_incidents: [
 *     { id, relation, primary, linked_at, linked_by, previous_status? }
 *   ]
 *
 * Non-primary incidents are flipped to `status_id: 6` ("Merged"). Their
 * detail page shows a "jump to primary" CTA. The primary's detail page
 * unions email threads / observables / activity from linked incidents.
 *
 * All writes stay on the frontend via `setDatastoreItem` — no backend
 * follow-pointer is required. New replies to either thread keep flowing
 * into their own incident (provider still overwrites by thread-id) and
 * simply appear in the union view.
 */

import {
  getDatastoreItem,
  setDatastoreItem,
  DATASTORE_CATEGORIES,
} from '@/Shuffle-MCPs/datastore';
import { statusConfig } from '@/config/incidentConfig';
import { deepMergeIncidents } from '@/lib/utils';
import { toCanonicalIncidentId } from './incidentUrl';

/**
 * Identity / user-editable fields that MUST stay owned by the primary
 * during a fold. These are things an analyst may have deliberately set
 * on the primary (title, severity, priority, assignee, description...)
 * — a later source folding in must NEVER overwrite them, even if the
 * source is more recent. Data fields (observables, correlations,
 * activity, tasks, iocs, stakeholders, email_thread, ...) are still
 * unioned by the deep merge and are intentionally NOT listed here.
 */
const PRIMARY_IDENTITY_KEYS = [
  // identity
  'id', 'finding_uid', 'uid',
  // headline / classification (all potentially user-edited)
  'title', 'message', 'description', 'summary',
  'status', 'status_id', 'status_detail',
  'severity', 'severity_id',
  'priority', 'priority_id',
  'confidence', 'confidence_id', 'confidence_score',
  'impact', 'impact_id', 'impact_score',
  'risk_level', 'risk_level_id', 'risk_score',
  // taxonomy
  'activity_name', 'activity_id',
  'category_name', 'category_uid',
  'class_name', 'class_uid',
  'type_name', 'type_uid',
  // times owned by the primary row
  'created_time', 'created_time_dt',
  'event_time', 'time', 'time_dt',
  // nested finding_info carries title/severity/etc.
  'finding_info', 'finding_info_list',
  // ownership / routing
  'assignee', 'assignee_id', 'owner', 'product',
  // merge bookkeeping
  'related_incidents', 'merged_into', 'merged_at',
];

const extractIncidentTs = (raw: any): number => {
  if (!raw || typeof raw !== 'object') return 0;
  const candidates: unknown[] = [
    raw.modified_time_dt, raw.updated_time_dt, raw.updated_at, raw.modified_at,
    raw.time_dt, raw.time, raw.event_time,
    raw.created_time_dt, raw.created_time, raw.created_at,
  ];
  for (const c of candidates) {
    if (typeof c === 'number' && Number.isFinite(c) && c > 0) {
      return c < 1e12 ? c * 1000 : c;
    }
    if (typeof c === 'string' && c) {
      const parsed = Date.parse(c);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }
  return 0;
};

/**
 * Non-destructively fold the source's *data* fields (observables,
 * correlations, activity, tasks, email_thread, iocs, stakeholders,
 * labels, references, custom_attributes, ...) INTO the primary while
 * preserving the primary's identity. This is what keeps timelines,
 * observables and correlations intact after an auto-merge: the primary
 * row becomes the union of every merged sibling.
 */
const foldSourceIntoPrimary = (primaryRaw: any, sourceRaw: any): any => {
  const cleanSourceRaw = stripMergeAuditActivity(sourceRaw);
  const pTs = extractIncidentTs(primaryRaw);
  const sTs = extractIncidentTs(cleanSourceRaw);
  const folded: any = deepMergeIncidents(
    primaryRaw || {},
    cleanSourceRaw || {},
    pTs,
    sTs,
  );
  for (const key of PRIMARY_IDENTITY_KEYS) {
    if (primaryRaw && Object.prototype.hasOwnProperty.call(primaryRaw, key)) {
      folded[key] = primaryRaw[key];
    } else {
      delete folded[key];
    }
  }
  return folded;
};


export type IncidentRelation = 'merged' | 'duplicate' | 'related';

export interface RelatedIncidentPointer {
  id: string;
  relation: IncidentRelation;
  /**
   * True when the *pointed-at* incident is the primary of the pair (i.e.
   * "this pointer takes you to the primary"). Exactly one side of a
   * merge pair carries `primary: true`.
   */
  primary: boolean;
  linked_at: number;
  linked_by?: string;
  /** Stashed on the non-primary side so unmerge can restore prior status. */
  previous_status?: string;
  previous_status_id?: number;
}

const MERGED_STATUS_ID = statusConfig.merged?.id ?? 6;
const MERGED_STATUS_LABEL = statusConfig.merged?.label ?? 'Merged';

const incidentIdKey = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  const canonical = toCanonicalIncidentId(value);
  if (!canonical) return '';
  if (canonical.includes('|')) return canonical.split('|').pop()?.toLowerCase() || canonical.toLowerCase();
  if (canonical.includes('/')) return canonical.split('/').pop()?.toLowerCase() || canonical.toLowerCase();
  return canonical.toLowerCase();
};

const isMergeAuditActivityItem = (item: any): boolean => {
  if (!item || typeof item !== 'object' || item.type !== 'system') return false;
  const id = String(item.id || '');
  if (id.startsWith('merge-') || id.startsWith('merge-in-')) return true;
  return /^Merged (data )?(from|into) /i.test(String(item.content || ''));
};

const mergeAuditDedupeKey = (item: any): string | null => {
  if (!isMergeAuditActivityItem(item)) return null;
  const id = String(item.id || '');
  if (id.startsWith('merge-in-')) {
    const sourcePart = id.replace(/^merge-in-/, '').replace(/-\d{10,}$/, '');
    if (sourcePart) return `merge-in:${sourcePart.toLowerCase()}`;
  }
  const content = String(item.content || '').trim().replace(/\s+/g, ' ').toLowerCase();
  if (content) return `merge-content:${content}`;
  return null;
};

const dedupeMergeAuditActivity = (activity: any[]): any[] => {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const item of activity) {
    const key = mergeAuditDedupeKey(item);
    if (key) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push(item);
  }
  return out;
};

const stripMergeAuditActivity = (raw: any): any => {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.activity)) return raw;
  return {
    ...raw,
    activity: raw.activity.filter((item: any) => !isMergeAuditActivityItem(item)),
  };
};

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

export const getRelatedIncidents = (raw: any): RelatedIncidentPointer[] => {
  if (!raw || typeof raw !== 'object') return [];
  const arr = raw.related_incidents;
  if (!Array.isArray(arr)) return [];
  return arr.filter((p): p is RelatedIncidentPointer =>
    p && typeof p.id === 'string' && typeof p.relation === 'string');
};

/** True when this row actively points at another incident as its primary. */
export const hasActiveMergedSourceRelation = (raw: any): boolean => {
  if (!raw || typeof raw !== 'object') return false;
  // Legacy destructive merge tombstone.
  if (raw.status_id === 99) return true;
  const primaryPointer = getRelatedIncidents(raw).find(
    (p) => p.relation === 'merged' && p.primary && !wasUnmergedFrom(raw, p.id),
  );
  if (primaryPointer) return true;
  const mergedInto = relationRefId(raw.merged_into);
  return !!mergedInto && !wasUnmergedFrom(raw, mergedInto);
};

/**
 * Hard invariant: if an incident is the non-primary side of a merge, its
 * status must be Merged. This prevents stale detail/list saves from preserving
 * the merge pointer while accidentally restoring an older "New" status.
 */
export const enforceMergedStatusInvariant = (raw: any): any => {
  if (!hasActiveMergedSourceRelation(raw)) return raw;
  if (raw?.status_id === MERGED_STATUS_ID && raw?.status === MERGED_STATUS_LABEL) return raw;
  return {
    ...(raw || {}),
    status_id: MERGED_STATUS_ID,
    status: MERGED_STATUS_LABEL,
  };
};

/** True when this incident is the non-primary side of a merge pair. */
export const isMergedIncident = (raw: any): boolean => {
  if (!raw || typeof raw !== 'object') return false;
  if (raw.status_id === MERGED_STATUS_ID) return true;
  return hasActiveMergedSourceRelation(raw);
};

/**
 * True when an incident is finished (Resolved or Closed).
 *
 * A finished thread must not keep absorbing new incidents: once an analyst
 * has resolved/closed the anchor, later arrivals stay separate so they get
 * their own triage instead of silently disappearing into a closed case.
 */
export const isClosedIncident = (raw: any): boolean => {
  if (!raw || typeof raw !== 'object') return false;
  const s = String(raw.status || '').toLowerCase().replace(/\s+/g, '_');
  if (s === 'resolved' || s === 'closed') return true;
  // OCSF mapping used across the app: 4 = Resolved/Closed.
  return raw.status_id === 4;
};



/** Returns the pointer that leads to the primary, or null if this is the primary.
 *  Skips any pointer that has been explicitly unmerged — those tombstones must
 *  never resurrect the "merged into" banner. */
export const getPrimaryPointer = (raw: any): RelatedIncidentPointer | null => {
  const pointers = getRelatedIncidents(raw);
  return pointers.find(p => p.relation === 'merged' && p.primary && !wasUnmergedFrom(raw, p.id)) || null;
};

/** Returns pointers to the non-primary linked incidents (this incident is primary).
 *  Also filters unmerged pointers for the same reason as above. */
export const getLinkedPointers = (raw: any): RelatedIncidentPointer[] => {
  return getRelatedIncidents(raw).filter(p => p.relation === 'merged' && !p.primary && !wasUnmergedFrom(raw, p.id));
};

// ---------------------------------------------------------------------------
// Writers
// ---------------------------------------------------------------------------

const upsertPointer = (
  raw: any,
  pointer: RelatedIncidentPointer,
): any => {
  const next = { ...(raw || {}) };
  const existing = getRelatedIncidents(next);
  const pointerKey = incidentIdKey(pointer.id);
  const filtered = existing.filter(p => incidentIdKey(p.id) !== pointerKey);
  next.related_incidents = [...filtered, pointer];
  return next;
};

const removePointer = (raw: any, targetId: string): any => {
  const next = { ...(raw || {}) };
  const existing = getRelatedIncidents(next);
  const key = String(targetId || '').toLowerCase();
  next.related_incidents = existing.filter(p => String(p.id || '').toLowerCase() !== key);
  return next;
};

const relationRefId = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.includes('|')) return trimmed.split('|').pop() || trimmed;
  if (trimmed.includes('/')) return trimmed.split('/').pop() || trimmed;
  return trimmed;
};

const relationRefKey = (value: unknown): string => relationRefId(value).toLowerCase();

const getRelationRefs = (raw: any): string[] => {
  if (!raw || typeof raw !== 'object') return [];
  const refs: string[] = [];
  if (Array.isArray(raw.related_events)) {
    refs.push(...raw.related_events.filter((x: unknown): x is string => typeof x === 'string' && x.trim().length > 0));
  }
  if (Array.isArray(raw.related_findings)) {
    refs.push(...raw.related_findings.filter((x: unknown): x is string => typeof x === 'string' && x.trim().length > 0));
  }
  return refs;
};

const unionRelationRefs = (...groups: string[][]): string[] => {
  const byId = new Map<string, string>();
  for (const group of groups) {
    for (const ref of group) {
      const key = relationRefKey(ref);
      if (!key) continue;
      if (!byId.has(key)) byId.set(key, ref);
    }
  }
  return Array.from(byId.values());
};

const upsertRelatedEventRefs = (raw: any, ids: string[]): any => {
  const next: any = { ...(raw || {}) };
  const merged = unionRelationRefs(getRelationRefs(next), ids.filter(Boolean));
  next.related_events = merged;
  if (Array.isArray(next.related_findings)) next.related_findings = merged;
  return next;
};

const writeAndVerifyPrimaryMerge = async (
  primaryId: string,
  nextPrimary: any,
  requiredPointers: RelatedIncidentPointer[],
): Promise<{ success: boolean; error?: string; raw?: any }> => {
  const requiredIds = Array.from(new Set(
    requiredPointers
      .map((p) => p.id)
      .filter((id): id is string => typeof id === 'string' && id.trim().length > 0),
  ));
  let payload = upsertRelatedEventRefs(nextPrimary, requiredIds);

  let lastReadError: string | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const write = await writeIncidentSafe(primaryId, payload);
    if (!write.success) {
      return { success: false, error: write.error || `Failed to update primary ${primaryId} (attempt ${attempt + 1}/2)` };
    }

    let storedRaw: any = null;
    let readErr: string | null = null;
    let readOk = false;
    try {
      const read = await getDatastoreItem(primaryId, DATASTORE_CATEGORIES.INCIDENTS);
      readOk = !!read?.success;
      if (!readOk) {
        readErr = (read as any)?.error || 'read-back returned success=false';
      } else if (!read.item?.value) {
        readErr = 'read-back returned no value';
      } else {
        try {
          storedRaw = JSON.parse(read.item.value);
        } catch (parseErr: any) {
          readErr = `read-back JSON parse failed: ${parseErr?.message || String(parseErr)}`;
        }
      }
    } catch (e: any) {
      readErr = `read-back threw: ${e?.message || String(e)}`;
    }
    lastReadError = readErr;

    if (!storedRaw || typeof storedRaw !== 'object') {
      if (attempt === 0) continue;
      return {
        success: false,
        error: `Failed to verify primary merge metadata for ${primaryId}: ${readErr || 'stored value not an object'}`,
      };
    }

    const linkedKeys = new Set(getLinkedPointers(storedRaw).map((p) => incidentIdKey(p.id)));
    const relatedKeys = new Set(getRelationRefs(storedRaw).map((ref) => relationRefKey(ref)));
    const missingPointerIds = requiredIds.filter((id) => !linkedKeys.has(incidentIdKey(id)));
    const missingRelatedIds = requiredIds.filter((id) => !relatedKeys.has(id.toLowerCase()));

    if (missingPointerIds.length === 0 && missingRelatedIds.length === 0) {
      return { success: true, raw: storedRaw };
    }

    if (attempt === 1) {
      const samplePointer = missingPointerIds[0];
      const sampleRelated = missingRelatedIds[0];
      const bits: string[] = [];
      if (missingPointerIds.length > 0) {
        bits.push(`${missingPointerIds.length} missing pointer${missingPointerIds.length === 1 ? '' : 's'}${samplePointer ? ` (e.g. ${samplePointer})` : ''}`);
      }
      if (missingRelatedIds.length > 0) {
        bits.push(`${missingRelatedIds.length} missing related event${missingRelatedIds.length === 1 ? '' : 's'}${sampleRelated ? ` (e.g. ${sampleRelated})` : ''}`);
      }
      return {
        success: false,
        error: `Primary merge metadata did not verify on ${primaryId} after 2 write/read cycles — ${bits.join(', ')}`,
      };
    }

    payload = upsertRelatedEventRefs(storedRaw, requiredIds);
    for (const pointer of requiredPointers) {
      payload = upsertPointer(payload, pointer);
    }
  }

  return {
    success: false,
    error: `Failed to verify primary merge metadata for ${primaryId}${lastReadError ? `: ${lastReadError}` : ''}`,
  };
};

interface LinkArgs {
  /** The incident chosen as the merge target (becomes primary). */
  primaryId: string;
  primaryRaw: any;
  primaryTitle?: string;
  /** The incident being merged (becomes non-primary, flipped to Merged). */
  sourceId: string;
  sourceRaw: any;
  sourceTitle?: string;
  linkedBy?: string;
}

/**
 * Link two incidents as a merge pair. Writes two datastore rows:
 *   primary  <- adds { id: source,  primary: false }
 *   source   <- adds { id: primary, primary: true } + status_id = merged
 *
 * Returns { success, error } — on partial failure the UI should surface a
 * repair action.
 */
export const linkMergePair = async ({
  primaryId,
  primaryRaw,
  primaryTitle,
  sourceId,
  sourceRaw,
  sourceTitle,
  linkedBy,
}: LinkArgs): Promise<{ success: boolean; error?: string; foldedPrimary?: any }> => {
  const now = Date.now();
  const primaryKey = incidentIdKey(primaryId);
  const sourceKey = incidentIdKey(sourceId);

  const canonicalPrimaryId = toCanonicalIncidentId(primaryId);
  const canonicalSourceId = toCanonicalIncidentId(sourceId);

  // Snapshot the source's current status so unmerge can restore it.
  const prevStatus: string | undefined =
    typeof sourceRaw?.status === 'string' ? sourceRaw.status : undefined;
  const prevStatusId: number | undefined =
    typeof sourceRaw?.status_id === 'number' && sourceRaw.status_id !== MERGED_STATUS_ID
      ? sourceRaw.status_id
      : undefined;

  // Primary side — points at source, not primary itself.
  const primaryPointer: RelatedIncidentPointer = {
    id: canonicalSourceId,
    relation: 'merged',
    primary: false,
    linked_at: now,
    linked_by: linkedBy,
  };
  // Source side — points at primary, IS primary.
  const sourcePointer: RelatedIncidentPointer = {
    id: canonicalPrimaryId,
    relation: 'merged',
    primary: true,
    linked_at: now,
    linked_by: linkedBy,
    previous_status: prevStatus,
    previous_status_id: prevStatusId,
  };

  const primaryAlreadyLinksSource = getRelatedIncidents(primaryRaw).some(
    (p) => p.relation === 'merged' && !p.primary && incidentIdKey(p.id) === sourceKey && !wasUnmergedFrom(primaryRaw, sourceId),
  );
  const sourceAlreadyPointsToPrimary = getRelatedIncidents(sourceRaw).some(
    (p) => p.relation === 'merged' && p.primary && incidentIdKey(p.id) === primaryKey && !wasUnmergedFrom(sourceRaw, primaryId),
  );
  const sourceHasMergedStatus = sourceRaw?.status_id === MERGED_STATUS_ID || String(sourceRaw?.status || '').toLowerCase() === 'merged';
  const sourceMergedIntoPrimary = sourceAlreadyPointsToPrimary || incidentIdKey(sourceRaw?.merged_into) === primaryKey;

  // Idempotency guard: background thread continuation may ask to merge the
  // same pair again while list/detail refreshes race. If the primary already
  // records this source, never fold the payload or append another audit line.
  // At most, repair the source-side tombstone/status so both sides agree.
  if (primaryAlreadyLinksSource) {
    let nextPrimary: any = primaryRaw || {};
    if (Array.isArray(nextPrimary.activity)) {
      nextPrimary = { ...nextPrimary, activity: dedupeMergeAuditActivity(nextPrimary.activity) };
    }
    const foldedFrom = Array.isArray(nextPrimary._merged_data_from) ? nextPrimary._merged_data_from : [];
    if (!foldedFrom.some((x: string) => incidentIdKey(x) === sourceKey)) {
      nextPrimary = { ...nextPrimary, _merged_data_from: [...foldedFrom, sourceId] };
    }
    nextPrimary = upsertRelatedEventRefs(nextPrimary, [sourceId]);
    const primaryVerify = await writeAndVerifyPrimaryMerge(primaryId, nextPrimary, [primaryPointer]);
    if (!primaryVerify.success) {
      return { success: false, error: primaryVerify.error || 'Failed to verify existing merge metadata' };
    }
    if (primaryVerify.raw) nextPrimary = primaryVerify.raw;

    if (sourceMergedIntoPrimary && sourceHasMergedStatus) {
      return { success: true, foldedPrimary: nextPrimary };
    }

    let nextSource: any = sourceRaw || {};
    if (!sourceAlreadyPointsToPrimary) nextSource = upsertPointer(nextSource, sourcePointer);
    nextSource = upsertRelatedEventRefs(nextSource, [primaryId]);
    nextSource = {
      ...nextSource,
      status_id: MERGED_STATUS_ID,
      status: MERGED_STATUS_LABEL,
      merged_into: primaryId,
      merged_at: sourceRaw?.merged_at || now,
    };
    const sourceActivity = Array.isArray(nextSource.activity) ? dedupeMergeAuditActivity(nextSource.activity) : [];
    const hasSourceAudit = sourceActivity.some((item: any) => {
      const content = String(item?.content || '');
      return item?.type === 'system' && content.includes(`Merged into "${primaryTitle || primaryId}"`);
    });
    if (!hasSourceAudit) {
      nextSource.activity = [
        ...sourceActivity,
        {
          id: `merge-${now}`,
          type: 'system',
          user: linkedBy || 'System',
          timestamp: now,
          content: `Merged into "${primaryTitle || primaryId}"`,
        },
      ];
    } else {
      nextSource.activity = sourceActivity;
    }

    const write = await writeIncidentSafe(sourceId, nextSource);
    if (!write.success) return { success: false, error: write.error || 'Failed to repair merged incident' };
    return { success: true, foldedPrimary: nextPrimary };
  }

  // If the source was itself the primary of a prior merge, it already
  // owns a set of transitively-linked children. Re-parent them to the
  // NEW primary so the chain flattens instead of forming A -> B -> C.
  const transitiveChildPointers = getRelatedIncidents(sourceRaw)
    .filter(p => p.relation === 'merged' && !p.primary && p.id !== primaryId);
  const childRaws: Array<{ id: string; raw: any; pointer: RelatedIncidentPointer }> = [];
  for (const cp of transitiveChildPointers) {
    try {
      const r = await getDatastoreItem(cp.id, DATASTORE_CATEGORIES.INCIDENTS);
      if (r.success && r.item) {
        childRaws.push({ id: cp.id, raw: JSON.parse(r.item.value), pointer: cp });
      }
    } catch { /* non-fatal — child stays parented to source, repairable */ }
  }

  // Fold the source's data (observables, correlations, activity, tasks,
  // email_thread, iocs, stakeholders, ...) into the primary BEFORE
  // writing. Identity fields on the primary are preserved. This is the
  // core of the merge overhaul: the primary keeps everything the source
  // (and its transitive children) contributed.
  let foldedPrimaryData: any = foldSourceIntoPrimary(primaryRaw, sourceRaw);
  for (const c of childRaws) {
    foldedPrimaryData = foldSourceIntoPrimary(foldedPrimaryData, c.raw);
  }

  let nextPrimary: any = upsertPointer(foldedPrimaryData, primaryPointer);
  const requiredPrimaryPointers: RelatedIncidentPointer[] = [primaryPointer];
  // Also add direct pointers to every re-parented grandchild so the
  // primary lists them alongside the source in the Correlations tab.
  for (const c of childRaws) {
    const childPointer: RelatedIncidentPointer = {
      id: c.id,
      relation: 'merged',
      primary: false,
      linked_at: now,
      linked_by: linkedBy || 'chain-reparent',
    };
    requiredPrimaryPointers.push(childPointer);
    nextPrimary = upsertPointer(nextPrimary, childPointer);
  }
  nextPrimary = upsertRelatedEventRefs(nextPrimary, requiredPrimaryPointers.map((p) => p.id));
  // Track which sources have been folded, for debugging / repair tooling.
  const foldedFrom = Array.isArray(nextPrimary._merged_data_from) ? nextPrimary._merged_data_from : [];
  const foldedSet = new Set<string>(foldedFrom);
  foldedSet.add(sourceId);
  childRaws.forEach(c => foldedSet.add(c.id));
  nextPrimary._merged_data_from = Array.from(foldedSet);

  // Attach a single audit entry summarising the fold.
  const primaryActivity = Array.isArray(nextPrimary.activity) ? dedupeMergeAuditActivity(nextPrimary.activity) : [];
  const foldedLabel = childRaws.length > 0
    ? `Merged data from "${sourceTitle || canonicalSourceId}" (+${childRaws.length} chained)`
    : `Merged data from "${sourceTitle || canonicalSourceId}"`;
  const alreadyHasPrimaryAudit = primaryActivity.some((item: any) => mergeAuditDedupeKey(item) === `merge-in:${canonicalSourceId.toLowerCase()}`);
  nextPrimary.activity = alreadyHasPrimaryAudit
    ? primaryActivity
    : [
        ...primaryActivity,
        {
          id: `merge-in-${canonicalSourceId}-${now}`,
          type: 'system',
          user: linkedBy || 'System',
          timestamp: now,
          content: foldedLabel,
        },
      ];

  // The source now points at the new primary and drops its own children
  // pointers (they belong to the new primary now).
  let nextSource: any = upsertPointer(sourceRaw, sourcePointer);
  for (const c of childRaws) {
    nextSource = removePointer(nextSource, c.id);
  }
  nextSource = upsertRelatedEventRefs(nextSource, [canonicalPrimaryId]);
  nextSource = {
    ...nextSource,
    status_id: MERGED_STATUS_ID,
    status: MERGED_STATUS_LABEL,
    merged_into: canonicalPrimaryId,           // legacy field for backwards compat
    merged_at: now,
  };

  // Attach a marker activity entry to the source for audit trail.
  const sourceActivity = Array.isArray(nextSource.activity) ? dedupeMergeAuditActivity(nextSource.activity) : [];
  const sourceAuditExists = sourceActivity.some((item: any) => {
    const content = String(item?.content || '');
    return item?.type === 'system' && content.includes(`Merged into "${primaryTitle || canonicalPrimaryId}"`);
  });
  nextSource.activity = sourceAuditExists
    ? sourceActivity
    : [
        ...sourceActivity,
        {
          id: `merge-${now}`,
          type: 'system',
          user: linkedBy || 'System',
          timestamp: now,
          content: `Merged into "${primaryTitle || canonicalPrimaryId}"`,
        },
      ];

  // Write and verify the primary's merge metadata BEFORE marking any child
  // as merged. If the primary cannot prove it has both related_incidents and
  // related_events for every source, abort so the merge never ends in a
  // child-only / parent-forgotten state.
  const r1 = await writeAndVerifyPrimaryMerge(primaryId, nextPrimary, requiredPrimaryPointers);
  if (!r1.success) return { success: false, error: r1.error || 'Failed to update primary' };
  if (r1.raw) nextPrimary = r1.raw;

  // Symmetric verification for the source side. Without a read-back, a
  // silent write failure (or a stale read swallowing the status flip)
  // leaves the source stuck in its prior status while the primary already
  // lists it as a child — exactly the "still open after merge" bug.
  const verifySourceMerged = async (): Promise<{ success: boolean; error?: string }> => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const write = await writeIncidentSafe(sourceId, nextSource);
      if (!write.success) return { success: false, error: write.error || 'Failed to update source' };
      try {
        const read = await getDatastoreItem(sourceId, DATASTORE_CATEGORIES.INCIDENTS);
        if (read.success && read.item?.value) {
          const stored = JSON.parse(read.item.value);
          const flipped = stored?.status_id === MERGED_STATUS_ID;
          const hasPrimaryPtr = getRelatedIncidents(stored).some(
            (p) => p.id === primaryId && p.relation === 'merged' && p.primary,
          );
          if (flipped && hasPrimaryPtr) return { success: true };
        }
      } catch { /* fall through to retry */ }
      if (attempt === 1) {
        return { success: false, error: 'Merged incident did not verify (status flip did not persist)' };
      }
    }
    return { success: false, error: 'Merged incident did not verify' };
  };

  const r2 = await verifySourceMerged();
  if (!r2.success) {
    // Roll back the pointer we just added to the primary so the primary
    // never lists a source that is still open. Best-effort — if the
    // rollback itself fails, the analyst can repair from the UI.
    try {
      let rollback: any = removePointer(nextPrimary, sourceId);
      for (const c of childRaws) {
        rollback = removePointer(rollback, c.id);
      }
      const rolledFolded = Array.isArray(rollback._merged_data_from)
        ? rollback._merged_data_from.filter((x: string) => x !== sourceId && !childRaws.some(c => c.id === x))
        : [];
      rollback._merged_data_from = rolledFolded;
      await writeIncidentSafe(primaryId, rollback);
    } catch { /* leave primary as-is; surface the source error below */ }
    return { success: false, error: r2.error || 'Failed to update source' };
  }

  // Re-parent each grandchild: drop pointer to source, add pointer to
  // new primary. Errors are non-fatal.
  for (const c of childRaws) {
    try {
      let rehomed: any = removePointer(c.raw, sourceId);
      rehomed = upsertPointer(rehomed, {
        id: primaryId,
        relation: 'merged',
        primary: true,
        linked_at: now,
        linked_by: linkedBy || 'chain-reparent',
        previous_status: c.pointer.previous_status,
        previous_status_id: c.pointer.previous_status_id,
      });
      rehomed.merged_into = primaryId;
      rehomed.merged_at = now;
      rehomed.status_id = MERGED_STATUS_ID;
      rehomed.status = MERGED_STATUS_LABEL;
      rehomed = upsertRelatedEventRefs(rehomed, [primaryId]);
      await writeIncidentSafe(c.id, rehomed);
    } catch { /* leave the old pointer; the primary chain still resolves */ }
  }

  return { success: true, foldedPrimary: nextPrimary };
};


/**
 * Batched variant of `linkMergePair` for merging N siblings into ONE
 * primary in a single write cycle instead of N sequential ones.
 *
 * Why: `linkMergePair` runs ~5 sequential datastore round-trips per
 * source (write primary → read-back verify → write source → read-back
 * verify). With 30-50 siblings on a hot thread and per-request latency
 * in the seconds, that turns into minutes of blocking work.
 *
 * This batch:
 *   1. Folds every "simple" source (no transitive grandchildren) into
 *      an in-memory `nextPrimary` payload — one pass.
 *   2. Writes the primary ONCE via writeAndVerifyPrimaryMerge (single
 *      write+verify covers every sibling pointer).
 *   3. Writes all source-side rows in PARALLEL (each is independent —
 *      they only mutate their own row).
 *   4. Sources that carry their own transitive children fall back to
 *      per-source `linkMergePair` (rare — needs chain-reparent logic).
 *
 * Result: ~2 network round-trips for the primary + one round-trip
 * per source, fully parallel. From O(N × 5) sequential to ~O(1 + 1)
 * wall-clock time for the common case.
 */
export interface BatchMergeSource {
  id: string;
  raw: any;
  title?: string;
}

export interface BatchMergeResult {
  success: boolean;
  foldedPrimary?: any;
  mergedIds: string[];
  errors: Array<{ id: string; error: string }>;
}

export interface IncrementalBatchMergeResult extends BatchMergeResult {
  attemptedIds: string[];
}

export const linkMergePairsBatch = async ({
  primaryId,
  primaryRaw,
  primaryTitle,
  sources,
  linkedBy,
}: {
  primaryId: string;
  primaryRaw: any;
  primaryTitle?: string;
  sources: BatchMergeSource[];
  linkedBy?: string;
}): Promise<BatchMergeResult> => {
  const errors: Array<{ id: string; error: string }> = [];
  const mergedIds: string[] = [];
  if (sources.length === 0) {
    return { success: true, foldedPrimary: primaryRaw, mergedIds, errors };
  }

  const primaryKey = incidentIdKey(primaryId);
  const canonicalPrimaryId = toCanonicalIncidentId(primaryId);
  const now = Date.now();

  // Split into simple vs complex (has transitive children — needs
  // chain-reparent). Complex sources are rare; fall back to serial.
  const simple: BatchMergeSource[] = [];
  const complex: BatchMergeSource[] = [];
  for (const s of sources) {
    if (incidentIdKey(s.id) === primaryKey) continue;
    const hasTransitiveChildren = getRelatedIncidents(s.raw).some(
      (p) => p.relation === 'merged' && !p.primary && incidentIdKey(p.id) !== primaryKey,
    );
    if (hasTransitiveChildren) complex.push(s);
    else simple.push(s);
  }

  let nextPrimary: any = primaryRaw || {};
  const requiredPointers: RelatedIncidentPointer[] = [];
  const sourceWrites: Array<{ id: string; raw: any }> = [];
  const foldedSet = new Set<string>(
    Array.isArray(nextPrimary._merged_data_from) ? nextPrimary._merged_data_from : [],
  );
  const alreadyLinkedKeys = new Set(
    getLinkedPointers(nextPrimary).map((p) => incidentIdKey(p.id)),
  );
  let primaryActivity: any[] = Array.isArray(nextPrimary.activity)
    ? dedupeMergeAuditActivity(nextPrimary.activity)
    : [];

  for (const src of simple) {
    if (pairWasUnmerged(nextPrimary, primaryId, src.raw, src.id)) {
      errors.push({ id: src.id, error: 'manually unmerged from this pair' });
      continue;
    }
    const sourceKey = incidentIdKey(src.id);
    const canonicalSrcId = toCanonicalIncidentId(src.id);
    const primaryPointer: RelatedIncidentPointer = {
      id: canonicalSrcId,
      relation: 'merged',
      primary: false,
      linked_at: now,
      linked_by: linkedBy,
    };
    const sourcePointer: RelatedIncidentPointer = {
      id: canonicalPrimaryId,
      relation: 'merged',
      primary: true,
      linked_at: now,
      linked_by: linkedBy,
      previous_status: typeof src.raw?.status === 'string' ? src.raw.status : undefined,
      previous_status_id:
        typeof src.raw?.status_id === 'number' && src.raw.status_id !== MERGED_STATUS_ID
          ? src.raw.status_id
          : undefined,
    };
    requiredPointers.push(primaryPointer);

    // Only fold data once per source key — idempotent across retries.
    if (!alreadyLinkedKeys.has(sourceKey) && !foldedSet.has(canonicalSrcId)) {
      nextPrimary = foldSourceIntoPrimary(nextPrimary, src.raw);
      // foldSourceIntoPrimary may have refreshed activity; re-sync.
      primaryActivity = Array.isArray(nextPrimary.activity)
        ? dedupeMergeAuditActivity(nextPrimary.activity)
        : primaryActivity;
    }
    nextPrimary = upsertPointer(nextPrimary, primaryPointer);
    alreadyLinkedKeys.add(sourceKey);
    foldedSet.add(canonicalSrcId);

    // Single audit entry per source; dedup by mergeAuditDedupeKey.
    const auditKey = `merge-in:${canonicalSrcId.toLowerCase()}`;
    if (!primaryActivity.some((item: any) => mergeAuditDedupeKey(item) === auditKey)) {
      primaryActivity = [
        ...primaryActivity,
        {
          id: `merge-in-${canonicalSrcId}-${now}`,
          type: 'system',
          user: linkedBy || 'System',
          timestamp: now,
          content: `Merged data from "${src.title || canonicalSrcId}"`,
        },
      ];
    }

    // Prepare source-side payload — written in parallel below.
    let nextSource: any = upsertPointer(src.raw, sourcePointer);
    nextSource = upsertRelatedEventRefs(nextSource, [canonicalPrimaryId]);
    nextSource = {
      ...nextSource,
      status_id: MERGED_STATUS_ID,
      status: MERGED_STATUS_LABEL,
      merged_into: canonicalPrimaryId,
      merged_at: now,
    };
    const srcActivity = Array.isArray(nextSource.activity)
      ? dedupeMergeAuditActivity(nextSource.activity)
      : [];
    const hasSourceAudit = srcActivity.some((item: any) => {
      const content = String(item?.content || '');
      return item?.type === 'system' && content.includes(`Merged into "${primaryTitle || canonicalPrimaryId}"`);
    });
    nextSource.activity = hasSourceAudit
      ? srcActivity
      : [
          ...srcActivity,
          {
            id: `merge-${now}-${canonicalSrcId}`,
            type: 'system',
            user: linkedBy || 'System',
            timestamp: now,
            content: `Merged into "${primaryTitle || canonicalPrimaryId}"`,
          },
        ];
    sourceWrites.push({ id: canonicalSrcId, raw: nextSource });
  }

  if (requiredPointers.length > 0) {
    nextPrimary.activity = primaryActivity;
    nextPrimary._merged_data_from = Array.from(foldedSet);
    nextPrimary = upsertRelatedEventRefs(nextPrimary, requiredPointers.map((p) => p.id));

    // ONE primary write+verify for the whole batch.
    const pRes = await writeAndVerifyPrimaryMerge(primaryId, nextPrimary, requiredPointers);
    if (!pRes.success) {
      // Primary write failed — every simple source in this batch fails.
      for (const sw of sourceWrites) {
        errors.push({ id: sw.id, error: pRes.error || 'primary write/verify failed' });
      }
    } else {
      if (pRes.raw) nextPrimary = pRes.raw;
      // PARALLEL source-side writes.
      const results = await Promise.all(
        sourceWrites.map(async (sw) => {
          try {
            const w = await writeIncidentSafe(sw.id, sw.raw);
            if (!w.success) return { id: sw.id, error: w.error || 'source write failed' };
            return { id: sw.id, error: null as string | null };
          } catch (e: any) {
            return { id: sw.id, error: e?.message || String(e) };
          }
        }),
      );
      for (const r of results) {
        if (r.error) errors.push({ id: r.id, error: r.error });
        else mergedIds.push(r.id);
      }
    }
  }

  // Fall back to serial linkMergePair for sources with transitive children.
  for (const src of complex) {
    try {
      const r = await linkMergePair({
        primaryId,
        primaryRaw: nextPrimary,
        primaryTitle,
        sourceId: src.id,
        sourceRaw: src.raw,
        sourceTitle: src.title,
        linkedBy,
      });
      if (r.success) {
        mergedIds.push(src.id);
        if (r.foldedPrimary) nextPrimary = r.foldedPrimary;
      } else {
        errors.push({ id: src.id, error: r.error || 'linkMergePair failed' });
      }
    } catch (e: any) {
      errors.push({ id: src.id, error: e?.message || String(e) });
    }
  }

  return {
    success: errors.length === 0,
    foldedPrimary: nextPrimary,
    mergedIds,
    errors,
  };
};

/**
 * Merge larger thread sets in bounded chunks. If an entire chunk fails, split
 * it and retry smaller groups so one bad sibling or oversized primary payload
 * does not block the rest of the thread from being folded in.
 */
export const linkMergePairsIncremental = async ({
  primaryId,
  primaryRaw,
  primaryTitle,
  sources,
  linkedBy,
  chunkSize = 10,
}: {
  primaryId: string;
  primaryRaw: any;
  primaryTitle?: string;
  sources: BatchMergeSource[];
  linkedBy?: string;
  chunkSize?: number;
}): Promise<IncrementalBatchMergeResult> => {
  const mergedIds: string[] = [];
  const mergedKeys = new Set<string>();
  const errorById = new Map<string, string>();
  const attemptedIds: string[] = [];
  let currentPrimary = primaryRaw;
  const boundedChunkSize = Math.max(1, Math.min(25, Math.floor(chunkSize || 10)));

  const recordSuccess = (id: string) => {
    const key = incidentIdKey(id);
    if (!key || mergedKeys.has(key)) return;
    mergedKeys.add(key);
    mergedIds.push(id);
    errorById.delete(id);
  };

  const recordError = (id: string, error: string) => {
    const key = incidentIdKey(id);
    if (!key || mergedKeys.has(key)) return;
    errorById.set(id, error || 'merge failed');
  };

  const mergeChunk = async (chunk: BatchMergeSource[]): Promise<void> => {
    if (chunk.length === 0) return;
    attemptedIds.push(...chunk.map((s) => s.id));
    const result = await linkMergePairsBatch({
      primaryId,
      primaryRaw: currentPrimary,
      primaryTitle,
      sources: chunk,
      linkedBy,
    });
    if (result.foldedPrimary) currentPrimary = result.foldedPrimary;
    for (const id of result.mergedIds) recordSuccess(id);

    const wholeChunkFailed = result.mergedIds.length === 0 && result.errors.length >= chunk.length;
    if (wholeChunkFailed && chunk.length > 1) {
      const mid = Math.ceil(chunk.length / 2);
      await mergeChunk(chunk.slice(0, mid));
      await mergeChunk(chunk.slice(mid));
      return;
    }

    for (const err of result.errors) recordError(err.id, err.error);
  };

  for (let i = 0; i < sources.length; i += boundedChunkSize) {
    await mergeChunk(sources.slice(i, i + boundedChunkSize));
  }

  return {
    success: errorById.size === 0,
    foldedPrimary: currentPrimary,
    mergedIds,
    attemptedIds,
    errors: Array.from(errorById.entries()).map(([id, error]) => ({ id, error })),
  };
};







interface UnlinkArgs {
  primaryId: string;
  sourceId: string;
  unlinkedBy?: string;
}

/**
 * Remove the merge link between two incidents. Symmetric — clears the
 * pointer on both sides and restores the non-primary's prior status.
 */
export const unlinkMergePair = async ({
  primaryId,
  sourceId,
  unlinkedBy,
}: UnlinkArgs): Promise<{ success: boolean; error?: string }> => {
  const [primaryRes, sourceRes] = await Promise.all([
    getDatastoreItem(primaryId, DATASTORE_CATEGORIES.INCIDENTS),
    getDatastoreItem(sourceId, DATASTORE_CATEGORIES.INCIDENTS),
  ]);
  if (!primaryRes.success || !primaryRes.item) {
    return { success: false, error: 'Primary incident not found' };
  }
  if (!sourceRes.success || !sourceRes.item) {
    return { success: false, error: 'Merged incident not found' };
  }

  let primaryRaw: any;
  let sourceRaw: any;
  try {
    primaryRaw = JSON.parse(primaryRes.item.value);
    sourceRaw = JSON.parse(sourceRes.item.value);
  } catch (e) {
    return { success: false, error: 'Failed to parse incident payloads' };
  }

  const sourcePointer = getPrimaryPointer(sourceRaw);
  const prevStatusId = sourcePointer?.previous_status_id;
  const prevStatus = sourcePointer?.previous_status;

  const now = Date.now();

  const stampUnmerged = (raw: any, otherId: string): any => {
    const next: any = { ...(raw || {}) };
    const existing: string[] = Array.isArray(next._unmerged_from) ? next._unmerged_from : [];
    if (!existing.includes(otherId)) next._unmerged_from = [...existing, otherId];
    else next._unmerged_from = existing;
    return next;
  };

  let nextPrimary: any = removePointer(primaryRaw, sourceId);
  nextPrimary = stampUnmerged(nextPrimary, sourceId);
  let nextSource: any = removePointer(sourceRaw, primaryId);
  nextSource = stampUnmerged(nextSource, primaryId);
  // Restore the source's previous status. If none was recorded, fall back
  // to "new" — never leave an incident stuck in Merged after unlink.
  nextSource.status_id = typeof prevStatusId === 'number' ? prevStatusId : 1;
  nextSource.status = prevStatus || 'New';
  delete nextSource.merged_into;
  delete nextSource.merged_at;

  const activity = Array.isArray(nextSource.activity) ? nextSource.activity : [];
  nextSource.activity = [
    ...activity,
    {
      id: `unmerge-${now}`,
      type: 'system',
      user: unlinkedBy || 'System',
      timestamp: now,
      content: `Unmerged from "${primaryId}"`,
    },
  ];
  const pActivity = Array.isArray(nextPrimary.activity) ? nextPrimary.activity : [];
  nextPrimary.activity = [
    ...pActivity,
    {
      id: `unmerge-out-${now}`,
      type: 'system',
      user: unlinkedBy || 'System',
      timestamp: now,
      content: `Unmerged "${sourceId}" from this incident (auto-merge disabled for this pair)`,
    },
  ];

  const r1 = await setDatastoreItem(
    primaryId,
    JSON.stringify(nextPrimary),
    DATASTORE_CATEGORIES.INCIDENTS,
  );
  if (!r1.success) return { success: false, error: r1.error || 'Failed to update primary' };
  const r2 = await setDatastoreItem(
    sourceId,
    JSON.stringify(nextSource),
    DATASTORE_CATEGORIES.INCIDENTS,
  );
  if (!r2.success) return { success: false, error: r2.error || 'Failed to update merged incident' };
  return { success: true };
};

/**
 * True when `raw` has an explicit user-recorded unmerge against `otherId`.
 * Auto-merge paths MUST honour this so a merge the analyst manually undid
 * does not silently reappear on the next background pass.
 */
export const wasUnmergedFrom = (raw: any, otherId: string): boolean => {
  if (!raw || typeof raw !== 'object' || !otherId) return false;
  const list = raw._unmerged_from;
  if (!Array.isArray(list)) return false;
  const key = otherId.toLowerCase();
  return list.some((x) => typeof x === 'string' && x.toLowerCase() === key);
};

/** True if EITHER side of the (a, b) pair has recorded an unmerge against the other. */
export const pairWasUnmerged = (rawA: any, idA: string, rawB: any, idB: string): boolean =>
  wasUnmergedFrom(rawA, idB) || wasUnmergedFrom(rawB, idA);


// ---------------------------------------------------------------------------
// Lazy migration for legacy tombstones (smartMerge era)
// ---------------------------------------------------------------------------

/**
 * When a raw payload has the legacy `merged_into` field but no
 * `related_incidents` pointer, synthesize the pointer pair and flip the
 * legacy status_id 99 to the new merged id. Runs once on incident load;
 * writes only when a change is actually needed.
 */
export const maybeMigrateLegacyMerge = async (
  incidentId: string,
  raw: any,
): Promise<boolean> => {
  if (!raw || typeof raw !== 'object') return false;
  const legacyPrimary: string | undefined = raw.merged_into;
  if (!legacyPrimary) return false;
  const alreadyMigrated = getPrimaryPointer(raw);
  if (alreadyMigrated && raw.status_id === MERGED_STATUS_ID) return false;

  const pointer: RelatedIncidentPointer = {
    id: legacyPrimary,
    relation: 'merged',
    primary: true,
    linked_at: raw.merged_at || Date.now(),
    linked_by: 'legacy-migration',
  };
  const nextSource = {
    ...upsertRelatedEventRefs(upsertPointer(raw, pointer), [legacyPrimary]),
    status_id: MERGED_STATUS_ID,
    status: MERGED_STATUS_LABEL,
  };
  await writeIncidentSafe(incidentId, nextSource);

  // Best-effort back-fill on the primary side too. Non-fatal if it fails
  // (e.g. permissions in multi-tenant), the incident detail still works.
  try {
    const primaryRes = await getDatastoreItem(
      legacyPrimary,
      DATASTORE_CATEGORIES.INCIDENTS,
    );
    if (primaryRes.success && primaryRes.item) {
      const primaryRaw = JSON.parse(primaryRes.item.value);
      const already = getRelatedIncidents(primaryRaw).some(p => p.id === incidentId);
      if (!already) {
        const nextPrimary = upsertRelatedEventRefs(upsertPointer(primaryRaw, {
          id: incidentId,
          relation: 'merged',
          primary: false,
          linked_at: raw.merged_at || Date.now(),
          linked_by: 'legacy-migration',
        }), [incidentId]);
        await writeIncidentSafe(legacyPrimary, nextPrimary);
      }
    }
  } catch {
    /* ignore */
  }
  return true;
};

export { MERGED_STATUS_ID, MERGED_STATUS_LABEL };

// ---------------------------------------------------------------------------
// Relation-safe writes + revision-based reconciliation
// ---------------------------------------------------------------------------

/**
 * Fields that describe the merge relationship. They MUST survive any write
 * to an incident row, because they are what wires primary <-> child. If a
 * caller overwrites the row with a stale copy that doesn't carry these,
 * the union is silently lost (parent forgets its children).
 */
const RELATION_FIELDS = [
  'related_incidents',
  '_merged_data_from',
  'merged_into',
  'merged_at',
] as const;

/**
 * Union two related_incidents arrays by pointer id. Later linked_at wins
 * on duplicates, and a `primary: true` entry always beats a false one for
 * the same id (child->primary direction must stick).
 */
const unionPointers = (
  a: RelatedIncidentPointer[] = [],
  b: RelatedIncidentPointer[] = [],
): RelatedIncidentPointer[] => {
  const byId = new Map<string, RelatedIncidentPointer>();
  for (const p of [...a, ...b]) {
    if (!p || typeof p.id !== 'string') continue;
    const key = incidentIdKey(p.id);
    const prev = byId.get(key);
    if (!prev) { byId.set(key, p); continue; }
    const preferPrimary = p.primary && !prev.primary ? p
      : (!p.primary && prev.primary ? prev : null);
    if (preferPrimary) { byId.set(key, preferPrimary); continue; }
    byId.set(key, (p.linked_at || 0) >= (prev.linked_at || 0) ? p : prev);
  }
  return Array.from(byId.values());
};

/**
 * Merge the relation fields from `existing` into `next` so a caller who
 * built `next` from a stale snapshot can't drop pointers. Returns the
 * hardened payload — never mutates inputs.
 */
export const preserveRelationFields = (existing: any, next: any): any => {
  const out: any = { ...(next || {}) };
  if (Array.isArray(out.activity)) {
    out.activity = dedupeMergeAuditActivity(out.activity);
  }
  if (!existing || typeof existing !== 'object') return out;

  const merged = unionPointers(
    getRelatedIncidents(existing),
    getRelatedIncidents(out),
  );
  if (merged.length > 0) out.related_incidents = merged;

  const existingFolded = Array.isArray(existing._merged_data_from) ? existing._merged_data_from : [];
  const nextFolded = Array.isArray(out._merged_data_from) ? out._merged_data_from : [];
  if (existingFolded.length || nextFolded.length) {
    out._merged_data_from = Array.from(new Set<string>([...existingFolded, ...nextFolded]));
  }

  // _unmerged_from is a monotonic tombstone — never lose it, always union.
  const existingUnmerged = Array.isArray(existing._unmerged_from) ? existing._unmerged_from : [];
  const nextUnmerged = Array.isArray(out._unmerged_from) ? out._unmerged_from : [];
  if (existingUnmerged.length || nextUnmerged.length) {
    out._unmerged_from = Array.from(new Set<string>([...existingUnmerged, ...nextUnmerged]));
  }

  const pointerRefs = getRelatedIncidents(out)
    .filter((p) => p.relation === 'merged')
    .map((p) => p.id);
  const mergedRelationRefs = unionRelationRefs(getRelationRefs(existing), getRelationRefs(out), pointerRefs);
  if (mergedRelationRefs.length > 0) {
    out.related_events = mergedRelationRefs;
    if (Array.isArray(existing.related_findings) || Array.isArray(out.related_findings)) {
      out.related_findings = mergedRelationRefs;
    }
  }

  // Preserve tombstone fields if the row was a non-primary side. Never
  // resurrect them if the caller explicitly cleared them (unmerge path
  // sets status back and deletes merged_into) — detect that by checking
  // whether the caller kept status_id === MERGED_STATUS_ID.
  if (out.status_id === MERGED_STATUS_ID || existing.status_id === MERGED_STATUS_ID) {
    if (!out.merged_into && existing.merged_into) out.merged_into = existing.merged_into;
    if (!out.merged_at && existing.merged_at) out.merged_at = existing.merged_at;
  }

  // Preserve terminal resolution on server if caller did not explicitly manually change status
  const existingIsResolved =
    existing.status_id === 3 ||
    String(existing.status || '').toLowerCase() === 'resolved';
  if (
    existingIsResolved &&
    out.status_id !== 3 &&
    (out._auto_status_progressed || !out._user_manual_status_change)
  ) {
    out.status_id = existing.status_id;
    out.status = existing.status;
    if (existing.status_detail && !out.status_detail) {
      out.status_detail = existing.status_detail;
    }
  }

  // Preserve concurrent server activity items that may be absent from a stale client snapshot
  if (Array.isArray(existing.activity) && existing.activity.length > 0) {
    const outActivity = Array.isArray(out.activity) ? out.activity : [];
    const seen = new Set(
      outActivity.map((a: any) =>
        a?.id
          ? String(a.id)
          : `${a?.timestamp}-${a?.user}-${String(a?.content || '').slice(0, 30)}`,
      ),
    );
    const missingFromOut = existing.activity.filter((a: any) => {
      const key = a?.id
        ? String(a.id)
        : `${a?.timestamp}-${a?.user}-${String(a?.content || '').slice(0, 30)}`;
      return !seen.has(key);
    });
    if (missingFromOut.length > 0) {
      out.activity = [...outActivity, ...missingFromOut];
    }
  }

  return enforceMergedStatusInvariant(out);
};

/**
 * Safe writer for incident rows. Re-fetches the current stored payload,
 * unions the merge-relation fields onto the caller's `nextRaw`, then
 * writes. Every code path that persists an incident SHOULD go through
 * this — bare `setDatastoreItem(..., INCIDENTS, ...)` is a footgun.
 *
 * Accepts either an object or a JSON string (mirrors setDatastoreItem).
 * Returns the same shape as setDatastoreItem.
 */
export const writeIncidentSafe = async (
  id: string,
  nextRaw: any,
  orgId?: string,
  options?: { regionUrl?: string },
): Promise<{ success: boolean; error?: string }> => {
  let nextObj: any = nextRaw;
  if (typeof nextRaw === 'string') {
    try { nextObj = JSON.parse(nextRaw); } catch { nextObj = {}; }
  }
  let existing: any = null;
  try {
    const res = await getDatastoreItem(id, DATASTORE_CATEGORIES.INCIDENTS, orgId, options?.regionUrl ? { regionUrl: options.regionUrl } : undefined);
    if (res.success && res.item?.value) {
      existing = JSON.parse(res.item.value);
    }
  } catch { /* first write, nothing to preserve */ }

  const hardened = preserveRelationFields(existing, nextObj);
  return setDatastoreItem(
    id,
    JSON.stringify(hardened),
    DATASTORE_CATEGORIES.INCIDENTS,
    orgId,
    options?.regionUrl ? { regionUrl: options.regionUrl } : undefined,
  );
};

/**
 * Reconcile `related_incidents` from a list of prior revisions. If a
 * previous revision recorded a pointer that is missing from `currentRaw`,
 * bring it back. Also unions `_merged_data_from`. Returns the reconciled
 * payload and whether anything actually changed.
 */
export const reconcileRelatedFromRevisions = (
  currentRaw: any,
  revisions: any[],
): { raw: any; changed: boolean } => {
  if (!currentRaw || typeof currentRaw !== 'object' || !Array.isArray(revisions) || revisions.length === 0) {
    return { raw: currentRaw, changed: false };
  }
  const currentPointers = getRelatedIncidents(currentRaw);
  const currentFolded = new Set<string>(
    Array.isArray(currentRaw._merged_data_from) ? currentRaw._merged_data_from : [],
  );

  const revPointers: RelatedIncidentPointer[] = [];
  const revFolded = new Set<string>();
  for (const rev of revisions) {
    // Revisions may nest the payload under .value / .data / .body — try
    // each shape leniently.
    const candidates = [rev?.value, rev?.data, rev?.body, rev];
    for (const c of candidates) {
      let obj: any = c;
      if (typeof obj === 'string') {
        try { obj = JSON.parse(obj); } catch { continue; }
      }
      if (!obj || typeof obj !== 'object') continue;
      const ptrs = getRelatedIncidents(obj);
      for (const p of ptrs) revPointers.push(p);
      if (Array.isArray(obj._merged_data_from)) {
        for (const x of obj._merged_data_from) revFolded.add(x);
      }
      break;
    }
  }

  const merged = unionPointers(currentPointers, revPointers);
  const foldedUnion = new Set<string>([...currentFolded, ...revFolded]);
  const currentRelationRefs = getRelationRefs(currentRaw);
  const currentActivity = Array.isArray(currentRaw.activity) ? currentRaw.activity : [];
  const dedupedActivity = currentActivity.length > 0 ? dedupeMergeAuditActivity(currentActivity) : currentActivity;
  const mergedRelationRefs = unionRelationRefs(
    currentRelationRefs,
    merged.filter((p) => p.relation === 'merged').map((p) => p.id),
  );

  const pointersChanged =
    merged.length !== currentPointers.length ||
    merged.some(p => !currentPointers.find(cp => cp.id === p.id && cp.primary === p.primary));
  const foldedChanged = foldedUnion.size !== currentFolded.size;
  const activityChanged = dedupedActivity.length !== currentActivity.length;
  const relatedRefsChanged =
    mergedRelationRefs.length !== currentRelationRefs.length ||
    mergedRelationRefs.some((ref) => !currentRelationRefs.find((current) => relationRefKey(current) === relationRefKey(ref)));

  if (!pointersChanged && !foldedChanged && !relatedRefsChanged && !activityChanged) return { raw: currentRaw, changed: false };

  const next: any = { ...currentRaw };
  if (merged.length > 0) next.related_incidents = merged;
  if (foldedUnion.size > 0) next._merged_data_from = Array.from(foldedUnion);
  if (mergedRelationRefs.length > 0) next.related_events = mergedRelationRefs;
  if (activityChanged) next.activity = dedupedActivity;
  return { raw: next, changed: true };
};

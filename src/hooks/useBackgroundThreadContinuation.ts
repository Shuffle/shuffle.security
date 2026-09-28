/**
 * useBackgroundThreadContinuation — silently keeps email-thread merges on the
 * /incidents list up to date.
 *
 * Rule of engagement:
 *   1. Pick at most one candidate per `thread_id` from the current list,
 *      preferring an existing primary and otherwise the newest visible row.
 *      This lets bulk-ingested threads start collapsing before an analyst
 *      opens the detail page, without querying once per row.
 *   2. For each candidate that carries a `thread_id`, ask
 *      /api/v2/correlations for every incident referencing that value,
 *      subtract the ones already merged/linked, and fold the remainder
 *      into the primary via linkMergePair. This is exactly what the
 *      detail page does — reused so the UX stays consistent.
 *   3. Runs behind the org's "Auto Merge Thread" preference. Rate-limits
 *      to a few thread groups per tick, remembers processed threads per
 *      session to avoid re-hitting the correlation endpoint in a loop.
 */

import { useEffect, useRef, useState } from 'react';
import { linkMergePairsIncremental, getLinkedPointers, isMergedIncident, isClosedIncident, getPrimaryPointer, pairWasUnmerged } from '@/lib/incidentRelations';
import { isDraftOnlyIncident } from '@/lib/emailThreadAdapters';
import { useAutoMergeThread } from '@/hooks/useEntityLabel';
import { extractThreadId } from '@/hooks/useThreadCorrelatedIncidents';
import { getApiUrl, getAuthHeader } from '@/Shuffle-MCPs/api';
import { getDatastoreItem, DATASTORE_CATEGORIES } from '@/Shuffle-MCPs/datastore';

interface IncidentListItem {
  id: string;
  rawOCSF?: any;
  createdTs?: number;
  title?: string;
}

interface ThreadCandidate extends IncidentListItem {
  rawOCSF: any;
  threadId: string;
  linked: number;
  checkKey: string;
}

const refToIncidentId = (ref: string): string => {
  if (!ref) return '';
  if (ref.includes('|')) return ref.split('|').pop() || '';
  if (ref.includes('/')) return ref.split('/').pop() || '';
  return ref;
};

const readTs = (raw: any): number => {
  if (!raw) return 0;
  const cs = [raw.time, raw.event_time, raw.created_time_dt, raw.created_time, raw.created_at];
  for (const c of cs) {
    if (typeof c === 'number' && Number.isFinite(c) && c > 0) return c < 1e12 ? c * 1000 : c;
    if (typeof c === 'string' && c) {
      const p = Date.parse(c);
      if (Number.isFinite(p) && p > 0) return p;
    }
  }
  return 0;
};

// How long we skip re-checking a given (thread, primary) after processing
// it. Short enough that newly-arrived siblings on later list refreshes get
// picked up; long enough that we don't spam /correlations on every
// re-render or poll.
const CHECK_COOLDOWN_MS = 20_000;
const MAX_THREAD_GROUPS_PER_PASS = 3;

interface CheckRecord {
  at: number;
  /**
   * Number of already-linked pointers we saw last time. If the primary
   * grows new links (someone opened a sibling and merged), we invalidate
   * the cooldown so background continuation picks up the rest.
   */
  linked: number;
}

export const useBackgroundThreadContinuation = (
  incidents: IncidentListItem[],
  onDidMerge?: () => void,
): { busy: boolean } => {
  const enabled = useAutoMergeThread();
  const lastCheckRef = useRef<Map<string, CheckRecord>>(new Map());
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    if (busyRef.current) return;
    if (!incidents || incidents.length === 0) return;

    // Collect at most one candidate per thread in the current list view.
    // Non-draft candidates always win over draft candidates; existing anchors win;
    // otherwise the newest visible row starts the merge.
    const now = Date.now();
    const byThread = new Map<string, ThreadCandidate>();

    for (const inc of incidents) {
      const raw = inc.rawOCSF;
      if (!raw) continue;
      if (isMergedIncident(raw)) continue;
      // Never fold new arrivals into a thread whose anchor is already
      // Resolved/Closed — they must stay separate incidents.
      if (isClosedIncident(raw)) continue;
      if (getPrimaryPointer(raw)) continue;

      const tid = extractThreadId(raw);
      if (!tid) continue;
      const threadKey = String(tid).toLowerCase();

      const linked = getLinkedPointers(raw).length;
      const key = linked > 0 ? `${threadKey}:${inc.id}` : `${threadKey}:new`;
      const prev = lastCheckRef.current.get(key);
      if (prev && now - prev.at < CHECK_COOLDOWN_MS && prev.linked >= linked) {
        continue;
      }
      const candidate: ThreadCandidate = { ...inc, rawOCSF: raw, threadId: tid, linked, checkKey: key };
      const existing = byThread.get(threadKey);
      if (!existing) {
        byThread.set(threadKey, candidate);
        continue;
      }
      // Never pick a draft candidate over a non-draft candidate
      const existingIsDraft = isDraftOnlyIncident(existing.rawOCSF);
      const candidateIsDraft = isDraftOnlyIncident(raw);
      if (candidateIsDraft !== existingIsDraft) {
        if (!candidateIsDraft) byThread.set(threadKey, candidate);
        continue;
      }
      const existingIsAnchor = existing.linked > 0;
      const candidateIsAnchor = linked > 0;
      if (candidateIsAnchor !== existingIsAnchor) {
        if (candidateIsAnchor) byThread.set(threadKey, candidate);
        continue;
      }
      const existingTs = readTs(existing.rawOCSF) || existing.createdTs || 0;
      const candidateTs = readTs(raw) || inc.createdTs || 0;
      if (candidateTs > existingTs || (candidateTs === existingTs && inc.id.localeCompare(existing.id) > 0)) {
        byThread.set(threadKey, candidate);
      }
    }

    const candidates = Array.from(byThread.values()).slice(0, MAX_THREAD_GROUPS_PER_PASS);
    if (candidates.length === 0) return;

    busyRef.current = true;
    setBusy(true);

    (async () => {
      let totalMerged = 0;
      try {
        for (const candidate of candidates) {
          const raw = candidate.rawOCSF;
          const threadId = candidate.threadId;
          const threadKey = String(threadId).toLowerCase();
          const key = candidate.checkKey;
          const alreadyLinked = new Set<string>(
            getLinkedPointers(raw).map((p) => p.id.toLowerCase()),
          );
          alreadyLinked.add(candidate.id.toLowerCase());
          lastCheckRef.current.set(key, { at: Date.now(), linked: alreadyLinked.size - 1 });

          let corrData: any[] = [];
          try {
            const resp = await fetch(getApiUrl('/api/v2/correlations'), {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
              body: JSON.stringify({ type: 'value', key: threadKey }),
            });
            if (!resp.ok) continue;
            const data = await resp.json();
            corrData = Array.isArray(data) ? data : (data.correlations || data.data || []);
          } catch { continue; }

          const siblingIds = new Set<string>();
          for (const c of corrData) {
            const refs = Array.isArray(c?.ref) ? c.ref : [];
            for (const r of refs) {
              const rid = refToIncidentId(String(r));
              if (!rid) continue;
              if (alreadyLinked.has(rid.toLowerCase())) continue;
              siblingIds.add(rid);
            }
          }
          if (siblingIds.size === 0) continue;

          // Cross-load each sibling with bounded concurrency so we don't
          // burst the client-side fetch breaker (30 calls / 1s per URL).
          const siblingIdList = Array.from(siblingIds);
          const CONCURRENCY = 4;
          const siblingLoads: (null | { id: string; raw: any; title: string })[] = new Array(siblingIdList.length).fill(null);
          let nextIdx = 0;
          const workers = Array.from({ length: Math.min(CONCURRENCY, siblingIdList.length) }, async () => {
            while (true) {
              const myIdx = nextIdx++;
              if (myIdx >= siblingIdList.length) return;
              const sid = siblingIdList[myIdx];
              try {
                const res = await getDatastoreItem(sid, DATASTORE_CATEGORIES.INCIDENTS);
                if (!res.success || !res.item) continue;
                const sRaw = JSON.parse(res.item.value);
                if (isMergedIncident(sRaw)) continue;
                // A resolved/closed sibling keeps its own life-cycle.
                if (isClosedIncident(sRaw)) continue;

                const title =
                  sRaw.title
                  || sRaw.finding_info_list?.[0]?.title
                  || sRaw.finding_info?.title
                  || sid;
                siblingLoads[myIdx] = { id: sid, raw: sRaw, title };
              } catch { /* skip */ }
            }
          });
          await Promise.all(workers);
          const siblings = siblingLoads
            .filter((s): s is { id: string; raw: any; title: string } => !!s)
            // The list snapshot can lag behind the latest datastore write.
            // Skip anything that already points back to this primary so we do
            // not call linkMergePair just to rediscover the pair is done.
            .filter((s) => {
              const sourcePrimary = getPrimaryPointer(s.raw);
              if (sourcePrimary?.id?.toLowerCase() === candidate.id.toLowerCase()) return false;
              if (String(s.raw?.merged_into || '').toLowerCase() === candidate.id.toLowerCase()) return false;
              return true;
            })
            // Skip siblings that were explicitly unmerged from this primary
            // (either direction). The analyst chose to keep them apart.
            .filter((s) => !pairWasUnmerged(raw, candidate.id, s.raw, s.id));
          if (siblings.length === 0) continue;

          const fullPool = [
            { id: candidate.id, raw, title: raw?.title || raw?.finding_info_list?.[0]?.title || candidate.id, ts: readTs(raw) || candidate.createdTs || 0 },
            ...siblings.map((s) => ({ id: s.id, raw: s.raw, title: s.title, ts: readTs(s.raw) || 0 })),
          ];

          // Primary selection order:
          //   1. Non-draft always wins over draft.
          //   2. Existing anchor (linked pointers) wins.
          //   3. Newest timestamp wins; ID breaks ties.
          fullPool.sort((a, b) => {
            const ad = isDraftOnlyIncident(a.raw) ? 1 : 0;
            const bd = isDraftOnlyIncident(b.raw) ? 1 : 0;
            if (ad !== bd) return ad - bd;
            const aAnchor = getLinkedPointers(a.raw).length > 0 ? 0 : 1;
            const bAnchor = getLinkedPointers(b.raw).length > 0 ? 0 : 1;
            if (aAnchor !== bAnchor) return aAnchor - bAnchor;
            return b.ts - a.ts || b.id.localeCompare(a.id);
          });
          const primary = fullPool[0];
          const sources = fullPool.slice(1).filter((s) => !pairWasUnmerged(primary.raw, primary.id, s.raw, s.id));
          if (sources.length === 0) continue;

          const primaryTitle = primary.title || primary.id;
          let mergedThisPass = 0;
          try {
            const batch = await linkMergePairsIncremental({
              primaryId: primary.id,
              primaryRaw: primary.raw,
              primaryTitle,
              sources: sources.map((s) => ({ id: s.id, raw: s.raw, title: s.title })),
              linkedBy: 'thread-auto-merge-list',
              chunkSize: 10,
            });
            mergedThisPass = batch.mergedIds.length;
            totalMerged += mergedThisPass;
          } catch { /* silent — cooldown will let us retry later */ }
          // Update cooldown record with the new linked count so a later
          // pass only suppresses work that actually succeeded.
          lastCheckRef.current.set(key, {
            at: Date.now(),
            linked: (alreadyLinked.size - 1) + mergedThisPass,
          });
          if (primary.id !== candidate.id) {
            lastCheckRef.current.set(`${threadKey}:${primary.id}`, {
              at: Date.now(),
              linked: getLinkedPointers(primary.raw).length + mergedThisPass,
            });
          }

        }
      } catch { /* silent */ } finally {
        busyRef.current = false;
        setBusy(false);
        if (totalMerged > 0) onDidMerge?.();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, incidents]);

  return { busy };
};

/**
 * Agent tools assignment.
 *
 * Stores which tool/app references are assigned to which agent + action type.
 * Each tool is stored as a `{ name, id }` object so downstream consumers
 * (workflow generation, Algolia lookups) can resolve the canonical app
 * without re-searching by name. Multiple agents can exist (default name
 * "default"), each with multiple action types (e.g. "timeline_reply",
 * "task_reply"). The shape is a flat array so it serializes cleanly:
 *
 *   [
 *     {
 *       agent: 'default',
 *       actionType: 'timeline_reply',
 *       tools: [{ name: 'Wazuh', id: 'wazuh' }, ...]
 *     },
 *     ...
 *   ]
 *
 * Backward-compat: legacy entries persisted as plain strings are coerced
 * into `{ name: <str>, id: <str> }` on read so older datastore values keep
 * working until the next write upgrades them in-place.
 *
 * Persistence: backed by the Shuffle datastore under category
 * `shuffle-security_agent_tools` / key `config`. localStorage is used purely
 * as a synchronous cache so existing call sites stay non-async; mutators
 * update the cache immediately and then write through to the datastore in
 * the background. Call `loadAgentToolsFromDatastore()` once on app startup
 * to hydrate the cache from the server.
 *
 * Components subscribe to in-process changes via the `agent-tools-changed`
 * window event so the UI updates without a reload.
 */

import { getDatastoreItem, setDatastoreItem } from '@/Shuffle-MCPs/datastore';

const STORAGE_KEY = 'agent_tools_config';
const DATASTORE_CATEGORY = 'shuffle-security_agent_tools';
const DATASTORE_KEY = 'config';

export const AGENT_TOOLS_CHANGED_EVENT = 'agent-tools-changed';

export const DEFAULT_AGENT = 'default';
export const DEFAULT_ACTION_TYPE = 'timeline_reply';

export interface ToolRef {
  /** Display name from the catalog (e.g. "Microsoft Defender"). */
  name: string;
  /** Canonical app id — Algolia `objectID` when available; falls back to name. */
  id: string;
}

export interface AgentToolsEntry {
  agent: string;
  actionType: string;
  tools: ToolRef[];
  updatedAt?: number;
}

export interface AgentToolsCachePayload {
  version: number;
  updatedAt: number;
  entries: AgentToolsEntry[];
}

let localWriteSeq = 0;
let lastLocalWriteTime = 0;
let pendingWritePayload: AgentToolsCachePayload | null = null;
let isWritingToDatastore = false;
let writeQueuePromise: Promise<boolean> | null = null;

export const getAgentToolsLastLocalWriteTime = (): number => lastLocalWriteTime;

const getActiveOrgId = (): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw =
      localStorage.getItem('shuffle_user_info') ||
      localStorage.getItem('userinfo') ||
      localStorage.getItem('user_info');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed.active_org?.id || parsed.org_id || parsed.active_org_id || null;
  } catch {
    return null;
  }
};

const getStorageKey = (orgId?: string | null): string => {
  const resolved = orgId || getActiveOrgId();
  return resolved ? `${STORAGE_KEY}_${resolved}` : STORAGE_KEY;
};

const coerceTool = (raw: unknown): ToolRef | null => {
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    return { name: trimmed, id: trimmed };
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const name = typeof obj.name === 'string' ? obj.name.trim() : '';
    const id = typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : name;
    if (!name) return null;
    return { name, id };
  }
  return null;
};

const sanitize = (parsed: unknown): AgentToolsEntry[] => {
  let target = parsed;
  if (target && typeof target === 'object' && !Array.isArray(target)) {
    const obj = target as Record<string, unknown>;
    if (Array.isArray(obj.entries)) {
      target = obj.entries;
    }
  }
  if (!Array.isArray(target)) return [];
  return target
    .filter((e: any) => e && typeof e.agent === 'string' && typeof e.actionType === 'string' && Array.isArray(e.tools))
    .map((e: any) => ({
      agent: e.agent,
      actionType: e.actionType,
      tools: (e.tools as unknown[])
        .map(coerceTool)
        .filter((t): t is ToolRef => !!t),
      updatedAt: typeof e.updatedAt === 'number' ? e.updatedAt : undefined,
    }));
};

const extractUpdatedAt = (parsed: unknown): number => {
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.updatedAt === 'number') return obj.updatedAt;
  }
  return 0;
};

interface CacheRecord {
  entries: AgentToolsEntry[];
  updatedAt: number;
}

const readCacheRecord = (): CacheRecord => {
  if (typeof window === 'undefined') return { entries: [], updatedAt: 0 };
  try {
    const key = getStorageKey();
    let raw = localStorage.getItem(key);
    if (!raw && key !== STORAGE_KEY) {
      raw = localStorage.getItem(STORAGE_KEY);
    }
    if (!raw) return { entries: [], updatedAt: 0 };
    const parsed = JSON.parse(raw);
    const entries = sanitize(parsed);
    const updatedAt =
      extractUpdatedAt(parsed) || entries.reduce((max, e) => Math.max(max, e.updatedAt || 0), 0);
    return { entries, updatedAt };
  } catch {
    return { entries: [], updatedAt: 0 };
  }
};

const readAll = (): AgentToolsEntry[] => readCacheRecord().entries;

const writeCache = (entries: AgentToolsEntry[], explicitUpdatedAt?: number) => {
  if (typeof window === 'undefined') return;
  try {
    const updatedAt = explicitUpdatedAt ?? Date.now();
    const payload: AgentToolsCachePayload = {
      version: 1,
      updatedAt,
      entries,
    };
    const serialized = JSON.stringify(payload);
    const orgKey = getStorageKey();
    localStorage.setItem(orgKey, serialized);
    if (orgKey !== STORAGE_KEY) {
      localStorage.setItem(STORAGE_KEY, serialized);
    }
    window.dispatchEvent(
      new CustomEvent(AGENT_TOOLS_CHANGED_EVENT, { detail: { updatedAt, entries } }),
    );
  } catch {
    /* ignore */
  }
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const executeDatastoreWrite = async (payload: AgentToolsCachePayload): Promise<boolean> => {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await setDatastoreItem(DATASTORE_KEY, payload, DATASTORE_CATEGORY);
      if (res && res.success) {
        return true;
      }
      if (attempt === maxAttempts) {
        try {
          const fallbackRes = await setDatastoreItem(
            'agent_tools_config',
            payload,
            'shuffle-security_configuration',
          );
          if (fallbackRes && fallbackRes.success) {
            return true;
          }
        } catch {
          /* ignore fallback */
        }
      }
      console.warn(`[agentTools] Datastore write attempt ${attempt} failed:`, res?.error || 'Unknown error');
    } catch (err) {
      console.warn(`[agentTools] Datastore write attempt ${attempt} threw:`, err);
    }
    if (attempt < maxAttempts) {
      await sleep(attempt * 500);
    }
  }
  return false;
};

const flushDatastoreQueue = async (): Promise<boolean> => {
  if (isWritingToDatastore) {
    return writeQueuePromise || Promise.resolve(false);
  }
  isWritingToDatastore = true;
  writeQueuePromise = (async () => {
    let finalSuccess = true;
    try {
      while (pendingWritePayload) {
        const toWrite = pendingWritePayload;
        pendingWritePayload = null;
        const ok = await executeDatastoreWrite(toWrite);
        if (!ok) finalSuccess = false;
      }
    } finally {
      isWritingToDatastore = false;
      writeQueuePromise = null;
    }
    return finalSuccess;
  })();
  return writeQueuePromise;
};

export const persistToDatastore = (
  entries: AgentToolsEntry[],
  updatedAt?: number,
): Promise<boolean> => {
  const ts = updatedAt ?? Date.now();
  pendingWritePayload = {
    version: 1,
    updatedAt: ts,
    entries,
  };
  return flushDatastoreQueue();
};

const mergeEntries = (
  base: AgentToolsEntry[],
  incoming: AgentToolsEntry[],
  preferIncoming: boolean,
): AgentToolsEntry[] => {
  const map = new Map<string, AgentToolsEntry>();
  const makeKey = (e: AgentToolsEntry) => `${e.agent}:::${e.actionType}`;

  for (const e of base) {
    map.set(makeKey(e), { ...e, tools: dedupeTools(e.tools) });
  }

  for (const inc of incoming) {
    const key = makeKey(inc);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...inc, tools: dedupeTools(inc.tools) });
    } else if (preferIncoming) {
      map.set(key, { ...inc, tools: dedupeTools(inc.tools) });
    } else {
      const incTs = inc.updatedAt || 0;
      const existTs = existing.updatedAt || 0;
      if (incTs >= existTs) {
        map.set(key, { ...inc, tools: dedupeTools(inc.tools) });
      }
    }
  }

  return Array.from(map.values());
};

/**
 * Hydrate the local cache from the datastore. Call once on app startup
 * (e.g. from DashboardLayout). Uses monotonic sequencing and timestamp-based
 * reconciliation so stale network reads never overwrite fresh local modifications.
 */
export const loadAgentToolsFromDatastore = async (): Promise<AgentToolsEntry[]> => {
  localWriteSeq++;
  const requestSeq = localWriteSeq;
  const requestStartTime = Date.now();

  try {
    let res = await getDatastoreItem(DATASTORE_KEY, DATASTORE_CATEGORY);
    if (!res.success || !res.item) {
      try {
        const fb = await getDatastoreItem('agent_tools_config', 'shuffle-security_configuration');
        if (fb.success && fb.item) {
          res = fb;
        }
      } catch {
        /* ignore */
      }
    }

    const localRecord = readCacheRecord();
    const localEntries = localRecord.entries;
    const localUpdatedAt = localRecord.updatedAt;

    if (!res.success || !res.item) {
      if (localEntries.length > 0 && localWriteSeq === requestSeq) {
        persistToDatastore(localEntries, localUpdatedAt);
      }
      return localEntries;
    }

    let remoteValue: unknown = res.item.value;
    if (typeof remoteValue === 'string') {
      try {
        remoteValue = JSON.parse(remoteValue);
      } catch {
        /* fall through */
      }
    }

    const remoteEntries = sanitize(remoteValue);
    const remoteUpdatedAt =
      extractUpdatedAt(remoteValue) ||
      remoteEntries.reduce((max, e) => Math.max(max, e.updatedAt || 0), 0);

    // If local writes happened during in-flight fetch, local changes win
    if (localWriteSeq > requestSeq || lastLocalWriteTime > requestStartTime) {
      const merged = mergeEntries(remoteEntries, localEntries, true);
      writeCache(merged, Math.max(localUpdatedAt, Date.now()));
      persistToDatastore(merged);
      return merged;
    }

    // If server returned empty array but local cache has tools, retain and sync up
    if (remoteEntries.length === 0 && localEntries.length > 0) {
      persistToDatastore(localEntries, localUpdatedAt);
      return localEntries;
    }

    // If local cache is newer than server, retain local
    if (localUpdatedAt > remoteUpdatedAt && localEntries.length > 0) {
      const merged = mergeEntries(remoteEntries, localEntries, true);
      writeCache(merged, localUpdatedAt);
      persistToDatastore(merged, localUpdatedAt);
      return merged;
    }

    // Server is newer or equal: reconcile and update cache
    const merged = mergeEntries(localEntries, remoteEntries, false);
    writeCache(merged, remoteUpdatedAt || Date.now());
    return merged;
  } catch (err) {
    console.warn('[agentTools] Error in loadAgentToolsFromDatastore:', err);
    return readAll();
  }
};

export const INCIDENT_HANDLER_SKILL = 'incident-handler';

export const getAgentTools = (
  agent: string = DEFAULT_AGENT,
  actionType: string = DEFAULT_ACTION_TYPE,
): ToolRef[] => {
  const all = readAll();
  const entry = all.find((e) => e.agent === agent && e.actionType === actionType);
  if (entry && entry.tools && entry.tools.length > 0) {
    return entry.tools;
  }
  if (agent === 'incident-handler' || agent === 'incident-response') {
    return all.find((e) => e.agent === DEFAULT_AGENT && e.actionType === actionType)?.tools ?? [];
  }
  if (agent === DEFAULT_AGENT) {
    return all.find((e) => (e.agent === 'incident-handler' || e.agent === 'incident-response') && e.actionType === actionType)?.tools ?? [];
  }
  return [];
};

const dedupeTools = (tools: ToolRef[]): ToolRef[] => {
  const seen = new Set<string>();
  const out: ToolRef[] = [];
  for (const t of tools) {
    const key = (t.id || t.name).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
};

export const setAgentTools = (
  tools: ToolRef[],
  agent: string = DEFAULT_AGENT,
  actionType: string = DEFAULT_ACTION_TYPE,
): AgentToolsEntry[] => {
  localWriteSeq++;
  const now = Date.now();
  lastLocalWriteTime = now;

  const all = readAll();
  const dedup = dedupeTools(tools.filter((t) => t && typeof t.name === 'string' && t.name.trim().length > 0));

  const setEntry = (targetAgent: string) => {
    const idx = all.findIndex((e) => e.agent === targetAgent && e.actionType === actionType);
    const entry: AgentToolsEntry = {
      agent: targetAgent,
      actionType,
      tools: dedup,
      updatedAt: now,
    };
    if (idx >= 0) all[idx] = entry;
    else all.push(entry);
  };

  setEntry(agent);
  if (agent === 'incident-handler' || agent === 'incident-response') {
    setEntry(DEFAULT_AGENT);
  } else if (agent === DEFAULT_AGENT) {
    setEntry('incident-handler');
  }

  writeCache(all, now);
  persistToDatastore(all, now);
  return all;
};

export const saveAgentTools = async (
  tools: ToolRef[],
  agent: string = DEFAULT_AGENT,
  actionType: string = DEFAULT_ACTION_TYPE,
): Promise<{ success: boolean; entries: AgentToolsEntry[] }> => {
  const entries = setAgentTools(tools, agent, actionType);
  const now = lastLocalWriteTime;
  const success = await persistToDatastore(entries, now);
  return { success, entries };
};

/** Get tools assigned to a given skill/preset (e.g. 'incident-handler', 'vulnerability', etc.) */
export const getToolsForSkill = (skillOrPresetId: string): ToolRef[] => {
  const normalized = (skillOrPresetId || '').toLowerCase().trim();
  if (normalized === 'incident-handler' || normalized === 'incident-response' || normalized === 'default') {
    const ih = getAgentTools('incident-handler');
    if (ih.length > 0) return ih;
    return getAgentTools(DEFAULT_AGENT);
  }
  return getAgentTools(normalized);
};

export const addAgentTool = (
  tool: ToolRef,
  agent: string = DEFAULT_AGENT,
  actionType: string = DEFAULT_ACTION_TYPE,
) => {
  const ref = coerceTool(tool);
  if (!ref) return;
  const current = getAgentTools(agent, actionType);
  const key = (ref.id || ref.name).toLowerCase();
  if (current.some((t) => (t.id || t.name).toLowerCase() === key)) return;
  setAgentTools([...current, ref], agent, actionType);
};

/**
 * Remove a tool by its canonical id. Falls back to name match for legacy
 * entries that were persisted before ids were tracked.
 */
export const removeAgentTool = (
  toolId: string,
  agent: string = DEFAULT_AGENT,
  actionType: string = DEFAULT_ACTION_TYPE,
) => {
  const target = (toolId || '').toLowerCase();
  const current = getAgentTools(agent, actionType);
  setAgentTools(
    current.filter((t) => (t.id || '').toLowerCase() !== target && t.name.toLowerCase() !== target),
    agent,
    actionType,
  );
};

export const formatToolName = (name: string): string =>
  name.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

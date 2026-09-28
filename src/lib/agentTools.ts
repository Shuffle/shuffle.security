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

import {
  getDatastoreItem,
  setDatastoreItem,
  getDatastoreByCategory,
  DATASTORE_CATEGORIES,
} from '../Shuffle-MCPs/datastore';

const STORAGE_KEY = 'agent_tools_config';
const DATASTORE_CATEGORY = DATASTORE_CATEGORIES.CONFIGURATION;
const DATASTORE_KEY = 'agent_tools_config';
const LEGACY_DATASTORE_CATEGORY = 'shuffle-security_agent_tools';
const LEGACY_DATASTORE_KEY = 'config';

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
  configured?: boolean;
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
    return (
      parsed?.active_org?.id ||
      parsed?.org_id ||
      parsed?.active_org_id ||
      (Array.isArray(parsed?.orgs) && parsed.orgs[0]?.id) ||
      parsed?.id ||
      null
    );
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
  configured: boolean;
}

const readCacheRecord = (): CacheRecord => {
  if (typeof window === 'undefined') return { entries: [], updatedAt: 0, configured: false };
  try {
    const key = getStorageKey();
    let raw = localStorage.getItem(key);
    let parsed: any = null;
    let entries: AgentToolsEntry[] = [];
    let updatedAt = 0;
    let configured = false;

    if (raw) {
      try {
        parsed = JSON.parse(raw);
        entries = sanitize(parsed);
        updatedAt =
          extractUpdatedAt(parsed) || entries.reduce((max, e) => Math.max(max, e.updatedAt || 0), 0);
        configured =
          parsed?.configured === true ||
          entries.length > 0 ||
          updatedAt > 0 ||
          (raw.includes('"entries"') && raw.includes('"version"'));
      } catch {
        /* fall through */
      }
    }

    // Only if org-specific key was completely absent from localStorage, check global fallback
    if (raw === null && key !== STORAGE_KEY) {
      const fallbackRaw = localStorage.getItem(STORAGE_KEY);
      if (fallbackRaw) {
        try {
          const fallbackParsed = JSON.parse(fallbackRaw);
          const fallbackEntries = sanitize(fallbackParsed);
          if (fallbackEntries.length > 0) {
            entries = fallbackEntries;
            updatedAt =
              extractUpdatedAt(fallbackParsed) ||
              fallbackEntries.reduce((max, e) => Math.max(max, e.updatedAt || 0), 0) ||
              Date.now();
            configured = true;
            // Migrate immediately into org key
            writeCache(entries, updatedAt);
          }
        } catch {
          /* ignore fallback parse failure */
        }
      }
    }

    return { entries, updatedAt, configured };
  } catch {
    return { entries: [], updatedAt: 0, configured: false };
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
      configured: true,
    };
    const serialized = JSON.stringify(payload);
    const orgKey = getStorageKey();
    localStorage.setItem(orgKey, serialized);
    if (orgKey !== STORAGE_KEY) {
      try {
        localStorage.setItem(STORAGE_KEY, serialized);
      } catch {
        /* ignore fallback write if quota is tight */
      }
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
        try {
          await setDatastoreItem(LEGACY_DATASTORE_KEY, payload, LEGACY_DATASTORE_CATEGORY);
        } catch {
          /* ignore legacy mirror write error */
        }
        return true;
      }
      if (attempt === maxAttempts) {
        try {
          const fallbackRes = await setDatastoreItem(
            LEGACY_DATASTORE_KEY,
            payload,
            LEGACY_DATASTORE_CATEGORY,
          );
          if (fallbackRes && fallbackRes.success) {
            return true;
          }
        } catch {
          /* ignore fallback write error */
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
    configured: true,
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
      const incTs = inc.updatedAt || 0;
      const existTs = existing.updatedAt || 0;
      // When preferIncoming is true (local modification during in-flight fetch),
      // allow empty tool array if incoming timestamp is at least as fresh as existing
      if (inc.tools.length === 0 && existing.tools.length > 0) {
        if (incTs >= existTs && incTs > 0) {
          map.set(key, { ...inc, tools: [] });
        }
      } else {
        map.set(key, { ...inc, tools: dedupeTools(inc.tools) });
      }
    } else {
      const incTs = inc.updatedAt || 0;
      const existTs = existing.updatedAt || 0;
      // Allow intentional empty tool array if incoming timestamp is at least as fresh
      if (inc.tools.length === 0 && existing.tools.length > 0) {
        if (incTs >= existTs && (incTs > 0 || existTs === 0)) {
          map.set(key, { ...inc, tools: [] });
        }
      } else if (incTs >= existTs) {
        map.set(key, { ...inc, tools: dedupeTools(inc.tools) });
      }
    }
  }

  return Array.from(map.values());
};

/**
 * Maps a datastore category (e.g. 'shuffle-security_incidents') or explicit skill
 * to the canonical agent skill ID (e.g. 'incident-handler', 'vulnerability').
 */
export const getSkillForCategory = (category: string, explicitSkill?: string): string => {
  if (explicitSkill && explicitSkill.trim()) {
    const s = explicitSkill.toLowerCase().trim();
    if (s === 'incident-response' || s === 'incident-handler') return 'incident-handler';
    if (s === 'vulnerability-agent' || s === 'vulnerability-management' || s === 'vulnerability') return 'vulnerability';
    if (s === 'workflow-edit' || s === 'build-workflows') return 'build-workflows';
    if (s === 'computer-use' || s === 'host-monitor-control') return 'host-monitor-control';
    return s;
  }
  const cat = (category || '').toLowerCase().trim();
  if (cat.includes('incident')) return 'incident-handler';
  if (cat.includes('vuln')) return 'vulnerability';
  if (cat.includes('infra') || cat.includes('sensor')) return 'host-monitor-control';
  return 'incident-handler';
};

/** Human-readable display label for a skill. */
export const getSkillLabel = (skillOrCategory: string): string => {
  const norm = getSkillForCategory(skillOrCategory, skillOrCategory);
  switch (norm) {
    case 'incident-handler':
    case 'incident-response':
      return 'Incident Handler';
    case 'vulnerability':
      return 'Vulnerability Agent';
    case 'build-workflows':
      return 'Build Workflow';
    case 'host-monitor-control':
      return 'Computer Use';
    case 'support':
      return 'Support Agent';
    case 'detection':
      return 'Detection Agent';
    default:
      return formatToolName(norm);
  }
};

/** Canonical built-in app identifiers (both slugs and IDs) that are active by default for a skill. */
export const getBuiltInAppsForSkill = (skillOrPresetId: string): string[] => {
  const norm = (skillOrPresetId || '').toLowerCase().trim();
  if (norm === 'incident-handler' || norm === 'incident-response' || norm === 'default') {
    return ['48793430d21468f9e371ace402efcd8e', 'shuffle_incidents'];
  }
  if (norm === 'vulnerability' || norm === 'vulnerability-agent' || norm === 'vulnerability-management') {
    return ['shuffle_vulnerabilities', 'shuffle_software_and_packages', 'b82668d868f6dc7ac1dc14caa92c674b'];
  }
  if (norm === 'build-workflows') {
    return ['shuffle_workflows_builder', 'shuffle_apps'];
  }
  if (norm === 'host-monitor-control' || norm === 'computer-use') {
    return ['shuffle_host_monitors'];
  }
  if (norm === 'support') {
    return ['shuffle_tools'];
  }
  if (norm === 'detection') {
    return ['shuffle_detection'];
  }
  return [];
};

/** Checks if an app key or ID is a built-in default for a skill. */
export const isBuiltInSkillApp = (
  skillOrPresetId: string,
  appKey: string,
  appId?: string | null,
): boolean => {
  const builtIn = getBuiltInAppsForSkill(skillOrPresetId).map((s) => s.toLowerCase());
  const k = (appKey || '').toLowerCase();
  const id = (appId || '').toLowerCase();
  return (k ? builtIn.includes(k) : false) || (id ? builtIn.includes(id) : false);
};

/**
 * Hydrates agent tools from category automations (e.g. "Automation for Incidents")
 * if no custom tools have been assigned in the canonical datastore yet.
 */
export const hydrateFromCategoryAutomations = async (force: boolean = false): Promise<boolean> => {
  if (!force) {
    const local = readCacheRecord();
    if (local.configured) {
      return false;
    }
  }
  let changed = false;
  try {
    const incRes: any = await getDatastoreByCategory(DATASTORE_CATEGORIES.INCIDENTS, undefined, 1);
    const incAuto = incRes?.categoryConfig?.automations?.find(
      (a: any) => a.type === 'ai_agent' || a.name === 'AI Incident Handling',
    );
    const incApps = incAuto?.options
      ?.flatMap((o: any) => (Array.isArray(o.apps) ? o.apps : []))
      .filter((a: any): a is string => typeof a === 'string' && !!a.trim());

    if (incApps && incApps.length > 0) {
      const uniqueApps = Array.from(new Set<string>(incApps as string[]));
      const assignedTools: ToolRef[] = uniqueApps
        .filter((k: string) => !isBuiltInSkillApp('incident-handler', k))
        .map((k: string) => ({ name: k, id: k }));
      if (assignedTools.length > 0) {
        setAgentTools(assignedTools, 'incident-handler');
        saveAgentTools(assignedTools, 'incident-handler');
        changed = true;
      }
    }
  } catch (err) {
    console.warn('[agentTools] Failed to hydrate from category automations:', err);
  }
  return changed;
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
    let loadedFromLegacy = false;

    // If primary read failed or returned no item, fall back to legacy datastore
    if (!res.success || !res.item) {
      try {
        const legacyRes = await getDatastoreItem(LEGACY_DATASTORE_KEY, LEGACY_DATASTORE_CATEGORY);
        if (legacyRes.success && legacyRes.item) {
          res = legacyRes;
          loadedFromLegacy = true;
        }
      } catch (err) {
        console.warn('[agentTools] Legacy datastore read failed:', err);
      }
    }

    const localRecord = readCacheRecord();
    const localEntries = localRecord.entries;
    const localUpdatedAt = localRecord.updatedAt;
    const localConfigured = localRecord.configured;

    if (!res.success || !res.item) {
      // If datastore fetch errored (network error, 500, etc.), do not overwrite local cache
      if (!res.success) {
        return localEntries;
      }

      // If datastore item genuinely does not exist (404), check if local is already configured
      if (localConfigured || localEntries.length > 0) {
        if (localWriteSeq === requestSeq) {
          persistToDatastore(localEntries, localUpdatedAt);
        }
        return localEntries;
      }

      // Neither datastore nor local cache has ever been configured: attempt initial hydration
      const hydrated = await hydrateFromCategoryAutomations(true);
      if (hydrated) {
        return readAll();
      }

      // If category automations also had no apps, initialize an empty record so it is marked configured
      writeCache([], Date.now());
      persistToDatastore([], Date.now());
      return [];
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

    // If local cache is newer than server, retain local and push to server
    if (localUpdatedAt > remoteUpdatedAt) {
      const merged = mergeEntries(remoteEntries, localEntries, true);
      writeCache(merged, localUpdatedAt);
      persistToDatastore(merged, localUpdatedAt);
      return merged;
    }

    // Server is newer or equal: reconcile and update cache
    const merged = mergeEntries(localEntries, remoteEntries, false);
    writeCache(merged, remoteUpdatedAt || Date.now());

    // If entries were loaded from legacy location, migrate them to modern datastore location
    if (loadedFromLegacy) {
      persistToDatastore(merged, remoteUpdatedAt || Date.now());
    }

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
  if (entry && Array.isArray(entry.tools)) {
    return entry.tools;
  }
  if (agent === 'incident-handler' || agent === 'incident-response' || agent === DEFAULT_AGENT) {
    const found = all.find(
      (e) =>
        (e.agent === 'incident-handler' || e.agent === 'incident-response' || e.agent === DEFAULT_AGENT) &&
        e.actionType === actionType &&
        Array.isArray(e.tools),
    );
    if (found) return found.tools;
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
  if (agent === 'incident-handler' || agent === 'incident-response' || agent === DEFAULT_AGENT) {
    setEntry('incident-handler');
    setEntry('incident-response');
    setEntry(DEFAULT_AGENT);
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
    return getAgentTools('incident-handler');
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
): AgentToolsEntry[] => {
  const target = (toolId || '').toLowerCase();
  const current = getAgentTools(agent, actionType);
  return setAgentTools(
    current.filter((t) => (t.id || '').toLowerCase() !== target && t.name.toLowerCase() !== target),
    agent,
    actionType,
  );
};

export const formatToolName = (name: string): string =>
  name.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());



/**
 * Returns all allowed apps for a skill: built-in default apps merged with assigned tools from permissions.
 */
export const resolveSkillAllowedApps = (skillOrPresetId: string): string[] => {
  const builtIns = getBuiltInAppsForSkill(skillOrPresetId);
  const assigned = getToolsForSkill(skillOrPresetId);
  const result: string[] = [];
  const seen = new Set<string>();

  // Primary built-in (e.g. 48793430d21468f9e371ace402efcd8e / shuffle_incidents)
  for (const b of builtIns) {
    const k = b.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      result.push(b);
    }
  }

  // Assigned tools (e.g. elasticsearch)
  for (const t of assigned) {
    const idKey = (t.id || '').toLowerCase();
    const nameKey = (t.name || '').toLowerCase();
    const val = t.id || t.name;
    const checkKey = idKey || nameKey;
    if (checkKey && !seen.has(checkKey)) {
      seen.add(checkKey);
      result.push(val);
    }
  }

  return result;
};

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
}

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
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((e: any) => e && typeof e.agent === 'string' && typeof e.actionType === 'string' && Array.isArray(e.tools))
    .map((e: any) => ({
      agent: e.agent,
      actionType: e.actionType,
      tools: (e.tools as unknown[])
        .map(coerceTool)
        .filter((t): t is ToolRef => !!t),
    }));
};

const readAll = (): AgentToolsEntry[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return sanitize(JSON.parse(raw));
  } catch {
    return [];
  }
};

const writeCache = (entries: AgentToolsEntry[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    window.dispatchEvent(new CustomEvent(AGENT_TOOLS_CHANGED_EVENT));
  } catch {
    /* ignore */
  }
};

const persistToDatastore = (entries: AgentToolsEntry[]) => {
  // Fire-and-forget: UI already updated from cache. Failures are logged
  // so users can see them in the console but do not block interaction.
  setDatastoreItem(DATASTORE_KEY, entries, DATASTORE_CATEGORY).catch((err) => {
    console.warn('[agentTools] Failed to persist to datastore:', err);
  });
};

const writeAll = (entries: AgentToolsEntry[]) => {
  writeCache(entries);
  persistToDatastore(entries);
};

/**
 * Hydrate the local cache from the datastore. Call once on app startup
 * (e.g. from DashboardLayout). Safe to call repeatedly — last write wins.
 */
export const loadAgentToolsFromDatastore = async (): Promise<AgentToolsEntry[]> => {
  try {
    const res = await getDatastoreItem(DATASTORE_KEY, DATASTORE_CATEGORY);
    if (!res.success || !res.item) return readAll();
    let value: unknown = res.item.value;
    if (typeof value === 'string') {
      try { value = JSON.parse(value); } catch { /* fall through */ }
    }
    const entries = sanitize(value);
    writeCache(entries);
    return entries;
  } catch {
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
) => {
  const all = readAll();
  const dedup = dedupeTools(tools.filter((t) => t && typeof t.name === 'string' && t.name.trim().length > 0));

  const setEntry = (targetAgent: string) => {
    const idx = all.findIndex((e) => e.agent === targetAgent && e.actionType === actionType);
    if (idx >= 0) all[idx] = { agent: targetAgent, actionType, tools: dedup };
    else all.push({ agent: targetAgent, actionType, tools: dedup });
  };

  setEntry(agent);
  if (agent === 'incident-handler' || agent === 'incident-response') {
    setEntry(DEFAULT_AGENT);
  } else if (agent === DEFAULT_AGENT) {
    setEntry('incident-handler');
  }

  writeAll(all);
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

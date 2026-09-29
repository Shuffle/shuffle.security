/**
 * connectedSourcesService — Discovers and connects tenant ingestion sources and forward destinations
 * as active AI tools in contextual Ask AI panels.
 *
 * Self-contained: relative imports only within Shuffle-MCPs.
 */

import {
  isIgnoredWorkflowAppName,
  normalizeAppName,
  findIngestTicketsWorkflow,
  extractWorkflowAppNames,
} from '@/Shuffle-Core/ingestionDetection';

export interface ConnectedToolApp {
  name: string;
  id?: string;
  icon?: string;
}

const CACHE_PREFIX = 'shuffle:connected_tools:v2:';
const LEGACY_CACHE_PREFIX = 'shuffle:connected_tools:';

/**
 * Retrieve cached connected tools from localStorage for immediate synchronous render.
 */
export function getCachedConnectedTools(category?: string): ConnectedToolApp[] {
  if (!category) return [];
  try {
    if (typeof localStorage === 'undefined') return [];
    try {
      localStorage.removeItem(`${LEGACY_CACHE_PREFIX}${category}`);
    } catch {
      /* ignore storage remove errors */
    }
    const raw = localStorage.getItem(`${CACHE_PREFIX}${category}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Save discovered connected tools to localStorage cache.
 */
export function setCachedConnectedTools(category: string, tools: ConnectedToolApp[]): void {
  if (!category) return;
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(`${CACHE_PREFIX}${category}`, JSON.stringify(tools));
  } catch {
    /* ignore storage write errors */
  }
}

/** Maximum number of automatically assigned tools. */
export const MAX_AUTO_ASSIGNED_TOOLS = 6;

/**
 * Merge connected tools into a base app list without duplicating entries,
 * preserving base apps first and appending tools enabled for ingestion.
 */
export function mergeConnectedTools(
  baseApps: ConnectedToolApp[] = [],
  connectedTools: ConnectedToolApp[] = [],
  maxTools: number = MAX_AUTO_ASSIGNED_TOOLS,
): ConnectedToolApp[] {
  if ((!connectedTools || connectedTools.length === 0) && (!baseApps || baseApps.length === 0)) {
    return [];
  }
  const seen = new Set<string>();
  const merged: ConnectedToolApp[] = [];

  const tryAdd = (app?: ConnectedToolApp) => {
    if (!app?.name || merged.length >= maxTools) return;
    const norm = normalizeAppName(app.name);
    if (!norm || seen.has(norm) || isIgnoredWorkflowAppName(norm)) return;
    seen.add(norm);
    merged.push(app);
  };

  // 1. Base default apps first (e.g. shuffle_vulnerabilities, shuffle_software_and_packages)
  for (const base of baseApps) {
    tryAdd(base);
  }

  // 2. Add authenticated connected tools (e.g. tools enabled for ingest) up to maxTools
  for (const tool of connectedTools || []) {
    tryAdd(tool);
    if (merged.length >= maxTools) return merged;
  }

  return merged.slice(0, maxTools);
}

/**
 * Derives connected tools from raw API responses.
 * Strictly includes only available tools that are BOTH authenticated AND configured for ingestion,
 * capped to a maximum number of tools (default 4).
 */
export function resolveConnectedTools(
  category: 'incidents' | 'vulnerabilities' | string,
  authApiResponse: any[] = [],
  workflowsResponse: any[] = [],
  maxTools: number = MAX_AUTO_ASSIGNED_TOOLS,
): ConnectedToolApp[] {
  const tools: ConnectedToolApp[] = [];
  const seen = new Set<string>();

  const authList = Array.isArray(authApiResponse)
    ? authApiResponse
    : (authApiResponse as any)?.data || [];

  const workflows = Array.isArray(workflowsResponse)
    ? workflowsResponse
    : (workflowsResponse as any)?.workflows || [];

  // Helper to add tool avoiding duplicates & ignored runtime apps
  const addTool = (name: string, id?: string, icon?: string) => {
    if (!name || typeof name !== 'string') return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const norm = normalizeAppName(trimmed);
    if (!norm || seen.has(norm) || isIgnoredWorkflowAppName(norm)) return;
    seen.add(norm);
    tools.push({ name: trimmed, id: id || undefined, icon: icon || undefined });
  };

  // Build lookup of auth apps by normalized name and id
  const authByName = new Map<string, { name: string; id?: string; icon?: string; active: boolean; valid: boolean }>();
  for (const entry of authList) {
    const app = entry?.app || entry;
    const rawName = app?.name;
    if (!rawName) continue;
    const norm = normalizeAppName(rawName);
    const isValid =
      entry?.active === true ||
      entry?.validation?.valid === true ||
      entry?.hasValidAuth === true ||
      app?.is_valid === true ||
      app?.tested === true;
    const img = app?.large_image || app?.image_url || app?.image || entry?.bestImage || '';
    if (!authByName.has(norm) || isValid) {
      authByName.set(norm, {
        name: rawName,
        id: app?.id || entry?.id,
        icon: img,
        active: Boolean(entry?.active),
        valid: isValid,
      });
    }
  }

  if (category === 'incidents') {
    // Only tools configured for incident ingestion
    const ingestWf = findIngestTicketsWorkflow(workflows);
    const ingestAppNames = ingestWf ? extractWorkflowAppNames(ingestWf) : new Set<string>();

    ingestAppNames.forEach((norm) => {
      const auth = authByName.get(norm);
      if (auth && (auth.valid || auth.active)) {
        addTool(auth.name, auth.id, auth.icon);
      } else if (auth) {
        addTool(auth.name, auth.id, auth.icon);
      } else {
        addTool(norm);
      }
    });
  } else if (category === 'vulnerabilities') {
    // Only tools configured for vulnerability ingestion
    const ingestVulnWorkflows = workflows.filter((w: any) =>
      typeof w?.name === 'string' && (
        w.name === 'Ingest Vulnerabilities' ||
        w.name.toLowerCase().includes('ingest vulnerabilit')
      )
    );
    const vulnAppNames = new Set<string>();
    for (const wf of ingestVulnWorkflows) {
      for (const name of extractWorkflowAppNames(wf)) {
        vulnAppNames.add(name);
      }
    }

    vulnAppNames.forEach((norm) => {
      const auth = authByName.get(norm);
      if (auth && (auth.valid || auth.active)) {
        addTool(auth.name, auth.id, auth.icon);
      } else if (auth) {
        addTool(auth.name, auth.id, auth.icon);
      } else {
        addTool(norm);
      }
    });
  }

  return tools.slice(0, maxTools);
}

/**
 * Fetch live connected tools from tenant workflows and authenticated apps.
 */
export async function fetchConnectedTools(
  category: string,
  resolveUrl: (path: string) => string = (p) => p,
  resolveHeaders: () => Record<string, string> = () => ({}),
): Promise<ConnectedToolApp[]> {
  if (!category || (category !== 'incidents' && category !== 'vulnerabilities')) {
    return [];
  }

  try {
    const [authRes, wfRes] = await Promise.allSettled([
      fetch(resolveUrl('/api/v1/apps/authentication'), {
        credentials: 'include',
        headers: resolveHeaders(),
      }),
      fetch(resolveUrl('/api/v1/workflows'), {
        credentials: 'include',
        headers: resolveHeaders(),
      }),
    ]);

    const authData = authRes.status === 'fulfilled' && authRes.value.ok ? await authRes.value.json() : [];
    const wfData = wfRes.status === 'fulfilled' && wfRes.value.ok ? await wfRes.value.json() : [];

    const tools = resolveConnectedTools(category, authData, wfData);
    if (tools.length > 0) {
      setCachedConnectedTools(category, tools);
    }
    return tools;
  } catch {
    return getCachedConnectedTools(category);
  }
}

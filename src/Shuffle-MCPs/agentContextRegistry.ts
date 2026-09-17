/**
 * agentContextRegistry — Extensible context awareness engine for Shuffle-MCPs.
 *
 * Maps application routes / locations to the appropriate MCP apps, agent skills/presets,
 * and contextual prompt seeds. Also manages per-page user choice persistence so any
 * manual tool or preset customization is remembered for that specific page.
 *
 * Self-contained: No host-app `@/` imports.
 */

import { getCachedConnectedTools, mergeConnectedTools, MAX_AUTO_ASSIGNED_TOOLS } from './connectedSourcesService';
import { composeDocPromptInput, isDocsRoute } from '@/lib/docsPromptContext';
import { composeIncidentPromptInput } from '@/lib/incidentPromptContext';
import { getDocGroup } from '@/lib/docGroups';

export interface AgentContextApp {
  name: string;
  id?: string;
  icon?: string;
}

export interface AgentContextRule {
  /** Unique identifier for the rule (e.g. 'incident-detail', 'incidents-list') */
  id: string;
  /**
   * Route pattern string with ':param' tokens (e.g. '/incidents/:id', '/vulnerabilities'),
   * a RegExp, or a custom matching function.
   */
  match:
    | string
    | RegExp
    | ((pathname: string, searchParams: URLSearchParams) => boolean | Record<string, string> | null);
  /** Default MCP apps to pre-select for this context */
  defaultApps: AgentContextApp[];
  /** Default skill/preset id (e.g. 'incident-response', 'vulnerability', 'build-workflows') */
  defaultPresetId?: string | null;
  /** Title shown on drawer header */
  title?: string | ((params: Record<string, string>, pathname: string, entityOverride?: string) => string);
  /** Subtitle or context description shown under the drawer header */
  subtitle?: string | ((params: Record<string, string>, pathname: string, entityOverride?: string) => string);
  /** Contextual prompt seed */
  defaultPrompt?: string | ((params: Record<string, string>, pathname: string, entityOverride?: string) => string);
  /** Custom placeholder for the prompt input */
  placeholder?: string;
  /** Custom label for the trigger button (e.g. 'Ask about Workflows') */
  buttonLabel?: string | ((params: Record<string, string>, pathname: string, entityOverride?: string) => string);
  /** Custom title for the panel/drawer header bar */
  headerTitle?: string | ((params: Record<string, string>, pathname: string, entityOverride?: string) => string);
  /** Key used for localStorage persistence. Defaults to the rule id or parameterized key */
  getStorageKey?: (params: Record<string, string>, pathname: string) => string;
  /** Human-readable description of what this context provides */
  description?: string;
  /** Category used to automatically connect tenant sources and destinations (e.g. 'incidents' or 'vulnerabilities') */
  sourceCategory?: 'incidents' | 'vulnerabilities' | string;
  /** Explicit flag indicating this route lacks a dedicated MCP mapping */
  missingConfig?: boolean;
  /** Whether Ask AI is in Beta and enabled for normal users on this page */
  isBeta?: boolean | ((params: Record<string, string>, pathname: string) => boolean);
  /** Whether opening the panel should sideshift the page layout. Default: true */
  sideshift?: boolean;
  /** Optional function to transform/compose user prompt input before submission (e.g. injecting markdown context for doc pages) */
  composeInput?: (rawInput: string, params: Record<string, string>, pathname: string) => string;
}

export interface AgentResolvedContext {
  ruleId: string;
  apps: AgentContextApp[];
  presetId?: string | null;
  title: string;
  /** Function to dynamically re-evaluate the title with an active entity name override */
  titleFn?: (entityOverride?: string) => string;
  /** Custom label for trigger button */
  buttonLabel?: string;
  buttonLabelFn?: (entityOverride?: string) => string;
  /** Custom title for panel header */
  headerTitle?: string;
  headerTitleFn?: (entityOverride?: string) => string;
  subtitle: string;
  defaultPrompt: string;
  placeholder?: string;
  storageKey: string;
  params: Record<string, string>;
  pathname: string;
  /** Category used to automatically connect tenant sources and destinations */
  sourceCategory?: 'incidents' | 'vulnerabilities' | string;
  /** True when the active apps or preset come from the user's saved overrides rather than rule defaults */
  isOverridden: boolean;
  /** The default apps before any user customization */
  originalDefaultApps: AgentContextApp[];
  /** The default preset before any user customization */
  originalDefaultPresetId?: string | null;
  /** True when no specific rule was configured for this route (fallback rule used) */
  missingConfig: boolean;
  /** Whether Ask AI is in Beta and enabled for normal users on this page */
  isBeta?: boolean;
  /** Whether opening the panel should sideshift the page layout */
  sideshift?: boolean;
  /** Optional function to transform/compose user prompt input before submission */
  composeInput?: (rawInput: string) => string;
}

export interface PageContextChoice {
  apps?: AgentContextApp[];
  presetId?: string | null;
  draftPrompt?: string;
  executionId?: string | null;
  authorization?: string | null;
  executionStatus?: string | null;
  viewMode?: 'start' | 'simple' | 'detailed' | null;
  updatedAt: number;
}

const STORAGE_PREFIX = 'shuffle_agent_context_choice_';

/** Match a URL pathname against a route pattern with `:param` segments */
export const matchRoutePattern = (pattern: string, pathname: string): Record<string, string> | null => {
  const normPattern = pattern.replace(/\/+$/, '') || '/';
  const normPath = pathname.replace(/\/+$/, '') || '/';

  // Exact match
  if (normPattern === normPath) return {};

  const patternSegments = normPattern.split('/');
  const pathSegments = normPath.split('/');

  if (patternSegments.length !== pathSegments.length) {
    // Check for wildcard /* at the end
    if (patternSegments[patternSegments.length - 1] === '*' && pathSegments.length >= patternSegments.length - 1) {
      const params: Record<string, string> = {};
      for (let i = 0; i < patternSegments.length - 1; i++) {
        if (patternSegments[i].startsWith(':')) {
          params[patternSegments[i].slice(1)] = decodeURIComponent(pathSegments[i]);
        } else if (patternSegments[i] !== pathSegments[i]) {
          return null;
        }
      }
      params['*'] = pathSegments.slice(patternSegments.length - 1).join('/');
      return params;
    }
    return null;
  }

  const params: Record<string, string> = {};
  for (let i = 0; i < patternSegments.length; i++) {
    const pSeg = patternSegments[i];
    const uSeg = pathSegments[i];
    if (pSeg.startsWith(':')) {
      params[pSeg.slice(1)] = decodeURIComponent(uSeg);
    } else if (pSeg !== uSeg) {
      return null;
    }
  }

  return params;
};

/** Checks whether the given pathname is an Agent-specific route that must disable Ask AI */
export const isAgentRoute = (pathname: string): boolean => {
  const norm = pathname.toLowerCase().replace(/\/+$/, '') || '/';
  return norm === '/agents' || norm === '/agent' || norm.startsWith('/agents/') || norm.startsWith('/agent/');
};

/** Strips composite org prefixes (e.g. orgId::itemId -> itemId) from entity IDs */
export const formatEntityDisplayId = (rawId?: string): string => {
  if (!rawId) return '';
  if (rawId.includes('::')) {
    const parts = rawId.split('::');
    return parts[parts.length - 1] || rawId;
  }
  return rawId;
};

/** Attempts to discover the primary entity name/title from the active DOM (e.g. incident/case/alert title input) */
export const getActivePageEntityName = (): string | undefined => {
  if (typeof document === 'undefined') return undefined;
  try {
    // 0. Global window property set by detail views if available
    if (typeof window !== 'undefined' && (window as any).__shuffleActiveEntityTitle) {
      const globalTitle = String((window as any).__shuffleActiveEntityTitle).trim();
      if (globalTitle && globalTitle !== 'Incident') return globalTitle;
    }

    // 1. Direct entity title data attribute on DOM element
    const elWithTitle = document.querySelector('[data-entity-title]') as HTMLElement | null;
    const attrTitle = elWithTitle?.getAttribute('data-entity-title');
    if (attrTitle && attrTitle.trim().length > 0 && attrTitle.trim() !== 'Incident') {
      return attrTitle.trim();
    }

    // 2. Form input or textarea for title
    const titleInput = document.querySelector(
      '[data-incident-field="title"] input, [data-incident-field="title"] textarea, [data-case-field="title"] input, [data-ticket-field="title"] input, [data-alert-field="title"] input, [data-host-field="name"] input, [data-monitor-field="name"] input, [data-asset-field="name"] input, [data-software-field="name"] input, [data-package-field="name"] input'
    ) as HTMLInputElement | HTMLTextAreaElement | null;
    if (titleInput?.value && titleInput.value.trim().length > 0) {
      return titleInput.value.trim();
    }

    // 3. Fallback: text content inside title container
    const titleContainer = document.querySelector('[data-incident-field="title"], [data-case-field="title"]') as HTMLElement | null;
    if (titleContainer?.textContent) {
      const text = titleContainer.textContent.trim();
      if (text && text.length > 0 && text.length < 120 && text !== 'Enter title...' && text !== 'Incident') {
        return text;
      }
    }

    // 4. Document title (e.g. "huh | Incident | Shuffle Security")
    if (document.title) {
      const parts = document.title.split('|').map((s) => s.trim());
      if (parts.length > 1 && parts[0] && parts[0] !== 'Incident' && parts[0] !== 'Shuffle Security') {
        return parts[0];
      }
    }

    // 5. Explicit heading tags
    const heading = document.querySelector('h1, h2') as HTMLElement | null;
    if (heading?.textContent && heading.textContent.trim().length > 0 && heading.textContent.trim().length < 90) {
      const hText = heading.textContent.trim();
      if (hText !== 'Incident' && hText !== 'Incidents') {
        return hText;
      }
    }
  } catch {
    /* ignore DOM query errors */
  }
  return undefined;
};

/** Helper to extract a user-friendly page name from documentation path or active doc title */
export const getDocPageDisplayName = (pathname: string, entityOverride?: string): string => {
  // If we are within documentation (/docs/*), map to its category so "Ask about X" asks about the whole category
  if (pathname.startsWith('/docs')) {
    const slug = pathname.replace(/^\/docs\/?/, '').split('/')[0]?.split('#')[0]?.split('?')[0];
    if (slug) {
      const group = getDocGroup(slug);
      if (group) {
        return group.label;
      }
    } else {
      return 'Docs';
    }
  }

  let candidate = (entityOverride || '').trim();
  if (!candidate || candidate.toLowerCase() === 'documentation' || candidate.toLowerCase() === 'index') {
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length <= 1) {
      return 'Docs';
    }
    candidate = parts[parts.length - 1];
  }

  const lower = candidate.toLowerCase();
  if (
    lower === 'about' ||
    lower === 'about-shuffle' ||
    lower === 'about_shuffle' ||
    lower === 'about shuffle' ||
    lower === 'about us' ||
    lower === 'about-us'
  ) {
    return 'Shuffle';
  }
  if (lower === 'index' || lower === 'documentation') {
    return 'Docs';
  }

  const known: Record<string, string> = {
    workflows: 'Workflows',
    incidents: 'Incidents',
    vulnerabilities: 'Vulnerabilities',
    monitors: 'Monitors',
    detection: 'Detection',
    detections: 'Detections',
    apps: 'Apps',
    api: 'API',
    ai: 'Agents & AI',
    sigma: 'Sigma',
    cases: 'Cases',
    alerts: 'Alerts',
    assets: 'Assets',
    software: 'Software',
    packages: 'Packages',
  };
  if (known[lower]) {
    return known[lower];
  }

  if (candidate.includes(' ') || /[A-Z]/.test(candidate)) {
    if (/^about\s+/i.test(candidate)) {
      const stripped = candidate.replace(/^about\s+/i, '').trim();
      if (stripped.length > 0) return stripped;
      return 'Shuffle';
    }
    return candidate;
  }

  return candidate.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

/** Helper to extract documentation category name */
export const getDocCategory = (pathname: string, entityOverride?: string): string => {
  if (pathname.startsWith('/docs')) {
    const slug = pathname.replace(/^\/docs\/?/, '').split('/')[0]?.split('#')[0]?.split('?')[0];
    if (slug) {
      const group = getDocGroup(slug);
      if (group && group.label) {
        return group.label;
      }
    } else {
      return 'Documentation';
    }
  }

  const clean = (entityOverride || '').trim();
  if (clean && clean.toLowerCase() !== 'index' && clean.toLowerCase() !== 'documentation') {
    const group = getDocGroup(clean);
    if (group && group.label) return group.label;
  }

  return 'Documentation';
};

/**
 * Formats a clean, natural "Ask about X" label avoiding grammatical stutter like
 * "Ask about About", "Ask about How To ...", or repetitive wording.
 */
export const formatDocAskAbout = (topic: string): string => {
  const t = (topic || '').trim();
  if (!t || t.toLowerCase() === 'docs' || t.toLowerCase() === 'documentation') {
    return 'Ask about Documentation';
  }
  const lower = t.toLowerCase();
  if (lower === 'about' || lower === 'about shuffle' || lower === 'about us' || lower === 'shuffle') {
    return 'Ask about Shuffle';
  }
  if (lower === 'automation') {
    return 'Ask about Automation';
  }
  if (lower === 'security') {
    return 'Ask about Security';
  }
  if (lower === 'usability') {
    return 'Ask about Usability';
  }
  if (lower === 'infrastructure') {
    return 'Ask about Infrastructure';
  }
  if (/^about\s+/i.test(t)) {
    return `Ask about ${t.replace(/^about\s+/i, '').trim()}`;
  }
  if (/^how\s+to\s+/i.test(t)) {
    return `Ask ${t.replace(/^how\s+to\s+/i, 'how to ')}`;
  }
  if (/^shuffle\s+/i.test(t)) {
    return `Ask about ${t}`;
  }
  return `Ask about ${t}`;
};

/**
 * Formats the drawer/panel heading for documentation pages.
 */
export const formatDocHelpTitle = (topic: string): string => {
  const t = (topic || '').trim();
  if (!t || t.toLowerCase() === 'docs' || t.toLowerCase() === 'documentation') {
    return 'How can we help with Documentation?';
  }
  const lower = t.toLowerCase();
  if (lower === 'about' || lower === 'about shuffle' || lower === 'about us' || lower === 'shuffle') {
    return 'How can we help with Shuffle?';
  }
  if (lower === 'automation') {
    return 'How can we help with Automation?';
  }
  if (lower === 'security') {
    return 'How can we help with Security?';
  }
  if (lower === 'usability') {
    return 'How can we help with Usability?';
  }
  if (lower === 'infrastructure') {
    return 'How can we help with Infrastructure?';
  }
  if (/^about\s+/i.test(t)) {
    return `How can we help with ${t.replace(/^about\s+/i, '').trim()}?`;
  }
  if (/^shuffle\s+/i.test(t)) {
    return `How can we help with ${t}?`;
  }
  return `How can we help with ${t}?`;
};

/**
 * Formats the initial prompt prefix for documentation pages.
 */
export const formatDocDefaultPrompt = (topic: string): string => {
  const t = (topic || '').trim();
  if (!t || t.toLowerCase() === 'docs' || t.toLowerCase() === 'documentation') {
    return 'Help me understand Documentation: ';
  }
  const lower = t.toLowerCase();
  if (lower === 'about' || lower === 'about shuffle' || lower === 'about us' || lower === 'shuffle') {
    return 'Help me understand Shuffle: ';
  }
  if (/^about\s+/i.test(t)) {
    return `Help me understand ${t.replace(/^about\s+/i, '').trim()}: `;
  }
  if (/^how\s+to\s+/i.test(t)) {
    return `Help me understand ${t.replace(/^how\s+to\s+/i, 'how to ')}: `;
  }
  return `Help me understand ${t}: `;
};

/**
 * Built-in context rules for Shuffle.
 * Most specific rules are defined first.
 */
export const DEFAULT_AGENT_CONTEXT_RULES: AgentContextRule[] = [
  // ==========================================
  // 1. Incidents, Cases, Tickets, Alerts (Grouped)
  // ==========================================
  // Incidents List (/incidents, /incidents-simple)
  {
    id: 'incidents-list',
    match: (pathname) => {
      const norm = pathname.replace(/\/+$/, '') || '/';
      return norm === '/incidents' || norm === '/incidents-simple';
    },
    isBeta: true,
    buttonLabel: 'Ask about incidents',
    headerTitle: 'Ask about incidents',
    defaultApps: [{ name: 'shuffle_incidents' }],
    defaultPresetId: 'incident-response',
    sourceCategory: 'incidents',
    title: 'How can we help handle incidents?',
    subtitle: () => 'Shuffle Incidents MCP',
    defaultPrompt: 'Investigate these incidents and recommend next steps: ',
    placeholder: 'Triage incidents, correlate alerts, or search threat intelligence...',
    getStorageKey: () => 'incidents_list',
    description: 'Incidents overview with Shuffle Incidents MCP',
  },
  // Specific Incident Detail
  {
    id: 'incident-detail',
    match: (pathname) => {
      const parts = pathname.replace(/\/+$/, '').split('/');
      if (parts.length === 3 && parts[1] === 'incidents') {
        const id = parts[2];
        const reserved = ['custom-fields', 'ioc-types', 'observables', 'response-actions', 'threat-feeds'];
        if (!reserved.includes(id)) {
          return { id };
        }
      }
      return null;
    },
    isBeta: true,
    buttonLabel: 'Ask about this incident',
    headerTitle: 'Ask about this incident',
    defaultApps: [{ name: 'shuffle_incidents' }],
    defaultPresetId: 'incident-response',
    sourceCategory: 'incidents',
    title: (params, _, entityOverride) => {
      const cleanId = formatEntityDisplayId(params.id);
      const entity = entityOverride || getActivePageEntityName();
      return entity ? `How can we help handle incident "${entity}"?` : `How can we help handle incident #${cleanId}?`;
    },
    subtitle: () => 'Shuffle Incidents MCP',
    defaultPrompt: (params) => {
      const cleanId = formatEntityDisplayId(params.id);
      return `Investigate incident ${cleanId} and recommend next steps: `;
    },
    composeInput: (raw) => composeIncidentPromptInput(raw),
    placeholder: 'Ask about this incident, triage observables, or correlate...',
    getStorageKey: (params) => `incident_${params.id}`,
    description: 'Focused on the currently viewed incident with Shuffle Incidents MCP',
  },
  // Simplified Incident Detail
  {
    id: 'incident-simple-detail',
    match: '/incidents-simple/:id',
    isBeta: true,
    buttonLabel: 'Ask about this incident',
    headerTitle: 'Ask about this incident',
    defaultApps: [{ name: 'shuffle_incidents' }],
    defaultPresetId: 'incident-response',
    sourceCategory: 'incidents',
    title: (params, _, entityOverride) => {
      const cleanId = formatEntityDisplayId(params.id);
      const entity = entityOverride || getActivePageEntityName();
      return entity ? `How can we help handle incident "${entity}"?` : `How can we help handle incident #${cleanId}?`;
    },
    subtitle: () => 'Shuffle Incidents MCP',
    defaultPrompt: (params) => {
      const cleanId = formatEntityDisplayId(params.id);
      return `Investigate incident ${cleanId} and recommend next steps: `;
    },
    composeInput: (raw) => composeIncidentPromptInput(raw),
    placeholder: 'Ask about this incident, triage observables, or correlate...',
    getStorageKey: (params) => `incident_${params.id}`,
    description: 'Focused on the currently viewed incident with Shuffle Incidents MCP',
  },
  // Specific Case Detail
  {
    id: 'case-detail',
    match: '/cases/:id',
    defaultApps: [{ name: 'shuffle_incidents' }],
    defaultPresetId: 'incident-response',
    sourceCategory: 'incidents',
    isBeta: true,
    title: (params, _, entityOverride) => {
      const cleanId = formatEntityDisplayId(params.id);
      const entity = entityOverride || getActivePageEntityName();
      return entity ? `How can we help handle case "${entity}"?` : `How can we help handle case #${cleanId}?`;
    },
    subtitle: () => 'Shuffle Incidents MCP',
    defaultPrompt: (params) => {
      const cleanId = formatEntityDisplayId(params.id);
      return `Investigate case ${cleanId} and recommend next steps: `;
    },
    composeInput: (raw) => composeIncidentPromptInput(raw),
    placeholder: 'Review case evidence, correlate events, or recommend response actions...',
    getStorageKey: (params) => `case_${params.id}`,
    description: 'Focused on the currently viewed case with Shuffle Incidents MCP',
  },
  // Specific Ticket Detail
  {
    id: 'ticket-detail',
    match: '/tickets/:id',
    defaultApps: [{ name: 'shuffle_incidents' }],
    defaultPresetId: 'incident-response',
    sourceCategory: 'incidents',
    isBeta: true,
    title: (params, _, entityOverride) => {
      const cleanId = formatEntityDisplayId(params.id);
      const entity = entityOverride || getActivePageEntityName();
      return entity ? `How can we help handle ticket "${entity}"?` : `How can we help handle ticket #${cleanId}?`;
    },
    subtitle: () => 'Shuffle Incidents MCP',
    defaultPrompt: (params) => {
      const cleanId = formatEntityDisplayId(params.id);
      return `Investigate ticket ${cleanId} and recommend next steps: `;
    },
    placeholder: 'Investigate ticket, draft reply, or correlate related incidents...',
    getStorageKey: (params) => `ticket_${params.id}`,
    description: 'Focused on the currently viewed ticket with Shuffle Incidents MCP',
  },
  // Specific Alert Detail
  {
    id: 'alert-detail',
    match: '/alerts/:id',
    defaultApps: [{ name: 'shuffle_incidents' }],
    defaultPresetId: 'incident-response',
    sourceCategory: 'incidents',
    isBeta: true,
    title: (params, _, entityOverride) => {
      const cleanId = formatEntityDisplayId(params.id);
      const entity = entityOverride || getActivePageEntityName();
      return entity ? `How can we help handle alert "${entity}"?` : `How can we help handle alert #${cleanId}?`;
    },
    subtitle: () => 'Shuffle Incidents MCP',
    defaultPrompt: (params) => {
      const cleanId = formatEntityDisplayId(params.id);
      return `Investigate alert ${cleanId} and recommend next steps: `;
    },
    placeholder: 'Analyze alert telemetry, assess false positive probability, or escalate...',
    getStorageKey: (params) => `alert_${params.id}`,
    description: 'Focused on the currently viewed alert with Shuffle Incidents MCP',
  },
  // Incidents Overview & Subpages (/incidents/*)
  {
    id: 'incidents-group',
    match: (pathname) => pathname.startsWith('/incidents') || pathname.startsWith('/incidents-simple'),
    defaultApps: [{ name: 'shuffle_incidents' }],
    defaultPresetId: 'incident-response',
    sourceCategory: 'incidents',
    isBeta: true,
    title: 'How can we help handle incidents?',
    subtitle: 'Shuffle Incidents MCP',
    defaultPrompt: 'Investigate this incident and recommend next steps: ',
    placeholder: 'Triage incidents, correlate alerts, or search threat intelligence...',
    getStorageKey: () => 'incidents_list',
    description: 'Incidents overview with Shuffle Incidents MCP',
  },
  // Cases Overview & Subpages (/cases/*)
  {
    id: 'cases-group',
    match: (pathname) => pathname.startsWith('/cases'),
    defaultApps: [{ name: 'shuffle_incidents' }],
    defaultPresetId: 'incident-response',
    sourceCategory: 'incidents',
    isBeta: true,
    title: 'How can we help handle cases?',
    subtitle: 'Shuffle Incidents MCP',
    defaultPrompt: 'Investigate this case and recommend next steps: ',
    placeholder: 'Review active cases, correlate investigations, or log evidence...',
    getStorageKey: () => 'cases_list',
    description: 'Cases overview with Shuffle Incidents MCP',
  },
  // Tickets Overview & Subpages (/tickets/*)
  {
    id: 'tickets-group',
    match: (pathname) => pathname.startsWith('/tickets'),
    defaultApps: [{ name: 'shuffle_incidents' }],
    defaultPresetId: 'incident-response',
    sourceCategory: 'incidents',
    isBeta: true,
    title: 'How can we help handle tickets?',
    subtitle: 'Shuffle Incidents MCP',
    defaultPrompt: 'Investigate this ticket and recommend next steps: ',
    placeholder: 'Triage incoming tickets, automate assignments, or resolve issues...',
    getStorageKey: () => 'tickets_list',
    description: 'Tickets overview with Shuffle Incidents MCP',
  },
  // Alerts Overview & Subpages (/alerts/*, /notifications/*)
  {
    id: 'alerts-group',
    match: (pathname) => pathname.startsWith('/alerts') || pathname.startsWith('/notifications'),
    defaultApps: [{ name: 'shuffle_incidents' }],
    defaultPresetId: 'incident-response',
    sourceCategory: 'incidents',
    isBeta: true,
    title: 'How can we help handle alerts?',
    subtitle: 'Shuffle Incidents MCP',
    defaultPrompt: 'Investigate this alert and recommend next steps: ',
    placeholder: 'Triage incoming security alerts, filter noise, or escalate to incident...',
    getStorageKey: () => 'alerts_list',
    description: 'Alert and notification triage with Shuffle Incidents MCP',
  },

  // ==========================================
  // 2. Vulnerabilities (shuffle_vulnerabilities, shuffle_software_and_packages)
  // ==========================================
  // Specific Vulnerability Detail
  {
    id: 'vulnerability-detail',
    match: '/vulnerabilities/:id',
    defaultApps: [
      { name: 'shuffle_vulnerabilities' },
      { name: 'shuffle_software_and_packages' },
    ],
    defaultPresetId: 'vulnerability',
    sourceCategory: 'vulnerabilities',
    title: (params, _, entityOverride) => {
      const cleanId = formatEntityDisplayId(params.id);
      const entity = entityOverride || getActivePageEntityName();
      return entity ? `How can we help with ${entity}?` : `How can we help with vulnerability ${cleanId}?`;
    },
    subtitle: () => 'Shuffle Vulnerabilities & Shuffle Software and Packages',
    defaultPrompt: (params) => {
      const cleanId = formatEntityDisplayId(params.id);
      return `Review vulnerability ${cleanId} and draft remediation plan: `;
    },
    placeholder: 'Analyze this CVE, check affected hosts, and draft remediation...',
    getStorageKey: (params) => `vulnerability_${params.id}`,
    description: 'Focused on the selected vulnerability with Shuffle Vulnerabilities and Shuffle Software and Packages',
  },
  // Vulnerabilities List & Subpages
  {
    id: 'vulnerabilities-list',
    match: (pathname) => pathname.startsWith('/vulnerabilities'),
    defaultApps: [
      { name: 'shuffle_vulnerabilities' },
      { name: 'shuffle_software_and_packages' },
    ],
    defaultPresetId: 'vulnerability',
    sourceCategory: 'vulnerabilities',
    title: 'How can we help review vulnerabilities?',
    subtitle: () => 'Shuffle Vulnerabilities & Shuffle Software and Packages',
    defaultPrompt: 'Review my current vulnerabilities and prioritize them by ',
    placeholder: 'Review CVEs, prioritize by exploitability, or draft patch workflows...',
    getStorageKey: () => 'vulnerabilities_list',
    description: 'Vulnerabilities overview with Shuffle Vulnerabilities and Shuffle Software and Packages',
  },

  // ==========================================
  // 3. Monitors & Computer Use (shuffle_host_monitors for all)
  // ==========================================
  // Specific Host Terminal (/monitors/:id/terminal)
  {
    id: 'monitor-terminal-detail',
    match: '/monitors/:id/terminal',
    defaultApps: [{ name: 'shuffle_host_monitors' }],
    defaultPresetId: 'host-monitor-control',
    title: (params, _, entityOverride) => {
      const cleanId = formatEntityDisplayId(params.id);
      const entity = entityOverride || getActivePageEntityName();
      return entity ? `How can we help in terminal for "${entity}"?` : `How can we help in terminal on host #${cleanId}?`;
    },
    subtitle: () => 'Shuffle Host Monitors MCP',
    defaultPrompt: (params) => {
      const cleanId = formatEntityDisplayId(params.id);
      return `Run commands on host ${cleanId} to `;
    },
    placeholder: 'Ask the agent to execute shell commands, inspect logs, or debug...',
    getStorageKey: (params) => `monitor_terminal_${params.id}`,
    description: 'Interactive terminal control with Shuffle Host Monitors MCP',
  },
  // General Host Terminal (/monitors/terminal)
  {
    id: 'monitor-terminal',
    match: '/monitors/terminal',
    defaultApps: [{ name: 'shuffle_host_monitors' }],
    defaultPresetId: 'host-monitor-control',
    title: 'How can we help in the host terminal?',
    subtitle: 'Shuffle Host Monitors MCP',
    defaultPrompt: 'Run terminal commands on this host to ',
    placeholder: 'Ask the agent to execute shell commands, inspect files, or debug...',
    getStorageKey: () => 'monitors_terminal',
    description: 'Interactive terminal control with Shuffle Host Monitors MCP',
  },
  // Host Response Actions (/monitors/response)
  {
    id: 'monitor-response',
    match: '/monitors/response',
    defaultApps: [{ name: 'shuffle_host_monitors' }],
    defaultPresetId: 'host-monitor-control',
    title: 'How can we help with host response?',
    subtitle: 'Shuffle Host Monitors MCP',
    defaultPrompt: 'Take response actions on this host to ',
    placeholder: 'Isolate host, terminate suspicious processes, or run remediation...',
    getStorageKey: () => 'monitors_response',
    description: 'Host response actions with Shuffle Host Monitors MCP',
  },
  // Specific Host Overview (/monitors/:id)
  {
    id: 'monitor-detail',
    match: '/monitors/:id',
    defaultApps: [{ name: 'shuffle_host_monitors' }],
    defaultPresetId: 'host-monitor-control',
    title: (params, _, entityOverride) => {
      const cleanId = formatEntityDisplayId(params.id);
      const entity = entityOverride || getActivePageEntityName();
      return entity ? `How can we help with host "${entity}"?` : `How can we help with host #${cleanId}?`;
    },
    subtitle: () => 'Shuffle Host Monitors MCP',
    defaultPrompt: (params) => {
      const cleanId = formatEntityDisplayId(params.id);
      return `Take control of host ${cleanId} and help me with: `;
    },
    placeholder: 'Inspect host telemetry, running processes, network connections, or remediate...',
    getStorageKey: (params) => `monitor_${params.id}`,
    description: 'Host detail view with Shuffle Host Monitors MCP',
  },
  // Monitors Fleet Overview & Subpages (/monitors, /monitors/*)
  {
    id: 'host-monitors-group',
    match: (pathname) => pathname.startsWith('/monitors'),
    defaultApps: [{ name: 'shuffle_host_monitors' }],
    defaultPresetId: 'host-monitor-control',
    title: 'How can we help with host monitors?',
    subtitle: 'Shuffle Host Monitors MCP',
    defaultPrompt: 'Take control of this host and help me with: ',
    placeholder: 'Ask the agent to run terminal commands, inspect files, or remediate...',
    getStorageKey: () => 'host_monitors',
    description: 'Computer use and host monitors control with Shuffle Host Monitors MCP',
  },

  // ==========================================
  // 4. Workflows & Automations
  // ==========================================
  // Specific Workflow Detail (/workflows/:id)
  {
    id: 'workflow-detail',
    match: '/workflows/:id',
    defaultApps: [{ name: 'shuffle_workflows_builder' }, { name: 'shuffle_apps' }],
    defaultPresetId: 'build-workflows',
    title: (params, _, entityOverride) => {
      const cleanId = formatEntityDisplayId(params.id);
      const entity = entityOverride || getActivePageEntityName();
      return entity ? `How can we help edit "${entity}"?` : `How can we help edit workflow #${cleanId}?`;
    },
    subtitle: () => 'Shuffle Workflows Builder & Shuffle Apps',
    defaultPrompt: (params) => {
      const cleanId = formatEntityDisplayId(params.id);
      return `Edit workflow ${cleanId} to `;
    },
    placeholder: 'Describe the changes, new actions, or logic to add...',
    getStorageKey: (params) => `workflow_${params.id}`,
    description: 'Focused on editing the selected workflow with Shuffle Workflows Builder and Shuffle Apps',
  },
  // Workflows Overview & Subpages (/workflows, /workflows/*)
  {
    id: 'workflows-group',
    match: (pathname) =>
      pathname === '/workflows' ||
      pathname.startsWith('/workflows') ||
      pathname.startsWith('/infrastructure/flows'),
    defaultApps: [{ name: 'shuffle_workflows_builder' }, { name: 'shuffle_apps' }],
    defaultPresetId: 'build-workflows',
    title: 'How can we help edit workflows?',
    subtitle: 'Shuffle Workflows Builder & Shuffle Apps',
    defaultPrompt: 'Edit this Shuffle workflow to ',
    placeholder: 'Describe the workflow you want to build or edit...',
    getStorageKey: () => 'workflows_builder',
    description: 'Workflow builder with Shuffle Workflows Builder and Shuffle Apps',
  },

  // ==========================================
  // 5. Assets, Software & Packages
  // ==========================================
  // Specific Asset Tab (/assets/:tab)
  {
    id: 'assets-tab',
    match: '/assets/:tab',
    defaultApps: [{ name: 'shuffle_assets' }, { name: 'shuffle_vulnerabilities' }],
    defaultPresetId: 'vulnerability',
    sourceCategory: 'vulnerabilities',
    title: (params) => {
      const entity = getActivePageEntityName();
      if (entity) return `How can we help with "${entity}"?`;
      const tabName = (params.tab || 'assets').replace(/[-_]+/g, ' ');
      return `How can we help with ${tabName}?`;
    },
    subtitle: () => 'Shuffle Assets & Shuffle Vulnerabilities',
    defaultPrompt: (params) => `Inspect ${params.tab || 'assets'} and review vulnerabilities: `,
    placeholder: 'Search assets, inspect hosts, or check security posture...',
    getStorageKey: (params) => `assets_tab_${params.tab}`,
    description: 'Assets tab view with Shuffle Assets and Shuffle Vulnerabilities MCPs',
  },
  // Assets Overview (/assets, /assets/*)
  {
    id: 'assets-overview',
    match: (pathname) => pathname === '/assets' || pathname.startsWith('/assets'),
    defaultApps: [{ name: 'shuffle_assets' }, { name: 'shuffle_vulnerabilities' }],
    defaultPresetId: 'vulnerability',
    sourceCategory: 'vulnerabilities',
    title: 'How can we help with assets?',
    subtitle: 'Shuffle Assets & Shuffle Vulnerabilities',
    defaultPrompt: 'Audit assets and review vulnerabilities for ',
    placeholder: 'Search assets, inspect hosts, or check security posture...',
    getStorageKey: () => 'assets_overview',
    description: 'Assets overview with Shuffle Assets and Shuffle Vulnerabilities MCPs',
  },
  // Software Inventory (/software, /software/*)
  {
    id: 'software-inventory',
    match: (pathname) => pathname === '/software' || pathname.startsWith('/software'),
    defaultApps: [{ name: 'shuffle_software' }, { name: 'shuffle_vulnerabilities' }],
    defaultPresetId: 'vulnerability',
    sourceCategory: 'vulnerabilities',
    title: (params) => {
      const entity = getActivePageEntityName();
      return entity ? `How can we help with "${entity}"?` : 'How can we help with software inventory?';
    },
    subtitle: () => 'Shuffle Software & Shuffle Vulnerabilities',
    defaultPrompt: 'Inspect software inventory and check for vulnerabilities in ',
    placeholder: 'Search installed software, verify versions, or scan for CVEs...',
    getStorageKey: () => 'software_inventory',
    description: 'Software inventory with Shuffle Software and Shuffle Vulnerabilities MCPs',
  },
  // Packages Inventory (/packages, /packages/*)
  {
    id: 'packages-inventory',
    match: (pathname) => pathname === '/packages' || pathname.startsWith('/packages'),
    defaultApps: [{ name: 'shuffle_packages' }, { name: 'shuffle_vulnerabilities' }],
    defaultPresetId: 'vulnerability',
    sourceCategory: 'vulnerabilities',
    title: (params) => {
      const entity = getActivePageEntityName();
      return entity ? `How can we help with "${entity}"?` : 'How can we help with packages?';
    },
    subtitle: () => 'Shuffle Packages & Shuffle Vulnerabilities',
    defaultPrompt: 'Analyze package dependencies and known vulnerabilities for ',
    placeholder: 'Search package dependencies, verify licenses, or check CVEs...',
    getStorageKey: () => 'packages_inventory',
    description: 'Package dependencies with Shuffle Packages and Shuffle Vulnerabilities MCPs',
  },

  // ==========================================
  // 6. Detection & Sigma
  // ==========================================
  {
    id: 'detection',
    match: (pathname) => pathname.startsWith('/detection'),
    defaultApps: [{ name: 'shuffle_detection' }],
    defaultPresetId: 'detection',
    title: 'How can we help tune detections?',
    subtitle: 'Shuffle Detection MCP',
    defaultPrompt: 'Modify my detections to ',
    placeholder: 'Create Sigma rules, tune detection pipelines, or filter false positives...',
    getStorageKey: () => 'detection',
    description: 'Detection engineering with Shuffle Detection MCP',
  },

  // ==========================================
  // 7. Documentation (/docs, /docs/*, /legal/*)
  // ==========================================
  // 7a. Workflows Documentation
  {
    id: 'docs-workflows',
    match: (pathname) => pathname.startsWith('/docs') && /workflow|automation|subflow|trigger/i.test(pathname),
    defaultApps: [{ name: 'shuffle_workflows_builder' }, { name: 'shuffle_apps' }],
    defaultPresetId: 'build-workflows',
    isBeta: true,
    buttonLabel: (params, pathname, entity) => formatDocAskAbout(getDocCategory(pathname, entity)),
    headerTitle: (params, pathname, entity) => formatDocAskAbout(getDocCategory(pathname, entity)),
    title: (params, pathname, entity) => formatDocHelpTitle(getDocCategory(pathname, entity)),
    subtitle: () => 'Shuffle Workflows Builder & Apps',
    defaultPrompt: (params, pathname, entity) => formatDocDefaultPrompt(getDocCategory(pathname, entity)),
    placeholder: 'Ask questions about workflows, nodes, triggers, or building automations...',
    getStorageKey: (params, pathname) => `docs_${pathname.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
    description: 'Documentation for Shuffle Workflows & Automations with Workflows Builder tools',
    sideshift: true,
  },
  // 7b. Incidents Documentation
  {
    id: 'docs-incidents',
    match: (pathname) => pathname.startsWith('/docs') && /incident|alert|case|ticket|triage/i.test(pathname),
    defaultApps: [{ name: 'shuffle_incidents' }],
    defaultPresetId: 'incident-response',
    sourceCategory: 'incidents',
    isBeta: true,
    buttonLabel: (params, pathname, entity) => formatDocAskAbout(getDocCategory(pathname, entity)),
    headerTitle: (params, pathname, entity) => formatDocAskAbout(getDocCategory(pathname, entity)),
    title: (params, pathname, entity) => formatDocHelpTitle(getDocCategory(pathname, entity)),
    subtitle: () => 'Shuffle Incidents MCP',
    defaultPrompt: (params, pathname, entity) => formatDocDefaultPrompt(getDocCategory(pathname, entity)),
    placeholder: 'Ask questions about incident response, alert feeds, or investigations...',
    getStorageKey: (params, pathname) => `docs_${pathname.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
    description: 'Documentation for Shuffle Incidents with Incident Response tools',
    sideshift: true,
  },
  // 7c. Vulnerabilities & Assets Documentation
  {
    id: 'docs-vulnerabilities',
    match: (pathname) => pathname.startsWith('/docs') && /vulnerabilit|cve|asset|software|package/i.test(pathname),
    defaultApps: [{ name: 'shuffle_vulnerabilities' }, { name: 'shuffle_assets' }],
    defaultPresetId: 'vulnerability',
    sourceCategory: 'vulnerabilities',
    isBeta: true,
    buttonLabel: (params, pathname, entity) => formatDocAskAbout(getDocCategory(pathname, entity)),
    headerTitle: (params, pathname, entity) => formatDocAskAbout(getDocCategory(pathname, entity)),
    title: (params, pathname, entity) => formatDocHelpTitle(getDocCategory(pathname, entity)),
    subtitle: () => 'Shuffle Vulnerabilities & Assets',
    defaultPrompt: (params, pathname, entity) => formatDocDefaultPrompt(getDocCategory(pathname, entity)),
    placeholder: 'Ask questions about vulnerability management, CVEs, or asset posture...',
    getStorageKey: (params, pathname) => `docs_${pathname.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
    description: 'Documentation for Vulnerabilities & Assets',
    sideshift: true,
  },
  // 7d. Host Monitors Documentation
  {
    id: 'docs-monitors',
    match: (pathname) => pathname.startsWith('/docs') && /monitor|terminal|computer-use|host/i.test(pathname),
    defaultApps: [{ name: 'shuffle_host_monitors' }],
    defaultPresetId: 'host-monitor-control',
    isBeta: true,
    buttonLabel: (params, pathname, entity) => formatDocAskAbout(getDocCategory(pathname, entity)),
    headerTitle: (params, pathname, entity) => formatDocAskAbout(getDocCategory(pathname, entity)),
    title: (params, pathname, entity) => formatDocHelpTitle(getDocCategory(pathname, entity)),
    subtitle: () => 'Shuffle Host Monitors MCP',
    defaultPrompt: (params, pathname, entity) => formatDocDefaultPrompt(getDocCategory(pathname, entity)),
    placeholder: 'Ask questions about host monitors, agent execution, or terminal controls...',
    getStorageKey: (params, pathname) => `docs_${pathname.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
    description: 'Documentation for Host Monitors',
    sideshift: true,
  },
  // 7e. Detection & Sigma Documentation
  {
    id: 'docs-detection',
    match: (pathname) => pathname.startsWith('/docs') && /detection|sigma|rule|pipeline/i.test(pathname),
    defaultApps: [{ name: 'shuffle_detection' }],
    defaultPresetId: 'detection',
    isBeta: true,
    buttonLabel: (params, pathname, entity) => formatDocAskAbout(getDocCategory(pathname, entity)),
    headerTitle: (params, pathname, entity) => formatDocAskAbout(getDocCategory(pathname, entity)),
    title: (params, pathname, entity) => formatDocHelpTitle(getDocCategory(pathname, entity)),
    subtitle: () => 'Shuffle Detection MCP',
    defaultPrompt: (params, pathname, entity) => formatDocDefaultPrompt(getDocCategory(pathname, entity)),
    placeholder: 'Ask questions about detection engineering, Sigma rules, or alerts...',
    getStorageKey: (params, pathname) => `docs_${pathname.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
    description: 'Documentation for Detection & Sigma',
    sideshift: true,
  },
  // 7f. Apps & Integrations Documentation
  {
    id: 'docs-apps',
    match: (pathname) => pathname.startsWith('/docs') && /app|integration|connector|openapi/i.test(pathname),
    defaultApps: [{ name: 'shuffle_apps' }, { name: 'shuffle_workflows_builder' }],
    defaultPresetId: 'build-workflows',
    isBeta: true,
    buttonLabel: (params, pathname, entity) => formatDocAskAbout(getDocCategory(pathname, entity)),
    headerTitle: (params, pathname, entity) => formatDocAskAbout(getDocCategory(pathname, entity)),
    title: (params, pathname, entity) => formatDocHelpTitle(getDocCategory(pathname, entity)),
    subtitle: () => 'Shuffle Apps & Integrations',
    defaultPrompt: (params, pathname, entity) => formatDocDefaultPrompt(getDocCategory(pathname, entity)),
    placeholder: 'Ask questions about building or configuring Shuffle apps...',
    getStorageKey: (params, pathname) => `docs_${pathname.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
    description: 'Documentation for Apps & Integrations',
    sideshift: true,
  },
  // 7g. General Documentation Fallback (/docs, /docs/*)
  {
    id: 'docs',
    match: (pathname) => pathname === '/docs' || pathname.startsWith('/docs/'),
    defaultApps: [],
    defaultPresetId: null,
    isBeta: true,
    buttonLabel: (params, pathname, entity) => formatDocAskAbout(getDocCategory(pathname, entity)),
    headerTitle: (params, pathname, entity) => formatDocAskAbout(getDocCategory(pathname, entity)),
    title: (params, pathname, entity) => formatDocHelpTitle(getDocCategory(pathname, entity)),
    subtitle: (params, pathname, entity) => `Shuffle ${getDocCategory(pathname, entity)} Documentation`,
    defaultPrompt: (params, pathname, entity) => formatDocDefaultPrompt(getDocCategory(pathname, entity)),
    placeholder: 'Ask questions about Shuffle features, guides, or API...',
    getStorageKey: (params, pathname) => `docs_${pathname.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
    description: 'Documentation assistant for Shuffle guides, features, and API references',
    sideshift: true,
  },
  // 7h. Legal & Articles Fallback (/legal, /legal/*, /articles, /articles/*)
  {
    id: 'legal-articles',
    match: (pathname) =>
      pathname === '/legal' ||
      pathname.startsWith('/legal/') ||
      pathname === '/articles' ||
      pathname.startsWith('/articles/'),
    defaultApps: [],
    defaultPresetId: null,
    isBeta: false,
    buttonLabel: (params, pathname, entity) => formatDocAskAbout(getDocPageDisplayName(pathname, entity)),
    headerTitle: (params, pathname, entity) => formatDocAskAbout(getDocPageDisplayName(pathname, entity)),
    title: (params, pathname, entity) => formatDocHelpTitle(getDocPageDisplayName(pathname, entity)),
    subtitle: (params, pathname, entity) => `Shuffle ${getDocPageDisplayName(pathname, entity)} Documentation`,
    defaultPrompt: (params, pathname, entity) => formatDocDefaultPrompt(getDocPageDisplayName(pathname, entity)),
    placeholder: 'Ask questions about Shuffle policies or articles...',
    getStorageKey: (params, pathname) => `docs_${pathname.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
    description: 'Assistant for Shuffle legal and article references',
    sideshift: true,
  },

  // ==========================================
  // 8. Default Fallback (Support)
  // ==========================================
  {
    id: 'default',
    match: () => true,
    defaultApps: [],
    defaultPresetId: null,
    title: 'How can we help on this page?',
    subtitle: 'General Platform Assistant',
    defaultPrompt: 'Help me with the following on this page: ',
    placeholder: 'Ask anything about Shuffle, integrations, or workflows...',
    getStorageKey: (params, pathname) => `page_${pathname.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
    description: 'General support agent for the platform',
    missingConfig: true,
  },
];

// Runtime dynamic rule registry
const customRuleRegistry: AgentContextRule[] = [];

/** Register a custom context rule dynamically. Returns an unsubscribe function. */
export const registerAgentContextRule = (rule: AgentContextRule, prepend = true): (() => void) => {
  if (prepend) {
    customRuleRegistry.unshift(rule);
  } else {
    customRuleRegistry.push(rule);
  }
  return () => {
    const idx = customRuleRegistry.indexOf(rule);
    if (idx !== -1) customRuleRegistry.splice(idx, 1);
  };
};

/** Get all registered rules (custom rules first, then built-in defaults) */
export const getAgentContextRules = (customRules?: AgentContextRule[]): AgentContextRule[] => {
  return [...(customRules ?? []), ...customRuleRegistry, ...DEFAULT_AGENT_CONTEXT_RULES];
};

/** Read saved user choice for a specific page storage key */
export const getPageContextChoice = (storageKey: string): PageContextChoice | null => {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${storageKey}`);
    if (!raw) return null;
    return JSON.parse(raw) as PageContextChoice;
  } catch {
    return null;
  }
};

/** Save user's customized apps, preset, draft prompt, and execution for a specific page storage key */
export const setPageContextChoice = (
  storageKey: string,
  choice: Partial<Omit<PageContextChoice, 'updatedAt'>>,
): void => {
  try {
    const existing = getPageContextChoice(storageKey) || { updatedAt: Date.now() };
    const payload: PageContextChoice = {
      ...existing,
      ...choice,
      updatedAt: Date.now(),
    };
    localStorage.setItem(`${STORAGE_PREFIX}${storageKey}`, JSON.stringify(payload));
  } catch {
    /* ignore storage write failures */
  }
};

/** Clear saved user choice for a specific page, reverting it to defaults */
export const clearPageContextChoice = (storageKey: string): void => {
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${storageKey}`);
  } catch {
    /* ignore storage removal failures */
  }
};

/**
 * Resolve the active context for a given pathname and search string.
 * Automatically checks for saved user choices per page and applies them if present.
 */
export const resolveAgentContext = (
  pathname: string,
  search = '',
  customRules?: AgentContextRule[],
): AgentResolvedContext => {
  const normPath = pathname.replace(/\/+$/, '') || '/';
  const searchParams = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const rules = getAgentContextRules(customRules);

  let matchedRule: AgentContextRule | null = null;
  let matchedParams: Record<string, string> = {};

  for (const rule of rules) {
    if (typeof rule.match === 'string') {
      const params = matchRoutePattern(rule.match, normPath);
      if (params !== null) {
        matchedRule = rule;
        matchedParams = params;
        break;
      }
    } else if (rule.match instanceof RegExp) {
      if (rule.match.test(normPath)) {
        matchedRule = rule;
        break;
      }
    } else if (typeof rule.match === 'function') {
      const res = rule.match(normPath, searchParams);
      if (res) {
        matchedRule = rule;
        if (typeof res === 'object') {
          matchedParams = res;
        }
        break;
      }
    }
  }

  // Fallback if somehow nothing matched (should never happen due to default rule)
  if (!matchedRule) {
    matchedRule = DEFAULT_AGENT_CONTEXT_RULES[DEFAULT_AGENT_CONTEXT_RULES.length - 1];
  }

  const storageKey = matchedRule.getStorageKey
    ? matchedRule.getStorageKey(matchedParams, normPath)
    : matchedRule.id;

  // Check if the user previously saved a choice for this page
  const savedChoice = getPageContextChoice(storageKey);
  const isOverridden = !!savedChoice && (savedChoice.apps !== undefined || savedChoice.presetId !== undefined);

  // If the user has not manually customized apps on this page, merge cached connected tools
  // for the context category (e.g. Elastic Security for incidents, Qualys for vulnerabilities).
  const cachedConnected = matchedRule.sourceCategory
    ? getCachedConnectedTools(matchedRule.sourceCategory)
    : [];
  const baseDefaultApps = mergeConnectedTools(matchedRule.defaultApps, cachedConnected, MAX_AUTO_ASSIGNED_TOOLS);

  let effectiveApps = savedChoice?.apps ?? baseDefaultApps;
  // If this is a documentation route that defaults to no tools, sanitize legacy auto-injected shuffle_tools
  if (matchedRule.id === 'docs' && matchedRule.defaultApps.length === 0 && effectiveApps.length > 0) {
    const cleaned = effectiveApps.filter(
      (a) => !['shuffle_tools', 'shuffle tools', 'shuffle_tool', 'shuffletools'].includes((a.name || '').toLowerCase().replace(/[-_]/g, '').trim())
    );
    if (cleaned.length !== effectiveApps.length) {
      effectiveApps = cleaned;
      if (savedChoice?.apps) {
        setPageContextChoice(storageKey, { ...savedChoice, apps: cleaned });
      }
    }
  }

  const effectivePresetId = savedChoice?.presetId !== undefined
    ? savedChoice.presetId
    : matchedRule.defaultPresetId;

  const title = typeof matchedRule.title === 'function'
    ? (matchedRule.title as (params: Record<string, string>, pathname: string, entityOverride?: string) => string)(
        matchedParams,
        normPath,
        getActivePageEntityName(),
      )
    : matchedRule.title ?? 'Agent';

  const titleFn = typeof matchedRule.title === 'function'
    ? (entityOverride?: string) => {
        const entity = entityOverride || getActivePageEntityName();
        return (matchedRule!.title as (params: Record<string, string>, pathname: string, entityOverride?: string) => string)(
          matchedParams,
          normPath,
          entity,
        );
      }
    : undefined;

  const buttonLabel = typeof matchedRule.buttonLabel === 'function'
    ? matchedRule.buttonLabel(matchedParams, normPath, getActivePageEntityName())
    : matchedRule.buttonLabel;

  const buttonLabelFn = typeof matchedRule.buttonLabel === 'function'
    ? (entityOverride?: string) => {
        const entity = entityOverride || getActivePageEntityName();
        return (matchedRule!.buttonLabel as (params: Record<string, string>, pathname: string, entityOverride?: string) => string)(
          matchedParams,
          normPath,
          entity,
        );
      }
    : undefined;

  const headerTitle = typeof matchedRule.headerTitle === 'function'
    ? matchedRule.headerTitle(matchedParams, normPath, getActivePageEntityName())
    : matchedRule.headerTitle;

  const headerTitleFn = typeof matchedRule.headerTitle === 'function'
    ? (entityOverride?: string) => {
        const entity = entityOverride || getActivePageEntityName();
        return (matchedRule!.headerTitle as (params: Record<string, string>, pathname: string, entityOverride?: string) => string)(
          matchedParams,
          normPath,
          entity,
        );
      }
    : undefined;

  const subtitle = typeof matchedRule.subtitle === 'function'
    ? matchedRule.subtitle(matchedParams, normPath)
    : matchedRule.subtitle ?? 'Context aware assistant';

  const defaultPrompt = typeof matchedRule.defaultPrompt === 'function'
    ? (matchedRule.defaultPrompt as (params: Record<string, string>, pathname: string, entityOverride?: string) => string)(
        matchedParams,
        normPath,
        getActivePageEntityName(),
      )
    : matchedRule.defaultPrompt ?? '';

  const missingConfig = Boolean(matchedRule.missingConfig ?? (matchedRule.id === 'default'));

  const isBeta = typeof matchedRule.isBeta === 'function'
    ? matchedRule.isBeta(matchedParams, normPath)
    : Boolean(matchedRule.isBeta);

  const composeInput = matchedRule.composeInput
    ? (rawInput: string) => matchedRule!.composeInput!(rawInput, matchedParams, normPath)
    : isDocsRoute(normPath)
      ? (rawInput: string) => composeDocPromptInput(rawInput, normPath, getDocPageDisplayName(normPath, getActivePageEntityName()))
      : undefined;

  return {
    ruleId: matchedRule.id,
    apps: effectiveApps,
    presetId: effectivePresetId,
    title,
    titleFn,
    buttonLabel,
    buttonLabelFn,
    headerTitle,
    headerTitleFn,
    subtitle,
    defaultPrompt,
    placeholder: matchedRule.placeholder,
    storageKey,
    params: matchedParams,
    pathname: normPath,
    sourceCategory: matchedRule.sourceCategory,
    isOverridden,
    originalDefaultApps: baseDefaultApps,
    originalDefaultPresetId: matchedRule.defaultPresetId,
    missingConfig,
    isBeta,
    sideshift: matchedRule.sideshift,
    composeInput,
  };
};

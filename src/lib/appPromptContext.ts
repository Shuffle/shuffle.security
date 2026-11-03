/**
 * App Page Prompt Context Builder
 *
 * Captures the active app's metadata, description, authentication status,
 * available actions, and documentation on `/apps/:appname` pages and injects
 * a structured context block into "Ask about <App>" agent prompts so the agent
 * can immediately help the user run actions, configure credentials, build
 * workflows, or answer questions about the tool.
 */

import { sanitizeDocMarkdown } from '@/lib/docsPromptContext';

export const APP_PROMPT_START = '=== APP CONTEXT ===';
export const APP_PROMPT_END = '=== END APP CONTEXT ===';

export const APP_CONTEXT_EVENT = 'shuffle-app-context-changed';

export interface AppActionSummary {
  name: string;
  label?: string;
  description?: string;
  category?: string;
  parameters?: Array<{
    name: string;
    description?: string;
    required?: boolean;
    type?: string;
  }>;
}

export interface AppAuthSummary {
  type?: string;
  required?: boolean;
  parameters?: Array<{
    name: string;
    description?: string;
    example?: string;
  }>;
}

export interface ActiveAppPromptContext {
  /** Canonical backend / execution app name (e.g. "CrowdStrike_Falcon" or "jira") */
  appName: string;
  /** URL route parameter `:appname` */
  slug?: string;
  /** Human-readable display name (e.g. "CrowdStrike Falcon" or "Jira") */
  displayName: string;
  /** Resolved Algolia objectID or backend app ID */
  appId?: string | null;
  /** Resolved logo / icon URL */
  icon?: string;
  /** App description */
  description?: string;
  /** App categories (e.g. ["SIEM", "EDR & XDR"]) */
  categories?: string[];
  /** App version string */
  appVersion?: string;
  /** Whether the app was generated from OpenAPI / AI */
  generated?: boolean;
  /** Whether the app is a built-in Shuffle platform tool */
  isBuiltIn?: boolean;
  /** Raw markdown documentation loaded for the app */
  documentation?: string;
  /** Upstream documentation link from doc metadata */
  docSourceUrl?: string;
  /** Available actions on this app */
  actions?: AppActionSummary[];
  /** Authentication configuration schema for this app */
  authentication?: AppAuthSummary;
  /** Whether the tenant has at least one validated authentication for this app */
  hasValidAuth?: boolean;
  /** Whether the tenant has any saved authentication entry for this app */
  hasAnyAuth?: boolean;
  /** Number of saved authentication entries for this app */
  authCount?: number;
  /** Whether the app is currently activated in the tenant */
  isActivated?: boolean | null;
  /** Whether event/alert ingestion is enabled for this app */
  isIngestEnabled?: boolean | null;
  /** Name of the target workflow when ingestion is enabled */
  targetWorkflowName?: string;
  /** Direct MCP endpoint path for this app */
  mcpEndpoint?: string;
}

const GLOBAL_KEY = '__shuffleActiveAppContext';

export function setActiveAppPromptContext(ctx: ActiveAppPromptContext | null): void {
  if (typeof globalThis === 'undefined') return;
  (globalThis as Record<string, unknown>)[GLOBAL_KEY] = ctx ?? undefined;
  if (typeof window !== 'undefined') {
    if (ctx?.displayName) {
      (window as unknown as Record<string, unknown>).__shuffleActiveEntityTitle = ctx.displayName;
    }
    window.dispatchEvent(new CustomEvent(APP_CONTEXT_EVENT, { detail: ctx }));
  }
}

export function clearActiveAppPromptContext(appNameOrSlug?: string): void {
  if (typeof globalThis === 'undefined') return;
  const current = (globalThis as Record<string, unknown>)[GLOBAL_KEY] as ActiveAppPromptContext | undefined;
  if (!appNameOrSlug || !current) {
    (globalThis as Record<string, unknown>)[GLOBAL_KEY] = undefined;
  } else {
    const normTarget = normalizeSlug(appNameOrSlug);
    const normCurrentName = normalizeSlug(current.appName);
    const normCurrentSlug = normalizeSlug(current.slug || '');
    if (normTarget === normCurrentName || normTarget === normCurrentSlug) {
      (globalThis as Record<string, unknown>)[GLOBAL_KEY] = undefined;
    } else {
      return;
    }
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(APP_CONTEXT_EVENT, { detail: null }));
  }
}

export function getActiveAppPromptContext(): ActiveAppPromptContext | undefined {
  if (typeof globalThis === 'undefined') return undefined;
  return (globalThis as Record<string, unknown>)[GLOBAL_KEY] as ActiveAppPromptContext | undefined;
}

function normalizeSlug(value: string): string {
  try {
    return decodeURIComponent(value).trim().toLowerCase().replace(/[\s-]+/g, '_');
  } catch {
    return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  }
}

export function humanizeAppSlug(raw?: string): string {
  if (!raw) return 'App';
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  const cleaned = decoded.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'App';
  return cleaned.replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
}

/**
 * Resolves the active app context if it matches the given route `:appname` param
 * (or returns the active context when no param is passed).
 */
export function resolveMatchingAppPromptContext(appnameParam?: string): ActiveAppPromptContext | undefined {
  const active = getActiveAppPromptContext();
  if (!active) return undefined;
  if (!appnameParam) return active;
  const target = normalizeSlug(appnameParam);
  if (!target) return active;
  if (
    normalizeSlug(active.appName) === target ||
    (active.slug && normalizeSlug(active.slug) === target) ||
    normalizeSlug(active.displayName) === target
  ) {
    return active;
  }
  return undefined;
}

/**
 * Resolves a human-friendly display name for the current app page.
 * Prefers the active app context's displayName, then falls back to humanizing
 * the URL `:appname` parameter.
 */
export function getAppDisplayName(appnameParam?: string): string {
  const active = resolveMatchingAppPromptContext(appnameParam);
  if (active?.displayName) return active.displayName;
  if (appnameParam) return humanizeAppSlug(appnameParam);
  if (typeof window !== 'undefined') {
    const match = /^\/apps\/([^/?#]+)/i.exec(window.location.pathname || '');
    if (match?.[1]) return humanizeAppSlug(match[1]);
  }
  return 'App';
}

/**
 * Checks whether a prompt string already contains an injected APP CONTEXT block.
 */
export function isAppInjectedPrompt(input?: string | null): boolean {
  if (!input || typeof input !== 'string') return false;
  return input.includes(APP_PROMPT_START) && input.includes(APP_PROMPT_END);
}

/**
 * Strips the injected APP CONTEXT block from a prompt so the UI only shows
 * the user's clean question/instruction.
 */
export function extractCleanAppPrompt(input?: string | null): string {
  if (!input || typeof input !== 'string') return '';
  if (!isAppInjectedPrompt(input)) return input;
  const endIdx = input.indexOf(APP_PROMPT_END);
  if (endIdx === -1) return input;
  const after = input.slice(endIdx + APP_PROMPT_END.length).trim();
  return after || input;
}

function formatConnectionStatus(ctx: ActiveAppPromptContext): string[] {
  const lines: string[] = [];

  if (ctx.isBuiltIn) {
    lines.push('Authentication Status: Built-in Shuffle platform tool (uses active Shuffle session, no external credentials required)');
  } else if (ctx.authentication?.required === false) {
    lines.push('Authentication Status: Optional / Not required by app specification');
  } else if (ctx.hasValidAuth) {
    const countSuffix = typeof ctx.authCount === 'number' && ctx.authCount > 0 ? ` (${ctx.authCount} saved configuration${ctx.authCount === 1 ? '' : 's'})` : '';
    lines.push(`Authentication Status: Connected and verified${countSuffix}`);
  } else if (ctx.hasAnyAuth) {
    const countSuffix = typeof ctx.authCount === 'number' && ctx.authCount > 0 ? ` (${ctx.authCount} saved configuration${ctx.authCount === 1 ? '' : 's'})` : '';
    lines.push(`Authentication Status: Credentials saved${countSuffix} (pending validation or requires verification)`);
  } else if (ctx.hasValidAuth === false || ctx.hasAnyAuth === false) {
    lines.push('Authentication Status: Not authenticated yet (user may need to configure credentials before running live actions)');
  }

  if (ctx.authentication?.type) {
    lines.push(`Authentication Scheme: ${ctx.authentication.type}`);
  }

  if (Array.isArray(ctx.authentication?.parameters) && ctx.authentication.parameters.length > 0) {
    const paramList = ctx.authentication.parameters
      .slice(0, 15)
      .map((p) => {
        const desc = p.description ? ` - ${p.description}` : '';
        const ex = p.example ? ` (e.g. ${p.example})` : '';
        return `  - ${p.name}${desc}${ex}`;
      })
      .join('\n');
    lines.push(`Required Credential Fields:\n${paramList}`);
  }

  if (ctx.isActivated !== undefined && ctx.isActivated !== null) {
    lines.push(`App Activation Status: ${ctx.isActivated ? 'Activated in tenant' : 'Not yet activated in tenant'}`);
  }

  if (ctx.isIngestEnabled !== undefined && ctx.isIngestEnabled !== null) {
    const wfNote = ctx.isIngestEnabled && ctx.targetWorkflowName ? ` (forwarding to workflow: ${ctx.targetWorkflowName})` : '';
    lines.push(`Event/Alert Ingestion: ${ctx.isIngestEnabled ? `Enabled${wfNote}` : 'Disabled'}`);
  }

  return lines;
}

function formatActionsSection(actions?: AppActionSummary[]): string {
  if (!Array.isArray(actions) || actions.length === 0) return '';
  const maxActions = 50;
  const shown = actions.slice(0, maxActions);
  const lines = shown.map((action) => {
    const labelPart = action.label && action.label.toLowerCase() !== action.name.toLowerCase().replace(/_/g, ' ')
      ? ` (${action.label})`
      : '';
    const catPart = action.category && action.category !== 'other' ? ` [${action.category}]` : '';
    const descPart = action.description ? `: ${action.description.replace(/\s+/g, ' ').trim()}` : '';
    let paramPart = '';
    if (Array.isArray(action.parameters) && action.parameters.length > 0) {
      const paramsFormatted = action.parameters
        .slice(0, 8)
        .map((p) => `${p.name}${p.required ? '*' : ''}`)
        .join(', ');
      const extraParams = action.parameters.length > 8 ? `, +${action.parameters.length - 8} more` : '';
      paramPart = ` | Params: (${paramsFormatted}${extraParams})`;
    }
    return `- ${action.name}${labelPart}${catPart}${descPart}${paramPart}`;
  });
  if (actions.length > maxActions) {
    lines.push(`- ...and ${actions.length - maxActions} additional actions available on this tool.`);
  }
  return lines.join('\n');
}

/**
 * Wraps the user's raw prompt with structured context for the currently viewed app page.
 */
export function composeAppPromptInput(rawInput: string, appnameParam?: string): string {
  const trimmed = (rawInput || '').trim();
  if (!trimmed) return rawInput;
  if (isAppInjectedPrompt(trimmed)) return trimmed;

  const ctx = resolveMatchingAppPromptContext(appnameParam);
  const effectiveSlug = ctx?.slug || appnameParam || ctx?.appName || '';
  const effectiveAppName = ctx?.appName || effectiveSlug || 'app';
  const displayName = ctx?.displayName || getAppDisplayName(effectiveSlug);
  const mcpEndpoint = ctx?.mcpEndpoint || `/api/v1/apps/${encodeURIComponent(effectiveAppName)}/mcp`;

  const metadataLines: string[] = [
    `App Name: ${displayName}`,
    `Canonical Tool Identifier: ${effectiveAppName}`,
  ];
  if (ctx?.appId) {
    metadataLines.push(`App ID: ${ctx.appId}`);
  }
  if (effectiveSlug) {
    metadataLines.push(`App Page URL: /apps/${effectiveSlug}`);
  }
  metadataLines.push(`App MCP Endpoint: ${mcpEndpoint}`);

  if (ctx?.categories && ctx.categories.length > 0) {
    metadataLines.push(`Categories: ${ctx.categories.join(', ')}`);
  }
  if (ctx?.appVersion) {
    metadataLines.push(`Version: ${ctx.appVersion}`);
  }
  if (ctx?.isBuiltIn) {
    metadataLines.push('Integration Type: Built-in Shuffle Platform Tool');
  } else if (ctx?.generated) {
    metadataLines.push('Integration Type: Generated OpenAPI / Custom App Integration');
  } else {
    metadataLines.push('Integration Type: Shuffle App Integration');
  }

  if (ctx) {
    const connLines = formatConnectionStatus(ctx);
    if (connLines.length > 0) {
      metadataLines.push(...connLines);
    }
  }

  const sections: string[] = [metadataLines.join('\n')];

  if (ctx?.description && ctx.description.trim().length > 0) {
    sections.push(
      `=== APP DESCRIPTION ===\n${ctx.description.trim()}\n=== END APP DESCRIPTION ===`,
    );
  }

  const actionsFormatted = formatActionsSection(ctx?.actions);
  if (actionsFormatted) {
    sections.push(
      `=== AVAILABLE ACTIONS & CAPABILITIES (${ctx?.actions?.length || 0}) ===\n${actionsFormatted}\n=== END AVAILABLE ACTIONS & CAPABILITIES ===`,
    );
  }

  if (ctx?.documentation && ctx.documentation.trim().length > 0) {
    const cleanDocs = sanitizeDocMarkdown(ctx.documentation, 18000);
    if (cleanDocs) {
      const sourceHeader = ctx.docSourceUrl ? `Documentation Source: ${ctx.docSourceUrl}\n` : '';
      sections.push(
        `=== APP DOCUMENTATION ===\n${sourceHeader}${cleanDocs}\n=== END APP DOCUMENTATION ===`,
      );
    }
  }

  return [
    APP_PROMPT_START,
    ...sections,
    'Operational directives for this app session:',
    `1. The user is currently on the individual page for "${displayName}" (tool identifier: "${effectiveAppName}"). This tool is attached to your session so you can use it directly.`,
    `2. Help the user accomplish whatever they want to do with "${displayName}" right here and now:`,
    `   - Execute actions: If the user wants to run an action, fetch data, test an operation, or perform a task with "${displayName}", invoke the tool directly using its available actions (or via Singul / MCP).`,
    `   - Configure & authenticate: If "${displayName}" requires credentials that are not yet configured or if an action reports missing authentication, guide the user clearly using the authentication scheme, required credential fields, and documentation above.`,
    `   - Automate & build workflows: If the user wants to automate a use case or connect "${displayName}" with other tools, provide concrete steps or execute workflow edits using the real action names and parameters of "${displayName}".`,
    `   - Answer documentation & usage questions: Use the injected description, action definitions, and documentation above to give accurate, actionable answers specific to "${displayName}".`,
    '3. Do not mention or repeat the hidden APP CONTEXT markers in your response.',
    APP_PROMPT_END,
    '',
    trimmed,
  ].join('\n');
}

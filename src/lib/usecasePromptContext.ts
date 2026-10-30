/**
 * Hidden usecase context for the "Ask about <usecase>" assistant on
 * /usecases/:flowId. The usecase detail view registers what it shows here;
 * the agent context registry appends it to the prompt, the same way
 * documentation is injected on /docs/*.
 */

export interface ActiveUsecasePromptContext {
  id: string;
  label: string;
  description?: string;
  agenticDescription?: string;
  source?: string;
  target?: string;
  phase?: string;
  tags?: string[];
  automationLabel?: string;
  automationCategory?: string;
  enabled?: boolean;
  /** Apps available per category used by this usecase (source/target). */
  categoryApps?: Record<string, string[]>;
  /** Apps with validated authentication per category used by this usecase. */
  connectedApps?: Record<string, string[]>;
  linkedWorkflows?: string[];
}

const GLOBAL_KEY = '__shuffleActiveUsecaseContext';
export const USECASE_CONTEXT_EVENT = 'shuffle-usecase-context-changed';

const scope = (): any => (typeof globalThis !== 'undefined' ? globalThis : null);

export const setActiveUsecasePromptContext = (ctx: ActiveUsecasePromptContext | null) => {
  const s = scope();
  if (!s) return;
  if (ctx) s[GLOBAL_KEY] = { ...ctx };
  else delete s[GLOBAL_KEY];
  try {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(USECASE_CONTEXT_EVENT));
  } catch { /* ignore */ }
};

export const getActiveUsecasePromptContext = (): ActiveUsecasePromptContext | null => {
  const v = scope()?.[GLOBAL_KEY];
  return v && typeof v === 'object' ? (v as ActiveUsecasePromptContext) : null;
};

export const humanizeUsecaseId = (id: string): string =>
  id.replace(/_\d+$/, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();

/** Display name for the usecase at the given flow id. */
export const getUsecaseDisplayName = (flowId?: string): string => {
  const ctx = getActiveUsecasePromptContext();
  // The URL slug (e.g. siem_alerts) can differ from the flow id, and the
  // context is cleared when the detail view unmounts, so trust it as-is.
  if (ctx?.label) return ctx.label;
  return flowId ? humanizeUsecaseId(flowId) : 'Usecases';
};

export const USECASE_PROMPT_START = '=== USECASE CONTEXT ===';
export const USECASE_PROMPT_END = '=== END USECASE CONTEXT ===';

/** Shuffle API endpoints the usecase flow relies on. */
export const USECASE_REQUIRED_APIS = [
  'GET /api/v1/workflows/usecases (usecase definitions)',
  'POST /api/v2/workflows/generate (enable: generates the workflow for the usecase)',
  'GET /api/v1/workflows (linked workflows and active state)',
  'GET /api/v1/apps/authentication (connected tools and validation state)',
  'GET /api/v1/apps (available apps per category)',
];

const list = (rec?: Record<string, string[]>) =>
  Object.entries(rec || {})
    .filter(([, v]) => Array.isArray(v) && v.length > 0)
    .map(([k, v]) => `  - ${k}: ${v.slice(0, 25).join(', ')}${v.length > 25 ? ` (+${v.length - 25} more)` : ''}`)
    .join('\n');

export const composeUsecasePromptInput = (rawInput: string, flowId?: string): string => {
  const trimmed = (rawInput || '').trim();
  if (!trimmed || trimmed.includes(USECASE_PROMPT_START)) return trimmed;
  const ctx = getActiveUsecasePromptContext();
  const lines: string[] = [USECASE_PROMPT_START];
  if (ctx) {
    lines.push(`Usecase: ${ctx.label} (id: ${ctx.id})`);
    if (ctx.source || ctx.target) lines.push(`Data flow: ${ctx.source || 'unknown'} -> ${ctx.target || 'unknown'}`);
    if (ctx.phase) lines.push(`Phase: ${ctx.phase}`);
    if (ctx.tags?.length) lines.push(`Tags: ${ctx.tags.join(', ')}`);
    if (typeof ctx.enabled === 'boolean') lines.push(`Status for this tenant: ${ctx.enabled ? 'Enabled' : 'Disabled'}`);
    if (ctx.automationLabel) lines.push(`Automation label: ${ctx.automationLabel}${ctx.automationCategory ? ` (category: ${ctx.automationCategory})` : ''}`);
    if (ctx.description) lines.push(`Description: ${ctx.description}`);
    if (ctx.agenticDescription) lines.push(`Agentic behavior: ${ctx.agenticDescription}`);
    const connected = list(ctx.connectedApps);
    if (connected) lines.push(`Connected tools with validated authentication:\n${connected}`);
    const apps = list(ctx.categoryApps);
    if (apps) lines.push(`Supported apps per category:\n${apps}`);
    if (ctx.linkedWorkflows?.length) lines.push(`Linked workflows: ${ctx.linkedWorkflows.join(', ')}`);
  } else if (flowId) {
    lines.push(`Usecase id: ${flowId}`);
  } else {
    lines.push('Page: Usecases overview (list of all automation usecases in Shuffle Security).');
  }
  lines.push(`Required Shuffle APIs:\n${USECASE_REQUIRED_APIS.map((a) => `  - ${a}`).join('\n')}`);
  lines.push(USECASE_PROMPT_END);
  return `${trimmed}\n\n${lines.join('\n')}`;
};

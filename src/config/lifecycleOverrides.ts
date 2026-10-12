/**
 * Per-tenant lifecycle overrides for incident statuses and severities.
 *
 * Built-in states in incidentConfig.ts remain the source of truth for keys,
 * OCSF ids and automatic mapping. Overrides only change presentation
 * (label, colour, hidden) and add extra synonyms. Custom entries are aliases
 * of a built-in "base" state, so everything saved stays a built-in key/id.
 * With no overrides, behaviour is identical to the defaults.
 */
import { statusConfig, STATUS_SYNONYMS, severityColors, registerSeverityColorOverride } from './incidentConfig';

export const BUILTIN_SEVERITIES = ['critical', 'high', 'medium', 'low', 'informational'] as const;

export interface StateOverride {
  label?: string;
  color?: string;
  hidden?: boolean;
}

export interface CustomState {
  key: string;
  label: string;
  color?: string;
  base: string;
  synonyms?: string[];
}

export interface LifecycleOverrides {
  statuses: { builtin: Record<string, StateOverride>; custom: CustomState[] };
  severities: { builtin: Record<string, StateOverride>; custom: CustomState[] };
}

export const EMPTY_LIFECYCLE: LifecycleOverrides = {
  statuses: { builtin: {}, custom: [] },
  severities: { builtin: {}, custom: [] },
};

const DEFAULT_STATUS = Object.fromEntries(
  Object.entries(statusConfig).map(([k, v]) => [k, { label: v.label, color: v.color, bg: v.bg }]),
);
const DEFAULT_SYNONYMS = { ...STATUS_SYNONYMS };
const DEFAULT_SEVERITY_COLORS = { ...severityColors };

export const DEFAULT_STATUS_META = DEFAULT_STATUS;
export const DEFAULT_SEVERITY_LABELS: Record<string, string> = {
  critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low', informational: 'Informational',
};

export const normalizeKey = (raw: string) => raw.toLowerCase().trim().replace(/[\s-]+/g, '_');

let severityLabelOverrides: Record<string, string> = {};
let severityColorOverrides: Record<string, string> = {};
let severitySynonyms: Record<string, string> = {};
let customStatusLabels: Record<string, CustomState> = {};

function toBg(color: string): string {
  const m = color.match(/^hsl\(\s*([^)]+)\)$/i);
  if (m) return `hsl(${m[1].replace(/,/g, ' ').replace(/\s+/g, ' ')} / 0.15)`;
  return `color-mix(in srgb, ${color} 15%, transparent)`;
}

export function sanitizeLifecycle(input: unknown): LifecycleOverrides {
  const out: LifecycleOverrides = JSON.parse(JSON.stringify(EMPTY_LIFECYCLE));
  if (!input || typeof input !== 'object') return out;
  const src = input as Record<string, any>;
  for (const kind of ['statuses', 'severities'] as const) {
    const valid: readonly string[] = kind === 'statuses' ? Object.keys(DEFAULT_STATUS) : BUILTIN_SEVERITIES;
    const builtin = src[kind]?.builtin;
    if (builtin && typeof builtin === 'object') {
      for (const [k, v] of Object.entries(builtin as Record<string, any>)) {
        if (!valid.includes(k) || !v || typeof v !== 'object') continue;
        const o: StateOverride = {};
        if (typeof v.label === 'string' && v.label.trim()) o.label = v.label.trim();
        if (typeof v.color === 'string' && v.color.trim()) o.color = v.color.trim();
        if (v.hidden === true && k !== 'new' && k !== 'resolved' && kind === 'statuses') o.hidden = true;
        out[kind].builtin[k] = o;
      }
    }
    const custom = src[kind]?.custom;
    if (Array.isArray(custom)) {
      const seen = new Set<string>(valid);
      for (const c of custom) {
        if (!c || typeof c.label !== 'string' || !c.label.trim()) continue;
        if (!valid.includes(c.base)) continue;
        const key = normalizeKey(c.key || c.label);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out[kind].custom.push({
          key,
          label: c.label.trim(),
          base: c.base,
          color: typeof c.color === 'string' && c.color.trim() ? c.color.trim() : undefined,
          synonyms: Array.isArray(c.synonyms)
            ? c.synonyms.filter((s: unknown) => typeof s === 'string' && s.trim()).map((s: string) => normalizeKey(s))
            : [],
        });
      }
    }
  }
  return out;
}

/** Apply overrides onto the shared config objects. Always resets to defaults first. */
export function applyLifecycleOverrides(raw: LifecycleOverrides | null | undefined) {
  const o = sanitizeLifecycle(raw);
  setCustomLists(o);

  for (const [k, d] of Object.entries(DEFAULT_STATUS)) {
    const ov = o.statuses.builtin[k] || {};
    const cfg = statusConfig[k] as any;
    cfg.label = ov.label || d.label;
    cfg.color = ov.color || d.color;
    cfg.bg = ov.color ? toBg(ov.color) : d.bg;
    cfg.hidden = !!ov.hidden;
  }

  for (const k of Object.keys(STATUS_SYNONYMS)) if (!(k in DEFAULT_SYNONYMS)) delete STATUS_SYNONYMS[k];
  Object.assign(STATUS_SYNONYMS, DEFAULT_SYNONYMS);
  customStatusLabels = {};
  for (const c of o.statuses.custom) {
    customStatusLabels[c.key] = c;
    for (const s of [c.key, ...(c.synonyms || [])]) {
      if (!(s in DEFAULT_SYNONYMS) && !statusConfig[s]) STATUS_SYNONYMS[s] = c.base;
    }
  }

  Object.assign(severityColors, DEFAULT_SEVERITY_COLORS);
  severityLabelOverrides = {};
  severityColorOverrides = {};
  severitySynonyms = {};
  for (const [k, ov] of Object.entries(o.severities.builtin)) {
    if (ov.label) severityLabelOverrides[k] = ov.label;
    if (ov.color) { severityColorOverrides[k] = ov.color; severityColors[k] = ov.color; }
  }
  for (const c of o.severities.custom) {
    for (const s of [c.key, ...(c.synonyms || [])]) {
      if (!(BUILTIN_SEVERITIES as readonly string[]).includes(s)) severitySynonyms[s] = c.base;
    }
  }
}

/** Map a raw severity string (built-in, custom key or synonym) to a built-in severity. */
export function resolveSeverity(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  const key = normalizeKey(raw);
  if ((BUILTIN_SEVERITIES as readonly string[]).includes(key)) return key;
  return severitySynonyms[key] || raw;
}

export function getSeverityLabel(sev: string | undefined): string {
  const key = resolveSeverity(sev) || '';
  return severityLabelOverrides[key] || DEFAULT_SEVERITY_LABELS[key] || (sev ?? '');
}

export function getSeverityColorOverride(sev: string): string | undefined {
  return severityColorOverrides[sev];
}

export function getCustomStatus(key: string | undefined): CustomState | undefined {
  return key ? customStatusLabels[normalizeKey(key)] : undefined;
}

registerSeverityColorOverride((sev) => severityColorOverrides[sev]);

let customSeverityMap: Record<string, CustomState> = {};
let customStatusList: CustomState[] = [];
let customSeverityList: CustomState[] = [];
export function getCustomStatuses(): CustomState[] { return customStatusList; }
export function getCustomSeverities(): CustomState[] { return customSeverityList; }
export function getCustomSeverity(key: string | undefined): CustomState | undefined {
  return key ? customSeverityMap[normalizeKey(key)] : undefined;
}
export function setCustomLists(o: LifecycleOverrides) {
  customStatusList = o.statuses.custom;
  customSeverityList = o.severities.custom;
  customSeverityMap = Object.fromEntries(o.severities.custom.map((c) => [c.key, c]));
}

/** Custom status stored on an incident, only while its base still matches the real status. */
export function getActiveCustomStatus(key: string | undefined, status: string | undefined): CustomState | undefined {
  const c = getCustomStatus(key);
  return c && status && c.base === status ? c : undefined;
}
/** Custom severity stored on an incident, only while its base still matches the real severity. */
export function getActiveCustomSeverity(key: string | undefined, severity: string | undefined): CustomState | undefined {
  const c = getCustomSeverity(key);
  return c && severity && c.base === resolveSeverity(severity) ? c : undefined;
}

/**
 * Filter values: built-in keys ("on_hold") or custom keys prefixed "custom:".
 * A built-in filter also matches incidents in a custom state based on it.
 */
type FilterableIncident = { status: string; severity: string; lifecycle?: { status?: string; severity?: string } };
export function matchesStatusFilter(i: FilterableIncident, f: string): boolean {
  if (f.startsWith('custom:')) return getActiveCustomStatus(i.lifecycle?.status, i.status)?.key === f.slice(7);
  return i.status === f;
}
export function matchesSeverityFilter(i: FilterableIncident, f: string): boolean {
  if (f.startsWith('custom:')) return getActiveCustomSeverity(i.lifecycle?.severity, i.severity)?.key === f.slice(7);
  return i.severity === f;
}
export function statusFilterLabel(f: string): string {
  if (f.startsWith('custom:')) return getCustomStatus(f.slice(7))?.label || f.slice(7);
  return statusConfigRef?.[f]?.label || f.replace(/_/g, ' ');
}
export function severityFilterLabel(f: string): string {
  if (f.startsWith('custom:')) return getCustomSeverity(f.slice(7))?.label || f.slice(7);
  return getSeverityLabel(f);
}
export function severityFilterColor(f: string): string | undefined {
  if (f.startsWith('custom:')) {
    const c = getCustomSeverity(f.slice(7));
    return c ? c.color || getSeverityColorFn(c.base) : undefined;
  }
  return getSeverityColorFn(f);
}

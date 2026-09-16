/**
 * routingRuleEvaluator — client-side preview/dry-run for incident routing rules.
 *
 * The "real" execution path runs inside a Shuffle workflow that writes
 * `routing_suggestions` onto the incident. This module evaluates the same
 * rule set in the browser so the incident detail page can show
 * "Rule X matched — do you want to apply it?" suggestions immediately.
 *
 * Features:
 *  - Any field path (e.g. `rawOCSF.unmapped_original.subject`) OR the
 *    whole-object pseudo-field `*` (searches every string in the
 *    normalized context AND every string reachable from `rawOCSF`).
 *  - Automatic base64 / base64url discovery: every string collected as a
 *    haystack is also probed for base64-encoded content (e.g. Gmail
 *    `payload.body.data`); if it decodes to printable text, the decoded
 *    form is added to the haystack so `contains` matches naturally.
 *  - Grouped AND / OR: conditions default to AND. A condition with
 *    `or: true` joins the previous condition into an OR-group. Groups
 *    are AND'd together. Legacy `matchMode: 'any' | 'all'` still works
 *    when no per-condition `or` flags are present.
 */
import type {
  RoutingRule,
  RoutingCondition,
} from '@/components/settings/IncidentRoutingEditor';
import {
  evaluateTree,
  collectLeaves,
  type ConditionGroup,
  type ConditionLeaf,
} from '@/utils/routingConditionTree';

export interface RoutingRuleMatch {
  rule: RoutingRule;
  matched: RoutingCondition[];
}

/** Snapshot of the fields a rule can target. */
export interface IncidentEvaluationContext {
  title?: string;
  description?: string;
  source?: string;
  severity?: string;
  status?: string;
  labels?: string[];
  observables?: Array<{ type?: string; value?: string }>;
  stakeholders?: Array<{ email?: string }>;
  rawOCSF?: any;
  [key: string]: any;
}

export type DatastoreEvaluationContext = IncidentEvaluationContext;

const getDeep = (obj: any, path: string): any => {
  if (obj == null) return undefined;
  const parts = path.split('.');
  let cur: any = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
};

// ── base64 helpers ───────────────────────────────────────────────────────
// Gmail-style payloads embed the message body as base64url; other providers
// wrap blobs the same way. Rather than force the user to spell out the exact
// path, every string haystack is probed and, if it decodes to printable
// text, the decoded form is added alongside the raw string.

const BASE64_MIN_LEN = 8;
const BASE64_MAX_LEN = 200_000; // don't try to decode multi-MB blobs

const looksBase64ish = (s: string): boolean => {
  if (s.length < BASE64_MIN_LEN || s.length > BASE64_MAX_LEN) return false;
  // strict-ish charset for base64 / base64url
  return /^[A-Za-z0-9+/_\-]+={0,2}$/.test(s);
};

const tryDecodeBase64 = (s: string): string | null => {
  if (!looksBase64ish(s)) return null;
  let b = s.replace(/-/g, '+').replace(/_/g, '/');
  while (b.length % 4 !== 0) b += '=';
  try {
    const bin = atob(b);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    if (!decoded) return null;
    // Heuristic: mostly printable characters (letters, digits, punctuation,
    // whitespace, or non-ASCII UTF-8 like é / æ). Anything else is likely
    // random bytes that happened to satisfy the regex.
    let printable = 0;
    for (let i = 0; i < decoded.length; i++) {
      const c = decoded.charCodeAt(i);
      if (c === 9 || c === 10 || c === 13 || (c >= 32 && c < 127) || c > 160) {
        printable++;
      }
    }
    if (printable / decoded.length < 0.85) return null;
    // Reject decoded output that is essentially unchanged (avoids noise
    // where a normal ASCII sentence happens to satisfy the base64 charset).
    if (decoded === s) return null;
    return decoded;
  } catch {
    return null;
  }
};

// ── whole-object string collector ────────────────────────────────────────
// Walks any value and returns every reachable string. Bounded to keep the
// evaluator fast even on very large rawOCSF payloads.

const MAX_STRINGS = 5000;
const MAX_DEPTH = 12;

const collectAllStrings = (root: any): string[] => {
  const out: string[] = [];
  const seen = new WeakSet<object>();
  const visit = (v: any, depth: number) => {
    if (out.length >= MAX_STRINGS || depth > MAX_DEPTH || v == null) return;
    if (typeof v === 'string') { out.push(v); return; }
    if (typeof v === 'number' || typeof v === 'boolean') { out.push(String(v)); return; }
    if (typeof v !== 'object') return;
    if (seen.has(v)) return;
    seen.add(v);
    if (Array.isArray(v)) {
      for (const it of v) visit(it, depth + 1);
    } else {
      for (const k of Object.keys(v)) visit((v as any)[k], depth + 1);
    }
  };
  visit(root, 0);
  return out;
};

/**
 * Resolve a rule field path against the evaluation context. Returns either
 * a single value or an array. The pseudo-field `*` (or the alias `$whole`)
 * expands to every string in the normalized context AND every string
 * reachable from `rawOCSF`.
 */
const resolveField = (ctx: IncidentEvaluationContext, field: string): any => {
  if (!field) return undefined;

  // Whole-object match — collect every string from the context so operators
  // like `contains` scan the entire payload at once.
  if (field === '*' || field === '$whole') {
    const buckets: any[] = [
      ctx,
      (ctx.observables || []).map((o) => `${o?.type || ''}:${o?.value || ''}`),
      (ctx.stakeholders || []).map((s) => s?.email || ''),
    ];
    return collectAllStrings(buckets);
  }

  // Top-level normalized fields
  switch (field) {
    case 'title': return ctx.title;
    case 'description': return ctx.description;
    case 'source': return ctx.source;
    case 'severity': return ctx.severity;
    case 'status': return ctx.status;
    case 'labels': return ctx.labels;
  }

  // observables.<type> — collect values of that observable type
  if (field.startsWith('observables.')) {
    const t = field.slice('observables.'.length).toLowerCase();
    return (ctx.observables || [])
      .filter((o) => (o.type || '').toLowerCase() === t)
      .map((o) => o.value)
      .filter((v): v is string => typeof v === 'string');
  }

  // stakeholders.email — emails of all stakeholders
  if (field === 'stakeholders.email') {
    return (ctx.stakeholders || [])
      .map((s) => s.email)
      .filter((v): v is string => typeof v === 'string');
  }

  // rawOCSF.* — deep-path into the original payload
  if (field.startsWith('rawOCSF.')) {
    return getDeep(ctx.rawOCSF, field.slice('rawOCSF.'.length));
  }

  // Generic deep-path or top-level field on any datastore record
  const deepVal = getDeep(ctx, field);
  if (deepVal !== undefined) {
    return deepVal;
  }

  return undefined;
};

const asStringArray = (v: any): string[] => {
  if (v == null) return [];
  if (Array.isArray(v)) return v.flatMap(asStringArray);
  if (typeof v === 'object') {
    try { return [JSON.stringify(v)]; } catch { return []; }
  }
  return [String(v)];
};

/**
 * Expand a set of raw string haystacks with any base64-decoded variants.
 * Deduplicated and length-capped so a single rule cannot balloon memory.
 */
const withBase64Decodes = (haystacks: string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of haystacks) {
    if (!seen.has(s)) { seen.add(s); out.push(s); }
    if (out.length >= MAX_STRINGS) break;
    const decoded = tryDecodeBase64(s.trim());
    if (decoded && !seen.has(decoded)) {
      seen.add(decoded);
      out.push(decoded);
    }
  }
  return out;
};

const evaluateCondition = (ctx: IncidentEvaluationContext, c: RoutingCondition): boolean => {
  const raw = resolveField(ctx, c.field);
  const rawStrings = asStringArray(raw);
  // Auto-decode any base64/base64url blobs on the fly so a rule like
  // `contains "invoice"` fires against Gmail's `payload.body.data` without
  // the user having to spell out the decoding step.
  const haystacks = withBase64Decodes(rawStrings).map((s) => s.toLowerCase());
  const needle = (c.value ?? '').toLowerCase();

  switch (c.op) {
    case 'exists':
      return haystacks.length > 0 && haystacks.some((s) => s.length > 0);
    case 'equals':
      return haystacks.some((s) => s === needle);
    case 'contains':
      return needle.length > 0 && haystacks.some((s) => s.includes(needle));
    case 'startsWith':
      return needle.length > 0 && haystacks.some((s) => s.startsWith(needle));
    case 'endsWith':
      return needle.length > 0 && haystacks.some((s) => s.endsWith(needle));
    case 'regex': {
      if (!c.value) return false;
      try {
        const re = new RegExp(c.value, 'i');
        return haystacks.some((s) => re.test(s));
      } catch {
        return false;
      }
    }
    default:
      return false;
  }
};

/**
 * Group conditions into AND-groups of OR'd conditions:
 *   - A condition with `or: true` joins the previous group as another
 *     OR alternative.
 *   - A condition without `or` starts a new AND-group.
 *   - Legacy fallback: if no condition carries an `or` flag, honour the
 *     rule's `matchMode` ('any' -> single OR group, 'all' -> per-condition
 *     AND-groups).
 */
const buildGroups = (rule: RoutingRule): RoutingCondition[][] => {
  const hasOrFlag = rule.conditions.some((c) => (c as any).or);
  if (!hasOrFlag) {
    return rule.matchMode === 'any'
      ? [rule.conditions.slice()]
      : rule.conditions.map((c) => [c]);
  }
  const groups: RoutingCondition[][] = [];
  for (const c of rule.conditions) {
    if ((c as any).or && groups.length > 0) {
      groups[groups.length - 1].push(c);
    } else {
      groups.push([c]);
    }
  }
  return groups;
};

export const evaluateRoutingRules = (
  ctx: IncidentEvaluationContext,
  rules: RoutingRule[]
): RoutingRuleMatch[] => {
  const out: RoutingRuleMatch[] = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;

    // Prefer tree model when the rule carries one (arbitrary AND/OR
    // nesting up to the UI's depth cap). Fall back to the legacy flat
    // conditions[] shape otherwise.
    const tree = (rule as any).conditionTree as ConditionGroup | undefined;
    if (tree && tree.kind === 'group' && tree.children?.length > 0) {
      const leafEval = (leaf: ConditionLeaf) =>
        evaluateCondition(ctx, { field: leaf.field, op: leaf.op, value: leaf.value });
      if (evaluateTree(tree, leafEval)) {
        // Report every leaf that individually matched, for the banner UI.
        const matched = collectLeaves(tree)
          .filter(leafEval)
          .map((l) => ({ field: l.field, op: l.op, value: l.value } as RoutingCondition));
        out.push({ rule, matched });
      }
      continue;
    }

    if (!rule.conditions || rule.conditions.length === 0) continue;
    const groups = buildGroups(rule);
    const matched: RoutingCondition[] = [];
    let ok = true;
    for (const group of groups) {
      const hits = group.filter((c) => evaluateCondition(ctx, c));
      if (hits.length === 0) { ok = false; break; }
      matched.push(...hits);
    }
    if (ok) out.push({ rule, matched });
  }
  // Lower priority number = higher priority
  out.sort((a, b) => (a.rule.priority || 0) - (b.rule.priority || 0));
  return out;
};

/**
 * Return a "target key" for a routing action describing *what* on the incident
 * would be mutated. Two actions with the same target key are competing to set
 * the same thing — only the winner (from the highest-priority matched rule)
 * should be shown or applied.
 *
 * Add-style actions (labels, comments) key on the value so distinct labels /
 * comments coexist; only exact duplicates are collapsed.
 */
export const actionTargetKey = (a: { type: string; value?: string; field?: string; targetOrgId?: string }): string => {
  switch (a.type) {
    case 'suggest_move': return 'move';
    case 'set_severity': return 'severity';
    case 'set_status': return 'status';
    case 'set_priority': return 'priority';
    case 'assign_to': return 'assignee';
    case 'add_label': return `label:${(a.value || '').trim().toLowerCase()}`;
    case 'add_comment': return `comment:${(a.value || '').trim()}`;
    case 'run_agent': return `agent:${(a.value || '').trim()}`;
    case 'set_field': return `field:${(a.field || '').trim().toLowerCase()}`;
    default: return `${a.type}:${a.value || ''}`;
  }
};

/**
 * Given priority-sorted matches (highest priority first), drop actions from
 * lower-priority rules whose target has already been claimed by a higher
 * one. Rules that end up with zero actions are dropped entirely.
 */
export const dedupeMatchesByActionTarget = (matches: RoutingRuleMatch[]): RoutingRuleMatch[] => {
  const claimed = new Set<string>();
  const out: RoutingRuleMatch[] = [];
  for (const m of matches) {
    const kept = m.rule.actions.filter((a) => {
      const key = actionTargetKey(a);
      if (claimed.has(key)) return false;
      claimed.add(key);
      return true;
    });
    if (kept.length === 0) continue;
    out.push({ ...m, rule: { ...m.rule, actions: kept } });
  }
  return out;
};

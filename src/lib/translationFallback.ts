/**
 * translationFallback — auto-corrects failed OCSF field translations.
 *
 * Background: the ingestion translator maps raw provider payloads onto OCSF
 * fields via JSONPath-ish expressions like:
 *
 *   "$payload.headers[?(@.name==\"Subject\")].value"
 *
 * The upstream translator only supports simple dotted paths, so filter
 * predicates (`[?(@.name=="X")]`) silently degrade to the prefix path —
 * dumping the entire `$payload.headers` array into the OCSF field. The
 * literal expression sometimes even survives as the field value.
 *
 * This module detects both failure modes and evaluates the expression
 * against the raw payload stored on the incident (`unmapped_original` or
 * `payload`), so the UI shows the actual scalar the mapping intended.
 *
 * The evaluator is deliberately minimal — it is a safety net, not a full
 * jq/JSONPath implementation. Supported syntax:
 *   $root                     — root reference (e.g. $payload)
 *   .field                    — object property
 *   ['field'] / ["field"]     — bracketed property
 *   [0]                       — array index
 *   [*]                       — every array element (flattens one level)
 *   [?(@.name=="X")]          — filter: keep items whose child matches
 *                               operators: == != (string / number literal)
 *   .value                    — chained after any of the above
 */

type Json = any;

const ROOT_ALIASES: Record<string, string[]> = {
  // JSONPath-ish root -> dotted paths to try on the incident payload container.
  // Order matters: the translator's `$payload` refers to the provider's raw
  // payload object (Gmail: `unmapped_original.payload`; Outlook: `unmapped_original`;
  // some pipelines: bare `payload`). Try each nesting before giving up.
  $payload: [
    'unmapped_original.payload',
    'unmapped_original',
    'payload',
    'raw',
    'original',
  ],
  $raw: ['unmapped_original', 'raw'],
  $original: ['unmapped_original', 'original'],
  $unmapped: ['unmapped_original'],
};

export const looksLikeTranslationExpr = (s: string): boolean => {
  if (!s || typeof s !== 'string') return false;
  const t = s.trim();
  if (t.length < 3) return false;
  if (t[0] !== '$') return false;
  // Must contain a path operator to avoid matching accidental "$foo" text.
  return /[.\[]/.test(t);
};

/**
 * Detect the "hybrid" failure mode where the translator serialised the
 * resolved prefix (a JSON array of header dicts) and appended the raw,
 * unevaluated filter suffix, e.g.:
 *   `[{"name":"Subject","value":"X"},...][?(@.name==Subject)].value`
 * Returns the parsed array + filter parameters when the shape matches.
 */
export const parseHybridHeaderFailure = (
  s: string,
): { array: Json[]; headerName: string; pickKey: string } | null => {
  if (typeof s !== 'string') return null;
  const trimmed = s.trim();
  if (!trimmed.startsWith('[')) return null;
  // Filter suffix: [?(@.name==Foo)].value  — value may be quoted or bare.
  const suffixMatch = trimmed.match(
    /\[\?\(\s*@\.(\w+)\s*==\s*(?:"([^"]+)"|'([^']+)'|([^)\s]+))\s*\)\]\.(\w+)\s*$/,
  );
  if (!suffixMatch) return null;
  const filterField = suffixMatch[1]; // e.g. "name"
  const headerName = suffixMatch[2] ?? suffixMatch[3] ?? suffixMatch[4]; // e.g. "Subject"
  const pickKey = suffixMatch[5]; // e.g. "value"
  const arrayPart = trimmed.slice(0, suffixMatch.index).trim();
  let parsed: Json;
  try {
    parsed = JSON.parse(arrayPart);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  // Verify it looks like a header list: every item is an object with the
  // filter field present as a string.
  const looksLikeHeaders = parsed.every(
    (it) => it && typeof it === 'object' && typeof (it as any)[filterField] === 'string',
  );
  if (!looksLikeHeaders) return null;
  return { array: parsed, headerName, pickKey };
};

const readDotted = (container: Json, dotted: string): Json => {
  const parts = dotted.split('.');
  let cur: Json = container;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as any)[p];
  }
  return cur;
};

const resolveRoot = (expr: string, container: Json): { rest: string; root: Json } | null => {
  const m = expr.match(/^(\$[A-Za-z_][\w]*)/);
  if (!m) return null;
  const alias = m[1];
  const rest = expr.slice(alias.length);
  const candidates = ROOT_ALIASES[alias] || [alias.slice(1)];
  for (const path of candidates) {
    const hit = readDotted(container, path);
    if (hit !== undefined) return { rest, root: hit };
  }
  // Fall back to the container itself — the caller may have passed us the
  // payload object directly.
  return { rest, root: container };
};

interface Segment {
  type: 'prop' | 'index' | 'wildcard' | 'filter';
  key?: string;
  index?: number;
  predicate?: { path: string; op: '==' | '!='; value: string | number };
}

const parseSegments = (rest: string): Segment[] | null => {
  const segments: Segment[] = [];
  let i = 0;
  const len = rest.length;
  while (i < len) {
    const ch = rest[i];
    if (ch === '.') {
      i++;
      let end = i;
      while (end < len && /[A-Za-z0-9_-]/.test(rest[end])) end++;
      if (end === i) return null;
      segments.push({ type: 'prop', key: rest.slice(i, end) });
      i = end;
      continue;
    }
    if (ch === '[') {
      const close = rest.indexOf(']', i);
      if (close === -1) return null;
      const inner = rest.slice(i + 1, close).trim();
      i = close + 1;
      if (inner === '*') {
        segments.push({ type: 'wildcard' });
        continue;
      }
      if (/^-?\d+$/.test(inner)) {
        segments.push({ type: 'index', index: parseInt(inner, 10) });
        continue;
      }
      const quoted = inner.match(/^['"](.+)['"]$/);
      if (quoted) {
        segments.push({ type: 'prop', key: quoted[1] });
        continue;
      }
      // Filter: ?(@.path OP "value") or ?(@.path OP number)
      const filter = inner.match(/^\?\(\s*@\.([\w.]+)\s*(==|!=)\s*(?:"([^"]*)"|'([^']*)'|(-?\d+(?:\.\d+)?))\s*\)$/);
      if (filter) {
        const path = filter[1];
        const op = filter[2] as '==' | '!=';
        const raw = filter[3] ?? filter[4] ?? filter[5];
        const value = filter[5] !== undefined ? Number(filter[5]) : raw;
        segments.push({ type: 'filter', predicate: { path, op, value } });
        continue;
      }
      return null;
    }
    // Unknown token — bail so we degrade gracefully instead of crashing.
    return null;
  }
  return segments;
};

const readPath = (node: Json, path: string): Json => {
  const parts = path.split('.');
  let cur: Json = node;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as any)[p];
  }
  return cur;
};

const applySegment = (node: Json, seg: Segment): Json => {
  if (node == null) return undefined;
  switch (seg.type) {
    case 'prop':
      return typeof node === 'object' ? (node as any)[seg.key!] : undefined;
    case 'index':
      if (!Array.isArray(node)) return undefined;
      return seg.index! < 0 ? node[node.length + seg.index!] : node[seg.index!];
    case 'wildcard':
      return Array.isArray(node) ? node.slice() : undefined;
    case 'filter': {
      if (!Array.isArray(node)) return undefined;
      const { path, op, value } = seg.predicate!;
      return node.filter(item => {
        const got = readPath(item, path);
        if (op === '==') return got == value; // eslint-disable-line eqeqeq
        return got != value; // eslint-disable-line eqeqeq
      });
    }
  }
};

/**
 * Evaluate a translation-style expression against a raw payload container.
 * Returns undefined when the expression doesn't apply or resolves to nothing.
 */
export const evaluateTranslationExpression = (expr: string, container: Json): Json => {
  if (!looksLikeTranslationExpr(expr)) return undefined;
  const root = resolveRoot(expr.trim(), container);
  if (!root) return undefined;
  const segments = parseSegments(root.rest);
  if (!segments) return undefined;

  let nodes: Json[] = [root.root];
  for (const seg of segments) {
    const next: Json[] = [];
    for (const n of nodes) {
      const applied = applySegment(n, seg);
      if (applied === undefined) continue;
      if (seg.type === 'wildcard' || seg.type === 'filter') {
        if (Array.isArray(applied)) next.push(...applied);
      } else {
        next.push(applied);
      }
    }
    nodes = next;
    if (nodes.length === 0) return undefined;
  }
  if (nodes.length === 1) return nodes[0];
  return nodes;
};

/**
 * If `value` looks like an unresolved translation expression, try to
 * evaluate it against the raw payload container (typically the parsed
 * datastore item). Returns the resolved scalar (stringified when needed)
 * or the original value when no correction applies.
 *
 * Also handles the degraded case where the translator dumped a whole
 * array of `{name, value}` header dicts into a scalar field. Pass
 * `headerName` (e.g. "Subject") to pick the matching header value.
 */
export const autoCorrectTranslatedString = (
  value: unknown,
  container: Json,
  headerName?: string,
): string | undefined => {
  const debug = typeof window !== 'undefined' && (window as any).__DEBUG_TRANSLATION_FALLBACK__;

  // Case 1: raw expression string leaked into the field.
  if (typeof value === 'string' && looksLikeTranslationExpr(value)) {
    const resolved = evaluateTranslationExpression(value, container);
    if (debug) console.log('[translationFallback] case1 raw-expression', { value, resolved });
    if (resolved != null) {
      if (typeof resolved === 'string') return resolved;
      if (typeof resolved === 'number' || typeof resolved === 'boolean') return String(resolved);
      value = resolved; // fall through to case 2
    } else {
      return value;
    }
  }

  // Case 3 (the common one): hybrid failure — translator serialized the
  // prefix array and appended the raw filter suffix as a string.
  if (typeof value === 'string') {
    const hybrid = parseHybridHeaderFailure(value);
    if (hybrid) {
      if (debug) console.log('[translationFallback] case3 hybrid-header', { headerName: hybrid.headerName, pickKey: hybrid.pickKey, arrayLen: hybrid.array.length });
      const target = hybrid.headerName.toLowerCase();
      for (const item of hybrid.array) {
        const n = (item as any).name ?? (item as any).Name ?? (item as any).key;
        if (typeof n === 'string' && n.toLowerCase() === target) {
          const v = (item as any)[hybrid.pickKey];
          if (typeof v === 'string') return v;
          if (typeof v === 'number' || typeof v === 'boolean') return String(v);
        }
      }
      if (debug) console.warn('[translationFallback] hybrid header not found', hybrid.headerName);
    }
  }

  // Case 2: field is a raw array of `{name, value}` header dicts.
  if (Array.isArray(value) && headerName) {
    const target = headerName.toLowerCase();
    if (debug) console.log('[translationFallback] case2 raw-array', { headerName, len: value.length });
    for (const item of value) {
      if (item && typeof item === 'object') {
        const n = (item as any).name ?? (item as any).Name ?? (item as any).key;
        if (typeof n === 'string' && n.toLowerCase() === target) {
          const v = (item as any).value ?? (item as any).Value;
          if (typeof v === 'string') return v;
          if (typeof v === 'number' || typeof v === 'boolean') return String(v);
        }
      }
    }
  }

  if (typeof value === 'string') return value;
  if (value == null) return undefined;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
};

const setDeepValue = (obj: Json, path: string, value: Json) => {
  if (!obj || typeof obj !== 'object' || !path) return;
  const parts = path.split('.');
  let cur: any = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    if (cur[part] == null || typeof cur[part] !== 'object') {
      cur[part] = {};
    }
    cur = cur[part];
  }
  cur[parts[parts.length - 1]] = value;
};

const findTitleLocation = (data: Json): { path: string; value: Json } | null => {
  if (!data || typeof data !== 'object') return null;
  const d = data as any;
  // New OCSF format: title is at the root.
  if ('finding_uid' in d && 'title' in d) {
    return { path: 'title', value: d.title };
  }
  // Legacy OCSF format: title lives inside finding_info_list[0] or finding_info.
  if (Array.isArray(d.finding_info_list) && d.finding_info_list.length > 0 && 'title' in d.finding_info_list[0]) {
    return { path: 'finding_info_list.0.title', value: d.finding_info_list[0].title };
  }
  if (d.finding_info && typeof d.finding_info === 'object' && 'title' in d.finding_info) {
    return { path: 'finding_info.title', value: d.finding_info.title };
  }
  // Non-OCSF format: root title.
  if ('title' in d) {
    return { path: 'title', value: d.title };
  }
  return null;
};

const findAssigneeLocation = (data: Json): { path: string; value: Json } | null => {
  if (!data || typeof data !== 'object') return null;
  const d = data as any;
  const customAttrs = d.metadata?.extensions?.custom_attributes;
  if (customAttrs && 'assignee' in customAttrs) {
    return { path: 'metadata.extensions.custom_attributes.assignee', value: customAttrs.assignee };
  }
  if ('assignee' in d) {
    return { path: 'assignee', value: d.assignee };
  }
  return null;
};

export interface FieldRepair {
  field: 'title' | 'assignee';
  path: string;
  original: unknown;
  corrected: string;
}

/**
 * Detect and fix corrupted OCSF identity fields in place.
 *
 * Returns a list of repairs performed. The passed `data` object is mutated
 * so the corrected scalar values replace the broken translation expressions
 * / header arrays, ready to be persisted back to the datastore.
 */
export const repairCorruptedOcsfFields = (data: Json): FieldRepair[] => {
  const repairs: FieldRepair[] = [];
  if (!data || typeof data !== 'object') return repairs;

  const titleLoc = findTitleLocation(data);
  if (titleLoc) {
    const corrected = autoCorrectTranslatedString(titleLoc.value, data, 'Subject');
    if (corrected && corrected !== titleLoc.value) {
      setDeepValue(data, titleLoc.path, corrected);
      repairs.push({ field: 'title', path: titleLoc.path, original: titleLoc.value, corrected });
    }
  }

  const assigneeLoc = findAssigneeLocation(data);
  if (assigneeLoc) {
    const corrected = autoCorrectTranslatedString(assigneeLoc.value, data, 'From');
    if (corrected && corrected !== assigneeLoc.value) {
      setDeepValue(data, assigneeLoc.path, corrected);
      repairs.push({ field: 'assignee', path: assigneeLoc.path, original: assigneeLoc.value, corrected });
    }
  }

  return repairs;
};

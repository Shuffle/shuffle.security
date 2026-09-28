/**
 * applyRoutingActionsToRaw
 *
 * Applies a routing rule's actions directly to a stored incident payload
 * (the raw JSON in the INCIDENTS datastore). Used by SelectionRuleChip so
 * newly-created rules can be executed end-to-end against historical
 * matches, not just previewed.
 *
 * Mirrors the field mapping used by applyRoutingActions in
 * IncidentDetailPage — top-level `severity` / `status` / `assignee` /
 * `labels` / `priority` / `title` / `message`, plus `activity[]` for
 * comments and `rawOCSF.*` for arbitrary set_field paths.
 *
 * Skipped: `suggest_move` (needs cross-org datastore hops; left to the
 * per-incident UI so an analyst can confirm the tenant move).
 */
import type { RoutingAction } from '@/components/settings/IncidentRoutingEditor';

const RESOLVING = new Set(['resolved', 'closed']);

const normalizeSeverity = (v: unknown): string | null => {
  const s = String(v ?? '').toLowerCase().trim();
  if (!s) return null;
  if (['critical', 'high', 'medium', 'low', 'info', 'informational'].includes(s)) {
    return s === 'informational' ? 'info' : s;
  }
  return s;
};

const normalizeStatus = (v: unknown): string | null => {
  const s = String(v ?? '').toLowerCase().trim();
  if (!s) return null;
  return s.replace(/\s+/g, '_');
};

const setDeep = (obj: any, path: string, value: any) => {
  const parts = path.split('.').filter(Boolean);
  if (!parts.length) return;
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
};

const parseValue = (raw: unknown): any => {
  if (typeof raw !== 'string') return raw;
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  if (/^(true|false)$/i.test(trimmed)) return trimmed.toLowerCase() === 'true';
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try { return JSON.parse(trimmed); } catch { /* fall through */ }
  }
  return raw;
};

export interface ApplyResult {
  next: any;
  changed: boolean;
  /** True when this call transitioned the incident into a resolving state. */
  autoResolved: boolean;
}

export const applyRoutingActionsToRaw = (
  raw: any,
  actions: RoutingAction[],
  opts: { ruleName?: string } = {},
): ApplyResult => {
  if (!raw || typeof raw !== 'object' || !Array.isArray(actions) || actions.length === 0) {
    return { next: raw, changed: false, autoResolved: false };
  }
  let next: any;
  try {
    next = structuredClone(raw);
  } catch {
    try {
      next = JSON.parse(JSON.stringify(raw));
    } catch {
      next = { ...raw };
    }
  }
  if (!next.rawOCSF || typeof next.rawOCSF !== 'object') next.rawOCSF = {};
  if (!Array.isArray(next.activity)) next.activity = [];
  if (!Array.isArray(next.labels)) next.labels = [];

  const prevStatus = String(next.status || '').toLowerCase();
  let changed = false;

  for (const action of actions) {
    if (!action || !action.type) continue;
    switch (action.type) {
      case 'suggest_move':
        // Intentionally skipped — needs cross-tenant datastore moves.
        break;
      case 'set_severity': {
        const s = normalizeSeverity(action.value);
        if (s && next.severity !== s) { next.severity = s; changed = true; }
        break;
      }
      case 'set_status': {
        const s = normalizeStatus(action.value);
        if (s && next.status !== s) { next.status = s; changed = true; }
        break;
      }
      case 'set_priority': {
        const p = String(action.value || '').trim();
        if (p && next.priority !== p) {
          next.priority = p;
          next.rawOCSF.priority = p;
          changed = true;
        }
        break;
      }
      case 'add_label': {
        const label = String(action.value || '').trim();
        if (label && !next.labels.includes(label)) {
          next.labels = [...next.labels, label];
          changed = true;
        }
        break;
      }
      case 'assign_to': {
        const a = String(action.value || '').trim();
        if (a && next.assignee !== a) { next.assignee = a; changed = true; }
        break;
      }
      case 'add_comment': {
        const text = String(action.value || '').trim();
        if (!text) break;
        const already = next.activity.some(
          (it: any) => it?.type === 'comment' && typeof it?.content === 'string' && it.content.trim() === text,
        );
        if (!already) {
          next.activity.push({
            id: `routing-comment-${Date.now()}-${next.activity.length}`,
            type: 'comment',
            user: 'Incident Routing Rules',
            timestamp: Date.now(),
            content: text,
            details: { source: 'incident_routing_rule', rule: opts.ruleName },
            attachments: [],
            ai_handled: true,
          });
          changed = true;
        }
        break;
      }
      case 'run_agent': {
        const prompt = String(action.value || '').trim();
        if (!prompt) break;
        const content = `@AIAgent ${prompt}`;
        const already = next.activity.some(
          (it: any) => it?.type === 'comment' && typeof it?.content === 'string' && it.content.trim() === content,
        );
        if (!already) {
          next.activity.push({
            id: `routing-agent-${Date.now()}-${next.activity.length}`,
            type: 'comment',
            user: 'Incident Routing Rules',
            timestamp: Date.now(),
            content,
            details: { source: 'incident_routing_rule', rule: opts.ruleName, run_agent: true },
            attachments: [],
            ai_handled: true,
          });
          changed = true;
        }
        break;
      }
      case 'set_field': {
        const field = String(action.field || '').trim();
        if (!field) break;
        const value = parseValue(action.value);
        const canonical = field.startsWith('rawOCSF.') ? field.slice('rawOCSF.'.length) : field;
        if (canonical === 'title') next.title = String(value);
        else if (canonical === 'description' || canonical === 'desc' || canonical === 'message') next.message = String(value);
        else if (canonical === 'severity') {
          const s = normalizeSeverity(value); if (s) next.severity = s;
        } else if (canonical === 'status') {
          const s = normalizeStatus(value); if (s) next.status = s;
        } else if (canonical === 'assignee') next.assignee = String(value);
        else if (canonical === 'priority') { next.priority = String(value); next.rawOCSF.priority = String(value); }
        else if (canonical === 'labels' || canonical === 'types') {
          const label = String(value).trim();
          if (label && !next.labels.includes(label)) next.labels = [...next.labels, label];
        } else if (field.startsWith('rawOCSF.')) {
          setDeep(next.rawOCSF, field.slice('rawOCSF.'.length), value);
        } else {
          if (!next.customFields || typeof next.customFields !== 'object') next.customFields = {};
          const key = field.replace(/^customFields\./, '').replace(/^custom_fields\./, '');
          next.customFields[key] = value;
        }
        changed = true;
        break;
      }
    }
  }

  const nowStatus = String(next.status || '').toLowerCase();
  const autoResolved = !RESOLVING.has(prevStatus) && RESOLVING.has(nowStatus);

  // Mirror IncidentDetailPage: when a routing rule auto-resolves an incident,
  // always leave a comment so the audit trail explains why it closed.
  if (autoResolved) {
    const statusLabel = nowStatus === 'resolved' ? 'Resolved' : nowStatus === 'closed' ? 'Closed' : nowStatus;
    const note = `${statusLabel} automatically by routing rule${opts.ruleName ? ` "${opts.ruleName}"` : ''}.`;
    const already = next.activity.some(
      (it: any) => it?.type === 'comment' && typeof it?.content === 'string' && it.content.trim() === note,
    );
    if (!already) {
      next.activity.push({
        id: `routing-autoresolve-${Date.now()}-${next.activity.length}`,
        type: 'comment',
        user: 'Incident Routing Rules',
        timestamp: Date.now(),
        content: note,
        details: { source: 'incident_routing_rule', auto_resolved: true, rule: opts.ruleName },
        attachments: [],
        ai_handled: true,
      });
    }
  }

  return { next, changed, autoResolved };
};

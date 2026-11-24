/**
 * Checks whether a routing rule's "Do" responses actually happened in the
 * routing workflow run. Nothing is executed here: the workflow is the
 * response, this only reads its results.
 *
 * The routing workflow reports what it did in the result of the
 * "Execute_rule_automation_for_found_rules" node, under `message`.
 */
export interface VerifiableAction {
  type: string;
  field?: string;
  value?: string;
  targetOrgId?: string;
}

export interface ActionCheck {
  ok: boolean;
  detail: string;
  /** Agent run picked up for a "Run AI Agent" response, when known. */
  agentExecutionId?: string;
  agentAuthorization?: string;
}

export const ROUTING_RESULT_NODE = 'Execute_rule_automation_for_found_rules';
export const TARGET_TENANT_NODE = 'Set_key_in_target_tenant';

const parseMaybe = (v: unknown): any => {
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return v; }
};

const labelOf = (r: any) => String(r?.action?.label || '');

/** The `message` payload of the routing node, or null when it did not run. */
export function getRoutingMessage(results: any[]): any | null {
  const node = (results || []).find((r) => labelOf(r) === ROUTING_RESULT_NODE);
  if (!node) return null;
  const res = parseMaybe(node.result);
  const msg = parseMaybe(res?.message ?? res);
  return msg && typeof msg === 'object' ? msg : null;
}

/** Finds the @AIAgent activity entry on the record once it has been picked up. */
export function findAgentActivity(record: any, prompt?: string): { executionId: string; authorization?: string } | null {
  const list = Array.isArray(record?.activity) ? record.activity : [];
  for (let i = list.length - 1; i >= 0; i--) {
    const a = list[i];
    const text = typeof a === 'string' ? a : JSON.stringify(a);
    if (!/@AIAgent/i.test(text)) continue;
    if (prompt && !text.includes(prompt)) continue;
    const id = a?.execution_id;
    if (typeof id === 'string' && id) return { executionId: id, ...(a?.authorization ? { authorization: String(a.authorization) } : {}) };
  }
  return null;
}

const forRule = (list: any, ruleId?: string): any[] =>
  (Array.isArray(list) ? list : []).filter((x) => !ruleId || !x?.rule_id || x.rule_id === ruleId);

export function verifyRoutingActions(
  actions: VerifiableAction[],
  results: any[],
  ruleId?: string,
  record?: any,
): ActionCheck[] {
  const msg = getRoutingMessage(results);
  if (!msg) return actions.map(() => ({ ok: false, detail: `${ROUTING_RESULT_NODE} did not run` }));
  const mod = msg.modified_fields && typeof msg.modified_fields === 'object' ? msg.modified_fields : {};
  const did: string[] = forRule(msg.matched_rules, ruleId).flatMap((m: any) => (Array.isArray(m?.did) ? m.did.map(String) : []));
  const matched = forRule(msg.matched_rules, ruleId).length > 0;
  if (!matched) {
    const why = forRule(msg.unmatched_rules, ruleId)[0]?.reason;
    return actions.map(() => ({ ok: false, detail: `rule did not match${why ? `: ${why}` : ''}` }));
  }

  const fieldCheck = (field: string, expected?: string, startsWith?: string): ActionCheck => {
    const m = mod[field];
    if (m) {
      const to = String(m.to ?? '');
      const ok = startsWith ? to.startsWith(startsWith) : expected === undefined || to.toLowerCase() === String(expected).toLowerCase();
      return { ok: ok && msg.db_updated === true, detail: ok ? (msg.db_updated ? `${field}: ${String(m.from ?? '') || 'empty'} -> ${to}` : `${field} changed but not saved`) : `${field} set to ${to}` };
    }
    if (did.some((d) => d.includes('(no change)') && d.includes(field))) return { ok: true, detail: `${field} already had this value (no change)` };
    return { ok: false, detail: `${field} was not changed` };
  };

  return actions.map((a) => {
    const value = String(a.value ?? '');
    switch (a.type) {
      case 'set_field':
        return fieldCheck(a.field || '', value);
      case 'set_severity': return fieldCheck('severity', value);
      case 'set_status': return fieldCheck('status', value);
      case 'set_priority': return fieldCheck('priority', value);
      case 'add_label': return fieldCheck('labels');
      case 'assign_to':
        return fieldCheck('assignee', value);
      case 'add_comment':
        return fieldCheck('activity', undefined, 'added comment: ');
      case 'suggest_move': {
        const tenant = (results || []).find((r) => labelOf(r) === TARGET_TENANT_NODE);
        const tenantOk = String(tenant?.status || '').toUpperCase() === 'SUCCESS';
        const idOk = !a.targetOrgId || msg.target_org_id === a.targetOrgId;
        const ok = msg.move_to_org === true && idOk && !!mod.target_org_id && tenantOk;
        return {
          ok,
          detail: msg.move_to_org !== true ? 'move was not requested'
            : !idOk ? `moved to ${msg.target_org_id || 'another tenant'}`
            : !tenantOk ? `write to target tenant ${tenant ? String(tenant.status || 'unknown').toLowerCase() : 'did not run'}`
            : `moved to ${msg.target_org_id}${msg.target_region ? ` (${msg.target_region})` : ''}`,
        };
      }
      case 'run_python': {
        const runs = forRule(msg.scripts_run, ruleId);
        if (runs.length === 0) return { ok: false, detail: 'no script ran' };
        const bad = runs.find((r: any) => r?.success !== true);
        return { ok: !bad, detail: bad ? `script failed${bad.error ? `: ${bad.error}` : ''}` : 'script ran' };
      }
      case 'send_notification': {
        const sent = forRule(msg.notifications_sent, ruleId);
        if (sent.length === 0) return { ok: false, detail: 'no notification sent' };
        const bad = sent.find((n: any) => n?.success !== true);
        const r = sent[0]?.response;
        const count = r?.dispatched_to !== undefined ? ` to ${Array.isArray(r.dispatched_to) ? r.dispatched_to.length : r.dispatched_to}${r?.total_targets !== undefined ? ` of ${r.total_targets}` : ''}` : '';
        return { ok: !bad, detail: bad ? `notification failed${bad.error ? `: ${bad.error}` : ''}` : `notification sent${count}` };
      }
      case 'run_agent': {
        const queued = String(mod.agent_prompt?.to ?? '') === value || did.some((d) => d.includes('queued @AIAgent:'));
        const ok = queued && msg.db_updated === true;
        const run = record ? findAgentActivity(record, value || undefined) : null;
        return {
          ok,
          detail: !ok ? 'agent was not queued' : run ? 'agent run started' : 'agent queued, not picked up yet',
          ...(run ? { agentExecutionId: run.executionId, ...(run.authorization ? { agentAuthorization: run.authorization } : {}) } : {}),
        };
      }
      default:
        return { ok: false, detail: 'cannot be checked' };
    }
  });
}

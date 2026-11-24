import { resolveField } from '@/utils/routingRuleEvaluator';

/**
 * Checks whether a routing rule's "Do" responses actually happened in the
 * routing workflow run. Nothing is executed here: the workflow is the
 * response, this only reads back the record and the run results.
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
  /** Agent run started by a "Run AI Agent" response, when found in the run. */
  agentExecutionId?: string;
  agentAuthorization?: string;
}

const parseMaybe = (v: unknown): any => {
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return v; }
};

/** Finds the agent run started by the agent step of a routing workflow run. */
export function findAgentRun(results: any[]): { executionId: string; authorization?: string } | null {
  for (const r of results || []) {
    if (isSkipped(r)) continue;
    const label = norm([r?.action?.label, r?.action?.name, r?.action?.app_name]);
    if (!label.includes('agent')) continue;
    const res = parseMaybe(r?.result);
    const id = res?.execution_id || res?.executionId || res?.id;
    if (typeof id === 'string' && id) return { executionId: id, authorization: res?.authorization };
  }
  return null;
}

const norm = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v ?? '')).trim().toLowerCase();

const isSkipped = (r: any) => String(r?.status || '').toUpperCase() === 'SKIPPED';

export function verifyRoutingActions(
  actions: VerifiableAction[],
  record: any,
  results: any[],
): ActionCheck[] {
  const recordText = norm(record);
  const ran = (results || []).filter((r) => !isSkipped(r));
  const runText = norm(ran.map((r) => [r?.action?.label, r?.action?.name, r?.action?.app_name, r?.result]));
  const inRun = (needle: string) => !!needle && runText.includes(needle.toLowerCase());

  return actions.map((a) => {
    const value = String(a.value ?? '').trim();
    switch (a.type) {
      case 'set_field': {
        const got = a.field ? resolveField(record, a.field) : undefined;
        const ok = got !== undefined && norm(got) === value.toLowerCase();
        return { ok, detail: ok ? `${a.field} is ${value}` : `${a.field || 'field'} is ${got === undefined ? 'not set' : String(got)}, expected ${value}` };
      }
      case 'assign_to': {
        const got = record?.assignee ?? record?.assigned_to ?? record?.owner;
        const ok = !!value && norm(got).includes(value.toLowerCase());
        return { ok, detail: ok ? `assigned to ${value}` : `not assigned to ${value || 'anyone'}` };
      }
      case 'add_comment': {
        const ok = !!value && recordText.includes(value.toLowerCase());
        return { ok, detail: ok ? 'comment added' : 'comment not found on the record' };
      }
      case 'suggest_move': {
        const id = a.targetOrgId || '';
        const ok = !!id && (recordText.includes(id.toLowerCase()) || inRun(id));
        return { ok, detail: ok ? 'move to tenant registered' : 'no move to the target tenant found' };
      }
      case 'run_agent': {
        const ok = inRun('agent');
        const run = findAgentRun(results);
        return {
          ok,
          detail: ok ? 'agent step ran' : 'no agent step ran',
          ...(run ? { agentExecutionId: run.executionId, ...(run.authorization ? { agentAuthorization: run.authorization } : {}) } : {}),
        };
      }
      case 'run_python': {
        const ok = inRun('python') || inRun('execute_python');
        return { ok, detail: ok ? 'python step ran' : 'no python step ran' };
      }
      default:
        return { ok: false, detail: 'cannot be checked' };
    }
  });
}

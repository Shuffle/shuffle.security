import { describe, it, expect } from 'vitest';
import { verifyRoutingActions } from './routingResponseVerifier';

const run = (message: any, extra: any[] = []) => [
  { status: 'SUCCESS', action: { label: 'Execute_rule_automation_for_found_rules' }, result: JSON.stringify({ success: true, message }) },
  ...extra,
];
const base = { matched: true, matched_rules: [{ rule_id: 'r1', did: [] }], db_updated: true };

describe('verifyRoutingActions', () => {
  it('set field passes only when modified_fields has the value and the record was saved', () => {
    const ok = run({ ...base, modified_fields: { tlp: { from: '', to: 'RED', by_rule: 'r1' } } });
    expect(verifyRoutingActions([{ type: 'set_field', field: 'tlp', value: 'RED' }], ok, 'r1')[0]?.ok).toBe(true);
    const unsaved = run({ ...base, db_updated: false, modified_fields: { tlp: { from: '', to: 'RED' } } });
    expect(verifyRoutingActions([{ type: 'set_field', field: 'tlp', value: 'RED' }], unsaved, 'r1')[0]?.ok).toBe(false);
  });
  it('add comment checks activity starting with "added comment: "', () => {
    const r = run({ ...base, modified_fields: { activity: { to: 'added comment: hi' } } });
    expect(verifyRoutingActions([{ type: 'add_comment', value: 'hi' }], r, 'r1')[0]?.ok).toBe(true);
  });
  it('move to tenant needs move_to_org and a successful target tenant write', () => {
    const msg = { ...base, move_to_org: true, target_org_id: 'org2', modified_fields: { target_org_id: { to: 'org2' } } };
    expect(verifyRoutingActions([{ type: 'suggest_move', targetOrgId: 'org2' }], run(msg, [{ status: 'SUCCESS', action: { label: 'Set_key_in_target_tenant' } }]), 'r1')[0]?.ok).toBe(true);
    expect(verifyRoutingActions([{ type: 'suggest_move', targetOrgId: 'org2' }], run(msg, [{ status: 'FAILURE', action: { label: 'Set_key_in_target_tenant' } }]), 'r1')[0]?.ok).toBe(false);
  });
  it('python script fails when scripts_run reports success false', () => {
    expect(verifyRoutingActions([{ type: 'run_python' }], run({ ...base, scripts_run: [{ rule_id: 'r1', success: false, error: 'x' }] }), 'r1')[0]?.ok).toBe(false);
  });
  it('agent is queued via agent_prompt and links the run once picked up', () => {
    const r = run({ ...base, modified_fields: { agent_prompt: { to: 'triage' } } });
    const record = { activity: [{ text: '@AIAgent triage', ai_handled: true, execution_id: 'e1' }] };
    const c = verifyRoutingActions([{ type: 'run_agent', value: 'triage' }], r, 'r1', record)[0];
    expect(c?.ok).toBe(true);
    expect(c?.agentExecutionId).toBe('e1');
  });
  it('agent that is only queued, with no run started, does not pass', () => {
    const r = run({ ...base, modified_fields: { agent_prompt: { to: 'triage' } } });
    expect(verifyRoutingActions([{ type: 'run_agent', value: 'triage' }], r, 'r1', { activity: [] })[0]?.ok).toBe(false);
  });
  it('fails every response when the rule did not match', () => {
    const r = run({ matched: false, matched_rules: [], unmatched_rules: [{ rule_id: 'r1', reason: 'no' }] });
    expect(verifyRoutingActions([{ type: 'set_field', field: 'a', value: 'b' }], r, 'r1')[0]?.ok).toBe(false);
  });
});

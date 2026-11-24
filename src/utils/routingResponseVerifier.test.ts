import { describe, it, expect } from 'vitest';
import { verifyRoutingActions } from './routingResponseVerifier';

describe('verifyRoutingActions', () => {
  it('passes set_field only when the workflow changed the record', () => {
    expect(verifyRoutingActions([{ type: 'set_field', field: 'severity', value: 'High' }], { severity: 'high' }, [])[0]?.ok).toBe(true);
    expect(verifyRoutingActions([{ type: 'set_field', field: 'severity', value: 'High' }], { severity: 'Low' }, [])[0]?.ok).toBe(false);
  });
  it('ignores skipped workflow steps when checking agent runs', () => {
    const skipped = [{ status: 'SKIPPED', action: { label: 'run agent' } }];
    expect(verifyRoutingActions([{ type: 'run_agent' }], {}, skipped)[0]?.ok).toBe(false);
    expect(verifyRoutingActions([{ type: 'run_agent' }], {}, [{ status: 'SUCCESS', action: { label: 'run agent' } }])[0]?.ok).toBe(true);
  });
  it('links the agent run started by the agent step', () => {
    const results = [{ status: 'SUCCESS', action: { label: 'AI Agent' }, result: JSON.stringify({ execution_id: 'abc', authorization: 'tok' }) }];
    const c = verifyRoutingActions([{ type: 'run_agent' }], {}, results)[0];
    expect(c?.agentExecutionId).toBe('abc');
    expect(c?.agentAuthorization).toBe('tok');
  });
});

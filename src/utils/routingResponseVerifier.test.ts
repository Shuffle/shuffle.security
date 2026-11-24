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
});

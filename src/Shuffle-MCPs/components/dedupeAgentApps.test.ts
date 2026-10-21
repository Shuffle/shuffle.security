import { describe, it, expect } from 'vitest';
import { dedupeAgentApps } from './AgentUI';

describe('dedupeAgentApps', () => {
  it('keeps Shuffle Workflows Builder only once across name forms', () => {
    const out = dedupeAgentApps([
      { name: 'shuffle_workflows_builder' },
      { name: 'Shuffle Workflows Builder', id: 'abc' },
      { name: 'shuffle_apps' },
    ]);
    expect(out.map((a) => a.name)).toEqual(['shuffle_workflows_builder', 'shuffle_apps']);
    expect(out[0].id).toBe('abc');
  });

  it('drops a second entry with the same id', () => {
    expect(dedupeAgentApps([{ name: 'a', id: '1' }, { name: 'b', id: '1' }])).toHaveLength(1);
  });
});

import { describe, it, expect } from 'vitest';
import { dedupeAgentApps } from './AgentUI';

describe('dedupeAgentApps', () => {
  it('keeps the latest entry when the same app appears under two name forms', () => {
    const out = dedupeAgentApps([
      { name: 'shuffle_workflows_builder' },
      { name: 'Shuffle Workflows Builder', id: 'abc' },
      { name: 'shuffle_apps' },
    ]);
    expect(out.map((a) => a.name)).toEqual(['Shuffle Workflows Builder', 'shuffle_apps']);
    expect(out[0].id).toBe('abc');
  });

  it('keeps the latest entry when the same id is added twice', () => {
    const out = dedupeAgentApps([
      { name: 'a', id: '1' },
      { name: 'b', id: '1' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('b');
  });

  it('carries id and icon from earlier entries the latest one lacks', () => {
    const out = dedupeAgentApps([
      { name: 'shuffle_workflows_builder', id: 'abc', icon: 'icon.png' },
      { name: 'Shuffle Workflows Builder' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ name: 'Shuffle Workflows Builder', id: 'abc', icon: 'icon.png' });
  });
});

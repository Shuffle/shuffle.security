import { describe, expect, it } from 'vitest';
import { addSelectedChartApp } from './chartAppSelection';

describe('Alluvial app selection', () => {
  it('adds the chosen app directly using its canonical catalog ID', () => {
    const nodes = addSelectedChartApp([], { id: 'gmail-catalog-id', name: 'Gmail', icon: 'gmail.png' });
    expect(nodes).toEqual([{ id: 'gmail-catalog-id', name: 'Gmail', icon: 'gmail.png', hasValidAuth: false, isActiveOnly: false }]);
  });

  it('does not invent authentication for a newly selected app', () => {
    const nodes = addSelectedChartApp([], { id: null, name: 'Gmail', icon: '' });
    expect(nodes[0]?.hasValidAuth).toBe(false);
    expect(nodes[0]?.id).toBe('');
  });

  it('keeps an existing app and its credential status without duplicating it', () => {
    const original = [{ id: 'tenant-id', name: 'Gmail', icon: '', hasValidAuth: true, isActiveOnly: false }];
    const nodes = addSelectedChartApp(original, { id: 'catalog-id', name: 'gmail', icon: 'gmail.png' });
    expect(nodes).toEqual([{ id: 'tenant-id', name: 'Gmail', icon: 'gmail.png', hasValidAuth: true, isActiveOnly: false }]);
    expect(original[0]?.icon).toBe('');
  });
});
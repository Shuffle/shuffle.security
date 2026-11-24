import { describe, it, expect } from 'vitest';
import { generateRuleSample } from './routingSampleGenerator';
import { emptyGroup, emptyLeaf } from './routingConditionTree';

describe('generateRuleSample', () => {
  it('builds a sample that matches an AND rule', () => {
    const tree = emptyGroup('and', [
      emptyLeaf({ field: 'title', op: 'startsWith', value: '[Shuffle]' }),
      emptyLeaf({ field: 'observables.email', op: 'equals', value: 'a@b.com' }),
    ]);
    const { sample, matches } = generateRuleSample(tree);
    expect(matches).toBe(true);
    expect(sample.title).toBe('[Shuffle] sample');
  });
  it('satisfies only the first branch of an OR group', () => {
    const tree = emptyGroup('or', [
      emptyLeaf({ field: 'title', op: 'contains', value: 'phish' }),
      emptyLeaf({ field: 'source', op: 'equals', value: 'x' }),
    ]);
    const { sample, matches } = generateRuleSample(tree);
    expect(matches).toBe(true);
    expect(sample.source).toBeUndefined();
  });
});

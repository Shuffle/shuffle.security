import { describe, it, expect } from 'vitest';
import { generateRuleSample, findRuleTestSample } from './routingSampleGenerator';
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

describe('findRuleTestSample', () => {
  const tree = emptyGroup('and', [
    emptyLeaf({ field: 'severity', op: 'equals', value: 'high' }),
    emptyLeaf({ field: 'source', op: 'equals', value: 'CrowdStrike' }),
  ]);

  it('picks the first recent record that already matches the rule', () => {
    const records = [
      { title: 'other', severity: 'low', source: 'CrowdStrike' },
      { title: 'Suspicious PowerShell', severity: 'high', source: 'CrowdStrike' },
      { title: 'second match', severity: 'high', source: 'CrowdStrike' },
    ];
    expect(findRuleTestSample(tree, records)).toEqual(records[1]);
  });

  it('returns null when no recent record matches the rule', () => {
    const records = [
      { title: 'a', severity: 'low', source: 'CrowdStrike' },
      { title: 'b', severity: 'high', source: 'Defender' },
    ];
    expect(findRuleTestSample(tree, records)).toBeNull();
  });

  it('returns null when there are no records to check', () => {
    expect(findRuleTestSample(tree, [])).toBeNull();
    expect(findRuleTestSample(tree, null)).toBeNull();
    expect(findRuleTestSample(tree, undefined)).toBeNull();
  });
});

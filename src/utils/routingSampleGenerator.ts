/**
 * Builds a sample record that should satisfy a routing rule's conditions,
 * so a rule can be tested end to end without waiting for a real record.
 * AND groups satisfy every child; OR groups satisfy their first child.
 */
import { evaluateTree, type ConditionGroup, type ConditionLeaf, type ConditionNode } from './routingConditionTree';
import { evaluateCondition } from './routingRuleEvaluator';

const valueFor = (leaf: ConditionLeaf): string => {
  const v = String(leaf.value ?? '');
  switch (leaf.op) {
    case 'equals': return v;
    case 'contains': return v ? `Sample ${v} sample` : 'Sample';
    case 'startsWith': return `${v} sample`;
    case 'endsWith': return `sample ${v}`;
    case 'exists': return 'sample';
    case 'regex': {
      const plain = v.replace(/^\^/, '').replace(/\$$/, '');
      return /[\\.*+?()[\]{}|]/.test(plain) ? 'sample' : plain;
    }
    default: return v || 'sample';
  }
};

const setLeaf = (obj: any, leaf: ConditionLeaf) => {
  const val = valueFor(leaf);
  const field = leaf.field || 'title';
  if (field === '*' || field === '$whole') {
    obj.sample_text = obj.sample_text ? `${obj.sample_text} ${val}` : val;
    return;
  }
  const [head, ...rest] = field.split('.');
  if (head === 'labels' && rest.length === 0) {
    obj.labels = [...(Array.isArray(obj.labels) ? obj.labels : []), val];
    return;
  }
  if (head === 'observables' && rest.length === 1) {
    obj.observables = [...(Array.isArray(obj.observables) ? obj.observables : []), { type: rest[0], value: val }];
    return;
  }
  if (head === 'stakeholders' && rest.length === 1) {
    obj.stakeholders = [...(Array.isArray(obj.stakeholders) ? obj.stakeholders : []), { [rest[0]!]: val }];
    return;
  }
  const parts = field.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!;
    if (!cur[p] || typeof cur[p] !== 'object' || Array.isArray(cur[p])) cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]!] = val;
};

const apply = (obj: any, node: ConditionNode) => {
  if (node.kind === 'condition') { setLeaf(obj, node); return; }
  if (node.children.length === 0) return;
  if (node.op === 'or') apply(obj, node.children[0]!);
  else node.children.forEach((c) => apply(obj, c));
};

export const generateRuleSample = (tree: ConditionGroup, base: any = {}): { sample: any; matches: boolean } => {
  const sample = base && typeof base === 'object' ? JSON.parse(JSON.stringify(base)) : {};
  apply(sample, tree);
  const matches = evaluateTree(tree, (l) => {
    try { return evaluateCondition(sample, { field: l.field, op: l.op, value: l.value } as any); } catch { return false; }
  });
  return { sample, matches };
};

/**
 * Picks the record a rule test should run through the routing workflow: the
 * first recent record that already satisfies the rule. Returns null when no
 * record does, so the caller knows to generate a matching sample instead.
 */
export const findRuleTestSample = (
  tree: ConditionGroup,
  records: any[] | null | undefined,
): any | null => {
  if (!Array.isArray(records)) return null;
  return (
    records.find((r) => {
      try {
        return evaluateTree(tree, (l) =>
          evaluateCondition(r, { field: l.field, op: l.op, value: l.value } as any),
        );
      } catch {
        return false;
      }
    }) || null
  );
};

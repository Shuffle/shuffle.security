import { describe, it, expect, afterEach } from 'vitest';
import { normalizeStatus, statusConfig } from './incidentConfig';
import { applyLifecycleOverrides, resolveSeverity, getSeverityLabel, EMPTY_LIFECYCLE } from './lifecycleOverrides';

afterEach(() => applyLifecycleOverrides(EMPTY_LIFECYCLE));

describe('lifecycle overrides', () => {
  it('no overrides keeps default mapping', () => {
    applyLifecycleOverrides(EMPTY_LIFECYCLE);
    expect(normalizeStatus('closed')).toBe('resolved');
    expect(normalizeStatus('investigating')).toBe('in_progress');
    expect(statusConfig.in_progress.label).toBe('In Progress');
    expect(statusConfig.resolved.id).toBe(3);
  });

  it('unknown status still falls back to new', () => {
    applyLifecycleOverrides(EMPTY_LIFECYCLE);
    expect(normalizeStatus('something weird')).toBe('new');
  });

  it('custom status maps to its base key and OCSF id', () => {
    applyLifecycleOverrides({
      ...EMPTY_LIFECYCLE,
      statuses: { builtin: {}, custom: [{ key: '', label: 'Awaiting Customer', base: 'on_hold', synonyms: ['customer wait'] }] },
    });
    expect(normalizeStatus('Awaiting Customer')).toBe('on_hold');
    expect(normalizeStatus('customer wait')).toBe('on_hold');
    expect(statusConfig[normalizeStatus('Awaiting Customer')].id).toBe(4);
  });

  it('renaming a status keeps its key and id', () => {
    applyLifecycleOverrides({ ...EMPTY_LIFECYCLE, statuses: { builtin: { in_progress: { label: 'Working' } }, custom: [] } });
    expect(statusConfig.in_progress.label).toBe('Working');
    expect(statusConfig.in_progress.id).toBe(2);
    expect(normalizeStatus('in progress')).toBe('in_progress');
  });

  it('hidden status is still recognised', () => {
    applyLifecycleOverrides({ ...EMPTY_LIFECYCLE, statuses: { builtin: { escalated: { hidden: true } }, custom: [] } });
    expect(statusConfig.escalated.hidden).toBe(true);
    expect(normalizeStatus('escalated')).toBe('escalated');
  });

  it('new and resolved cannot be hidden', () => {
    applyLifecycleOverrides({ ...EMPTY_LIFECYCLE, statuses: { builtin: { new: { hidden: true } }, custom: [] } });
    expect(statusConfig.new.hidden).toBe(false);
  });

  it('custom severity maps to its base severity', () => {
    applyLifecycleOverrides({
      ...EMPTY_LIFECYCLE,
      severities: { builtin: { high: { label: 'Severe' } }, custom: [{ key: '', label: 'P1', base: 'critical' }] },
    });
    expect(resolveSeverity('P1')).toBe('critical');
    expect(getSeverityLabel('high')).toBe('Severe');
  });
});

describe('custom lists', () => {
  it('exposes custom statuses and severities for menus', async () => {
    const m = await import('./lifecycleOverrides');
    m.applyLifecycleOverrides({
      statuses: { builtin: {}, custom: [{ key: '', label: 'Awaiting Customer', base: 'on_hold' }] },
      severities: { builtin: {}, custom: [{ key: '', label: 'P1', base: 'critical' }] },
    });
    expect(m.getCustomStatuses().map((c) => c.key)).toEqual(['awaiting_customer']);
    expect(m.getCustomSeverity('p1')?.base).toBe('critical');
    expect(m.getCustomStatus('awaiting_customer')?.base).toBe('on_hold');
  });

  it('custom state only shows while the incident is still in its base state', async () => {
    const m = await import('./lifecycleOverrides');
    applyLifecycleOverrides({
      statuses: { builtin: {}, custom: [{ key: '', label: 'Awaiting Customer', base: 'on_hold' }] },
      severities: { builtin: {}, custom: [{ key: '', label: 'P1', base: 'critical' }] },
    });
    expect(m.getActiveCustomStatus('awaiting_customer', 'on_hold')?.label).toBe('Awaiting Customer');
    expect(m.getActiveCustomStatus('awaiting_customer', 'in_progress')).toBeUndefined();
    expect(m.getActiveCustomSeverity('p1', 'critical')?.label).toBe('P1');
    expect(m.getActiveCustomSeverity('p1', 'high')).toBeUndefined();
  });
});

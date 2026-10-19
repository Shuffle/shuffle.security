import { describe, it, expect } from 'vitest';
import { DEFAULT_SLA_CONTROLS, mergeSlaControls, normalizeSlaControls } from './useSlaControls';

describe('mergeSlaControls', () => {
  it('applies only the patched fields and keeps everything another section saved', () => {
    // The SLO editor saved sloEnabled + incidentSloPercent after the task
    // editor became dirty; saving the task section must not revert them.
    const latest = { ...DEFAULT_SLA_CONTROLS, sloEnabled: true, incidentSloPercent: 80 };
    const merged = mergeSlaControls(latest, { taskSlaEnabled: true, taskTargets: { triage: 30 } });
    expect(merged.sloEnabled).toBe(true);
    expect(merged.incidentSloPercent).toBe(80);
    expect(merged.taskSlaEnabled).toBe(true);
    expect(merged.taskTargets.triage).toBe(30);
  });

  it('merges task targets key-by-key so untouched categories survive', () => {
    const latest = { ...DEFAULT_SLA_CONTROLS, taskTargets: { ...DEFAULT_SLA_CONTROLS.taskTargets, triage: 15 } };
    const merged = mergeSlaControls(latest, { taskTargets: { containment: 120 } });
    expect(merged.taskTargets.containment).toBe(120);
    expect(merged.taskTargets.triage).toBe(15);
  });

  it('normalizes invalid values in the merged result', () => {
    expect(mergeSlaControls(DEFAULT_SLA_CONTROLS, { incidentSloPercent: 150 }).incidentSloPercent)
      .toBe(DEFAULT_SLA_CONTROLS.incidentSloPercent);
  });
});

describe('normalizeSlaControls', () => {
  it('falls back to defaults for missing or invalid input', () => {
    expect(normalizeSlaControls(undefined)).toEqual(DEFAULT_SLA_CONTROLS);
    expect(normalizeSlaControls({ taskTargets: { triage: -5 } }).taskTargets.triage).toBe(DEFAULT_SLA_CONTROLS.taskTargets.triage);
  });
});

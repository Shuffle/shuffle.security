import { describe, it, expect } from 'vitest';
import { DEFAULT_SLA_CONTROLS, mergeSlaControls, normalizeSlaControls } from './useSlaControls';

describe('mergeSlaControls', () => {
  it('keeps values another section saved after this draft was created', () => {
    // Draft was taken when SLO was off; meanwhile the SLO editor saved sloEnabled: true.
    const latest = { ...DEFAULT_SLA_CONTROLS, sloEnabled: true, incidentSloPercent: 80 };
    const staleDraft = { ...DEFAULT_SLA_CONTROLS, taskSlaEnabled: true, taskTargets: { ...DEFAULT_SLA_CONTROLS.taskTargets, triage: 30 } };
    const merged = mergeSlaControls(latest, staleDraft);
    expect(merged.sloEnabled).toBe(true);
    expect(merged.incidentSloPercent).toBe(80);
    expect(merged.taskSlaEnabled).toBe(true);
    expect(merged.taskTargets.triage).toBe(30);
  });

  it('merges task targets key-by-key so untouched categories survive', () => {
    const latest = { ...DEFAULT_SLA_CONTROLS, taskTargets: { ...DEFAULT_SLA_CONTROLS.taskTargets, triage: 15 } };
    const draft = { ...DEFAULT_SLA_CONTROLS, taskTargets: { ...DEFAULT_SLA_CONTROLS.taskTargets, triage: 60, containment: 120 } };
    const merged = mergeSlaControls(latest, draft);
    expect(merged.taskTargets.containment).toBe(120);
    expect(merged.taskTargets.triage).toBe(60);
  });

  it('normalizes invalid values in the merged result', () => {
    const draft = { ...DEFAULT_SLA_CONTROLS, incidentSloPercent: 150 };
    expect(mergeSlaControls(DEFAULT_SLA_CONTROLS, draft).incidentSloPercent).toBe(DEFAULT_SLA_CONTROLS.incidentSloPercent);
  });
});

describe('normalizeSlaControls', () => {
  it('falls back to defaults for missing or invalid input', () => {
    expect(normalizeSlaControls(undefined)).toEqual(DEFAULT_SLA_CONTROLS);
    expect(normalizeSlaControls({ taskTargets: { triage: -5 } }).taskTargets.triage).toBe(DEFAULT_SLA_CONTROLS.taskTargets.triage);
  });
});

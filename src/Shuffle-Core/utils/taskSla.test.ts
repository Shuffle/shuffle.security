import { describe, it, expect } from 'vitest';
import { isTaskOverdue, taskSloAttainment, incidentSloAttainment } from './taskSla';

const H = 3_600_000;
const now = 100 * H;
const targets = { triage: 60, general: 24 * 60 };

describe('task SLA', () => {
  it('open triage task past 1 hour is overdue', () => {
    expect(isTaskOverdue({ category: 'triage', completed: false, createdAt: now - 2 * H }, targets, now)).toBe(true);
  });
  it('triage task completed within 1 hour is not overdue', () => {
    expect(isTaskOverdue({ category: 'triage', completed: true, createdAt: now - 5 * H, completedAt: now - 4.5 * H }, targets, now)).toBe(false);
  });
  it('unknown category uses the general target', () => {
    expect(isTaskOverdue({ category: 'custom', completed: false, createdAt: now - 23 * H }, targets, now)).toBe(false);
    expect(isTaskOverdue({ category: 'custom', completed: false, createdAt: now - 25 * H }, targets, now)).toBe(true);
  });
});

describe('SLO attainment', () => {
  it('task attainment is share of tasks within target', () => {
    const tasks = [
      { category: 'triage', completed: false, createdAt: now - 2 * H },
      { category: 'triage', completed: false, createdAt: now - 0.5 * H },
    ];
    expect(taskSloAttainment(tasks, targets, now)).toBe(50);
    expect(taskSloAttainment([], targets, now)).toBeNull();
  });
  it('incident attainment counts breached incidents as missed', () => {
    const sla = { fallback: { respondMinutes: 60, resolveMinutes: 240 } };
    const incs = [
      { status: 'resolved', severity: '', createdTs: now - 10 * H, respondedTs: now - 9.5 * H, resolvedTs: now - 8 * H },
      { status: 'new', severity: '', createdTs: now - 10 * H },
    ];
    expect(incidentSloAttainment(incs, sla, now)).toBe(50);
  });
});

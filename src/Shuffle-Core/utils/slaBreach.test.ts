import { describe, it, expect } from 'vitest';
import { isSlaBreached } from './slaBreach';

const MIN = 60_000;
const targets = { critical: { respondMinutes: 15, resolveMinutes: 240 }, fallback: { respondMinutes: 480, resolveMinutes: 2400 } };
const now = 1_000_000_000_000;

describe('isSlaBreached', () => {
  it('flags a critical incident responded to after 15 minutes', () => {
    expect(isSlaBreached({ status: 'resolved', severity: 'critical', createdTs: now - 100 * MIN, respondedTs: now - 84 * MIN, resolvedTs: now - 50 * MIN }, targets, now)).toBe(true);
  });
  it('does not flag a critical incident handled within 15 minutes and 4 hours', () => {
    expect(isSlaBreached({ status: 'resolved', severity: 'critical', createdTs: now - 100 * MIN, respondedTs: now - 90 * MIN, resolvedTs: now - 50 * MIN }, targets, now)).toBe(false);
  });
  it('flags an open critical incident older than 4 hours', () => {
    expect(isSlaBreached({ status: 'in_progress', severity: 'critical', createdTs: now - 241 * MIN, respondedTs: now - 240 * MIN }, targets, now)).toBe(true);
  });
  it('uses the fallback row for severities without a target', () => {
    expect(isSlaBreached({ status: 'new', severity: 'low', createdTs: now - 481 * MIN }, targets, now)).toBe(true);
    expect(isSlaBreached({ status: 'new', severity: 'low', createdTs: now - 479 * MIN }, targets, now)).toBe(false);
  });
});

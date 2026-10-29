import { describe, it, expect } from 'vitest';
import { slaPauseIntervals, pausedBetween, isSlaPaused, SLA_PAUSE_TEXT, SLA_RESUME_TEXT } from './slaPause';

const H = 3_600_000;
const base = 1_700_000_000_000;

describe('SLA pause', () => {
  it('closed pause time is excluded from elapsed time', () => {
    const iv = slaPauseIntervals([
      { content: SLA_PAUSE_TEXT, timestamp: base + H },
      { content: SLA_RESUME_TEXT, timestamp: base + 3 * H },
    ]);
    expect(isSlaPaused(iv)).toBe(false);
    expect(pausedBetween(iv, base, base + 5 * H)).toBe(2 * H);
  });
  it('open pause freezes the timer until now', () => {
    const iv = slaPauseIntervals([{ content: SLA_PAUSE_TEXT, timestamp: base + H }]);
    expect(isSlaPaused(iv)).toBe(true);
    expect(pausedBetween(iv, base, base + 4 * H)).toBe(3 * H);
  });
});

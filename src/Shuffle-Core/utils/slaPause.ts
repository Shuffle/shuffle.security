/**
 * SLA/SLO pause intervals, derived from incident activity entries so pauses
 * are persisted and audited with the rest of the incident history.
 * A pause starts at an activity whose content is SLA_PAUSE_TEXT and ends at
 * the next SLA_RESUME_TEXT entry (or is still open).
 */
export const SLA_PAUSE_TEXT = 'SLA timers paused';
export const SLA_RESUME_TEXT = 'SLA timers resumed';

export interface PauseActivity { content?: string; timestamp?: number | string }
export interface PauseInterval { start: number; end?: number }

const toMs = (t: number | string | undefined): number => {
  if (!t) return 0;
  const n = typeof t === 'string' && /[^0-9.]/.test(t) ? new Date(t).getTime() : Number(t);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n < 1e12) return n * 1000;
  if (n < 1e15) return n;
  if (n < 1e18) return n / 1000;
  return n / 1e6;
};

export const slaPauseIntervals = (activity: PauseActivity[] | undefined): PauseInterval[] => {
  const events = (activity || [])
    .map(a => ({ c: (a.content || '').trim(), t: toMs(a.timestamp) }))
    .filter(e => e.t > 0 && (e.c === SLA_PAUSE_TEXT || e.c === SLA_RESUME_TEXT))
    .sort((a, b) => a.t - b.t);
  const out: PauseInterval[] = [];
  let open: PauseInterval | null = null;
  for (const e of events) {
    if (e.c === SLA_PAUSE_TEXT && !open) { open = { start: e.t }; out.push(open); }
    else if (e.c === SLA_RESUME_TEXT && open) { open.end = e.t; open = null; }
  }
  return out;
};

export const isSlaPaused = (intervals: PauseInterval[]) => intervals.some(i => i.end === undefined);

/** Milliseconds paused between `from` and `to`. */
export const pausedBetween = (intervals: PauseInterval[], from: number, to: number): number => {
  let total = 0;
  for (const i of intervals) {
    const s = Math.max(i.start, from);
    const e = Math.min(i.end ?? to, to);
    if (e > s) total += e - s;
  }
  return total;
};

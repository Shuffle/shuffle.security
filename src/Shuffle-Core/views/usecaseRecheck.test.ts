import { describe, it, expect } from 'vitest';
import { recheckUntilConfirmed, createCoalescedFetcher } from './usecaseRecheck';

const noSleep = () => Promise.resolve();

describe('recheckUntilConfirmed', () => {
  it('stops at the first fetch that confirms the change', async () => {
    let calls = 0;
    const ok = await recheckUntilConfirmed({
      fetchState: async () => ++calls,
      isConfirmed: (n) => n === 3,
      sleep: noSleep,
    });
    expect(ok).toBe(true);
    expect(calls).toBe(3);
  });

  it('gives up after maxAttempts completed fetches', async () => {
    let calls = 0;
    const ok = await recheckUntilConfirmed({
      fetchState: async () => { calls++; throw new Error('slow'); },
      isConfirmed: () => true,
      maxAttempts: 4,
      sleep: noSleep,
    });
    expect(ok).toBe(false);
    expect(calls).toBe(4);
  });

  it('never starts a new fetch while the previous one is still running', async () => {
    let running = 0;
    let maxRunning = 0;
    await recheckUntilConfirmed({
      fetchState: async () => {
        running++; maxRunning = Math.max(maxRunning, running);
        await new Promise((r) => setTimeout(r, 5));
        running--;
        return false;
      },
      isConfirmed: (v) => v,
      maxAttempts: 3,
      sleep: noSleep,
    });
    expect(maxRunning).toBe(1);
  });
});

describe('createCoalescedFetcher', () => {
  it('runs at most one follow-up fetch for callers arriving mid-flight', async () => {
    let calls = 0;
    const fetcher = createCoalescedFetcher(async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 5));
      return calls;
    });
    const results = await Promise.all([fetcher(), fetcher(), fetcher(), fetcher()]);
    expect(calls).toBe(2);
    expect(results).toEqual([1, 2, 2, 2]);
  });
});

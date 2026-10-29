/**
 * Smart rechecks after a usecase is enabled or disabled.
 *
 * Loading the workflow list can take a long time on large tenants, so we
 * never stack requests on a timer. Each attempt waits for the previous fetch
 * to finish (however long it takes), stops as soon as the server reflects the
 * change, and only pauses briefly between attempts.
 */

export const USECASE_RECHECK_DONE_EVENT = 'shuffle-usecase-recheck-done';

export interface RecheckOptions<T> {
  /** Fetch fresh state. Awaited fully before the next attempt starts. */
  fetchState: () => Promise<T>;
  /** True once the fetched state reflects the change. */
  isConfirmed: (state: T) => boolean;
  /** Completed fetches to try before giving up. */
  maxAttempts?: number;
  /** Pause after attempt `i` (0-based) before the next one. */
  pauseMs?: (attempt: number) => number;
  /** Return true to stop early (e.g. a newer toggle superseded this one). */
  isCancelled?: () => boolean;
  sleep?: (ms: number) => Promise<void>;
}

export const defaultRecheckPause = (attempt: number) => Math.min(1000 * 2 ** attempt, 8000);

export async function recheckUntilConfirmed<T>(opts: RecheckOptions<T>): Promise<boolean> {
  const {
    fetchState,
    isConfirmed,
    maxAttempts = 6,
    pauseMs = defaultRecheckPause,
    isCancelled = () => false,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  } = opts;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (isCancelled()) return false;
    try {
      const state = await fetchState();
      if (isCancelled()) return false;
      if (isConfirmed(state)) return true;
    } catch {
      /* a failed fetch counts as an attempt; try again after the pause */
    }
    if (attempt < maxAttempts - 1) await sleep(pauseMs(attempt));
  }
  return false;
}

/**
 * Coalesce forced fetches: while one is running, extra callers share a single
 * follow-up fetch that starts after it finishes, so they always get data
 * newer than their request without piling parallel heavy requests.
 */
export function createCoalescedFetcher<T>(doFetch: () => Promise<T>): () => Promise<T> {
  let inflight: Promise<T> | null = null;
  let queued: Promise<T> | null = null;
  const run = (): Promise<T> => {
    if (!inflight) {
      inflight = doFetch().finally(() => { inflight = null; });
      return inflight;
    }
    if (!queued) {
      queued = inflight.catch(() => undefined).then(() => {
        queued = null;
        return run();
      });
    }
    return queued;
  };
  return run;
}

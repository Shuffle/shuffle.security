/**
 * Global scheduler for datastore reads.
 *
 * The client-side fetch breaker trips when a single endpoint sees more than
 * 30 calls inside 1s (`fetchBreaker.ts`). Background work — incident list
 * cross-loads, thread continuation, sibling merges — all hit the very same
 * `POST /api/v1/orgs/:id/get_cache` endpoint, so navigating from /incidents
 * into an incident could burst past that threshold and leave the foreground
 * read fail-fasting against an open breaker for 30s. Refreshing the page felt
 * instant only because none of that background work was in flight.
 *
 * This scheduler keeps every datastore read under the breaker threshold and
 * lets user-initiated ("priority") reads jump ahead of background work.
 */

const MAX_CONCURRENT = 6;
const MAX_PER_SECOND = 16; // comfortably below the breaker's 30/1s burst limit

type Waiter = () => void;

const priorityQueue: Waiter[] = [];
const backgroundQueue: Waiter[] = [];
let active = 0;
let recentStarts: number[] = [];

const pump = () => {
  const now = Date.now();
  recentStarts = recentStarts.filter((t) => now - t < 1000);

  while (active < MAX_CONCURRENT && recentStarts.length < MAX_PER_SECOND) {
    const next = priorityQueue.shift() || backgroundQueue.shift();
    if (!next) return;
    active += 1;
    recentStarts.push(Date.now());
    next();
  }

  // Nothing could start right now — retry once the oldest start ages out or a
  // slot frees up (release() calls pump again).
  if ((priorityQueue.length || backgroundQueue.length) && recentStarts.length >= MAX_PER_SECOND) {
    const wait = Math.max(20, 1000 - (Date.now() - recentStarts[0]));
    setTimeout(pump, wait);
  }
};

/**
 * Acquire a datastore request slot. Resolves with a `release` function that
 * MUST be called once the request settles.
 */
export const acquireDatastoreSlot = (priority = false): Promise<() => void> =>
  new Promise((resolve) => {
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      active = Math.max(0, active - 1);
      pump();
    };
    const start = () => resolve(release);
    if (priority) priorityQueue.push(start);
    else backgroundQueue.push(start);
    pump();
  });

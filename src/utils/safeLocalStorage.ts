/**
 * Global localStorage quota guard.
 *
 * Patches localStorage.setItem so any QuotaExceededError is handled
 * automatically by evicting the largest non-essential keys and retrying,
 * instead of bubbling up as an unhandled runtime error.
 *
 * Install once at app startup (see main.tsx).
 */

const PROTECTED_KEY_PATTERNS: RegExp[] = [
  /^shuffle[-_]/i,      // shuffle-theme, shuffle_api_key, shuffle_user_info etc.
  /^supabase\./i,       // supabase auth tokens
  /^sb-/i,              // supabase client storage
  /token/i,
  /auth/i,
  /session-id/i,
  /^user(Info|_)/i,
  /agent_tools/i,       // agent tools configuration and per-org caches
];

const isQuotaError = (err: unknown): boolean => {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; code?: number };
  return (
    e.name === "QuotaExceededError" ||
    e.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    e.code === 22 ||
    e.code === 1014
  );
};

const isProtected = (key: string): boolean =>
  PROTECTED_KEY_PATTERNS.some((rx) => rx.test(key));

type SizedKey = { key: string; size: number };

const listKeysBySize = (skipKey: string): SizedKey[] => {
  const out: SizedKey[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || k === skipKey || isProtected(k)) continue;
    const v = localStorage.getItem(k) ?? "";
    out.push({ key: k, size: k.length + v.length });
  }
  // Largest first. Authentication and session keys are never eviction candidates.
  out.sort((a, b) => b.size - a.size);
  return out;
};

export const installLocalStorageQuotaGuard = (): void => {
  if (typeof window === "undefined") return;
  let hasLocalStorage = false;
  try {
    hasLocalStorage = Boolean(window.localStorage);
  } catch {
    return;
  }
  if (!hasLocalStorage) return;

  let proto: Storage;
  try {
    proto = Object.getPrototypeOf(window.localStorage) as Storage;
  } catch {
    return;
  }

  const flag = window as unknown as { __lsQuotaGuardInstalled?: boolean };
  if (flag.__lsQuotaGuardInstalled) return;
  flag.__lsQuotaGuardInstalled = true;

  try {
    const originalSetItem = proto.setItem.bind(window.localStorage);
    proto.setItem = function patchedSetItem(key: string, value: string): void {
      try {
        originalSetItem(key, value);
        return;
      } catch (err) {
        if (!isQuotaError(err)) {
          // In sandboxed iframes or private modes, storage throws SecurityError.
          // Silently drop write rather than crashing the whole view.
          console.warn(`[safeLocalStorage] storage write blocked for "${key}":`, err);
          return;
        }

        // Evict largest other keys one at a time and retry.
        const candidates = listKeysBySize(key);
        for (const { key: victim } of candidates) {
          try {
            window.localStorage.removeItem(victim);
          } catch {
            /* ignore */
          }
          try {
            originalSetItem(key, value);
            console.warn(
              `[safeLocalStorage] quota hit while writing "${key}"; evicted "${victim}" to make room.`
            );
            return;
          } catch (retryErr) {
            if (!isQuotaError(retryErr)) {
              console.warn(`[safeLocalStorage] storage retry failed for "${key}":`, retryErr);
              return;
            }
          }
        }

        // Last resort — silently drop the write rather than crash the app.
        console.warn(
          `[safeLocalStorage] dropping write to "${key}" (${value.length} chars) — storage full and no evictable keys remain.`
        );
      }
    };

    const originalGetItem = proto.getItem.bind(window.localStorage);
    proto.getItem = function patchedGetItem(key: string): string | null {
      try {
        return originalGetItem(key);
      } catch (err) {
        console.warn(`[safeLocalStorage] storage read blocked for "${key}":`, err);
        return null;
      }
    };

    const originalRemoveItem = proto.removeItem.bind(window.localStorage);
    proto.removeItem = function patchedRemoveItem(key: string): void {
      try {
        originalRemoveItem(key);
      } catch (err) {
        console.warn(`[safeLocalStorage] storage remove blocked for "${key}":`, err);
      }
    };
  } catch {
    // Prototype manipulation might be blocked
  }
};

/**
 * Remembers which authentication entries have been validated at least once.
 *
 * The backend drops `validation.valid` when an authentication is written back
 * with masked secret placeholders (which happens on every provider switch,
 * including switching to Shuffle AI). Without this memory the "Validated"
 * state visually disappears even though the credentials are untouched.
 *
 * Keyed by authentication id, so deleting an auth naturally drops the state.
 */
const STORAGE_KEY = 'shuffle-validated-auth-ids';

const read = (): string[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [];
  } catch {
    return [];
  }
};

export const getValidatedAuthIds = (): Set<string> => new Set(read());

export const rememberValidatedAuth = (authId?: string | null) => {
  if (!authId) return;
  try {
    const ids = read();
    if (ids.includes(authId)) return;
    ids.push(authId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids.slice(-50)));
  } catch {
    /* noop */
  }
};

export const forgetValidatedAuth = (authId?: string | null) => {
  if (!authId) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(read().filter((id) => id !== authId)));
  } catch {
    /* noop */
  }
};

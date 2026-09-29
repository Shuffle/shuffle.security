/**
 * useAgentPromptPrefix — per-user default prompt prefix rendered as a chip
 * at the start of the AgentUI input. Prepended to the submitted text so it
 * feels like the user is "typing to" the Shuffle Tools MCP without the
 * prefix filling the box.
 *
 * Self-contained inside `@/Shuffle-MCPs`. Storage uses this library's own
 * datastore helper, keyed by the caller-supplied `userId` (or `"default"`
 * when omitted). The datastore is already org-scoped internally.
 *
 * Category: {@link AGENT_PROMPT_PREFIX_CATEGORY}
 * Value:    `{ prompt: string }` JSON payload.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getDatastoreItem, setDatastoreItem } from '@/Shuffle-Core/datastore';

export const AGENT_PROMPT_PREFIX_CATEGORY = 'agent-prompt-prefix';

/** Default seed used until the user saves their own prefix.
 * Empty by default — the backend system prompt handles agent identity. */
export const DEFAULT_AGENT_PROMPT_PREFIX = '';

const decodePrompt = (raw: unknown): string | null => {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && typeof parsed.prompt === 'string') {
        return parsed.prompt;
      }
    } catch { /* fall through */ }
    return raw;
  }
  if (typeof raw === 'object') {
    const obj = raw as { prompt?: unknown; value?: unknown };
    if (typeof obj.prompt === 'string') return obj.prompt;
    if (typeof obj.value === 'string') {
      try {
        const parsed = JSON.parse(obj.value);
        if (parsed && typeof parsed.prompt === 'string') return parsed.prompt;
      } catch { /* ignore */ }
      return obj.value;
    }
  }
  return null;
};

export interface UseAgentPromptPrefixOptions {
  /** Storage key — typically the current user id. Falls back to `"default"`. */
  userId?: string;
  /** Override the seed shown until the user saves their own. */
  defaultPrompt?: string;
  /** When false, disables datastore reads/writes entirely (in-memory only). */
  persist?: boolean;
}

export const useAgentPromptPrefix = (options: UseAgentPromptPrefixOptions = {}) => {
  const { userId, defaultPrompt = DEFAULT_AGENT_PROMPT_PREFIX, persist = true } = options;
  const key = userId || 'default';
  const [prompt, setPrompt] = useState<string>(defaultPrompt);
  const [hasFetched, setHasFetched] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const fetchedForKey = useRef<string | null>(null);

  useEffect(() => {
    if (!persist) { setHasFetched(true); return; }
    if (fetchedForKey.current === key) return;
    fetchedForKey.current = key;
    let cancelled = false;
    (async () => {
      try {
        const res = await getDatastoreItem(key, AGENT_PROMPT_PREFIX_CATEGORY);
        if (cancelled) return;
        if (res.success && res.item) {
          const parsed = decodePrompt(res.item.value ?? res.item);
          if (parsed && parsed.trim().length > 0) {
            setPrompt(parsed);
          }
        }
      } catch {
        // Non-fatal — keep default.
      } finally {
        if (!cancelled) setHasFetched(true);
      }
    })();
    return () => { cancelled = true; };
  }, [key, persist]);

  const savePrompt = useCallback(async (next: string): Promise<boolean> => {
    const prev = prompt;
    setPrompt(next); // optimistic
    if (!persist) return true;
    setIsSaving(true);
    try {
      const res = await setDatastoreItem(key, { prompt: next }, AGENT_PROMPT_PREFIX_CATEGORY);
      if (!res.success) {
        setPrompt(prev);
        return false;
      }
      return true;
    } catch {
      setPrompt(prev);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [prompt, key, persist]);

  return { prompt, savePrompt, hasFetched, isSaving };
};

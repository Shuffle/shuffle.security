/**
 * Shared service for switching active LLM providers and managing OpenAI-compatible
 * authentication states in real time.
 *
 * Used by:
 *  - `AgentUI` Choose LLM chip and quick-switch menu
 *  - `LocalLLMConfig` provider selector and Shuffle AI button
 */

import { getApiUrl, getAuthHeader } from '@/Shuffle-MCPs/api';
import {
  fetchAuthenticatedApps,
  invalidateAuthenticatedAppsCache,
} from '@/Shuffle-MCPs/authenticatedApps';
import {
  ENDPOINT_PRESETS,
  SHUFFLE_AI_PRESET,
  getProviderLogoUrl,
  isOpenAICompatibleAuthEntry,
  providerLabelOfAuthEntry,
} from '@/Shuffle-MCPs/llmProviderDetect';

export const SECRET_PLACEHOLDER = 'Secret. Replaced during app execution!';

const SECRET_FIELD_KEYS = new Set([
  'apikey',
  'api_key',
  'token',
  'secret',
  'password',
]);

const isSecretKey = (key: string | undefined | null): boolean => {
  if (!key) return false;
  return SECRET_FIELD_KEYS.has(key.trim().toLowerCase());
};

/**
 * Mask only sensitive credentials (apikey, token, secret, password) with
 * the backend's secret placeholder, while preserving non-secret configuration
 * fields like `url` and `model`.
 */
export const maskSecretFields = (fields: any): any => {
  if (Array.isArray(fields)) {
    return fields.map((f: any) => {
      if (f && typeof f === 'object' && 'key' in f) {
        if (isSecretKey(f.key)) {
          return { ...f, value: f.value ? SECRET_PLACEHOLDER : '' };
        }
        return f;
      }
      return f;
    });
  }
  if (fields && typeof fields === 'object') {
    const masked: Record<string, any> = {};
    for (const [key, val] of Object.entries(fields)) {
      if (isSecretKey(key)) {
        masked[key] = val ? SECRET_PLACEHOLDER : '';
      } else {
        masked[key] = val;
      }
    }
    return masked;
  }
  return fields;
};

/**
 * Make one LLM provider active (active: true) and deactivate all other
 * OpenAI-compatible authentications (active: false).
 *
 * When target is `null` or `'Shuffle AI'`, ALL OpenAI-compatible entries
 * are deactivated so Shuffle AI becomes the active provider.
 *
 * This operation is optimistic and broadcasts realtime events so all UI
 * surfaces update instantly without waiting for network round-trips.
 */
export const switchActiveLLM = async (
  targetProviderOrId: string | null,
): Promise<{ success: boolean; label: string }> => {
  const isShuffleAI =
    targetProviderOrId === null || targetProviderOrId === SHUFFLE_AI_PRESET;

  const optimisticLabel = isShuffleAI ? SHUFFLE_AI_PRESET : targetProviderOrId;
  const presetMatch = ENDPOINT_PRESETS.find((p) => p.label === optimisticLabel);
  const optimisticUrl = presetMatch?.url || '';
  const optimisticLogo = getProviderLogoUrl(optimisticLabel, optimisticUrl);

  // 1. Optimistic event broadcast — updates listeners synchronously in 0ms
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('integrations-changed', {
        detail: {
          source: 'llm-active-change',
          activeProvider: optimisticLabel,
          url: optimisticUrl,
          logo: optimisticLogo,
          activeId: isShuffleAI ? null : targetProviderOrId,
        },
      }),
    );
    window.dispatchEvent(
      new CustomEvent('llm-provider-changed', {
        detail: {
          activeProvider: optimisticLabel,
          url: optimisticUrl,
          logo: optimisticLogo,
          activeId: isShuffleAI ? null : targetProviderOrId,
        },
      }),
    );
  }

  try {
    // 2. Fetch fresh authentications
    invalidateAuthenticatedAppsCache();
    const rawApps = await fetchAuthenticatedApps();
    const llmEntries = (rawApps || []).filter(isOpenAICompatibleAuthEntry);

    // 3. Resolve target auth ID
    let targetAuthId: string | null = null;
    if (!isShuffleAI) {
      const matchById = llmEntries.find((e: any) => e?.id === targetProviderOrId);
      if (matchById?.id) {
        targetAuthId = matchById.id;
      } else {
        const matchByLabel = llmEntries.find(
          (e: any) => providerLabelOfAuthEntry(e) === targetProviderOrId,
        );
        if (matchByLabel?.id) {
          targetAuthId = matchByLabel.id;
        }
      }
    }

    // 4. Update entries on backend. Only a failure to write the `active`
    //    flag itself is treated as a failure — everything else stays optimistic.
    let activeWriteFailed = false;

    if (!isShuffleAI && !targetAuthId) {
      console.warn('[switchActiveLLM] Target provider auth not found:', targetProviderOrId);
      activeWriteFailed = true;
    }

    for (const entry of llmEntries) {
      if (!entry?.id) continue;
      const shouldBeActive = Boolean(targetAuthId && entry.id === targetAuthId);
      if (Boolean(entry.active) === shouldBeActive) continue;

      const body: Record<string, any> = {
        ...entry,
        active: shouldBeActive,
        fields: maskSecretFields(entry.fields),
      };

      try {
        const resp = await fetch(getApiUrl('/api/v1/apps/authentication'), {
          method: 'PUT',
          credentials: 'include',
          headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!resp.ok) {
          console.error('[switchActiveLLM] Failed to update entry:', entry.id, resp.status);
          if (shouldBeActive) {
            activeWriteFailed = true;
          }
        }
      } catch (err) {
        console.error('[switchActiveLLM] Failed to update entry:', entry.id, err);
        if (shouldBeActive) {
          activeWriteFailed = true;
        }
      }
    }

    // 5. Invalidate caches and broadcast completion
    invalidateAuthenticatedAppsCache();

    if (activeWriteFailed) {
      return { success: false, label: optimisticLabel };
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('integrations-changed', {
          detail: {
            source: 'llm-active-change-complete',
            activeProvider: optimisticLabel,
            url: optimisticUrl,
            logo: optimisticLogo,
            activeId: targetAuthId,
          },
        }),
      );
    }

    return { success: true, label: optimisticLabel };
  } catch (err) {
    console.error('[switchActiveLLM] Error switching LLM provider:', err);
    return { success: false, label: optimisticLabel };
  }
};

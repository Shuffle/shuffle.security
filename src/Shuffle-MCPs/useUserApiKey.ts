import { useState, useEffect } from 'react';
import { getApiUrl, getAuthHeader, API_CONFIG, getSessionToken, hasShuffleAuth } from '@/Shuffle-MCPs/api';

const API_KEY_CACHE_KEY = 'shuffle_user_apikey';

export interface UserApiKeyInfo {
  apiKey: string | null;
  maskedApiKey: string;
  isLoading: boolean;
  isAuthenticated: boolean;
  baseUrl: string;
  orgId: string | null;
}

export function maskApiKey(key: string | null | undefined): string {
  if (!key || key.trim() === '') return '<API_KEY>';
  const trimmed = key.trim();
  if (trimmed.length <= 8) return '••••••••';
  const start = trimmed.slice(0, 4);
  const end = trimmed.slice(-4);
  return `${start}••••••••••••${end}`;
}

const readCachedOrgId = (): string | null => {
  if (typeof localStorage === 'undefined') return null;
  try {
    const info = localStorage.getItem('shuffle_user_info');
    if (!info) return null;
    const parsed = JSON.parse(info);
    return parsed?.active_org?.id || parsed?.active_org_id || null;
  } catch {
    return null;
  }
};

export function useUserApiKey(): UserApiKeyInfo {
  const isAuthenticated = hasShuffleAuth();
  const [apiKey, setApiKey] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      return localStorage.getItem(API_KEY_CACHE_KEY) || null;
    } catch {
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!isAuthenticated) {
      setApiKey(null);
      try {
        localStorage.removeItem(API_KEY_CACHE_KEY);
      } catch {}
      return;
    }

    let isMounted = true;
    const fetchApiKey = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(getApiUrl('/api/v1/getsettings'), {
          credentials: 'include',
          headers: {
            ...getAuthHeader(),
          },
        });
        if (res.ok) {
          const data = await res.json();
          const key = data.apikey || data.api_key;
          if (key && typeof key === 'string' && isMounted) {
            const cleanKey = key.trim();
            setApiKey(cleanKey);
            try {
              localStorage.setItem(API_KEY_CACHE_KEY, cleanKey);
            } catch {}
            return;
          }
        }
      } catch (e) {
        // Fall back to existing cached or session token
      } finally {
        if (isMounted) setIsLoading(false);
      }

      // Fallback if getsettings didn't return an apikey
      const fallbackToken = getSessionToken();
      if (fallbackToken && isMounted && !apiKey) {
        setApiKey(fallbackToken);
      }
    };

    fetchApiKey();

    return () => {
      isMounted = false;
    };
  }, [isAuthenticated]);

  const rawBaseUrl = API_CONFIG.baseUrl || (typeof window !== 'undefined' ? window.location.origin : 'https://shuffler.io');
  const baseUrl = rawBaseUrl.replace(/\/+$/, '');
  const orgId = readCachedOrgId();

  return {
    apiKey,
    maskedApiKey: maskApiKey(apiKey),
    isLoading,
    isAuthenticated,
    baseUrl,
    orgId,
  };
}

/**
 * useAppLookup — Resolve an app's display name, image, categories,
 * canonical Algolia objectID and matching auth entries from just
 * an app name (or id).
 *
 * Used by the standalone section components (Authentication, Try MCP,
 * Try individual actions) so consumers only need to pass `appName`.
 *
 * Resolution order:
 *  1. Algolia `appsearch` index (best-effort, may 429)
 *  2. /api/v1/apps fallback (private + activated apps)
 *  3. /api/v1/apps/:id/config to enrich with auth schema
 */

import { useEffect, useMemo, useState } from 'react';
import { API_CONFIG } from '@/Shuffle-MCPs/api';
import { fetchAppsViaApiConfig } from '@/Shuffle-MCPs/appsCache';
import { fetchAppConfig } from '@/Shuffle-MCPs/appConfigFetch';
import { useAppAuth } from '@/Shuffle-MCPs/useAppAuth';
import { isNoAuthApp, getBuiltInAppMetadata, getBuiltInAppImage } from '@/Shuffle-MCPs/noAuthApps';
import type { AlgoliaSearchApp } from '@/Shuffle-MCPs/shuffle-mcp.helpers';

export interface AppLookupResult {
  loading: boolean;
  displayName: string;
  image: string;
  categories: string[];
  /** Canonical Algolia objectID (or Shuffle private app id). */
  algoliaId: string | null;
  /** Synthesized AlgoliaSearchApp suitable for AppAuthCard. */
  algoliaApp: AlgoliaSearchApp | null;
  /** Auth entries matching this app name. */
  matchingEntries: any[];
  hasValidAuth: boolean;
  hasAnyAuth: boolean;
  authCount: number;
  authState: any;
  // Pass-through helpers from useAppAuth (so consumers do not need a second hook):
  handleAuthChange: any;
  handleTestConnection: (appId: string, authId?: string) => any;
  handleSaveAuth: (appId: string, credentials: Record<string, string>) => Promise<boolean>;
  refreshAuth: () => void;
}

const norm = (s: string) => s.toLowerCase().replace(/[\s_\-]+/g, '_');

export function useAppLookup(appName: string | null): AppLookupResult {
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<{
    name: string;
    description: string;
    image: string;
    categories: string[];
  } | null>(null);
  const [algoliaId, setAlgoliaId] = useState<string | null>(null);

  const {
    authStates,
    authenticatedApps,
    handleAuthChange,
    handleTestConnection,
    handleSaveAuth,
    refreshAuth,
  } = useAppAuth();

  useEffect(() => {
    if (!appName) {
      setInfo(null);
      setAlgoliaId(null);
      return;
    }
    setLoading(true);
    setInfo(null);
    setAlgoliaId(null);
    refreshAuth();

    const normalizedName = norm(appName);
    const searchName = appName.replace(/_/g, ' ');

    (async () => {
      let id: string | null = null;
      try {
        const { algoliasearch } = await import('algoliasearch');
        const client = algoliasearch('JNSS5CFDZZ', '33e4e3564f4f060e96e0531957bed552');
        const res = await client.search({
          requests: [{ indexName: 'appsearch', query: searchName, hitsPerPage: 10 }],
        });
        const hits = (res as any)?.results?.[0]?.hits || [];
        const match = hits.find((h: any) => h.name && norm(h.name) === normalizedName) || hits[0];
        if (match) {
          id = match.objectID;
          setAlgoliaId(id);
          setInfo({
            name: match.name || searchName,
            description: match.description || '',
            image: match.image_url || '',
            categories: match.categories || [],
          });
        }
      } catch {}

      let appsList: any[] | null = null;
      if (API_CONFIG.apiKey) {
        try {
          const apps = await fetchAppsViaApiConfig();
          if (Array.isArray(apps)) appsList = apps;
        } catch {}
      }

      if (!id && appsList) {
        const localMatch = appsList.find((a: any) => norm(a.name || '') === normalizedName);
        if (localMatch?.id) {
          id = localMatch.id;
          setAlgoliaId(localMatch.id);
          setInfo((prev) => prev ?? {
            name: localMatch.name || searchName,
            description: localMatch.description || '',
            image: localMatch.large_image || '',
            categories: localMatch.categories || [],
          });
        }
      }

      if (API_CONFIG.apiKey && id) {
        // Shared negative-caching fetcher: a 401/403/404 on this id is
        // remembered for the session so remounting this hook does not
        // repeat the failing request.
        const result = await fetchAppConfig(id);
        if (result.ok && result.data?.name) {
          const data = result.data;
          setInfo((prev) => ({
            name: data.name || prev?.name || searchName,
            description: data.description || prev?.description || '',
            image: data.large_image || prev?.image || '',
            categories: data.categories || prev?.categories || [],
          }));
        }
      }

      const isBuiltIn = isNoAuthApp(appName);
      const builtInMeta = isBuiltIn ? getBuiltInAppMetadata(appName) : null;

      setInfo((prev) => {
        const next = prev ?? {
          name: builtInMeta?.displayName || searchName,
          description: builtInMeta?.description || '',
          image: builtInMeta?.image || '',
          categories: builtInMeta?.categories || ['Built-in'],
        };
        return {
          ...next,
          name: next.name || builtInMeta?.displayName || searchName,
          description: next.description || builtInMeta?.description || '',
          image: next.image || builtInMeta?.image || '',
          categories: next.categories?.length ? next.categories : (builtInMeta?.categories || ['Built-in']),
        };
      });
      setLoading(false);
    })();
  }, [appName]);

  const matchingEntries = useMemo(() => {
    if (!appName) return [];
    return authenticatedApps.filter(
      (auth) => auth.app?.name && norm(auth.app.name) === norm(appName),
    );
  }, [appName, authenticatedApps]);

  const image = useMemo(() => {
    if (info?.image) return info.image;
    for (const entry of matchingEntries) {
      const img = (entry as any).app?.large_image || (entry as any).large_image;
      if (img) return img;
    }
    if (isNoAuthApp(appName || '')) {
      return getBuiltInAppImage(appName || '') || '';
    }
    return '';
  }, [info, matchingEntries, appName]);

  const algoliaApp: AlgoliaSearchApp | null = useMemo(() => {
    if (!appName) return null;
    return {
      objectID: algoliaId || appName,
      name: appName,
      image_url: image,
      description: info?.description || '',
      categories: info?.categories || [],
    } as AlgoliaSearchApp;
  }, [appName, info, image, algoliaId]);

  const displayName = (info?.name || appName || '').replace(/_/g, ' ');
  const authState = authStates[appName || ''] || { systemId: appName || '', status: 'pending' as const, credentials: {} };

  return {
    loading,
    displayName,
    image,
    categories: info?.categories || [],
    algoliaId,
    algoliaApp,
    matchingEntries,
    hasValidAuth: matchingEntries.some((e) => e.validation?.valid === true),
    hasAnyAuth: matchingEntries.length > 0,
    authCount: matchingEntries.length,
    authState,
    handleAuthChange,
    handleTestConnection,
    handleSaveAuth,
    refreshAuth,
  };
}

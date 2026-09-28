/**
 * resolveApp — General-purpose app resolver.
 *
 * Given an app id OR name, look it up across all three known sources and
 * return a unified `{ id, name, image }` triple. Used anywhere we need to
 * render an app chip/icon and only have a free-form identifier (decision
 * `tool`, auth-request `appName`, `app_authentication` payload, etc.).
 *
 * Resolution order (each pass merges in any newly-found fields, so we keep
 * going until id/name/image are all known or all sources are exhausted):
 *   1. /api/v1/apps/authentication — covers user-installed/active apps,
 *      including private ones that may not be in the public catalog.
 *   2. /api/v1/apps — covers everything visible to the org (activated
 *      and private uploads).
 *   3. Algolia `appsearch` — canonical objectID + public catalog metadata.
 *
 * Results are cached in-memory by normalized key so repeat lookups for the
 * same name/id are free.
 */

import { fetchAppsViaApiConfig } from '@/Shuffle-MCPs/appsCache';
import { fetchAuthenticatedApps } from '@/Shuffle-MCPs/authenticatedApps';
import { isNoAuthApp, getBuiltInAppMetadata } from '@/Shuffle-MCPs/noAuthApps';

export interface ResolvedApp {
  /** Canonical id — Algolia objectID when known, otherwise Shuffle app id. */
  id: string;
  /** Display name (may be raw slug if no source had a friendly name). */
  name: string;
  /** Best available large image URL. Empty string if not found. */
  image: string;
  /** Categories from whichever source provided them. */
  categories?: string[];
}

const norm = (s: string): string =>
  (s || '').toLowerCase().trim().replace(/[\s\-]+/g, '_');

const _cache = new Map<string, ResolvedApp>();
const _pending = new Map<string, Promise<ResolvedApp | null>>();

/** Returns true when the resolved record is fully populated. */
const isComplete = (r: Partial<ResolvedApp>): boolean =>
  Boolean(r.id && r.name && r.image);

const merge = (
  base: Partial<ResolvedApp>,
  next: Partial<ResolvedApp>,
): Partial<ResolvedApp> => ({
  id: base.id || next.id,
  name: base.name || next.name,
  image: base.image || next.image,
  categories: base.categories?.length ? base.categories : next.categories,
});

/**
 * Resolve an app from id-or-name across auth + apps + Algolia.
 * Returns `null` only if all three sources came back empty.
 */
export async function resolveApp(idOrName: string): Promise<ResolvedApp | null> {
  if (!idOrName || typeof idOrName !== 'string') return null;
  const slug = norm(idOrName);
  const rawKey = idOrName;

  const cached = _cache.get(slug) || _cache.get(rawKey);
  if (cached) return cached;

  const inflight = _pending.get(slug);
  if (inflight) return inflight;

  const work = (async (): Promise<ResolvedApp | null> => {
    let acc: Partial<ResolvedApp> = {};

    if (isNoAuthApp(slug) || isNoAuthApp(rawKey)) {
      const meta = getBuiltInAppMetadata(slug) || getBuiltInAppMetadata(rawKey);
      if (meta) {
        acc = merge(acc, {
          id: slug,
          name: meta.displayName,
          image: meta.image || '',
          categories: meta.categories || ['Built-in'],
        });
      }
    }

    // --- Pass 1: authenticated apps -----------------------------------
    try {
      const auths = await fetchAuthenticatedApps();
      const hit = auths.find((a) => {
        const app = a?.app || {};
        return (
          (app.id && (app.id === rawKey || app.id === slug)) ||
          (app.name && norm(String(app.name)) === slug)
        );
      });
      if (hit?.app) {
        acc = merge(acc, {
          id: hit.app.id ? String(hit.app.id) : undefined,
          name: hit.app.name ? String(hit.app.name) : undefined,
          image: hit.app.large_image || hit.app.small_image || '',
          categories: hit.app.categories as string[] | undefined,
        });
      }
    } catch { /* ignore */ }

    // --- Pass 2: /api/v1/apps -----------------------------------------
    if (!isComplete(acc)) {
      try {
        const apps = await fetchAppsViaApiConfig();
        const hit = apps.find(
          (a: any) =>
            a?.id === rawKey ||
            a?.id === slug ||
            (a?.name && norm(String(a.name)) === slug),
        );
        if (hit) {
          acc = merge(acc, {
            id: hit.id ? String(hit.id) : undefined,
            name: hit.name ? String(hit.name) : undefined,
            image: hit.large_image || hit.image_url || hit.image || '',
            categories: hit.categories,
          });
        }
      } catch { /* ignore */ }
    }

    // --- Pass 3: Algolia ----------------------------------------------
    if (!isComplete(acc)) {
      try {
        const { algoliasearch } = await import('algoliasearch');
        const client = algoliasearch(
          'JNSS5CFDZZ',
          '33e4e3564f4f060e96e0531957bed552',
        );
        // Prefer direct objectID lookup if the input looks like one.
        let match: any = null;
        try {
          const obj = await (client as any).getObject({
            indexName: 'appsearch',
            objectID: rawKey,
          });
          if (obj?.name || obj?.image_url) match = obj;
        } catch { /* not an objectID — fall through */ }
        if (!match) {
          const res = await client.searchSingleIndex({
            indexName: 'appsearch',
            searchParams: { query: slug.replace(/_/g, ' '), hitsPerPage: 5 },
          });
          const hits = (res.hits as any[]) || [];
          match = hits.find((h) => norm(h.name || '') === slug) || hits[0];
        }
        if (match) {
          acc = merge(acc, {
            // Algolia objectID is canonical — prefer it for `id` when we
            // didn't already get a real id from auth/apps.
            id: acc.id || match.objectID || match.id,
            name: match.name,
            image: match.image_url,
            categories: match.categories,
          });
        }
      } catch { /* algolia unavailable / rate-limited */ }
    }

    if (!acc.id && !acc.name && !acc.image) return null;

    const resolved: ResolvedApp = {
      id: acc.id || slug,
      name: acc.name || idOrName,
      image: acc.image || '',
      categories: acc.categories,
    };
    _cache.set(slug, resolved);
    _cache.set(rawKey, resolved);
    return resolved;
  })();

  _pending.set(slug, work);
  try {
    return await work;
  } finally {
    _pending.delete(slug);
  }
}

/** Resolve many at once — convenience wrapper. */
export async function resolveApps(
  idsOrNames: string[],
): Promise<Record<string, ResolvedApp>> {
  const out: Record<string, ResolvedApp> = {};
  await Promise.all(
    idsOrNames.map(async (n) => {
      const r = await resolveApp(n);
      if (r) out[n] = r;
    }),
  );
  return out;
}

/** Seed the cache (e.g. from chosenApps that already carry an icon). */
export function seedResolvedApp(idOrName: string, app: Partial<ResolvedApp>) {
  if (!idOrName || !app) return;
  const slug = norm(idOrName);
  const existing = _cache.get(slug) || _cache.get(idOrName);
  const merged: ResolvedApp = {
    id: app.id || existing?.id || slug,
    name: app.name || existing?.name || idOrName,
    image: app.image || existing?.image || '',
    categories: app.categories || existing?.categories,
  };
  _cache.set(slug, merged);
  _cache.set(idOrName, merged);
}

/** Clear the resolver cache (e.g. on org change). */
export function invalidateResolvedApps() {
  _cache.clear();
}

/**
 * Auth-app dedup + image backfill utilities.
 * Inlined into the Shuffle-MCPs library so it has no host-app dependency.
 * (Mirror copy of the helpers in src/lib/utils.ts — keep in sync.)
 */

export interface AuthAppEntry {
  app: {
    id: string;
    name: string;
    large_image?: string;
    categories?: string[];
  };
  active?: boolean;
  validation?: {
    valid: boolean;
    error?: string;
    last_valid?: number;
  };
  label?: string;
  id?: string;
}

export interface DeduplicatedApp {
  app: AuthAppEntry['app'];
  hasValidAuth: boolean;
  bestImage: string;
  instances: { label: string; isValidated: boolean }[];
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function isValidationFresh(validation?: { valid?: boolean; last_valid?: number; error?: string } | null): boolean {
  if (validation?.valid !== true) return false;
  if (!validation.last_valid) return true;
  const cutoff = Date.now() - THIRTY_DAYS_MS;
  const lastValidMs = validation.last_valid > 1e12 ? validation.last_valid : validation.last_valid * 1000;
  return lastValidMs >= cutoff;
}

export function deduplicateAuthApps(apps: AuthAppEntry[]): DeduplicatedApp[] {
  const appMap = new Map<string, DeduplicatedApp>();

  apps.forEach(auth => {
    if (!auth.app?.name) return;
    if (!auth.active && !isValidationFresh(auth.validation)) return;
    const normalizedName = auth.app.name.toLowerCase().trim().replace(/[\s_\-]+/g, '_');
    const existing = appMap.get(normalizedName);
    const isValidated = isValidationFresh(auth.validation);
    const entryImage = auth.app.large_image || '';
    const instance = {
      label: auth.label || auth.id || 'Default',
      isValidated,
    };

    if (!existing) {
      appMap.set(normalizedName, {
        app: auth.app,
        hasValidAuth: isValidated,
        bestImage: entryImage,
        instances: [instance],
      });
    } else {
      existing.instances.push(instance);
      if (isValidated) existing.hasValidAuth = true;
      if (!existing.bestImage && entryImage) existing.bestImage = entryImage;
      if (isValidated && !existing.app.large_image && entryImage) {
        existing.app = { ...existing.app, large_image: entryImage };
      }
    }
  });

  return Array.from(appMap.values());
}

const _imageCache = new Map<string, string>();
const _pendingLookups = new Map<string, Promise<string | null>>();
const _normalize = (n: string) => n.toLowerCase().replace(/[\s_\-]+/g, '_');

export function seedImageCache(appName: string, imageUrl: string) {
  if (appName && imageUrl) _imageCache.set(_normalize(appName), imageUrl);
}

export async function backfillAppImages(dedupedApps: DeduplicatedApp[]): Promise<DeduplicatedApp[]> {
  for (const d of dedupedApps) {
    const norm = _normalize(d.app.name);
    const existingImg = d.bestImage || d.app.large_image;
    if (existingImg) {
      _imageCache.set(norm, existingImg);
    } else if (_imageCache.has(norm)) {
      d.bestImage = _imageCache.get(norm)!;
      d.app = { ...d.app, large_image: d.bestImage };
    }
  }

  let missing = dedupedApps.filter(d => !d.bestImage && !d.app.large_image);
  if (missing.length === 0) return dedupedApps;

  // 1) Fallback to the user's /api/v1/apps list (already cached, no rate
  //    limits). This must run BEFORE Algolia so we keep working when the
  //    public Algolia index is rate-limited (429).
  try {
    const { fetchAppsViaApiConfig } = await import('@/Shuffle-MCPs/appsCache');
    const apps = await fetchAppsViaApiConfig().catch(() => []);
    if (Array.isArray(apps) && apps.length > 0) {
      const byName = new Map<string, string>();
      for (const a of apps) {
        const url = a?.large_image || a?.image_url;
        if (!url) continue;
        const n = _normalize(a?.name || '');
        if (n && !byName.has(n)) byName.set(n, url);
      }
      for (const entry of missing) {
        const url = byName.get(_normalize(entry.app.name));
        if (url) {
          entry.bestImage = url;
          entry.app = { ...entry.app, large_image: url };
          _imageCache.set(_normalize(entry.app.name), url);
        }
      }
      missing = dedupedApps.filter(d => !d.bestImage && !d.app.large_image);
    }
  } catch {
    // ignore
  }

  if (missing.length === 0) return dedupedApps;

  // 2) Last resort: public Algolia catalog. May 429 — handled silently.
  try {
    const { algoliasearch } = await import('algoliasearch');
    const client = algoliasearch('JNSS5CFDZZ', '33e4e3564f4f060e96e0531957bed552');

    await Promise.all(missing.map(async (entry) => {
      const norm = _normalize(entry.app.name);
      if (!_pendingLookups.has(norm)) {
        _pendingLookups.set(norm, (async () => {
          try {
            const result = await client.searchSingleIndex({
              indexName: 'appsearch',
              searchParams: { query: entry.app.name, hitsPerPage: 3 },
            });
            const match = (result.hits as any[]).find(
              h => _normalize(h.name || '') === norm
            );
            const url = match?.image_url || null;
            if (url) _imageCache.set(norm, url);
            return url;
          } catch {
            return null;
          } finally {
            _pendingLookups.delete(norm);
          }
        })());
      }
      const url = await _pendingLookups.get(norm);
      if (url) {
        entry.bestImage = url;
        entry.app = { ...entry.app, large_image: url };
      }
    }));
  } catch {
    // ignore
  }

  return dedupedApps;
}

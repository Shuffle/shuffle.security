/**
 * AppFallbackIcon — lightweight, list-friendly app icon with graceful fallback.
 *
 * Resolution order:
 *  1. The provided `imageUrl` (if any). If it loads, we use it.
 *  2. If it 404s OR is empty, look up the app by name in the Algolia
 *     `appsearch` index (module-level cache so 100 list items only fire
 *     one search per unique name).
 *  3. If Algolia has no match, render a colored letter avatar derived
 *     from the app name.
 *
 * Designed to drop into <ShuffleMCP />'s grid items where the previous
 * code only rendered an <img> when `image_url` was non-empty (causing
 * blank tiles for private/custom apps without uploaded icons).
 */

import { useEffect, useRef, useState, CSSProperties } from 'react';
import { isNoAuthApp, getBuiltInAppImage } from '@/Shuffle-MCPs/noAuthApps';

const norm = (s: string) => s.toLowerCase().replace(/[\s_\-]+/g, '_');

// ---------------------------------------------------------------------------
// Persistent app-icon URL cache (localStorage)
// ---------------------------------------------------------------------------
// We resolve image_url -> name once (via Algolia) and persist the mapping so
// reloads do not have to round-trip the network just to render an app icon.
// Cache is namespaced + versioned so we can invalidate it cleanly later.
const STORAGE_KEY = 'shuffle:app-icon-cache:v1';
const STORAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface PersistedEntry { url: string; ts: number; }
type PersistedMap = Record<string, PersistedEntry>;

const readPersisted = (): PersistedMap => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch {
    return {};
  }
};

const writePersisted = (key: string, url: string) => {
  if (typeof window === 'undefined' || !url) return;
  try {
    const map = readPersisted();
    map[key] = { url, ts: Date.now() };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* quota / privacy mode — fail silently */
  }
};

const readPersistedFresh = (key: string): string | null => {
  const entry = readPersisted()[key];
  if (!entry) return null;
  if (Date.now() - entry.ts > STORAGE_TTL_MS) return null;
  return entry.url || null;
};

// Module-level memo so every grid item shares the same in-flight cache.
const lookupCache = new Map<string, Promise<string>>();

const lookupImageByName = (name: string): Promise<string> => {
  const key = norm(name);
  if (!key) return Promise.resolve('');
  if (isNoAuthApp(key) || isNoAuthApp(name)) {
    const builtInImg = getBuiltInAppImage(key) || getBuiltInAppImage(name);
    if (builtInImg) return Promise.resolve(builtInImg);
  }
  const hit = lookupCache.get(key);
  if (hit) return hit;

  // localStorage hit -> resolve synchronously without hitting Algolia.
  const persisted = readPersistedFresh(key);
  if (persisted) {
    const p = Promise.resolve(persisted);
    lookupCache.set(key, p);
    return p;
  }

  const promise = (async () => {
    try {
      const { algoliasearch } = await import('algoliasearch');
      const client = algoliasearch('JNSS5CFDZZ', '33e4e3564f4f060e96e0531957bed552');
      const res = await client.search({
        requests: [{ indexName: 'appsearch', query: name.replace(/_/g, ' '), hitsPerPage: 5 }],
      });
      const hits = ((res as any)?.results?.[0]?.hits || []) as any[];
      const match = hits.find((h) => h.name && norm(h.name) === key) || hits[0];
      const url = (match?.image_url as string) || '';
      if (url) writePersisted(key, url);
      return url;
    } catch {
      return '';
    }
  })();

  lookupCache.set(key, promise);
  return promise;
};

/** Eagerly persist a known-good app image URL (e.g. when /api/v1/apps already
 *  returned image_url). Lets later renders skip the Algolia round-trip. */
export const rememberAppImage = (name: string, url: string) => {
  if (!name || !url) return;
  writePersisted(norm(name), url);
};

const resolveInitialSrc = (imageUrl?: string, name?: string): string => {
  if (imageUrl) return imageUrl;
  const key = norm(name || '');
  if (!key) return '';
  if (isNoAuthApp(key) || isNoAuthApp(name || '')) {
    const builtInImg = getBuiltInAppImage(key) || getBuiltInAppImage(name || '');
    if (builtInImg) return builtInImg;
  }
  return readPersistedFresh(key) || '';
};

// Stable, accessible color from a string (HSL hue 0-360).
const colorFromName = (name: string): string => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}, 55%, 45%)`;
};

interface AppFallbackIconProps {
  name: string;
  imageUrl?: string;
  size?: number;
  style?: CSSProperties;
  className?: string;
  alt?: string;
}

export const AppFallbackIcon = ({
  name,
  imageUrl,
  size = 28,
  style,
  className,
  alt,
}: AppFallbackIconProps) => {
  // Initial src: prop > built-in image > persisted-localStorage hit > empty (will lookup).
  const [src, setSrc] = useState<string>(() => resolveInitialSrc(imageUrl, name));
  const [errored, setErrored] = useState(false);
  const lookedUpRef = useRef(false);

  // Remember a working caller-provided URL so future reloads skip the network.
  useEffect(() => {
    if (imageUrl && name) writePersisted(norm(name), imageUrl);
  }, [imageUrl, name]);

  // Reset when props change
  useEffect(() => {
    setSrc(resolveInitialSrc(imageUrl, name));
    setErrored(false);
    lookedUpRef.current = false;
  }, [imageUrl, name]);

  // Trigger lookup when we have no imageUrl OR after the provided one errored.
  useEffect(() => {
    if (lookedUpRef.current) return;
    if (src) return;
    if (!name) return;
    lookedUpRef.current = true;
    lookupImageByName(name).then((found) => {
      if (found) {
        setSrc(found);
        setErrored(false);
      }
    });
  }, [src, name]);

  const baseStyle: CSSProperties = {
    width: size,
    height: size,
    borderRadius: 6,
    flexShrink: 0,
    objectFit: 'contain',
    ...style,
  };

  if (src && !errored) {
    return (
      <img
        src={src}
        alt={alt || name}
        className={className}
        style={baseStyle}
        onError={() => {
          // Fall through to letter avatar; the lookup effect will also
          // try once if we have not already looked up.
          setErrored(true);
          setSrc('');
        }}
      />
    );
  }

  // Letter avatar fallback
  const display = (name || '?').trim();
  const letter = (display.replace(/[^a-z0-9]/i, '').charAt(0) || '?').toUpperCase();
  return (
    <div
      className={className}
      style={{
        ...baseStyle,
        background: colorFromName(display || '?'),
        color: '#fff',
        fontSize: Math.round(size * 0.5),
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textTransform: 'uppercase',
        letterSpacing: 0,
      }}
      aria-label={alt || display}
    >
      {letter}
    </div>
  );
};

export default AppFallbackIcon;

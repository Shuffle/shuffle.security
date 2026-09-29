import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { algoliasearch } from 'algoliasearch';
import { getApiUrl, getAuthHeader } from '@/Shuffle-Core/api';
import { resolveDocName, fetchDocsList, docSlug } from '@/components/docs/remoteDocs';
import { extractHeadings, stripInContentToc, extractDocTitleAndBody, type TocHeading } from './tocUtils';

export interface Contributor {
  name?: string;
  url?: string;
  image?: string;
}

export interface RemoteDocMeta {
  name?: string;
  contributors?: Contributor[];
  read_time?: number;
  edited?: string;
  link?: string;
}

export interface DocSuggestion {
  path: string;
  label: string;
  snippet?: string;
}

interface DocsHit {
  title?: string;
  filename?: string;
  data?: string;
  urlpath?: string;
}

const docsSearchClient = algoliasearch('JNSS5CFDZZ', '33e4e3564f4f060e96e0531957bed552');

const isMissingDocBody = (markdown: string) => {
  const trimmed = markdown.trim();
  if (trimmed.length > 200) return false;
  return /^(404\s*:?\s*not\s*found|not\s*found|400\s*:\s*.*|no\s*such\s*file.*)$/i.test(trimmed);
};

const docsQuery = (folder?: string, resetCache = false) => {
  const params = new URLSearchParams();
  if (folder) params.set('folder', folder);
  if (resetCache) params.set('resetCache', 'true');
  const query = params.toString();
  return query ? `?${query}` : '';
};

const docContentCache = new Map<string, { markdown: string; meta: RemoteDocMeta | null }>();
const docContentInflight = new Map<string, Promise<{ markdown: string; meta: RemoteDocMeta | null } | null>>();

export const fetchRemoteDoc = async (
  slug: string,
  resetCache = false,
  folder?: string,
  signal?: AbortSignal,
): Promise<{ markdown: string; meta: RemoteDocMeta | null } | null> => {
  const cleanSlug = (slug || '').toLowerCase().replace(/_+/g, '-');
  const cacheKey = `${folder || 'docs'}:${cleanSlug}`;

  if (resetCache) {
    docContentCache.delete(cacheKey);
    docContentInflight.delete(cacheKey);
  } else {
    const cached = docContentCache.get(cacheKey);
    if (cached) return cached;
    const inflight = docContentInflight.get(cacheKey);
    if (inflight) return inflight;
  }

  const run = (async () => {
    try {
      const exact = await resolveDocName(cleanSlug, resetCache, folder, signal);
      if (signal?.aborted) return null;
      const candidates = Array.from(
        new Set([exact, cleanSlug, slug, slug.replace(/-/g, '_')].filter(Boolean) as string[]),
      );
      for (const name of candidates) {
        if (signal?.aborted) return null;
        try {
          const res = await fetch(
            getApiUrl(`/api/v1/docs/${encodeURIComponent(name)}${docsQuery(folder, resetCache)}`),
            {
              credentials: 'include',
              headers: { ...getAuthHeader() },
              signal,
            },
          );
          if (!res.ok) continue;
          const data = await res.json();
          if (signal?.aborted) return null;
          if (data?.success && typeof data.reason === 'string' && data.reason.trim().length > 0) {
            if (isMissingDocBody(data.reason)) continue;
            const result = { markdown: data.reason, meta: (data.meta as RemoteDocMeta) ?? null };
            docContentCache.set(cacheKey, result);
            if (exact && exact.toLowerCase() !== cleanSlug) {
              docContentCache.set(`${folder || 'docs'}:${exact.toLowerCase()}`, result);
            }
            return result;
          }
        } catch (err: any) {
          if (err?.name === 'AbortError' || signal?.aborted) {
            return null;
          }
          // Try next candidate
        }
      }
      return null;
    } finally {
      docContentInflight.delete(cacheKey);
    }
  })();

  docContentInflight.set(cacheKey, run);
  return run;
};

export interface UseDocContentOptions {
  slug: string;
  folder?: string;
  basePath?: string;
  initialContent?: string | null;
  initialMeta?: RemoteDocMeta | null;
}

export interface UseDocContentResult {
  title: string | null;
  content: string;
  meta: RemoteDocMeta | null;
  headings: TocHeading[];
  loading: boolean;
  resetting: boolean;
  error: string | null;
  suggestions: DocSuggestion[];
  suggestLoading: boolean;
  handleResetCache: () => Promise<void>;
  reload: () => Promise<void>;
}

export const useDocContent = ({
  slug,
  folder,
  basePath = '/docs',
  initialContent = null,
  initialMeta = null,
}: UseDocContentOptions): UseDocContentResult => {
  // Clean and extract title from initial SSR markdown if provided
  const initialProcessed = useMemo(() => {
    if (!initialContent) return { title: null, content: '' };
    const stripped = stripInContentToc(initialContent);
    return extractDocTitleAndBody(stripped);
  }, [initialContent]);

  const [title, setTitle] = useState<string | null>(initialProcessed.title);
  const [content, setContent] = useState<string>(initialProcessed.content);
  const [meta, setMeta] = useState<RemoteDocMeta | null>(initialMeta);
  const [loading, setLoading] = useState(!initialContent);
  const ssrSlugRef = useRef<string | null>(initialContent ? slug : null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeSlugRef = useRef<string>(slug);
  const requestIdRef = useRef<number>(0);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<DocSuggestion[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);

  // Synchronously compute headings from content
  const headings = useMemo(() => {
    return extractHeadings(content);
  }, [content]);

  const loadContent = useCallback(
    async (resetCache = false) => {
      // Abort previous in-flight request
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const currentRequestId = ++requestIdRef.current;
      activeSlugRef.current = slug;

      ssrSlugRef.current = null;
      setLoading(true);
      setError(null);
      setMeta(null);

      try {
        let target = slug;
        if (slug === 'index' || !slug) {
          const list = await fetchDocsList(resetCache, folder, controller.signal);
          if (controller.signal.aborted || currentRequestId !== requestIdRef.current) return;

          const preferred =
            list.find((d) => docSlug(d.name) === 'index') ??
            list.find((d) => docSlug(d.name) === 'getting-started') ??
            list[0];
          if (preferred) target = docSlug(preferred.name);
        }

        let remote = await fetchRemoteDoc(target, resetCache, folder, controller.signal);
        if (controller.signal.aborted || currentRequestId !== requestIdRef.current) return;

        // If direct fetch didn't find the doc, consult docs list for fallback/redirects
        if (!remote && slug !== 'index') {
          const list = await fetchDocsList(resetCache, folder, controller.signal);
          if (controller.signal.aborted || currentRequestId !== requestIdRef.current) return;
          const match = list.find((d) => docSlug(d.name) === slug.toLowerCase());
          if (match && match.name !== target) {
            remote = await fetchRemoteDoc(match.name, resetCache, folder, controller.signal);
            if (controller.signal.aborted || currentRequestId !== requestIdRef.current) return;
          }
        }

        if (remote) {
          const stripped = stripInContentToc(remote.markdown);
          const { title: extractedTitle, content: bodyContent } = extractDocTitleAndBody(stripped);
          setTitle(extractedTitle);
          setContent(bodyContent);

          let finalMeta = remote.meta;
          if (!finalMeta?.contributors?.length || !finalMeta?.link) {
            try {
              const list = await fetchDocsList(false, folder, controller.signal);
              const match = list.find(
                (d) => docSlug(d.name) === target.toLowerCase() || docSlug(d.name) === slug.toLowerCase(),
              );
              if (match) {
                finalMeta = {
                  ...match,
                  ...finalMeta,
                  contributors: finalMeta?.contributors?.length ? finalMeta.contributors : match.contributors,
                  link: finalMeta?.link || match.link,
                };
              }
            } catch {
              // ignore
            }
          }
          setMeta(finalMeta);
        } else {
          setTitle(null);
          setContent('');
          setError(`Documentation not found: ${slug}`);
        }
      } catch (err: any) {
        if (err?.name === 'AbortError' || controller.signal.aborted) {
          return;
        }
        setTitle(null);
        setContent('');
        setError(`Failed to load documentation: ${err?.message || slug}`);
      } finally {
        if (!controller.signal.aborted && currentRequestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [slug, folder],
  );

  useEffect(() => {
    if (ssrSlugRef.current === slug) return;
    // When switching to a new doc page, immediately clear stale content
    setTitle(null);
    setContent('');
    setMeta(null);
    loadContent();
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [loadContent, slug]);

  useEffect(() => {
    if (initialContent) {
      const cleanSlug = (slug || '').toLowerCase().replace(/_+/g, '-');
      const cacheKey = `${folder || 'docs'}:${cleanSlug}`;
      if (!docContentCache.has(cacheKey)) {
        docContentCache.set(cacheKey, { markdown: initialContent, meta: initialMeta });
      }
    }
  }, [initialContent, initialMeta, slug, folder]);

  // Algolia fallback suggestions when doc 404s
  useEffect(() => {
    if (!error) {
      setSuggestions([]);
      setSuggestLoading(false);
      return;
    }
    let cancelled = false;
    setSuggestLoading(true);
    (async () => {
      try {
        const res = await docsSearchClient.searchSingleIndex({
          indexName: 'documentation',
          searchParams: {
            query: slug.replace(/[-_]+/g, ' '),
            hitsPerPage: 8,
            attributesToRetrieve: ['title', 'filename', 'data', 'urlpath'],
          },
        });
        const seen = new Set<string>();
        const items: DocSuggestion[] = [];
        for (const raw of res.hits as unknown as DocsHit[]) {
          const rawPath = typeof raw.urlpath === 'string' ? raw.urlpath.trim() : '';
          const filename = (raw.filename || '').replace(/\.md$/i, '');
          const pathWithoutHash = rawPath.split('#')[0];
          const docSlugValue = pathWithoutHash.startsWith('/docs/')
            ? pathWithoutHash.slice('/docs/'.length).replace(/^\/+|\/+$/g, '')
            : pathWithoutHash.startsWith('/articles/')
            ? pathWithoutHash.slice('/articles/'.length).replace(/^\/+|\/+$/g, '')
            : pathWithoutHash.startsWith('/legal/')
            ? pathWithoutHash.slice('/legal/'.length).replace(/^\/+|\/+$/g, '')
            : filename.replace(/[_\s]+/g, '-').toLowerCase();
          if (!docSlugValue || seen.has(docSlugValue)) continue;
          seen.add(docSlugValue);
          const isKnownDocRoute = rawPath.startsWith('/docs/') || rawPath.startsWith('/articles/') || rawPath.startsWith('/legal/');
          items.push({
            path: isKnownDocRoute ? rawPath : rawPath.startsWith('/') ? rawPath : `/docs/${docSlugValue}`,
            label:
              raw.title?.trim() ||
              (filename || docSlugValue).replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
            snippet: (raw.data || '').replace(/\s+/g, ' ').trim().slice(0, 160),
          });
          if (items.length >= 3) break;
        }
        let final = items;
        if (final.length === 0) {
          const list = await fetchDocsList(false, folder);
          const query = slug.replace(/[-_]+/g, ' ').toLowerCase();
          const scored = list
            .map((d) => {
              const label = d.name.replace(/[_-]+/g, ' ');
              const lower = label.toLowerCase();
              const score = lower.includes(query) || query.includes(lower) ? 2 : 0;
              return { d, label, score };
            })
            .sort((a, b) => b.score - a.score)
            .slice(0, 3);
          final = scored.map(({ d, label }) => ({ path: `${basePath}/${docSlug(d.name)}`, label }));
        }
        if (!cancelled) setSuggestions(final);
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setSuggestLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [error, slug, folder, basePath]);

  const handleResetCache = useCallback(async () => {
    setResetting(true);
    docContentCache.clear();
    docContentInflight.clear();
    try {
      await loadContent(true);
    } finally {
      setResetting(false);
    }
  }, [loadContent]);

  return {
    title,
    content,
    meta,
    headings,
    loading,
    resetting,
    error,
    suggestions,
    suggestLoading,
    handleResetCache,
    reload: loadContent,
  };
};

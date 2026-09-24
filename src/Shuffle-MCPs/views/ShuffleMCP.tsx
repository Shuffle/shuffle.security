/**
 * Local Singul Library - React Component
 * This is a local copy for development. Changes here should be merged back to:
 * https://github.com/Shuffle/singul.js
 */

import React, { useState, useEffect, useRef, useCallback, useMemo, useImperativeHandle } from 'react';
import { algoliasearch, SearchClient } from 'algoliasearch';
import { Tooltip } from '@mui/material';
import type { AlgoliaSearchApp, AppSelectedEvent, ShuffleMCPProps, AppAuthentication } from '@/Shuffle-MCPs/shuffle-mcp.helpers';
import AppDetailDrawer from '@/Shuffle-MCPs/views/AppDetailDrawer';
import '../shuffle-mcp.css';
import { fetchApps } from '@/Shuffle-MCPs/appsCache';
import { AppFallbackIcon } from '@/Shuffle-MCPs/components/AppFallbackIcon';
import { SegmentedControl } from '@/Shuffle-MCPs/components/SegmentedControl';
import { useSyncHostBaseUrl } from '@/Shuffle-MCPs/useSyncHostBaseUrl';
import { isValidationFresh } from '@/Shuffle-MCPs/auth-utils';

const DEFAULT_ALGOLIA_APP_ID = 'JNSS5CFDZZ';
const DEFAULT_ALGOLIA_API_KEY = '33e4e3564f4f060e96e0531957bed552';
const DEFAULT_ALGOLIA_INDEX = 'appsearch';
const EMPTY_SELECTED_APPS: AlgoliaSearchApp[] = [];
// Hard ceiling on public Algolia results so infinite scroll does not load
// the entire catalog. We surface a CTA to narrow the search or create a new app.
const MAX_RESULTS = 250;

// Skeleton row(s) rendered at the bottom of an infinite-scrolling result list
// while the next page is being fetched from Algolia.
const InfiniteScrollSkeleton: React.FC<{ layout: 'list' | 'grid'; gridColumns: number }> = ({ layout, gridColumns }) => {
  const count = layout === 'grid' ? Math.max(3, gridColumns) : 3;
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={`skel-${i}`}
          className="singul-dropdown-item"
          aria-hidden="true"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 14px',
            opacity: 0.6,
            pointerEvents: 'none',
          }}
        >
          <div style={{
            width: 28, height: 28, borderRadius: 6,
            background: 'hsl(var(--muted) / 0.5)',
            animation: 'singul-skeleton-pulse 1.2s ease-in-out infinite',
          }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{
              width: '55%', height: 10, borderRadius: 4,
              background: 'hsl(var(--muted) / 0.5)',
              animation: 'singul-skeleton-pulse 1.2s ease-in-out infinite',
            }} />
            <div style={{
              width: '35%', height: 8, borderRadius: 4,
              background: 'hsl(var(--muted) / 0.35)',
              animation: 'singul-skeleton-pulse 1.2s ease-in-out infinite',
            }} />
          </div>
        </div>
      ))}
    </>
  );
};

// Consistent error state for search failures. Centered and always points users
// to the support contact form when the catalog is throttled.
const SearchErrorMessage: React.FC<{ rateLimited: boolean; message: string }> = ({ rateLimited, message }) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        alignItems: 'center',
        textAlign: 'center',
        width: '100%',
        padding: '8px 12px',
        color: rateLimited ? 'hsl(var(--severity-medium))' : 'hsl(var(--destructive))',
      }}
    >
      <strong style={{ fontSize: 13 }}>
        {rateLimited ? 'Algolia rate limit reached (429)' : 'Search unavailable'}
      </strong>
      <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', lineHeight: 1.4 }}>
        {message}
      </span>
      <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', lineHeight: 1.4 }}>
        Need help sooner? Reach out on{' '}
        <a
          href="https://shuffler.io/contact"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'hsl(var(--primary))', textDecoration: 'underline' }}
        >
          shuffler.io/contact
        </a>
        .
      </span>
    </div>
  );
};


export interface ShuffleMCPHandle {
  search: (query: string) => void;
  clear: () => void;
  focus: (selectAll?: boolean) => void;
}


export const ShuffleMCP = React.forwardRef<ShuffleMCPHandle, ShuffleMCPProps>(({
  authToken,
  orgId,
  placeholder = 'Search apps...',
  layout = 'list',
  gridColumns = 3,
  showDescription = false,
  showCategories = false,
  showCheckbox = false,
  multiSelect = false,
  selectedApps = EMPTY_SELECTED_APPS,
  disableAutoSelectValidatedApps = false,
  preventDefault = false,
  inline = false,
  initialQuery = '',
  initialFilterQuery,
  hitsPerPage = 20,
  apiKey,
  apiBaseUrl = 'https://uk.shuffle.security',
  authPath = '/api/v1/apps/authentication',
  appAuthPath = '/appauth',
  privateAppsPath = '/api/v1/apps',
  disablePrivateApps = false,
  showSourceFilter = true,
  singulBaseUrl = 'https://singul.io',
  hideAuthStatus = false,
  authenticatedApps: externalAuthenticatedApps,
  pinnedApps,
  algoliaAppId = DEFAULT_ALGOLIA_APP_ID,
  algoliaApiKey = DEFAULT_ALGOLIA_API_KEY,
  algoliaIndexName = DEFAULT_ALGOLIA_INDEX,
  customStyles = {},
  className = '',
  renderItem,
  renderEmptyState,
  renderLoadingState,
  renderEndOfResults,
  renderInputEndAdornment,
  onAppSelected,
  onSelectionChange,
  onSearchChange,
  onCreateNewApp,
  globalUrl,
}, ref) => {
  // Forward host-injected globalUrl into the runtime so all internal fetches
  // honor the host backend.
  useSyncHostBaseUrl(globalUrl);
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<AlgoliaSearchApp[]>([]);
  const [privateApps, setPrivateApps] = useState<AlgoliaSearchApp[]>([]);
  const [privateAppsLoading, setPrivateAppsLoading] = useState<boolean>(!disablePrivateApps);
  const [sourceFilter, setSourceFilter] = useState<'all' | 'public' | 'private' | 'authenticated'>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [searchError, setSearchError] = useState<{ rateLimited: boolean; message: string } | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [internalSelectedApps, setInternalSelectedApps] = useState<AlgoliaSearchApp[]>(selectedApps);

  useEffect(() => {
    if (selectedApps) {
      setInternalSelectedApps(selectedApps);
    }
  }, [selectedApps]);

  const [authenticatedApps, setAuthenticatedApps] = useState<AppAuthentication[]>(externalAuthenticatedApps || []);
  const [authenticatedAppsLoading, setAuthenticatedAppsLoading] = useState<boolean>(!externalAuthenticatedApps);
  const [drawerApp, setDrawerApp] = useState<AlgoliaSearchApp | null>(null);
  // First paint guard: keep a skeleton on screen until the first Algolia
  // search AND the private-app fetch have both resolved, so the list is only
  // revealed once selected apps are known and sorted. Without this the list
  // pops in, then visibly reshuffles when selections/private apps arrive.
  const [initialSettled, setInitialSettled] = useState(false);
  const firstSearchDoneRef = useRef(false);

  const hasInitialized = useRef(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const resultsScrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchClient = useRef<SearchClient | null>(null);
  const activeQueryRef = useRef<string>('');
  // Snapshot the selection at mount so the result list order stays static
  // while the user toggles tools in the drawer. Only the initial selection
  // is used to float already-chosen apps to the top.
  const initialSelectedAppsRef = useRef<AlgoliaSearchApp[]>(selectedApps);

  // Fetch authenticated apps when apiKey is provided
  const fetchAuthenticatedApps = useCallback(async () => {
    if (!apiKey) {
      setAuthenticatedAppsLoading(false);
      return;
    }
    setAuthenticatedAppsLoading(true);
    try {
      const response = await fetch(`${apiBaseUrl}${authPath}`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          ...(orgId ? { 'Org-Id': orgId } : {}),
        },
      });
      if (response.ok) {
        const result = await response.json();
        const authData = result.data || result;
        if (Array.isArray(authData)) {
          setAuthenticatedApps(authData);
        }
      }
    } catch (error) {
      console.error('Failed to fetch authenticated apps:', error);
    } finally {
      setAuthenticatedAppsLoading(false);
    }
  }, [apiKey, apiBaseUrl, authPath, orgId]);

  useEffect(() => {
    fetchAuthenticatedApps();
  }, [fetchAuthenticatedApps]);


  // Fetch the user's private apps from /api/v1/apps when apiKey is provided.
  // These get merged into search results so users can find their own apps too.
  useEffect(() => {
    if (disablePrivateApps) {
      setPrivateApps([]);
      setPrivateAppsLoading(false);
      return;
    }
    const fetchPrivateApps = async () => {
      setPrivateAppsLoading(true);
      try {
        const apps = await fetchApps({
          baseUrl: apiBaseUrl,
          path: privateAppsPath,
          apiKey: apiKey || null,
          orgId: orgId || null,
        });
        // Normalize to AlgoliaSearchApp shape, tagged as 'private' source.
        const normalized: AlgoliaSearchApp[] = apps.map((a: any) => ({
          name: a.name || '',
          description: a.description || '',
          objectID: a.id || a.objectID || `private-${a.name}`,
          creator: a.owner || a.creator || '',
          app_version: a.app_version || '1.0.0',
          image_url: a.large_image || a.image_url || '',
          time_edited: a.edited || 0,
          generated: !!a.generated,
          invalid: !!a.invalid,
          priority: a.priority || 0,
          actions: Array.isArray(a.actions) ? a.actions.length : (a.actions || 0),
          tags: a.tags || [],
          accessible_by: a.accessible_by || [],
          categories: a.categories || [],
          action_labels: a.action_labels || [],
          triggers: a.triggers || [],
          verified: !!a.verified,
          source: 'private',
        }));
        setPrivateApps(normalized);
      } catch (error) {
        console.error('Failed to fetch private apps:', error);
      } finally {
        setPrivateAppsLoading(false);
      }
    };
    fetchPrivateApps();
  }, [apiKey, apiBaseUrl, privateAppsPath, disablePrivateApps, orgId]);


  // Auto-select validated apps when they're loaded (validated = tests ran successfully)
  useEffect(() => {
    if (disableAutoSelectValidatedApps) return;
    if (authenticatedApps.length > 0 && results.length > 0) {
      const validatedApps = authenticatedApps.filter(auth => auth.validation?.valid);
      const appsToAutoSelect = results.filter(app => 
        validatedApps.some(auth => auth.app.name.toLowerCase() === app.name.toLowerCase())
      );
      
      if (appsToAutoSelect.length > 0) {
        const newSelection = [...internalSelectedApps];
        appsToAutoSelect.forEach(app => {
          if (!newSelection.some(a => a.objectID === app.objectID)) {
            newSelection.push(app);
          }
        });
        if (newSelection.length !== internalSelectedApps.length) {
          setInternalSelectedApps(newSelection);
          onSelectionChange?.(newSelection);
        }
      }
    }
  }, [authenticatedApps, results, disableAutoSelectValidatedApps]);

  // Sync external authenticatedApps
  useEffect(() => {
    if (externalAuthenticatedApps) {
      setAuthenticatedApps(externalAuthenticatedApps);
      setAuthenticatedAppsLoading(false);
    }
  }, [externalAuthenticatedApps]);


  // Initialize Algolia client and run initial search
  useEffect(() => {
    searchClient.current = algoliasearch(algoliaAppId, algoliaApiKey);
    
    // Run initial search after client is ready
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      const searchTerm = initialQuery || initialFilterQuery || '';
      setTimeout(() => {
        if (searchClient.current) {
          performSearch(searchTerm);
          onSearchChange?.(initialQuery); // Only report the visible query
        }
      }, 100);
    }
  }, []);

  // Sync external selectedApps
  useEffect(() => {
    setInternalSelectedApps(selectedApps);
  }, [selectedApps]);

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSelectedIndex(-1);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const norm = useCallback((s?: string) => (s || '').toLowerCase().trim().replace(/[\s_\-]+/g, ''), []);

  // Helper to test if a raw auth entry from the API has valid, fresh validation
  const isAuthEntryValidated = useCallback((auth: any) => {
    if (!auth) return false;
    if (auth.active === false) return false;
    const v = auth.validation;
    if (!v || v.valid !== true) return false;
    return isValidationFresh(v);
  }, []);

  // Helper to match an auth entry to an AlgoliaSearchApp
  const authMatchesApp = useCallback((auth: any, app: AlgoliaSearchApp) => {
    if (!auth || !app) return false;
    // Direct matches if synthesized or mapped from an auth entry
    if ((app as any).authId && (app as any).authId === auth.id) return true;
    if ((app as any).authEntry && (app as any).authEntry.id === auth.id) return true;
    if (auth.id && app.objectID === auth.id) return true;

    // App ID match
    const authAppId = auth.app?.id || auth.app_id;
    if (authAppId && (app.objectID === authAppId || (app as any).id === authAppId)) return true;

    // Normalized name matching
    const targetName = norm(app.name);
    if (!targetName) return false;

    const authAppName = norm(auth.app?.name);
    if (authAppName && authAppName === targetName) return true;

    const topAuthName = norm(auth.name || auth.app_name);
    if (topAuthName && topAuthName === targetName) return true;

    return false;
  }, [norm]);

  // Check if an app is configured (found in authentication API)
  const isAppConfigured = useCallback((app: AlgoliaSearchApp) => {
    if ((app as any).authEntry) return true;
    return authenticatedApps.some(auth => authMatchesApp(auth, app));
  }, [authenticatedApps, authMatchesApp]);

  // Check if an app is validated/tested ("Verified")
  const isAppValidated = useCallback((app: AlgoliaSearchApp) => {
    if ((app as any).authEntry) {
      return isAuthEntryValidated((app as any).authEntry);
    }
    return authenticatedApps.some(auth => authMatchesApp(auth, app) && isAuthEntryValidated(auth));
  }, [authenticatedApps, authMatchesApp, isAuthEntryValidated]);

  // Get auth state for an app
  const getAppAuthState = useCallback((app: AlgoliaSearchApp) => {
    return {
      configured: isAppConfigured(app),
      validated: isAppValidated(app),
    };
  }, [isAppConfigured, isAppValidated]);

  // Perform search (page 0 = new query, page > 0 = append for infinite scroll)
  const performSearch = useCallback(async (searchQuery: string, pageIndex: number = 0) => {
    if (!searchClient.current) {
      return;
    }

    const isAppend = pageIndex > 0;
    // Hard stop: never load more than MAX_RESULTS public Algolia hits.
    if (isAppend && results.length >= MAX_RESULTS) {
      setHasMore(false);
      return;
    }

    if (isAppend) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
      activeQueryRef.current = searchQuery;
    }

    try {
      const searchResult = await searchClient.current.searchSingleIndex({
        indexName: algoliaIndexName,
        searchParams: {
          query: searchQuery || '', // Empty string gets top results
          hitsPerPage,
          page: pageIndex,
        },
      });

      // Ignore stale responses if the query changed while this was in flight
      if (activeQueryRef.current !== searchQuery) return;

      const hits = (searchResult.hits as AlgoliaSearchApp[]).map(h => ({ ...h, source: 'public' as const }));
      const totalPages = (searchResult as any).nbPages ?? 1;
      const nextResults = isAppend ? [...results, ...hits] : hits;
      const cappedResults = nextResults.slice(0, MAX_RESULTS);
      setHasMore(pageIndex + 1 < totalPages && cappedResults.length < MAX_RESULTS);
      setPage(pageIndex);
      setResults(cappedResults);
      setSearchError(null);
      // Open dropdown if we got Algolia hits OR we have private apps to show
      if (!isAppend) {
        setIsOpen(hits.length > 0 || privateApps.length > 0);
        setSelectedIndex(-1);
      }
    } catch (error: any) {
      // Algolia rate-limit (429) or network error: don't blank out the dropdown
      // if we still have private apps to show from /api/v1/apps.
      console.error('Search failed:', error);
      const status: number | undefined = error?.status ?? error?.statusCode ?? error?.response?.status;
      const rawMessage: string = String(error?.message || error?.name || '');
      const rateLimited = status === 429 || /429|rate.?limit|too many requests/i.test(rawMessage);
      setSearchError({
        rateLimited,
        message: rateLimited
          ? 'Search is temporarily rate limited by Algolia. Please wait a moment and try again.'
          : 'Search is temporarily unavailable. Please try again in a moment.',
      });
      if (!isAppend) {
        setResults([]);
        setIsOpen(privateApps.length > 0);
      }
      setHasMore(false);
    } finally {
      if (isAppend) setIsLoadingMore(false);
      else {
        firstSearchDoneRef.current = true;
        setIsLoading(false);
      }
    }
  }, [hitsPerPage, algoliaIndexName, privateApps.length, results.length]);

  // Reveal the list only once the first search and private apps have resolved,
  // taking a fresh snapshot of the selection so the sort is right first time.
  useEffect(() => {
    if (initialSettled) return;
    if (!firstSearchDoneRef.current || isLoading || privateAppsLoading) return;
    initialSelectedAppsRef.current = selectedApps;
    setInitialSettled(true);
  }, [initialSettled, isLoading, privateAppsLoading, selectedApps]);

  // Failsafe: never leave the skeleton up forever if a fetch never resolves.
  useEffect(() => {
    const t = setTimeout(() => setInitialSettled(true), 6000);
    return () => clearTimeout(t);
  }, []);



  // Infinite scroll: load next page when scrolled near bottom of results
  const canLoadMore = hasMore && !isLoading && !isLoadingMore && results.length < MAX_RESULTS;

  const loadMore = useCallback(() => {
    if (!canLoadMore) return;
    performSearch(activeQueryRef.current, page + 1);
  }, [canLoadMore, page, performSearch]);

  const handleResultsScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (!canLoadMore) return;
    const el = e.currentTarget;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 200) loadMore();
  }, [canLoadMore, loadMore]);

  // Scroll events do not bubble, so the onScroll handler above only fires when
  // the results container itself is the scrolling element. When an ancestor
  // (drawer body, dialog) owns the scroll, this sentinel observer is what keeps
  // paging alive.
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !canLoadMore) return;
    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== 'undefined') {
      try {
        observer = new IntersectionObserver(
          (entries) => { if (entries.some((entry) => entry.isIntersecting)) loadMore(); },
          { rootMargin: '300px' },
        );
        observer.observe(node);
      } catch {
        observer = null;
      }
    }
    return () => observer?.disconnect();
  }, [canLoadMore, loadMore, results.length]);

  const renderLoadMoreSentinel = () => (canLoadMore ? <div ref={sentinelRef} style={{ height: 1, gridColumn: '1 / -1' }} /> : null);


  // Expose imperative methods via ref
  useImperativeHandle(ref, () => ({
    search: (searchQuery: string) => {
      setQuery(searchQuery);
      onSearchChange?.(searchQuery);
      performSearch(searchQuery);
    },
    clear: () => {
      setQuery('');
      performSearch(''); // Show top results when cleared
    },
    focus: (selectAll = false) => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      if (selectAll) {
        try { el.select(); } catch { /* noop */ }
      }
    },
    getQuery: () => query,
  }), [performSearch, onSearchChange, query]);


  // Handle input change
  const handleInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setQuery(value);
    setSelectedIndex(-1);
    onSearchChange?.(value);

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      performSearch(value);
    }, 300);
  }, [performSearch, onSearchChange]);

  // Handle app selection
  const selectApp = useCallback((app: AlgoliaSearchApp) => {
    const handoffToken = apiKey || authToken || '';
    const authUrl = `${apiBaseUrl}${appAuthPath}?app_id=${app.objectID}&auth=${handoffToken}&source=shuffle${orgId ? `&org_id=${encodeURIComponent(orgId)}` : ''}`;

    if (multiSelect) {
      // Template defaults often only know an app name and therefore carry a
      // synthetic objectID. Match by canonical objectID OR normalized name so
      // clicking one of those visibly pre-selected rows actually removes it.
      const norm = (s?: string) => (s || '').toLowerCase().replace(/[\s_\-]+/g, '');
      const targetName = norm(app.name);
      const matchesApp = (candidate: AlgoliaSearchApp) =>
        candidate.objectID === app.objectID || (targetName && norm(candidate.name) === targetName);
      const isAlreadySelected = internalSelectedApps.some(matchesApp);
      const newSelection = isAlreadySelected
        ? internalSelectedApps.filter((a) => !matchesApp(a))
        : [...internalSelectedApps, app];

      setInternalSelectedApps(newSelection);
      onSelectionChange?.(newSelection);
    } else {
      // If consumer wired up onAppSelected, defer entirely to them.
      if (onAppSelected) {
        onAppSelected({ app, authUrl });
        if (!preventDefault) {
          window.open(authUrl, '_blank');
        }
      } else if (!preventDefault) {
        // New default: open built-in side drawer with the app + its existing
        // authentications, instead of popping a new tab to shuffler.io.
        setDrawerApp(app);
      }

      setIsOpen(false);
    }
  }, [authToken, apiKey, apiBaseUrl, appAuthPath, orgId, multiSelect, internalSelectedApps, onAppSelected, onSelectionChange, preventDefault]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (!isOpen) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, displayResults.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, -1));
        break;
      case 'Enter':
        event.preventDefault();
        if (selectedIndex >= 0 && displayResults[selectedIndex]) {
          selectApp(displayResults[selectedIndex]);
        }
        break;
      case 'Escape':
        event.preventDefault();
        setIsOpen(false);
        setSelectedIndex(-1);
        inputRef.current?.blur();
        break;
    }
  }, [isOpen, results, selectedIndex, selectApp]);

  // Check if app is selected. Matches by objectID first, then falls back to
  // normalized name so callers can pre-select apps without knowing the
  // canonical Algolia objectID (e.g. AgentUI's chosenApps).
  const isAppSelected = useCallback((app: AlgoliaSearchApp) => {
    const norm = (s?: string) => (s || '').toLowerCase().replace(/[\s_\-]+/g, '');
    const target = norm(app.name);
    return internalSelectedApps.some(
      (a) => a.objectID === app.objectID || (target && norm(a.name) === target),
    );
  }, [internalSelectedApps]);


  // Filter the user's private apps client-side by the current query.
  // Normalize whitespace, underscores and dashes on both sides so that
  // "host monitors", "host_monitors" and "host-monitors" all match an app
  // literally named "shuffle_host_monitors".
  const filteredPrivateApps = useMemo(() => {
    if (privateApps.length === 0) return [];
    const normalize = (s: string) => (s || '').toLowerCase().replace(/[\s_\-]+/g, '');
    const q = normalize(query.trim());
    if (!q) return privateApps;
    return privateApps.filter(a =>
      normalize(a.name).includes(q) ||
      normalize(a.description || '').includes(q) ||
      (a.categories || []).some(c => normalize(c).includes(q))
    );
  }, [privateApps, query]);

  // Merge private + public apps, apply source filter, sort pre-selected apps to
  // the top on initial load, prepend pinned, and dedupe by name.
  const displayResults = useMemo(() => {
    let merged: AlgoliaSearchApp[];
    if (sourceFilter === 'public') {
      merged = results;
    } else if (sourceFilter === 'private') {
      merged = filteredPrivateApps;
    } else if (sourceFilter === 'authenticated') {
      const authItems: AlgoliaSearchApp[] = authenticatedApps.map((auth) => {
        const matched = filteredPrivateApps.find(a => authMatchesApp(auth, a)) ||
          results.find(a => authMatchesApp(auth, a));

        const isVerified = isAuthEntryValidated(auth);
        const appName = matched?.name || auth.app?.name || (auth as any).name || (auth as any).app_name || auth.label || 'Untitled app';
        const imageUrl = matched?.image_url || auth.app?.large_image || (auth.app as any)?.image_url || (auth.app as any)?.small_image || '';

        return {
          name: appName,
          description: matched?.description || (auth.app as any)?.description || (auth as any).description || '',
          objectID: auth.id || auth.app?.id || `auth-${appName}`,
          creator: matched?.creator || '',
          app_version: matched?.app_version || (auth.app as any)?.app_version || '1.0.0',
          image_url: imageUrl,
          time_edited: matched?.time_edited || (auth as any)?.edited || 0,
          generated: !!matched?.generated,
          invalid: !!matched?.invalid,
          priority: matched?.priority || 0,
          actions: matched?.actions || 0,
          tags: matched?.tags || [],
          accessible_by: matched?.accessible_by || [],
          categories: matched?.categories?.length ? matched.categories : (auth.app?.categories || []),
          action_labels: matched?.action_labels || [],
          triggers: matched?.triggers || [],
          verified: isVerified,
          source: (matched?.source as any) || 'private',
          authId: auth.id,
          authLabel: auth.label,
          authEntry: auth,
        } as AlgoliaSearchApp & { authId?: string; authLabel?: string; authEntry?: any };
      });

      if (query.trim()) {
        const q = norm(query);
        merged = authItems.filter(item =>
          norm(item.name).includes(q) ||
          norm(item.description).includes(q) ||
          norm((item as any).authLabel).includes(q) ||
          item.categories?.some((c: string) => norm(c).includes(q))
        );
      } else {
        merged = authItems;
      }
    } else {
      // 'all' — private apps first (your own tools win), then public, deduped by name
      const privateNames = new Set(filteredPrivateApps.map(a => norm(a.name)));
      const publicOnly = results.filter(a => !privateNames.has(norm(a.name)));
      const baseMerged = [...filteredPrivateApps, ...publicOnly];
      const existingNames = new Set(baseMerged.map(a => norm(a.name)));
      const extraAuthed: AlgoliaSearchApp[] = [];
      for (const auth of authenticatedApps) {
        const appName = auth.app?.name || (auth as any).name || (auth as any).app_name;
        if (!appName || existingNames.has(norm(appName))) continue;
        existingNames.add(norm(appName));
        extraAuthed.push({
          name: appName,
          description: (auth.app as any)?.description || (auth as any).description || '',
          objectID: auth.id || auth.app?.id || `auth-${appName}`,
          creator: '',
          app_version: (auth.app as any)?.app_version || '1.0.0',
          image_url: auth.app?.large_image || (auth.app as any)?.image_url || (auth.app as any)?.small_image || '',
          time_edited: (auth as any)?.edited || 0,
          generated: false,
          invalid: false,
          priority: 0,
          actions: 0,
          tags: [],
          accessible_by: [],
          categories: auth.app?.categories || [],
          action_labels: [],
          triggers: [],
          verified: isAuthEntryValidated(auth),
          source: 'private',
          authId: auth.id,
          authLabel: auth.label,
          authEntry: auth,
        } as AlgoliaSearchApp);
      }
      merged = [...baseMerged, ...extraAuthed];
    }

    // Float pre-selected apps to the top on initial mount so it's obvious
    // which tools are already chosen. The snapshot stays static while the
    // user toggles selections, so selecting a new tool does not reorder the list.
    const initialSelection = initialSelectedAppsRef.current;
    const selectedNames = new Set(initialSelection.map(a => norm(a.name)));
    const selectedObjectIDs = new Set(initialSelection.map(a => a.objectID).filter(Boolean));
    const sorted = [...merged].sort((a, b) => {
      const aSelected = selectedObjectIDs.has(a.objectID) || selectedNames.has(norm(a.name));
      const bSelected = selectedObjectIDs.has(b.objectID) || selectedNames.has(norm(b.name));
      if (aSelected && !bSelected) return -1;
      if (!aSelected && bSelected) return 1;
      return 0;
    });

    if (!pinnedApps || pinnedApps.length === 0) return sorted;
    const pinnedNames = new Set(pinnedApps.map(a => norm(a.name)));
    return [...pinnedApps, ...sorted.filter(a => !pinnedNames.has(norm(a.name)))];
  }, [pinnedApps, results, filteredPrivateApps, sourceFilter, authenticatedApps, query, authMatchesApp, isAuthEntryValidated, norm]);

  // Get grid columns style
  const getGridColumnsStyle = useMemo(() => {
    if (layout !== 'grid') return {};
    
    const cols = typeof gridColumns === 'number' ? gridColumns : gridColumns.md || 3;
    return { '--singul-grid-columns': cols } as React.CSSProperties;
  }, [layout, gridColumns]);

  // Render individual app item
  const renderAppItem = (app: AlgoliaSearchApp, index: number) => {
    const selected = isAppSelected(app);
    const isHighlighted = index === selectedIndex;
    const authState = getAppAuthState(app);

    // Use custom render if provided
    if (renderItem) {
      return (
        <div
          key={app.objectID}
          onClick={() => selectApp(app)}
          onMouseEnter={() => setSelectedIndex(index)}
        >
          {renderItem(app, selected, () => selectApp(app), authState)}
        </div>
      );
    }

    // Show both chips (configured/not configured AND tested/not tested)
    return (
      <div
        key={app.objectID}
        className={`singul-dropdown-item ${selected ? 'singul-selected' : ''} ${authState.validated ? 'singul-validated' : ''} ${authState.configured ? 'singul-configured' : ''}`}
        data-app-name={app.name}
        data-object-id={app.objectID}
        style={{
          ...customStyles.dropdownItem,
          ...(selected ? customStyles.selectedItem : {}),
        }}
        onClick={() => selectApp(app)}
      >
        <div className="singul-app-info" style={customStyles.appInfo}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <AppFallbackIcon
              name={app.name || ''}
              imageUrl={app.image_url}
              size={28}
              className="singul-app-icon"
              style={customStyles.appIcon as React.CSSProperties}
            />
            {/* Color-coded status dot: green=verified, yellow=configured/pending */}
            {!hideAuthStatus && (
              <span
                className={`singul-status-dot ${
                  authState.validated ? 'singul-dot-validated' :
                  authState.configured ? 'singul-dot-configured' :
                  selected ? 'singul-dot-activated' :
                  'singul-dot-inactive'
                }`}
                title={
                  authState.validated
                    ? 'Verified'
                    : authState.configured
                    ? 'Pending verification'
                    : undefined
                }
              />
            )}
          </div>
          <div className="singul-app-details" style={customStyles.appDetails}>
            <span
              className="singul-app-name"
              style={{
                ...customStyles.appName,
                ...(!app.name || /^untitled$/i.test(app.name.trim())
                  ? { fontStyle: 'italic', color: 'hsl(var(--muted-foreground))' }
                  : {}),
              }}
            >
              {!app.name || /^untitled$/i.test(app.name.trim())
                ? 'Untitled app'
                : app.name.replace(/_/g, ' ')}
              {app.source === 'private' && (
                <Tooltip
                  title="Private apps are apps you have activated in your organization, or your own custom apps — not just from the public Algolia catalog."
                  arrow
                  enterDelay={100}
                  enterNextDelay={100}
                  placement="top"
                  slotProps={{ popper: { style: { zIndex: 10050 } } }}
                >
                  <span className="singul-private-badge">Private</span>
                </Tooltip>
              )}
            </span>
            {(app as any).authLabel && norm((app as any).authLabel) !== norm(app.name) && (
              <span
                className="singul-auth-label"
                style={{
                  fontSize: '0.7rem',
                  color: 'hsl(var(--muted-foreground))',
                  lineHeight: 1.2,
                  display: 'block',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {(app as any).authLabel}
              </span>
            )}
            {showDescription && app.description && (
              <span className="singul-app-description" style={customStyles.appDescription}>
                {app.description}
              </span>
            )}
            {showCategories && app.categories?.[0] && (
              <span className="singul-app-category" style={customStyles.appCategory}>
                {app.categories[0]}
              </span>
            )}
          </div>
          {showCheckbox && (
            <div
              className={`singul-checkbox ${selected ? 'singul-checked' : ''}`}
              style={selected ? customStyles.checkboxChecked : customStyles.checkbox}
            >
              {selected && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  // Footer shown at the end of the result list. When we hit the hard result
  // ceiling, we give the user a clear path forward: refine the query or make
  // a new app.
  const renderEndOfResultsFooter = () => {
    if (renderEndOfResults) return renderEndOfResults();
    const capped = results.length >= MAX_RESULTS;
    return (
      <div className="singul-end-of-results" style={{
        padding: '10px 16px 28px',
        textAlign: 'center' as const,
        gridColumn: '1 / -1',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
          <span style={{ color: 'hsl(var(--foreground) / 0.4)', fontSize: '11px', lineHeight: 1.4 }}>
            {capped
              ? `Showing the top ${MAX_RESULTS} results. Try a more specific search to narrow it down.`
              : "Can't find what you're looking for? Try a different search term."}
          </span>
          {onCreateNewApp && (
            <button
              type="button"
              onClick={onCreateNewApp}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: '11px',
                fontWeight: 600,
                color: 'hsl(var(--primary))',
                background: 'hsl(var(--primary) / 0.08)',
                border: '1px solid hsl(var(--primary) / 0.25)',
                borderRadius: '6px',
                padding: '6px 12px',
                cursor: 'pointer',
                transition: 'background 0.2s ease, border-color 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'hsl(var(--primary) / 0.14)';
                e.currentTarget.style.borderColor = 'hsl(var(--primary) / 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'hsl(var(--primary) / 0.08)';
                e.currentTarget.style.borderColor = 'hsl(var(--primary) / 0.25)';
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New app
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className={`singul-container ${inline ? 'singul-inline' : ''} ${className}`}
      style={customStyles.container}
    >
      <div className="singul-search-bar-container">
        <div className="singul-search-input-wrapper" style={customStyles.inputWrapper}>
          <input
            ref={inputRef}
            type="text"
            className="singul-search-input"
            style={{
              ...customStyles.input,
              ...(renderInputEndAdornment ? { paddingRight: 148 } : null),
            }}
            placeholder={placeholder}
            value={query}
            onChange={handleInputChange}
            onFocus={() => {
              if (!inline && query.trim() && results.length > 0) {
                setIsOpen(true);
              }
            }}
            onKeyDown={handleKeyDown}
            autoComplete="off"
          />
          {!renderInputEndAdornment && (
            <div className="singul-search-icon" style={customStyles.searchIcon}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            </div>
          )}
          {renderInputEndAdornment && (
            <div
              style={{
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 3,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {renderInputEndAdornment()}
            </div>
          )}
          {isLoading && (
            <div
              className="singul-loading-spinner"
              style={{
                ...customStyles.loadingSpinner,
                ...(renderInputEndAdornment ? { right: 152 } : null),
              }}
            >
              {renderLoadingState ? (
                renderLoadingState()
              ) : (
                <div className="singul-spinner" style={customStyles.spinner} />
              )}
            </div>
          )}
        </div>

        {/* Source filter — shown immediately; per-tab counts fall back to a
            spinner glyph while private/authenticated data is still loading. */}
        {showSourceFilter && (
          <div style={{ margin: '12px 0 8px' }}>
            <SegmentedControl
              ariaLabel="Filter by app source"
              value={sourceFilter}
              onChange={(v) => setSourceFilter(v as typeof sourceFilter)}
              options={[
                { value: 'all', label: 'All', count: privateAppsLoading ? '…' : (results.length >= hitsPerPage ? `${results.length + filteredPrivateApps.length}+` : results.length + filteredPrivateApps.length), title: 'All available apps — both the public catalog and your private apps.' },
                { value: 'public', label: 'Public', count: (results.length >= hitsPerPage ? `${results.length}+` : results.length), title: 'Public apps from the Shuffle catalog (powered by Algolia).' },
                { value: 'private', label: 'Private', count: privateAppsLoading ? '…' : filteredPrivateApps.length, title: 'Private apps are apps you have activated in your organization, or your own custom apps — not just from the public Algolia catalog.' },
                { value: 'authenticated', label: 'Authenticated', count: (privateAppsLoading || authenticatedAppsLoading) ? '…' : authenticatedApps.length, title: 'Apps you have authenticated and that are ready to use.' },
              ]}
            />
          </div>
        )}


        {/* Inline Results Container */}
        {inline && (
          <div
            ref={resultsScrollRef}
            onScroll={handleResultsScroll}
            className={`singul-results-container ${layout === 'grid' ? 'singul-results-grid' : ''}`}
            style={{
              ...customStyles.resultsContainer,
              ...getGridColumnsStyle,
              ...(layout === 'grid' ? { display: 'grid' } : {}),
            }}
          >
            {!initialSettled ? (
              <InfiniteScrollSkeleton layout={layout} gridColumns={typeof gridColumns === 'number' ? gridColumns : (gridColumns.md || 3)} />
            ) : displayResults.length > 0 ? (
              <>
                {displayResults.map((app, index) => renderAppItem(app, index))}
                {isLoadingMore && (
                  <InfiniteScrollSkeleton layout={layout} gridColumns={typeof gridColumns === 'number' ? gridColumns : (gridColumns.md || 3)} />
                )}
                {renderLoadMoreSentinel()}
                {!hasMore && !isLoadingMore && renderEndOfResultsFooter()}
              </>
            ) : query.trim() ? (
              <div className="singul-empty-state" style={customStyles.emptyState}>
                {searchError ? (
                  <SearchErrorMessage rateLimited={searchError.rateLimited} message={searchError.message} />
                ) : renderEmptyState ? (
                  renderEmptyState(query)
                ) : (
                  <>No integrations match "{query}". Try searching for a different app or category.</>
                )}
              </div>
            ) : (
              <div className="singul-empty-state" style={customStyles.emptyState}>
                {searchError ? (
                  <SearchErrorMessage rateLimited={searchError.rateLimited} message={searchError.message} />
                ) : (
                  <>Start typing to search integrations...</>
                )}
              </div>
            )}
          </div>
        )}

        {/* Dropdown Results (non-inline mode) */}
        {!inline && isOpen && (
          <div
            onScroll={handleResultsScroll}
            className={`singul-dropdown ${layout === 'grid' ? 'singul-dropdown-grid' : ''}`}
            style={{
              ...customStyles.dropdown,
              ...getGridColumnsStyle,
              ...(layout === 'grid' ? { display: 'grid' } : {}),
            }}
          >
            {!initialSettled ? (
              <InfiniteScrollSkeleton layout={layout} gridColumns={typeof gridColumns === 'number' ? gridColumns : (gridColumns.md || 3)} />
            ) : displayResults.length > 0 ? (
              <>
                {displayResults.map((app, index) => renderAppItem(app, index))}
                {isLoadingMore && (
                  <InfiniteScrollSkeleton layout={layout} gridColumns={typeof gridColumns === 'number' ? gridColumns : (gridColumns.md || 3)} />
                )}
                {renderLoadMoreSentinel()}
                {!hasMore && !isLoadingMore && renderEndOfResultsFooter()}
              </>
            ) : (
              <div className="singul-empty-state" style={customStyles.emptyState}>
                {searchError ? (
                  <SearchErrorMessage rateLimited={searchError.rateLimited} message={searchError.message} />
                ) : renderEmptyState ? (
                  renderEmptyState(query)
                ) : (
                  <>No apps found for "{query}"</>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Built-in app config drawer — same drawer used by /incidents Add ingestion source */}
      {drawerApp && (
        <AppDetailDrawer
          open={true}
          appName={drawerApp.name}
          anchor="right"
          width={560}
          onClose={() => setDrawerApp(null)}
          onRefresh={fetchAuthenticatedApps}
        />
      )}
    </div>
  );
});

ShuffleMCP.displayName = 'ShuffleMCP';

export default ShuffleMCP;

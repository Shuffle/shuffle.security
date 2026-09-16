import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { algoliasearch } from 'algoliasearch';
import { useSearchParams, useNavigate } from '@/lib/router-compat';
import { usePageMeta } from '@/hooks/usePageMeta';
import { useWorkflows } from '@/hooks/useWorkflows';
import {
  BASE_NAV_ITEMS,
  getSynonymsForQuery,
  algoliaDocToItem,
  type AlgoliaDocHit,
  type AlgoliaSearchApp,
  type DocItem,
  type CorrelationItem,
  type NavResult,
  getApiUrl,
  getAuthHeader,
  getShuffleCoreWorkflowUrl,
} from '@/Shuffle-Core';
import { navigateToShuffleCore } from '@/lib/authHandoff';

const ALGOLIA_APP_ID = 'JNSS5CFDZZ';
const ALGOLIA_API_KEY = '33e4e3564f4f060e96e0531957bed552';

const algoliaClient = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_API_KEY);

const NOISE_KEYS = new Set([
  'new', 'in_progress', 'resolved', 'escalated', 'closed', 'open', 'pending',
  'critical', 'high', 'medium', 'low', 'informational', 'info', 'warning', 'error',
  'unknown', 'none', 'null', 'undefined', 'true', 'false',
]);

type SearchCategory = 'all' | 'apps' | 'workflows' | 'incidents' | 'docs' | 'pages';

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQuery = searchParams.get('q') || '';
  const initialCategory = (searchParams.get('category') as SearchCategory) || 'all';

  const [inputVal, setInputVal] = useState(urlQuery);
  const [activeCategory, setActiveCategory] = useState<SearchCategory>(initialCategory);
  const navigate = useNavigate();

  usePageMeta({
    title: urlQuery ? `Search: ${urlQuery}` : 'Search',
    description: 'Unified search across integrations, workflows, incidents, documentation, and system navigation.',
    url: '/search',
    noindex: true,
  });

  // Keep inputVal in sync if URL query changes externally
  useEffect(() => {
    setInputVal(urlQuery);
  }, [urlQuery]);

  // Asynchronous result states
  const [appResults, setAppResults] = useState<AlgoliaSearchApp[]>([]);
  const [docResults, setDocResults] = useState<DocItem[]>([]);
  const [publicWorkflowResults, setPublicWorkflowResults] = useState<
    { id: string; name: string; description?: string }[]
  >([]);
  const [correlationResults, setCorrelationResults] = useState<CorrelationItem[]>([]);

  // Loading states
  const [algoliaLoading, setAlgoliaLoading] = useState(false);
  const [correlationsLoading, setCorrelationsLoading] = useState(false);

  // In-memory tenant workflows
  const { data: allWorkflows = [] } = useWorkflows();

  // Matched tenant workflows
  const matchedOrgWorkflows = useMemo(() => {
    const q = urlQuery.trim().toLowerCase();
    if (!q) return [];
    const synonyms = getSynonymsForQuery(q);
    return allWorkflows.filter((w) => {
      const name = (w.name || '').toLowerCase();
      const desc = (w.description || '').toLowerCase();
      if (name.includes(q) || desc.includes(q)) return true;
      return synonyms.some((syn) => name.includes(syn) || desc.includes(syn));
    });
  }, [urlQuery, allWorkflows]);

  // Filtered system navigation pages
  const matchedNavItems = useMemo((): NavResult[] => {
    const q = urlQuery.trim().toLowerCase();
    if (!q) return [];
    const synonyms = getSynonymsForQuery(q);
    return BASE_NAV_ITEMS.filter((n) => {
      const label = n.label.toLowerCase();
      const path = n.path.toLowerCase();
      if (label.includes(q) || path.includes(q)) return true;
      if (n.keywords?.some((k) => k.includes(q) || q.includes(k))) return true;
      for (const syn of synonyms) {
        if (label.includes(syn) || n.keywords?.some((k) => k.includes(syn) || syn.includes(k))) {
          return true;
        }
      }
      return false;
    });
  }, [urlQuery]);

  // Query Algolia indexes
  const searchAlgolia = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setAppResults([]);
      setDocResults([]);
      setPublicWorkflowResults([]);
      setAlgoliaLoading(false);
      return;
    }

    setAlgoliaLoading(true);
    try {
      const [appsSettled, docsSettled, workflowsSettled] = await Promise.allSettled([
        algoliaClient.searchSingleIndex({
          indexName: 'appsearch',
          searchParams: { query: trimmed, hitsPerPage: 20 },
        }),
        algoliaClient.searchSingleIndex({
          indexName: 'documentation',
          searchParams: {
            query: trimmed,
            hitsPerPage: 20,
            attributesToRetrieve: ['title', 'filename', 'data', 'urlpath'],
            attributesToHighlight: ['data'],
            highlightPreTag: '',
            highlightPostTag: '',
          },
        }),
        algoliaClient.searchSingleIndex({
          indexName: 'workflows',
          searchParams: { query: trimmed, hitsPerPage: 20 },
        }),
      ]);

      if (appsSettled.status === 'fulfilled') {
        setAppResults((appsSettled.value.hits as AlgoliaSearchApp[]) || []);
      } else {
        setAppResults([]);
      }

      if (docsSettled.status === 'fulfilled') {
        const seenDocs = new Set<string>();
        const docs = ((docsSettled.value.hits as unknown as AlgoliaDocHit[]) || [])
          .map(algoliaDocToItem)
          .filter((doc): doc is DocItem => {
            if (!doc) return false;
            const key = doc.name.toLowerCase();
            if (seenDocs.has(key)) return false;
            seenDocs.add(key);
            return true;
          });
        setDocResults(docs);
      } else {
        setDocResults([]);
      }

      if (workflowsSettled.status === 'fulfilled') {
        const hits = (workflowsSettled.value.hits as any[]) || [];
        const publicList = hits.map((hit) => {
          const rawName = hit.name || hit.title || hit.filename || 'Community Workflow';
          const name = rawName.replace(/_/g, ' ');
          return {
            id: hit.objectID,
            name: name.charAt(0).toUpperCase() + name.slice(1),
            description: hit.description || '',
          };
        });
        setPublicWorkflowResults(publicList);
      } else {
        setPublicWorkflowResults([]);
      }
    } catch {
      setAppResults([]);
      setDocResults([]);
      setPublicWorkflowResults([]);
    } finally {
      setAlgoliaLoading(false);
    }
  }, []);

  // Query correlations
  const searchCorrelations = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || trimmed.length < 2) {
      setCorrelationResults([]);
      setCorrelationsLoading(false);
      return;
    }

    setCorrelationsLoading(true);
    try {
      const response = await fetch(getApiUrl('/api/v2/correlations'), {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          type: 'datastore',
          key: trimmed,
          category: 'shuffle-security_incidents',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const rawCorrelationData = Array.isArray(data)
          ? data
          : data.correlations || data.data || [];
        const correlationData = Array.isArray(rawCorrelationData) ? rawCorrelationData : [];
        const filtered = correlationData.filter((candidate: any): candidate is CorrelationItem => {
          if (!candidate || typeof candidate !== 'object') return false;
          if (typeof candidate.key !== 'string' || !candidate.key.trim()) return false;
          if (!Array.isArray(candidate.ref) || candidate.ref.length === 0) return false;
          return (
            candidate.ref.some(
              (ref: any) => typeof ref === 'string' && ref.includes('shuffle-security_incidents'),
            ) && !NOISE_KEYS.has(candidate.key.toLowerCase())
          );
        });
        setCorrelationResults(filtered);
      } else {
        setCorrelationResults([]);
      }
    } catch {
      setCorrelationResults([]);
    } finally {
      setCorrelationsLoading(false);
    }
  }, []);

  // Trigger search on urlQuery change
  useEffect(() => {
    searchAlgolia(urlQuery);
    searchCorrelations(urlQuery);
  }, [urlQuery, searchAlgolia, searchCorrelations]);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputVal.trim();
    if (trimmed) {
      setSearchParams({ q: trimmed });
    } else {
      setSearchParams({});
    }
  };

  const handleClear = () => {
    setInputVal('');
    setSearchParams({});
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInputVal(suggestion);
    setSearchParams({ q: suggestion });
  };

  const totalWorkflowCount = matchedOrgWorkflows.length + publicWorkflowResults.length;
  const totalCount =
    appResults.length +
    docResults.length +
    totalWorkflowCount +
    correlationResults.length +
    matchedNavItems.length;

  const isLoading = algoliaLoading || correlationsLoading;

  // Handlers for clicking results
  const handleAppClick = (app: AlgoliaSearchApp) => {
    navigate(`/apps?app=${encodeURIComponent(app.name)}`);
  };

  const handleOrgWorkflowClick = (wf: { id: string }) => {
    navigateToShuffleCore(getShuffleCoreWorkflowUrl(wf.id), { newTab: true });
  };

  const handlePublicWorkflowClick = (wf: { id: string }) => {
    navigateToShuffleCore(getShuffleCoreWorkflowUrl(wf.id), { newTab: true });
  };

  const handleDocClick = (doc: DocItem) => {
    navigate(doc.path || `/docs/${doc.slug}`);
  };

  const handleCorrelationClick = (corr: CorrelationItem) => {
    const incidentRef = corr.ref?.find((r) => r.includes('shuffle-security_incidents'));
    const key = incidentRef
      ? incidentRef.includes('|')
        ? incidentRef.split('|').pop()
        : incidentRef.split('/').pop()
      : corr.key;
    if (key) {
      navigate(`/incidents/${key}`);
    }
  };

  const handleNavClick = (nav: NavResult) => {
    navigate(nav.path);
  };

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">
          Search
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Unified search across integrations, workflows, incidents, documentation, and system navigation.
        </p>
      </div>

      {/* Search Input Bar */}
      <form onSubmit={handleFormSubmit} className="flex gap-2 items-center">
        <div className="relative flex-1">
          <input
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            placeholder="Search integrations, workflows, incidents, documentation..."
            className="w-full h-11 px-4 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
          />
        </div>
        <button
          type="submit"
          className="h-11 px-5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Search
        </button>
        {inputVal && (
          <button
            type="button"
            onClick={handleClear}
            className="h-11 px-4 rounded-md border border-border bg-card text-foreground text-sm font-medium hover:bg-muted transition-colors"
          >
            Clear
          </button>
        )}
      </form>

      {/* Suggestions when query is empty */}
      {!urlQuery.trim() && (
        <div className="rounded-lg border border-border bg-card p-6 space-y-4">
          <div className="text-sm font-medium text-foreground">Suggested Searches</div>
          <p className="text-xs text-muted-foreground">
            Select a common security operations or integration query to search across the platform:
          </p>
          <div className="flex flex-wrap gap-2">
            {['aws', 'incident', 'slack', 'virustotal', 'cve', 'crowdstrike', 'jira', 'splunk'].map((term) => (
              <button
                key={term}
                type="button"
                onClick={() => handleSuggestionClick(term)}
                className="px-3 py-1.5 text-xs font-mono rounded border border-border bg-muted/40 text-foreground hover:bg-muted transition-colors"
              >
                {term}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results Section */}
      {urlQuery.trim() && (
        <div className="space-y-6">
          {/* Category Tabs */}
          <div className="flex flex-wrap gap-2 border-b border-border pb-3">
            <button
              type="button"
              onClick={() => setActiveCategory('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeCategory === 'all'
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border bg-card text-foreground hover:bg-muted'
              }`}
            >
              All ({totalCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory('apps')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeCategory === 'apps'
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border bg-card text-foreground hover:bg-muted'
              }`}
            >
              Integrations ({appResults.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory('workflows')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeCategory === 'workflows'
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border bg-card text-foreground hover:bg-muted'
              }`}
            >
              Workflows ({totalWorkflowCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory('incidents')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeCategory === 'incidents'
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border bg-card text-foreground hover:bg-muted'
              }`}
            >
              Incidents & Correlations ({correlationResults.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory('docs')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeCategory === 'docs'
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border bg-card text-foreground hover:bg-muted'
              }`}
            >
              Documentation ({docResults.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory('pages')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeCategory === 'pages'
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border bg-card text-foreground hover:bg-muted'
              }`}
            >
              Pages ({matchedNavItems.length})
            </button>
          </div>

          {/* Loading Indicator */}
          {isLoading && (
            <div className="p-4 rounded-md border border-border bg-muted/20 text-xs font-mono text-muted-foreground">
              Searching remote indexes...
            </div>
          )}

          {/* Zero Results State */}
          {!isLoading && totalCount === 0 && (
            <div className="rounded-lg border border-border bg-card p-8 text-center space-y-3">
              <div className="text-base font-semibold text-foreground">
                No results found for &ldquo;{urlQuery}&rdquo;
              </div>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                No matching integrations, workflows, incidents, documentation, or system pages were found. Check your spelling or try broader terms.
              </p>
            </div>
          )}

          {/* Results Lists */}
          <div className="space-y-6">
            {/* System Navigation Pages */}
            {(activeCategory === 'all' || activeCategory === 'pages') && matchedNavItems.length > 0 && (
              <div className="space-y-3">
                <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  System Navigation ({matchedNavItems.length})
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {matchedNavItems.map((item) => (
                    <div
                      key={item.path}
                      onClick={() => handleNavClick(item)}
                      className="flex items-center justify-between p-3 rounded-md border border-border bg-card hover:border-primary/40 hover:bg-muted/30 cursor-pointer transition-all"
                    >
                      <div className="space-y-0.5">
                        <div className="text-sm font-medium text-foreground">{item.label}</div>
                        <div className="text-xs font-mono text-muted-foreground">{item.path}</div>
                      </div>
                      <span className="text-xs font-mono px-2 py-0.5 rounded border border-border bg-muted/50 text-muted-foreground">
                        PAGE
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Integrations (Apps) */}
            {(activeCategory === 'all' || activeCategory === 'apps') && appResults.length > 0 && (
              <div className="space-y-3">
                <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  Integrations ({appResults.length})
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {appResults.map((app) => (
                    <div
                      key={app.objectID}
                      onClick={() => handleAppClick(app)}
                      className="p-3.5 rounded-md border border-border bg-card hover:border-primary/40 hover:bg-muted/30 cursor-pointer transition-all flex flex-col justify-between"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-semibold text-foreground capitalize">
                            {app.name.replace(/_/g, ' ')}
                          </span>
                          <span className="text-[11px] font-mono px-1.5 py-0.5 rounded border border-border bg-muted/50 text-muted-foreground uppercase flex-shrink-0">
                            APP
                          </span>
                        </div>
                        {app.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {app.description}
                          </p>
                        )}
                      </div>
                      {app.categories?.[0] && (
                        <div className="mt-2.5 pt-2 border-t border-border/60 text-[11px] font-mono text-muted-foreground uppercase">
                          {app.categories[0]}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Workflows (Organization + Community) */}
            {(activeCategory === 'all' || activeCategory === 'workflows') && totalWorkflowCount > 0 && (
              <div className="space-y-3">
                <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  Workflows & Playbooks ({totalWorkflowCount})
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {matchedOrgWorkflows.map((wf) => (
                    <div
                      key={wf.id}
                      onClick={() => handleOrgWorkflowClick(wf)}
                      className="p-3.5 rounded-md border border-border bg-card hover:border-primary/40 hover:bg-muted/30 cursor-pointer transition-all flex flex-col justify-between"
                    >
                      <div className="space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-semibold text-foreground">
                            {wf.name}
                          </span>
                          <span className="text-[11px] font-mono px-1.5 py-0.5 rounded border border-primary/30 bg-primary/10 text-primary flex-shrink-0">
                            ORGANIZATION
                          </span>
                        </div>
                        {wf.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {wf.description}
                          </p>
                        )}
                      </div>
                      <div className="mt-2 text-[11px] font-mono text-muted-foreground">
                        ID: {wf.id.slice(0, 16)}...
                      </div>
                    </div>
                  ))}

                  {publicWorkflowResults.map((wf) => (
                    <div
                      key={wf.id}
                      onClick={() => handlePublicWorkflowClick(wf)}
                      className="p-3.5 rounded-md border border-border bg-card hover:border-primary/40 hover:bg-muted/30 cursor-pointer transition-all flex flex-col justify-between"
                    >
                      <div className="space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-semibold text-foreground">
                            {wf.name}
                          </span>
                          <span className="text-[11px] font-mono px-1.5 py-0.5 rounded border border-border bg-muted/50 text-muted-foreground flex-shrink-0">
                            COMMUNITY
                          </span>
                        </div>
                        {wf.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {wf.description}
                          </p>
                        )}
                      </div>
                      <div className="mt-2 text-[11px] font-mono text-muted-foreground">
                        Template ID: {wf.id.slice(0, 16)}...
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Incidents & Correlations */}
            {(activeCategory === 'all' || activeCategory === 'incidents') && correlationResults.length > 0 && (
              <div className="space-y-3">
                <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  Incidents & Correlations ({correlationResults.length})
                </div>
                <div className="space-y-2">
                  {correlationResults.map((corr, idx) => {
                    const refCount = corr.ref?.length || 0;
                    return (
                      <div
                        key={`${corr.key}-${idx}`}
                        onClick={() => handleCorrelationClick(corr)}
                        className="flex items-center justify-between p-3.5 rounded-md border border-border bg-card hover:border-primary/40 hover:bg-muted/30 cursor-pointer transition-all"
                      >
                        <div className="space-y-0.5">
                          <div className="text-sm font-mono font-medium text-foreground">
                            {corr.key}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {refCount} incident reference{refCount !== 1 ? 's' : ''}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {corr.amount > 1 && (
                            <span className="text-xs font-mono font-semibold text-primary px-1.5 py-0.5 rounded bg-primary/10">
                              x{corr.amount}
                            </span>
                          )}
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded border border-border bg-muted/50 text-muted-foreground">
                            INCIDENT
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Documentation */}
            {(activeCategory === 'all' || activeCategory === 'docs') && docResults.length > 0 && (
              <div className="space-y-3">
                <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  Documentation ({docResults.length})
                </div>
                <div className="space-y-2">
                  {docResults.map((doc) => (
                    <div
                      key={doc.slug}
                      onClick={() => handleDocClick(doc)}
                      className="p-3.5 rounded-md border border-border bg-card hover:border-primary/40 hover:bg-muted/30 cursor-pointer transition-all space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-foreground">
                          {doc.label}
                        </span>
                        <span className="text-[11px] font-mono px-1.5 py-0.5 rounded border border-border bg-muted/50 text-muted-foreground flex-shrink-0">
                          DOCS
                        </span>
                      </div>
                      {doc.snippet && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {doc.snippet}
                        </p>
                      )}
                      <div className="text-[11px] font-mono text-muted-foreground">
                        {doc.path || `/docs/${doc.slug}`}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

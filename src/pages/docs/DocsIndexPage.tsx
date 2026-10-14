import { useEffect, useMemo, useState } from 'react';
import { Box, Button, Container, TextField, Typography } from '@mui/material';
import { Link } from '@/lib/router-compat';
import { LandingNavbar } from '@/components/landing/LandingNavbar';
import { DocsSidebar } from '@/components/docs/DocsSidebar';
import { docSlug, fetchDocsList, KNOWN_DOCS, type RemoteDocEntry } from '@/components/docs/remoteDocs';
import { getDocDisplayLabel, groupRemoteDocs } from '@/components/docs/docGroups';
import { liteClient } from 'algoliasearch/lite';
import { algoliaDocToItem, type AlgoliaDocHit, type DocItem } from '@/Shuffle-Core';

const searchClient = liteClient('JNSS5CFDZZ', '33e4e3564f4f060e96e0531957bed552');

const quickLinks = [
  { slug: 'getting-started', label: 'Getting Started', description: 'Set up Shuffle and connect your first tools.' },
  { slug: 'incidents', label: 'Incidents & Cases', description: 'Ingest alerts, triage incidents, and coordinate response.' },
  { slug: 'api', label: 'API Reference', description: 'Endpoints, authentication, and request examples.' },
];
const linkStyle = { display: 'block', py: 1, color: 'text.primary', textDecoration: 'none', fontSize: 15, overflowWrap: 'anywhere', '&:hover': { color: 'primary.main', textDecoration: 'underline' } };

export default function DocsIndexPage() {
  const [docs, setDocs] = useState<RemoteDocEntry[]>(KNOWN_DOCS);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DocItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const term = query.trim();
    setResults([]);
    setSearchError(false);
    setSearching(Boolean(term));
    if (!term) return;
    const timeout = setTimeout(async () => {
      try {
        const response = await searchClient.searchForHits<AlgoliaDocHit>({
          requests: [{ indexName: 'documentation', query: term, hitsPerPage: 30,
            attributesToRetrieve: ['title', 'filename', 'data', 'urlpath'],
            attributesToHighlight: ['data'], highlightPreTag: '', highlightPostTag: '',
          }],
        });
        const seen = new Set<string>();
        const items = (response.results[0]?.hits ?? []).map(algoliaDocToItem).filter((item): item is DocItem => {
          if (!item || !item.path || !/^\/(docs|articles)\//.test(item.path) || seen.has(item.path)) return false;
          seen.add(item.path);
          return true;
        });
        if (!cancelled) setResults(items);
      } catch {
        if (!cancelled) setSearchError(true);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(timeout); };
  }, [query]);
  useEffect(() => {
    let cancelled = false;
    fetchDocsList().then((list) => {
      if (!cancelled && list.length > 0) setDocs(list);
    }).catch(() => { /* Keep built-in topics available when offline. */ });
    return () => { cancelled = true; };
  }, []);
  const groups = useMemo(() => {
    const entries = docs.filter((doc) => docSlug(doc.name) !== 'index').map((doc) => ({
      ...doc, slug: docSlug(doc.name), label: getDocDisplayLabel(docSlug(doc.name), doc.name),
    }));
    return groupRemoteDocs(entries);
  }, [docs]);
  return (
    <Box className="docs-page-scope" sx={{ minHeight: '100vh', color: 'text.primary' }}>
      <LandingNavbar />
      <Box sx={{ height: 64 }} />
      <Box component="aside" aria-label="Documentation navigation" sx={{ display: { xs: 'none', md: 'block' }, position: 'fixed', top: 64, left: 0, height: 'calc(100vh - 64px)', width: { md: 260, xl: 280 }, bgcolor: 'background.default' }}>
        <DocsSidebar activeSlug="overview" />
      </Box>
      <Box component="main" sx={{ ml: { xs: 0, md: '260px', xl: '280px' }, mr: { xs: 0, md: 'var(--ask-ai-panel-width, 0px)' }, minWidth: 0, transition: 'margin 0.3s cubic-bezier(0.4, 0, 0.2, 1)', '@media (prefers-reduced-motion: reduce)': { transition: 'none' } }}>
        <Container maxWidth={false} sx={{ maxWidth: 1200, py: { xs: 4, md: 6 }, px: { xs: 2, sm: 3, lg: 5 } }}>
          <Typography component="h1" sx={{ fontSize: 32, fontWeight: 700, letterSpacing: 0, mb: 1.5 }}>Shuffle Documentation</Typography>
          <Typography sx={{ color: 'text.secondary', lineHeight: 1.7, mb: 4 }}>Setup, integrations, incident response, and automation.</Typography>
          <TextField fullWidth value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find documentation" slotProps={{ htmlInput: { 'aria-label': 'Find documentation' } }} type="search" size="small" sx={{ maxWidth: 720, mb: 4, '& .MuiOutlinedInput-root': { bgcolor: 'hsl(var(--card))' } }} />
          {!query.trim() && (
            <Box component="section" aria-labelledby="docs-start-title" sx={{ mb: 5 }}>
              <Typography id="docs-start-title" component="h2" sx={{ fontSize: 18, fontWeight: 600, mb: 2 }}>Start here</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 3 }}>
                {quickLinks.map((doc) => (
                  <Box key={doc.slug}>
                    <Typography component={Link} to={`/docs/${doc.slug}`} sx={{ ...linkStyle, color: 'primary.main', fontWeight: 600 }}>{doc.label}</Typography>
                    <Typography sx={{ fontSize: 14, color: 'text.secondary', lineHeight: 1.7 }}>{doc.description}</Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          )}
          <Box component="section" aria-label="Documentation topics" sx={{ borderTop: '1px solid hsl(var(--border))', pt: 3 }}>
            {query.trim() ? (
              <Box aria-live="polite" aria-busy={searching}>
                <Typography sx={{ fontSize: 14, color: 'text.secondary', mb: 3 }}>
                  {searching ? 'Searching documentation and articles…' : searchError ? 'Search could not be loaded. Please try again.' : `${results.length} results`}
                </Typography>
                {results.map((item) => (
                  <Box key={item.path} sx={{ mb: 3 }}>
                    <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{item.path?.startsWith('/articles/') ? 'Article' : 'Documentation'}</Typography>
                    <Typography component={Link} to={item.path ?? `/docs/${item.slug}`} sx={{ ...linkStyle, fontWeight: 600 }}>{item.label}</Typography>
                    {item.snippet && <Typography sx={{ fontSize: 14, lineHeight: 1.7, color: 'text.secondary', overflowWrap: 'anywhere' }}>{item.snippet}</Typography>}
                  </Box>
                ))}
                {!searching && !searchError && results.length === 0 && <Typography sx={{ color: 'text.secondary', mb: 2 }}>No documentation or articles match your search.</Typography>}
                <Button variant="outlined" onClick={() => setQuery('')} sx={{ height: 36, whiteSpace: 'nowrap' }}>Clear search</Button>
              </Box>
            ) : <>
            <Typography sx={{ fontSize: 14, color: 'text.secondary', mb: 3 }}>Browse all topics</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, columnGap: 5, rowGap: 4 }}>
              {groups.map((group) => (
                <Box key={group.id} component="section" aria-labelledby={`docs-group-${group.id}`} sx={{ minWidth: 0 }}>
                  <Typography id={`docs-group-${group.id}`} component="h2" sx={{ fontSize: 20, fontWeight: 600, mb: 1 }}>{group.label}</Typography>
                  <Typography sx={{ fontSize: 14, color: 'text.secondary', lineHeight: 1.7, mb: 1.5 }}>{group.description}</Typography>
                  <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                    {group.docs.map((doc) => <Box component="li" key={doc.slug}><Typography component={Link} to={`/docs/${doc.slug}`} sx={linkStyle}>{doc.label}</Typography></Box>)}
                  </Box>
                </Box>
              ))}
            </Box>
            </>}
          </Box>
          <Box sx={{ mt: 5, pt: 3, borderTop: '1px solid hsl(var(--border))' }}>
            <Typography component="a" href="https://github.com/Shuffle/shuffle-docs/tree/master/docs" target="_blank" rel="noopener noreferrer" sx={{ ...linkStyle, color: 'text.secondary', fontSize: 14 }}>Documentation on GitHub</Typography>
          </Box>
        </Container>
      </Box>
    </Box>
  );
}

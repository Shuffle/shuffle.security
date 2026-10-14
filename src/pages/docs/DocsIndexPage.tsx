import { useEffect, useMemo, useState } from 'react';
import { Box, Button, Container, TextField, Typography } from '@mui/material';
import { Link } from '@/lib/router-compat';
import { LandingNavbar } from '@/components/landing/LandingNavbar';
import { DocsSidebar } from '@/components/docs/DocsSidebar';
import { docSlug, fetchDocsList, KNOWN_DOCS, type RemoteDocEntry } from '@/components/docs/remoteDocs';
import { getDocDisplayLabel, groupRemoteDocs } from '@/components/docs/docGroups';

const quickLinks = [
  { slug: 'getting-started', label: 'Getting Started', description: 'Set up Shuffle and connect your first tools.' },
  { slug: 'incidents', label: 'Incidents & Cases', description: 'Ingest alerts, triage incidents, and coordinate response.' },
  { slug: 'api', label: 'API Reference', description: 'Endpoints, authentication, and request examples.' },
];
const linkStyle = { display: 'block', py: 1, color: 'text.primary', textDecoration: 'none', fontSize: 15, overflowWrap: 'anywhere', '&:hover': { color: 'primary.main', textDecoration: 'underline' } };

export default function DocsIndexPage() {
  const [docs, setDocs] = useState<RemoteDocEntry[]>(KNOWN_DOCS);
  const [query, setQuery] = useState('');
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
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return groupRemoteDocs(entries).map((group) => ({
      ...group,
      docs: group.docs.filter((doc) => {
        const text = `${doc.label} ${doc.slug} ${group.label} ${group.description ?? ''}`.toLowerCase();
        return terms.every((term) => text.includes(term));
      }),
    })).filter((group) => group.docs.length > 0);
  }, [docs, query]);
  const count = groups.reduce((total, group) => total + group.docs.length, 0);
  return (
    <Box sx={{ minHeight: '100vh', color: 'text.primary' }}>
      <LandingNavbar />
      <Box sx={{ height: 64 }} />
      <Box component="aside" aria-label="Documentation navigation" sx={{ display: { xs: 'none', md: 'block' }, position: 'fixed', top: 64, left: 0, height: 'calc(100vh - 64px)', width: { md: 260, xl: 280 }, bgcolor: 'background.default' }}>
        <DocsSidebar activeSlug="overview" />
      </Box>
      <Box component="main" sx={{ ml: { xs: 0, md: '260px', xl: '280px' }, mr: { xs: 0, md: 'var(--ask-ai-panel-width, 0px)' }, minWidth: 0, transition: 'margin 0.3s cubic-bezier(0.4, 0, 0.2, 1)', '@media (prefers-reduced-motion: reduce)': { transition: 'none' } }}>
        <Container maxWidth={false} sx={{ maxWidth: 1200, py: { xs: 4, md: 6 }, px: { xs: 2, sm: 3, lg: 5 } }}>
          <Typography component="h1" sx={{ fontSize: 32, fontWeight: 700, letterSpacing: 0, mb: 1.5 }}>Shuffle Security Documentation</Typography>
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
            <Typography aria-live="polite" sx={{ fontSize: 14, color: 'text.secondary', mb: 3 }}>{query.trim() ? `${count} ${count === 1 ? 'document' : 'documents'} found` : 'Browse all topics'}</Typography>
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
            {groups.length === 0 && <Box sx={{ py: 3 }}><Typography sx={{ mb: 2, color: 'text.secondary' }}>No documentation matches your search.</Typography><Button variant="outlined" onClick={() => setQuery('')} sx={{ height: 36, whiteSpace: 'nowrap' }}>Clear search</Button></Box>}
          </Box>
          <Box sx={{ mt: 5, pt: 3, borderTop: '1px solid hsl(var(--border))' }}>
            <Typography component="a" href="https://github.com/Shuffle/shuffle-docs/tree/master/docs" target="_blank" rel="noopener noreferrer" sx={{ ...linkStyle, color: 'text.secondary', fontSize: 14 }}>Documentation on GitHub</Typography>
          </Box>
        </Container>
      </Box>
    </Box>
  );
}

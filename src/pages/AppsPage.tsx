import { useRef, useState, useEffect } from 'react';
import { Box, Container, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions, useTheme } from '@mui/material';
import { motion } from 'framer-motion';
import { Link, useSearchParams, useNavigate } from '@/lib/router-compat';
import { useAuth } from '@/context/AuthContext';
import { Mail, Radar, Search, Globe, Cloud, Shield, ArrowRight as ArrowForwardIcon, Plus } from 'lucide-react';
import { LandingNavbar } from '@/components/landing/LandingNavbar';
import { Footer } from '@/components/landing/Footer';
import { ShuffleMCP, ShuffleMCPHandle } from '@/Shuffle-MCPs';
import { AddAppDialog } from '@/Shuffle-Core';
import { trackCTA, trackPredefinedEvent, GA_EVENTS } from '@/lib/analytics';
import { usePageMeta } from '@/hooks/usePageMeta';

const categories = [
  { id: 'cloud', label: 'Cloud', icon: Cloud, description: 'AWS, Azure, GCP', searchTerm: 'cloud' },
  { id: 'siem', label: 'SIEM', icon: Radar, description: 'Log aggregation', searchTerm: 'siem' },
  { id: 'email', label: 'Email', icon: Mail, description: 'Inboxes & mail', searchTerm: 'email' },
  { id: 'edr', label: 'EDR', icon: Search, description: 'Endpoint detection', searchTerm: 'edr' },
  { id: 'threat', label: 'Threat Intel', icon: Shield, description: 'IOC enrichment', searchTerm: 'threat intel' },
];

const catchAllCategory = { id: 'other', label: 'Browse All 3,000+ Integrations', icon: Globe, searchTerm: '' };

export default function AppsPage() {
  const singulRef = useRef<ShuffleMCPHandle>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [addAppOpen, setAddAppOpen] = useState(false);
  const [addAppSeed, setAddAppSeed] = useState('');
  const [registerPromptOpen, setRegisterPromptOpen] = useState(false);
  const [pendingSeed, setPendingSeed] = useState('');
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const theme = useTheme();
  const primaryColor = theme.palette.primary.main;

  // Category search-terms we should NOT seed into the "Add app" dialog —
  // these are broad filters (e.g. "cloud", "siem"), not the name of an app
  // the user is trying to generate.
  const CATEGORY_PREFIXES = ['cloud', 'siem', 'email', 'edr', 'threat intel'];
  const SEED_MAX_LEN = 200;

  const computeSeed = () => {
    const raw = (searchQuery || '').trim();
    const lower = raw.toLowerCase();
    const isCategory = CATEGORY_PREFIXES.some(
      (p) => lower === p || lower === p.replace(' ', ''),
    );
    return !raw || isCategory ? '' : raw.slice(0, SEED_MAX_LEN);
  };

  const openAddApp = (source: string) => {
    const seed = computeSeed();
    trackCTA('add_app', source);
    if (!isAuthenticated) {
      setPendingSeed(seed);
      setRegisterPromptOpen(true);
      return;
    }
    setAddAppSeed(seed);
    setAddAppOpen(true);
  };

  const goRegisterForAddApp = () => {
    const target = `/apps?addApp=1${pendingSeed ? `&addAppSeed=${encodeURIComponent(pendingSeed)}` : ''}`;
    navigate(`/register?view=${encodeURIComponent(target)}`);
  };

  usePageMeta({
    title: '3,000+ Integrations',
    description: 'Browse and connect 3,000+ security integrations — SIEM, EDR, Email, Cloud, ITSM, Threat Intel and more. Use your existing tools with Shuffle Security.',
    url: '/apps',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: '3,000+ Security Integrations',
      description: 'Browse and connect 3,000+ security integrations across SIEM, EDR, Email, Cloud, ITSM, and Threat Intelligence categories.',
      url: 'https://shuffle.security/apps',
      isPartOf: { '@type': 'WebSite', name: 'Shuffle Security', url: 'https://shuffle.security' },
    },
  });

  // Initialize from URL query param
  useEffect(() => {
    const categoryParam = searchParams.get('category');
    const searchParam = searchParams.get('search');
    
    if (searchParam) {
      // Direct search query (e.g., from floating icons)
      setSearchQuery(searchParam);
      if (singulRef.current) {
        singulRef.current.search(searchParam);
      }
    } else if (categoryParam) {
      const category = categories.find(c => c.id === categoryParam);
      if (category) {
        setSearchQuery(category.searchTerm);
        if (singulRef.current) {
          singulRef.current.search(category.searchTerm);
        }
      }
    }

    // Auto-open the "Add app" dialog if the user came back from /register with the flag.
    if (searchParams.get('addApp') === '1') {
      const seed = searchParams.get('addAppSeed') || '';
      if (isAuthenticated) {
        setAddAppSeed(seed);
        setAddAppOpen(true);
        // Clean the URL so a refresh does not re-open the dialog.
        const next = new URLSearchParams(searchParams);
        next.delete('addApp');
        next.delete('addAppSeed');
        setSearchParams(next, { replace: true });
      } else {
        // Still not authenticated (e.g. cancelled registration) — surface the prompt again.
        setPendingSeed(seed);
        setRegisterPromptOpen(true);
      }
    }
  }, [isAuthenticated]);

  const getActiveCategory = () => {
    const lowerQuery = searchQuery.toLowerCase().trim();
    if (lowerQuery === '') return 'other';
    return categories.find(c => c.searchTerm && lowerQuery.includes(c.searchTerm.toLowerCase()))?.id || null;
  };

  const handleCategoryClick = (categoryId: string, searchTerm: string) => {
    // Toggle off if clicking the same category
    const isAlreadyActive = activeCategory === categoryId;
    const newSearchTerm = isAlreadyActive ? '' : searchTerm;
    
    setSearchQuery(newSearchTerm);
    setSearchParams(newSearchTerm ? { category: categoryId } : {});
    trackPredefinedEvent(GA_EVENTS.CATEGORY_FILTER, isAlreadyActive ? 'clear' : categoryId);
    if (singulRef.current) {
      singulRef.current.search(newSearchTerm);
    }
  };

  const activeCategory = getActiveCategory();

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <LandingNavbar />
      
      {/* Hero section */}
      <Box
        sx={{
          pt: { xs: 12, md: 16 },
          pb: { xs: 4, md: 6 },
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Background gradient */}
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: `
              radial-gradient(ellipse 80% 50% at 50% -20%, rgba(139, 92, 246, 0.12) 0%, transparent 50%),
              radial-gradient(ellipse 60% 40% at 80% 80%, rgba(255, 102, 0, 0.08) 0%, transparent 50%)
            `,
            pointerEvents: 'none',
          }}
        />

        <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Box sx={{ textAlign: 'center', mb: 5 }}>
              <Typography
                variant="h1"
                sx={{
                  fontSize: { xs: '2.5rem', md: '4rem' },
                  fontWeight: 800,
                  mb: 3,
                  letterSpacing: '-0.02em',
                }}
              >
                <Box
                  component="span"
                  sx={{
                    background: 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  3,000+
                </Box>{' '}
                Integrations
              </Typography>
              <Typography
                variant="h5"
                component="p"

                sx={{
                  color: 'text.secondary',
                  maxWidth: 650,
                  mx: 'auto',
                  fontWeight: 400,
                  lineHeight: 1.7,
                  fontSize: { xs: '1.1rem', md: '1.25rem' },
                  mb: 4,
                }}
              >
                Connect your SIEM, EDR, ITSM, Email, Threat Intel, Cloud, and any other data source. 
                Use your existing tools—we fill in the gaps.
              </Typography>
              <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center', flexWrap: 'wrap' }}>
                <Button
                  component={Link}
                  to="/register"
                  variant="contained"
                  size="large"
                  endIcon={<ArrowForwardIcon />}
                  onClick={() => trackCTA('get_started_free', 'apps_hero')}
                  sx={{
                    py: { xs: 1.25, md: 1.5 },
                    px: { xs: 3, md: 4 },
                    fontSize: { xs: '0.9rem', md: '1rem' },
                    fontWeight: 600,
                    borderRadius: 3,
                    background: primaryColor,
                    boxShadow: `0 8px 32px ${primaryColor}40`,
                    '&:hover': {
                      transform: 'translateY(-2px)',
                      boxShadow: `0 12px 40px ${primaryColor}60`,
                    },
                  }}
                >
                  Get Started Free
                </Button>
                <Button
                  variant="outlined"
                  size="large"
                  startIcon={<Plus size={18} />}
                  onClick={() => openAddApp('apps_hero')}
                  sx={{
                    py: { xs: 1.25, md: 1.5 },
                    px: { xs: 3, md: 4 },
                    fontSize: { xs: '0.9rem', md: '1rem' },
                    fontWeight: 600,
                    borderRadius: 3,
                    borderColor: `${primaryColor}80`,
                    color: 'primary.main',
                    '&:hover': {
                      borderColor: 'primary.main',
                      background: `${primaryColor}14`,
                    },
                  }}
                >
                  Add app
                </Button>
              </Box>
            </Box>
          </motion.div>
        </Container>
      </Box>

      {/* Category buttons and search section */}
      <Box sx={{ flex: 1, pb: 12 }}>
        <Container maxWidth="lg">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            {/* Category Grid */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(5, 1fr)' },
                gap: 2,
                mb: 4,
              }}
            >
              {categories.map((category) => {
                const isActive = activeCategory === category.id;
                return (
                  <Box
                    key={category.id}
                    sx={{
                      p: 2.5,
                      backgroundColor: isActive ? `${primaryColor}1A` : 'action.hover',
                      border: '1px solid',
                      borderColor: isActive ? 'primary.main' : 'divider',
                      borderRadius: 3,
                      cursor: 'pointer',
                      transition: 'all 0.3s ease',
                      textAlign: 'center',
                      '&:hover': {
                        borderColor: `${primaryColor}80`,
                        backgroundColor: isActive ? `${primaryColor}26` : 'action.selected',
                      },
                    }}
                    onClick={() => handleCategoryClick(category.id, category.searchTerm)}
                  >
                    <Box
                      sx={{
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        backgroundColor: isActive ? `${primaryColor}33` : 'action.hover',
                        border: '2px solid',
                        borderColor: isActive ? 'primary.main' : 'divider',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        mx: 'auto',
                        mb: 1,
                        transition: 'all 0.3s ease',
                      }}
                    >
                      <category.icon size={18} color={isActive ? primaryColor : undefined} />
                    </Box>
                    <Typography
                      variant="subtitle2"
                      sx={{ color: 'text.primary', fontWeight: 600, mb: 0.25 }}
                    >
                      {category.label}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{ color: 'text.secondary', display: 'block', fontSize: '0.7rem' }}
                    >
                      {category.description}
                    </Typography>
                  </Box>
                );
              })}
            </Box>

            {/* Singul Search Component */}
            <Box
              sx={{
                '--singul-input-bg': 'hsl(var(--input))',
                '--singul-input-border': '1px solid hsl(var(--border))',
                '--singul-input-color': 'hsl(var(--foreground))',
                '--singul-input-focus-border': 'hsl(var(--primary))',
                '--singul-input-focus-shadow': '0 0 0 3px hsla(var(--primary) / 0.15)',
                '--singul-placeholder-color': 'hsl(var(--muted-foreground))',
                '--singul-icon-color': 'hsl(var(--muted-foreground))',
                '--singul-dropdown-bg': 'hsl(var(--background))',
                '--singul-dropdown-border': '1px solid hsl(var(--border))',
                '--singul-item-border': '1px solid hsl(var(--border-subtle))',
                '--singul-item-hover-bg': 'rgba(255, 102, 0, 0.1)',
                '--singul-app-name-color': 'hsl(var(--foreground))',
                '--singul-app-description-color': 'hsl(var(--muted-foreground))',
                '--singul-empty-state-color': 'hsl(var(--muted-foreground))',
                '--singul-grid-gap': '16px',
                '& .singul-results-container': {
                  maxHeight: '600px',
                  mt: 3,
                },
                '& .singul-results-grid': {
                  display: 'grid !important',
                  gridTemplateColumns: {
                    xs: 'repeat(2, 1fr) !important',
                    sm: 'repeat(2, 1fr) !important',
                    md: 'repeat(3, 1fr) !important',
                  },
                  gap: { xs: '12px !important', md: '16px !important' },
                },
                '& .singul-dropdown-item': {
                  backgroundColor: 'hsl(var(--card))',
                  borderRadius: '12px',
                  border: '1px solid hsl(var(--border))',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    backgroundColor: `${primaryColor}14`,
                    borderColor: `${primaryColor}80`,
                  },
                },
                '& .singul-search-input': {
                  backgroundColor: 'hsl(var(--input))',
                  border: '1px solid hsl(var(--border))',
                  color: 'hsl(var(--foreground))',
                  fontSize: { xs: '0.9rem', md: '1rem' },
                  padding: { xs: '12px 14px', md: '14px 16px' },
                  borderRadius: '12px',
                  '&:focus': {
                    borderColor: primaryColor,
                    boxShadow: `0 0 0 3px ${primaryColor}26`,
                  },
                  '&::placeholder': {
                    color: 'hsl(var(--muted-foreground))',
                  },
                },
                '& .singul-app-icon': {
                  backgroundColor: 'hsl(var(--muted) / 0.5)',
                  border: '1px solid hsl(var(--border))',
                },
                '& .singul-app-name': {
                  color: 'hsl(var(--foreground))',
                  fontSize: { xs: '0.8rem', md: '0.9rem' },
                },
                '& .singul-app-description': {
                  color: 'hsl(var(--muted-foreground))',
                  fontSize: { xs: '0.7rem', md: '0.75rem' },
                },
                '& .singul-empty-state, & .singul-end-of-results': {
                  color: 'hsl(var(--muted-foreground))',
                },
              }}
            >
              <ShuffleMCP
                ref={singulRef}
                placeholder="Search integrations... (e.g., Splunk, CrowdStrike)"
                layout="grid"
                gridColumns={3}
                showDescription
                inline
                hitsPerPage={28}
                preventDefault
                hideAuthStatus
                initialQuery={searchQuery}
                onSearchChange={(query: string) => {
                  setSearchQuery(query);
                  if (query.length > 2) {
                    trackPredefinedEvent(GA_EVENTS.SEARCH_USED, query);
                  }
                }}
                onAppSelected={({ app }: { app: any }) => {
                  trackPredefinedEvent(GA_EVENTS.APP_VIEWED, app.name);
                  navigate(`/apps/${encodeURIComponent(app.name.toLowerCase().replace(/[\s]+/g, '_'))}`);
                }}
                onCreateNewApp={() => openAddApp('apps_search_empty')}
              />
            </Box>
          </motion.div>

          {/* CTA at bottom */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            <Box sx={{ textAlign: 'center', mt: 8 }}>
              <Typography
                sx={{
                  color: 'text.secondary',
                  fontSize: '1.1rem',
                  mb: 3,
                }}
              >
                Can't find what you need? We support any REST API or Python function.
              </Typography>
              <Button
                component={Link}
                to="/register"
                variant="outlined"
                size="large"
                onClick={() => trackCTA('start_building', 'apps_bottom')}
                sx={{
                  py: { xs: 1.25, md: 1.5 },
                  px: { xs: 3, md: 4 },
                  fontSize: { xs: '0.9rem', md: '1rem' },
                  fontWeight: 600,
                  borderRadius: 3,
                  borderColor: 'rgba(255, 102, 0, 0.5)',
                  color: 'primary.main',
                  '&:hover': {
                    borderColor: 'primary.main',
                    background: 'rgba(255, 102, 0, 0.08)',
                  },
                }}
              >
                Start Building
              </Button>
            </Box>
          </motion.div>
        </Container>
      </Box>

      <AddAppDialog
        open={addAppOpen}
        onOpenChange={setAddAppOpen}
        initialInput={addAppSeed}
        onCreated={(_appId, app) => {
          if (app?.name) {
            navigate(`/apps/${encodeURIComponent(app.name.toLowerCase().replace(/[\s]+/g, '_'))}`);
          }
        }}
      />

      <Dialog
        open={registerPromptOpen}
        onClose={() => setRegisterPromptOpen(false)}
        fullWidth
        maxWidth="xs"
        PaperProps={{
          sx: {
            background: 'hsl(var(--card))',
            color: 'hsl(var(--foreground))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 2,
          },
        }}
      >
        <DialogTitle sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, pt: 4, pb: 1 }}>
          <Box sx={{
            width: 48, height: 48, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'hsla(var(--primary) / 0.1)',
            border: '1px solid hsla(var(--primary) / 0.3)',
            mb: 0.5,
          }}>
            <Plus size={24} style={{ color: 'hsl(var(--primary))' }} />
          </Box>
          <Typography sx={{ fontSize: 20, fontWeight: 700, textAlign: 'center' }}>
            Register to add a new app
          </Typography>
        </DialogTitle>
        <DialogContent sx={{ px: 4, pb: 1 }}>
          <Typography sx={{ fontSize: 14, color: 'hsl(var(--muted-foreground))', textAlign: 'center' }}>
            Generating a new integration requires a free Shuffle account. You will be sent to registration, and after signing up we will bring you right back here with this popup ready to continue{pendingSeed ? <> for <strong style={{ color: 'hsl(var(--foreground))' }}>"{pendingSeed}"</strong></> : null}.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 4, pb: 3, pt: 2, justifyContent: 'center', gap: 1 }}>
          <Button onClick={() => setRegisterPromptOpen(false)} sx={{ textTransform: 'none', color: 'hsl(var(--muted-foreground))' }}>
            Not now
          </Button>
          <Button
            variant="contained"
            onClick={goRegisterForAddApp}
            sx={{ textTransform: 'none', background: primaryColor, '&:hover': { background: primaryColor, filter: 'brightness(1.05)' } }}
          >
            Register &amp; continue
          </Button>
        </DialogActions>
      </Dialog>

      <Footer />
    </Box>
  );
}
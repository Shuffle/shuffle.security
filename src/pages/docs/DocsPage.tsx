import { X as XIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from '@/lib/router-compat';
import { Box, Container, IconButton, Drawer, Typography, Skeleton, Stack, useTheme, useMediaQuery } from '@mui/material';
import { LandingNavbar } from '@/components/landing/LandingNavbar';
import { DocsSidebar } from '@/components/docs/DocsSidebar';
import { MarkdownRenderer } from '@/components/docs/MarkdownRenderer';
import { DocsTableOfContents, MobileTableOfContents } from '@/components/docs/DocsTableOfContents';
import { useDocContent, type RemoteDocMeta } from '@/components/docs/useDocContent';
import { setActiveDocPromptContext, clearActiveDocPromptContext } from '@/lib/docsPromptContext';
import { getDocGroup, loadGroupDocsContent, getDocDisplayLabel } from '@/components/docs/docGroups';
import { usePageMeta } from '@/hooks/usePageMeta';
import { ComponentErrorBoundary } from '@/components/common/ComponentErrorBoundary';
import type { ShuffleProduct } from '@/lib/shuffleUrls';

const SIDEBAR_WIDTH_MD = 260;
const SIDEBAR_WIDTH_XL = 280;

interface DocsPageProps {
  /** SSR-provided markdown/metadata; when present the client fetch is skipped. */
  initialContent?: string | null;
  /** API folder to load from (e.g. "legal"). */
  folder?: string;
  /** URL prefix for this section (defaults to /docs). */
  basePath?: string;
  /** Section label used in the sidebar and fallback titles. */
  sectionTitle?: string;
  /** Hide read time, contributors and "Edit on GitHub" metadata. Print stays. */
  hideMeta?: boolean;
  initialMeta?: RemoteDocMeta | null;
  /** Explicitly declare whether docs are viewed within Shuffle Security or Shuffle Core/Automation */
  currentProduct?: ShuffleProduct;
}

const DocsPage = ({
  initialContent = null,
  initialMeta = null,
  folder,
  basePath = '/docs',
  sectionTitle = 'Documentation',
  hideMeta,
  currentProduct,
}: DocsPageProps) => {
  const params = useParams<{ slug?: string; name?: string }>();
  const slug = params.slug || params.name || 'index';
  const [mobileOpen, setMobileOpen] = useState(false);

  const effectiveSlug = useMemo(() => {
    const s = (slug || '').toLowerCase().replace(/_+/g, '-');
    if (!s || s === 'index') {
      if (!folder || folder === 'docs') {
        return 'getting-started';
      }
    }
    return s || slug;
  }, [slug, folder]);

  const doc = useDocContent({
    slug,
    folder,
    basePath,
    initialContent,
    initialMeta,
  });

  const fallbackTitle =
    slug === 'index'
      ? sectionTitle
      : slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const docTitle = doc.title || doc.meta?.name || getDocDisplayLabel(effectiveSlug, fallbackTitle);
  const group = getDocGroup(effectiveSlug);
  const categoryLabel =
    folder && folder !== 'docs'
      ? folder.charAt(0).toUpperCase() + folder.slice(1)
      : group ? group.label : '';
  const fullPageTitle =
    slug === 'index'
      ? `Shuffle Security ${sectionTitle}`
      : categoryLabel
        ? (categoryLabel === 'Security'
            ? `Shuffle Security - ${docTitle}`
            : `Shuffle Security ${categoryLabel} - ${docTitle}`)
        : `Shuffle Security - ${docTitle}`;

  usePageMeta({
    title: fullPageTitle,
    rawTitle: true,
    description: `Shuffle Security ${categoryLabel ? `${categoryLabel.toLowerCase()} — ` : ''}${docTitle}.`,
    url: `${basePath}/${slug}`,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      headline: fullPageTitle,
      description: `Shuffle Security ${categoryLabel ? `${categoryLabel.toLowerCase()} — ` : ''}${docTitle}.`,
      url: `https://shuffle.security${basePath}/${slug}`,
      author: { '@type': 'Organization', name: 'Shuffle Security' },
      publisher: { '@type': 'Organization', name: 'Shuffle Security', url: 'https://shuffle.security' },
    },
  });

  // Keep global entity title and doc context in sync with current doc and its group for Ask AI contextual handles
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const group = getDocGroup(effectiveSlug);
    (window as any).__shuffleActiveEntityTitle = group ? group.label : docTitle;

    setActiveDocPromptContext({
      title: docTitle,
      content: doc.content,
      slug: effectiveSlug,
      basePath,
      pathname: basePath === '/docs' && slug === 'index' ? '/docs' : `${basePath}/${effectiveSlug}`,
      groupId: group?.id,
      groupLabel: group?.label,
    });

    let cancelled = false;
    if (group) {
      loadGroupDocsContent(group.id, folder).then((contents) => {
        if (cancelled) return;
        const groupDocs = Object.entries(contents).map(([s, md]) => ({
          slug: s,
          title: getDocDisplayLabel(s),
          content: md,
        }));
        setActiveDocPromptContext({
          title: docTitle,
          content: doc.content,
          slug,
          basePath,
          pathname: `${basePath}/${slug}`,
          groupId: group.id,
          groupLabel: group.label,
          groupDocs,
        });
      }).catch(() => {
        // Silently keep single doc context if group fetch fails
      });
    }

    return () => {
      cancelled = true;
      delete (window as any).__shuffleActiveEntityTitle;
      clearActiveDocPromptContext();
    };
  }, [docTitle, doc.content, slug, basePath, folder]);

  const hasHeadings = doc.headings.length > 0;
  const theme = useTheme();
  const isLgUp = useMediaQuery(theme.breakpoints.up('lg')); // >= 1200px
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    setContainerWidth(el.getBoundingClientRect().width);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      try {
        observer = new ResizeObserver((entries) => {
          for (const entry of entries) {
            if (entry.contentBoxSize) {
              const size = Array.isArray(entry.contentBoxSize) ? entry.contentBoxSize[0] : entry.contentBoxSize;
              setContainerWidth(size.inlineSize);
            } else {
              setContainerWidth(entry.contentRect.width);
            }
          }
        });
        observer.observe(el);
      } catch {
        observer = null;
      }
    }
    return () => observer?.disconnect();
  }, []);

  // Show desktop TOC only if viewport is >= 1200px (isLgUp) AND the content area has
  // at least 860px of available space (leaving enough room for middle content + gap + TOC).
  // If the window is < 1200px, or if the Ask AI panel shrinks available space below 860px,
  // we smoothly fall back to the mobile TOC jumper view.
  const showDesktopToc = isLgUp && (containerWidth === null || containerWidth >= 860);

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <LandingNavbar onMobileMenuClick={() => setMobileOpen(true)} />

      {/* Spacer for fixed navbar */}
      <Box sx={{ height: 64 }} />

      {/* Mobile drawer */}
      <Drawer
        variant="temporary"
        anchor="right"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': {
            boxSizing: 'border-box',
            width: 300,
            minWidth: 260,
            maxWidth: '85vw',
            backgroundColor: 'background.default',
            display: 'flex',
            flexDirection: 'column',
          },
        }}
      >
        <Box
          sx={{
            p: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
            <Typography
              variant="subtitle1"
              sx={{
                fontWeight: 700,
                background: 'linear-gradient(135deg, #FF6600 0%, #FF8533 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Shuffle
            </Typography>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'text.primary' }}>
              Docs
            </Typography>
          </Box>
          <IconButton
            onClick={() => setMobileOpen(false)}
            size="small"
            aria-label="Close menu"
            sx={{ color: 'text.secondary' }}
          >
            <XIcon size={18} />
          </IconButton>
        </Box>

        <Box sx={{ flex: 1, overflowY: 'auto' }}>
          <DocsSidebar
            onNavigate={() => setMobileOpen(false)}
            activeSlug={effectiveSlug}
            folder={folder}
            basePath={basePath}
            title={sectionTitle}
            autoExpand={folder === 'articles' || folder === 'legal'}
            hideExternal={Boolean(folder)}
          />
        </Box>

        <Box
          sx={{
            p: 2,
            borderTop: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            flexDirection: 'column',
            gap: 1.25,
            backgroundColor: 'background.paper',
          }}
        >
          <Typography
            component={Link}
            to="/"
            onClick={() => setMobileOpen(false)}
            sx={{
              fontSize: '0.875rem',
              color: 'text.secondary',
              textDecoration: 'none',
              fontWeight: 500,
              '&:hover': { color: 'primary.main' },
            }}
          >
            Home
          </Typography>
          <Typography
            component={Link}
            to="/#features"
            onClick={() => setMobileOpen(false)}
            sx={{
              fontSize: '0.875rem',
              color: 'text.secondary',
              textDecoration: 'none',
              fontWeight: 500,
              '&:hover': { color: 'primary.main' },
            }}
          >
            Features
          </Typography>
          <Typography
            component={Link}
            to="/usecases"
            onClick={() => setMobileOpen(false)}
            sx={{
              fontSize: '0.875rem',
              color: 'text.secondary',
              textDecoration: 'none',
              fontWeight: 500,
              '&:hover': { color: 'primary.main' },
            }}
          >
            Usecases
          </Typography>
        </Box>
      </Drawer>

      <Box sx={{ display: 'flex', flex: 1, minWidth: 0 }}>
        {/* Desktop Sidebar (Left) */}
        <Box
          sx={{
            display: { xs: 'none', md: 'block' },
            position: 'fixed',
            top: 64,
            left: 0,
            height: 'calc(100vh - 64px)',
            width: { md: SIDEBAR_WIDTH_MD, xl: SIDEBAR_WIDTH_XL },
            backgroundColor: 'background.default',
            zIndex: 1,
          }}
        >
          <DocsSidebar
            activeSlug={effectiveSlug}
            folder={folder}
            basePath={basePath}
            title={sectionTitle}
            autoExpand={folder === 'articles' || folder === 'legal'}
            hideExternal={Boolean(folder)}
          />
        </Box>

        {/* Main content + Right ToC area */}
        <Box
          ref={containerRef}
          sx={{
            flex: 1,
            minWidth: 0,
            ml: { xs: 0, md: `${SIDEBAR_WIDTH_MD}px`, xl: `${SIDEBAR_WIDTH_XL}px` },
            mr: { xs: 0, md: 'var(--ask-ai-panel-width, 0px)' },
            transition: 'margin 0.2s ease',
            minHeight: 'calc(100vh - 64px)',
          }}
        >
          <Container
            maxWidth={false}
            sx={{
              maxWidth: 1440,
              width: '100%',
              py: { xs: 3, md: 5 },
              px: { xs: 2, sm: 3, md: 3, lg: 4, xl: 5 },
              boxSizing: 'border-box',
            }}
          >
            <Box
              sx={{
                display: 'flex',
                gap: { lg: 3.5, xl: 5 },
                alignItems: 'flex-start',
                minWidth: 0,
                width: '100%',
              }}
            >
              {/* Document Article Column */}
              <Box
                sx={{
                  flex: 1,
                  minWidth: 0,
                  maxWidth: showDesktopToc ? { xs: '100%', lg: 820, xl: 900 } : '100%',
                }}
              >
                <ComponentErrorBoundary name="DocsMarkdownRenderer" onReset={doc.reload}>
                  <MarkdownRenderer
                    title={docTitle}
                    slug={effectiveSlug}
                    folder={folder}
                    basePath={basePath}
                    currentProduct={currentProduct}
                    content={doc.content}
                    meta={doc.meta}
                    loading={doc.loading}
                    resetting={doc.resetting}
                    error={doc.error}
                    suggestions={doc.suggestions}
                    suggestLoading={doc.suggestLoading}
                    onResetCache={doc.handleResetCache}
                    hideMeta={hideMeta ?? folder === 'legal'}
                    mobileToc={
                      hasHeadings && !showDesktopToc ? (
                        <Box
                          sx={{
                            position: 'sticky',
                            top: { xs: 56, sm: 64 },
                            zIndex: 20,
                            backgroundColor: 'background.default',
                            py: 0.5,
                            mb: 3,
                            mx: { xs: -2, sm: -3 },
                            width: {
                              xs: 'calc(100% + 32px)',
                              sm: 'calc(100% + 48px)',
                              md: '100%',
                            },
                          }}
                        >
                          <ComponentErrorBoundary name="DocsMobileTOC" fallback={null}>
                            <MobileTableOfContents headings={doc.headings} />
                          </ComponentErrorBoundary>
                        </Box>
                      ) : null
                    }
                  />
                </ComponentErrorBoundary>
              </Box>

              {/* Right Sidebar: Table of Contents (lg+) */}
              {showDesktopToc && (hasHeadings || doc.loading) && (
                <Box
                  component="aside"
                  aria-label="Table of contents"
                  sx={{
                    width: { lg: 220, xl: 250 },
                    flexShrink: 0,
                    display: { xs: 'none', lg: 'block' },
                    position: 'sticky',
                    top: 84,
                    alignSelf: 'flex-start',
                    maxHeight: 'calc(100vh - 100px)',
                    overflowY: 'auto',
                    pr: { lg: 2, xl: 2.5 },
                    // subtle scrollbar
                    '&::-webkit-scrollbar': { width: 4 },
                    '&::-webkit-scrollbar-thumb': {
                      backgroundColor: 'divider',
                      borderRadius: 2,
                    },
                  }}
                >
                  {doc.loading ? (
                    <Box sx={{ pt: 1 }}>
                      <Skeleton variant="text" width={90} height={18} sx={{ mb: 2 }} />
                      <Stack spacing={1.5}>
                        <Skeleton variant="text" width="80%" height={14} />
                        <Skeleton variant="text" width="60%" height={14} sx={{ ml: 1.5 }} />
                        <Skeleton variant="text" width="70%" height={14} sx={{ ml: 1.5 }} />
                        <Skeleton variant="text" width="85%" height={14} />
                        <Skeleton variant="text" width="55%" height={14} sx={{ ml: 1.5 }} />
                      </Stack>
                    </Box>
                  ) : (
                    <ComponentErrorBoundary name="DocsDesktopTOC" fallback={null}>
                      <DocsTableOfContents headings={doc.headings} />
                    </ComponentErrorBoundary>
                  )}
                </Box>
              )}
            </Box>
          </Container>
        </Box>
      </Box>
    </Box>
  );
};

export default DocsPage;

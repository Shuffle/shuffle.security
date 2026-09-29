import { useCallback, useEffect, useMemo, useRef } from 'react';
import ShuffleMarkdown from '@/Shuffle-Core/components/Markdown';
import {
  parseMarkdownSegments,
  DocDynamicComponent,
  DocExpandable,
} from './DocDynamicComponents';
import { DocCurlViewer } from './DocCurlViewer';
import { Link, useLocation, useNavigate } from '@/lib/router-compat';
import {
  Avatar,
  AvatarGroup,
  Box,
  Button,
  CircularProgress,
  Link as MuiLink,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Clock as ClockIcon,
  Github as GithubIcon,
  RefreshCw as RefreshCwIcon,
} from 'lucide-react';
import { useIsSupport } from '@/hooks/useIsSupport';
import { useAuth } from '@/context/AuthContext';
import { docSlug } from '@/components/docs/remoteDocs';
import PrintDocsDialog from '@/components/docs/PrintDocsDialog';
import { anchorKey, isTocHeading, stripMarkdownInline, safeDecodeURIComponent } from './tocUtils';
import { ComponentErrorBoundary } from '@/components/common/ComponentErrorBoundary';
import {
  resolveProductLink,
  type ShuffleProduct,
} from '@/lib/shuffleUrls';
import { navigateToShuffleCore } from '@/lib/authHandoff';
import { getSessionToken, hasShuffleAuth } from '@/Shuffle-Core/api';
import {
  useDocContent,
  type RemoteDocMeta,
  type Contributor,
  type DocSuggestion,
} from './useDocContent';

export type { RemoteDocMeta, Contributor, DocSuggestion };

export interface MarkdownRendererProps {
  slug?: string;
  /** API folder to load from (e.g. "legal"); defaults to the main docs folder. */
  folder?: string;
  /** URL prefix for internal links (defaults to /docs). */
  basePath?: string;
  /** SSR-provided markdown/metadata; when present the initial client fetch is skipped. */
  initialContent?: string | null;
  initialMeta?: RemoteDocMeta | null;
  /** Hide read time, contributors and "Edit on GitHub" metadata. Print stays. */
  hideMeta?: boolean;
  /** Primary H1 document title to render at the very top. */
  title?: string | null;
  /** Optional mobile/tablet sticky table of contents component to render before actual content. */
  mobileToc?: React.ReactNode;
  /** Controlled doc content (from useDocContent) */
  content?: string;
  meta?: RemoteDocMeta | null;
  loading?: boolean;
  resetting?: boolean;
  error?: string | null;
  suggestions?: DocSuggestion[];
  suggestLoading?: boolean;
  onResetCache?: () => Promise<void>;
  /** Explicitly set or override the current product ('security' vs 'core' / 'automation'). Defaults to auto-detected. */
  currentProduct?: ShuffleProduct;
}

const normalizeDocPath = (pathname: string, basePath = '/docs') => {
  const match = pathname.match(/(?:^|\/)docs\/([^/]+)$/i);
  if (!match) return pathname;
  const name = match[1].replace(/\.md$/i, '');
  return `${basePath}/${docSlug(name)}`;
};

export const MarkdownRenderer = ({
  slug = 'index',
  folder,
  basePath = '/docs',
  initialContent = null,
  initialMeta = null,
  hideMeta = false,
  title: propTitle,
  mobileToc,
  content: propContent,
  meta: propMeta,
  loading: propLoading,
  resetting: propResetting,
  error: propError,
  suggestions: propSuggestions,
  suggestLoading: propSuggestLoading,
  onResetCache: propOnResetCache,
  currentProduct,
}: MarkdownRendererProps) => {
  const isControlled = propContent !== undefined;

  const hookDoc = useDocContent(
    isControlled
      ? { slug: '', initialContent: '' }
      : { slug, folder, basePath, initialContent, initialMeta },
  );

  const title = propTitle !== undefined ? propTitle : hookDoc.title;
  const content = isControlled ? propContent : hookDoc.content;
  const meta = isControlled ? (propMeta ?? null) : hookDoc.meta;
  const loading = isControlled ? Boolean(propLoading) : hookDoc.loading;
  const resetting = isControlled ? Boolean(propResetting) : hookDoc.resetting;
  const error = isControlled ? (propError ?? null) : hookDoc.error;
  const suggestions = isControlled ? (propSuggestions ?? []) : hookDoc.suggestions;
  const suggestLoading = isControlled ? Boolean(propSuggestLoading) : hookDoc.suggestLoading;
  const handleResetCache = propOnResetCache || hookDoc.handleResetCache;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { hash } = location;

  const scrollToDocAnchor = useCallback((rawHash: string) => {
    const root = containerRef.current;
    if (!root) return false;
    const target = anchorKey(safeDecodeURIComponent(rawHash.replace(/^#/, '')));
    if (!target) return false;
    const headings = Array.from(root.querySelectorAll('h1, h2, h3, h4, h5, h6')) as HTMLElement[];
    const match = headings.find(
      (heading) =>
        anchorKey(heading.id || '') === target || anchorKey(heading.textContent || '') === target,
    );
    if (!match) return false;
    requestAnimationFrame(() => match.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    return true;
  }, []);

  // Give every heading a stable id, then scroll to the hash target once the
  // markdown has rendered (docs links carry anchors like "#cloud_specific_example").
  useEffect(() => {
    if (loading || !content) return;
    const root = containerRef.current;
    if (!root) return;

    const headings = Array.from(root.querySelectorAll('h1, h2, h3, h4, h5, h6')) as HTMLElement[];
    const seenKeys = new Map<string, number>();

    headings.forEach((heading) => {
      const clean = stripMarkdownInline(heading.textContent || '');
      // If this heading is a TOC heading ("Table of Contents"), hide it completely!
      if (isTocHeading(clean)) {
        heading.style.display = 'none';
        return;
      }
      const baseKey = anchorKey(clean);
      if (baseKey) {
        const count = seenKeys.get(baseKey) || 0;
        seenKeys.set(baseKey, count + 1);
        const key = count === 0 ? baseKey : `${baseKey}_${count}`;
        heading.id = key;
        heading.style.scrollMarginTop = '80px';
      }
    });

    scrollToDocAnchor(hash);
  }, [content, loading, hash, scrollToDocAnchor]);

  const isSupportHook = useIsSupport();
  const { userInfo } = useAuth();
  const isSupport =
    isSupportHook ||
    Boolean((userInfo as any)?.admin || (userInfo as any)?.role === 'admin' || (userInfo as any)?.support);

  const editUrl = useMemo(() => {
    if (meta?.link) return meta.link;
    if (slug && slug !== 'index') {
      return `https://github.com/Shuffle/shuffle.security/blob/main/docs/${slug}.md`;
    }
    return 'https://github.com/Shuffle/shuffle.security';
  }, [meta?.link, slug]);

  const readingTime = useMemo(() => {
    if (meta?.read_time) return meta.read_time;
    const words = (content || '').trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.ceil(words / 200));
  }, [meta?.read_time, content]);

  const actionButtons = (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ ml: 'auto' }}>
      {isSupport && (
        <Button
          variant="outlined"
          size="small"
          onClick={handleResetCache}
          disabled={resetting || loading}
          startIcon={<RefreshCwIcon size={14} className={resetting ? 'animate-spin' : ''} />}
          sx={{
            textTransform: 'none',
            height: 36,
            borderColor: 'hsl(var(--border))',
            color: 'text.primary',
            '&:hover': { borderColor: 'primary.main', color: 'primary.main' },
          }}
        >
          {resetting ? 'Resetting…' : 'Reset Cache'}
        </Button>
      )}
      <PrintDocsDialog
        slug={slug}
        title={title}
        currentMarkdown={content}
        disabled={loading || resetting}
        folder={folder}
      />
    </Stack>
  );

  if (loading) {
    return (
      <Box sx={{ width: '100%', py: 1 }}>
        {/* Document Title */}
        {title && (
          <Typography
            component="h1"
            sx={{
              fontSize: { xs: '30px', md: '36px' },
              fontWeight: 600,
              color: 'text.primary',
              mb: 3,
            }}
          >
            {title}
          </Typography>
        )}

        {/* Read-time & Loading Indicator Bar */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            mb: 4,
            pb: 3,
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Skeleton variant="text" width={90} height={20} />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CircularProgress size={16} sx={{ color: 'primary.main' }} />
            <Typography sx={{ color: 'text.secondary', fontSize: '0.8rem', fontWeight: 500 }}>
              Loading…
            </Typography>
          </Box>
        </Box>

        {/* Paragraph & Subheading Skeletons */}
        <Stack spacing={2.2} sx={{ maxWidth: 820 }}>
          <Skeleton variant="rectangular" height={16} width="95%" sx={{ borderRadius: 1 }} />
          <Skeleton variant="rectangular" height={16} width="100%" sx={{ borderRadius: 1 }} />
          <Skeleton variant="rectangular" height={16} width="82%" sx={{ borderRadius: 1 }} />

          <Box sx={{ pt: 3, pb: 0.5 }}>
            <Skeleton variant="rectangular" height={26} width="36%" sx={{ borderRadius: 1 }} />
          </Box>

          <Skeleton variant="rectangular" height={16} width="100%" sx={{ borderRadius: 1 }} />
          <Skeleton variant="rectangular" height={16} width="92%" sx={{ borderRadius: 1 }} />
          <Skeleton variant="rectangular" height={16} width="88%" sx={{ borderRadius: 1 }} />
          <Skeleton variant="rectangular" height={16} width="74%" sx={{ borderRadius: 1 }} />

          <Box sx={{ pt: 3, pb: 0.5 }}>
            <Skeleton variant="rectangular" height={26} width="45%" sx={{ borderRadius: 1 }} />
          </Box>

          <Skeleton variant="rectangular" height={16} width="98%" sx={{ borderRadius: 1 }} />
          <Skeleton variant="rectangular" height={16} width="90%" sx={{ borderRadius: 1 }} />
          <Skeleton variant="rectangular" height={16} width="65%" sx={{ borderRadius: 1 }} />
        </Stack>
      </Box>
    );
  }

  if (error) {
    return (
      <Box>
        <Box sx={{ py: 6, maxWidth: 640, mx: 'auto' }}>
          <Typography sx={{ color: 'text.primary', fontSize: '1.25rem', fontWeight: 600, mb: 1 }}>
            This documentation page does not exist
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
            We could not find a document for "{slug}". It may have been renamed or moved.
          </Typography>

          {(suggestLoading || suggestions.length > 0) && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
                {suggestLoading ? 'Looking for related documentation…' : 'Related documentation'}
              </Typography>

              {suggestLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                  <CircularProgress size={18} />
                </Box>
              ) : (
                <Stack spacing={1}>
                  {suggestions.map((s) => (
                    <Box
                      key={s.path}
                      component={Link}
                      to={s.path}
                      sx={{
                        display: 'block',
                        p: 1.5,
                        borderRadius: 1,
                        border: '1px solid hsl(var(--border))',
                        background: 'hsl(var(--card))',
                        textDecoration: 'none',
                        '&:hover': { borderColor: 'primary.main' },
                      }}
                    >
                      <Typography sx={{ color: 'text.primary', fontWeight: 600, fontSize: '0.9rem' }}>
                        {s.label}
                      </Typography>
                      {s.snippet && (
                        <Typography
                          variant="body2"
                          sx={{
                            color: 'text.secondary',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {s.snippet}
                        </Typography>
                      )}
                    </Box>
                  ))}
                </Stack>
              )}
            </Box>
          )}
        </Box>
      </Box>
    );
  }



  return (
    <Box
      ref={containerRef}
      className="prose dark:prose-invert max-w-none"

      sx={{
        '& h1': {
          color: 'text.primary',
          fontSize: '2.25rem',
          fontWeight: 700,
          mb: 3,
        },
        '& h2': {
          color: 'text.primary',
          fontSize: { xs: '1.4rem', sm: '1.65rem' },
          fontWeight: 600,
          mt: { xs: '3.5rem !important', md: '5rem !important' },
          mb: 2.5,
          letterSpacing: '-0.015em',
          lineHeight: 1.3,
        },
        '& h1 + h2': {
          mt: '2rem !important',
        },
        '& h3': {
          color: 'text.primary',
          fontSize: '1.25rem',
          fontWeight: 600,
          mt: 4,
          mb: 2,
        },
        '& h4, & h5, & h6': {
          color: 'text.primary',
          fontWeight: 600,
          mt: 3,
          mb: 1.5,
        },
        '& p': {
          color: 'text.secondary',
          lineHeight: 1.8,
          mb: 2,
        },
        '& strong, & b': {
          color: 'text.primary',
          fontWeight: 600,
        },
        '& em, & i': {
          color: 'inherit',
        },
        '& a': {
          color: 'primary.main',
          textDecoration: 'none',
          '&:hover': {
            textDecoration: 'underline',
          },
        },
        '& code': {
          backgroundColor: 'rgba(255, 102, 0, 0.1)',
          color: 'primary.main',
          px: 1,
          py: 0.5,
          borderRadius: 1,
          fontSize: '0.875rem',
          fontFamily: 'JetBrains Mono, monospace',
        },
        '& pre': {
          backgroundColor: (t) => t.palette.mode === 'dark' ? '#0D0D0D' : '#f5f5f5',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          p: 3,
          overflow: 'auto',
          '& code': {
            backgroundColor: 'transparent',
            p: 0,
            color: 'text.primary',
          },
        },
        '& ul, & ol': {
          color: 'text.secondary',
          pl: 3,
          mb: 3,
        },
        '& li': {
          mb: 1,
          color: 'text.secondary',
        },
        '& li::marker': {
          color: 'text.secondary',
        },
        '& table': {
          width: '100%',
          borderCollapse: 'collapse',
          mb: 4,
        },
        '& th': {
          backgroundColor: (t) => t.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
          borderBottom: '2px solid',
          borderColor: 'divider',
          p: 2,
          textAlign: 'left',
          fontWeight: 600,
          color: 'text.primary',
        },
        '& td': {
          borderBottom: '1px solid',
          borderColor: 'divider',
          p: 2,
          color: 'text.secondary',
        },
        '& blockquote': {
          borderLeft: '4px solid',
          borderColor: 'primary.main',
          pl: 3,
          ml: 0,
          fontStyle: 'italic',
          color: 'text.secondary',
        },
        '& hr': {
          border: 'none',
          borderTop: '1px solid',
          borderColor: 'divider',
          my: 6,
        },
      }}
    >
      {/* 1. # H1 Document Title */}
      {title && (
        <Typography
          component="h1"
          sx={{
            fontSize: { xs: '30px', md: '36px' },
            fontWeight: 600,
            color: 'text.primary',
            mb: 3,
          }}
        >
          {title}
        </Typography>
      )}

      {/* 2a. Desktop Metadata Bar (>= md): read_time, contributors, Edit on GitHub, Reset Cache, Print */}
      <Stack
        direction="row"
        spacing={2}
        alignItems="center"
        flexWrap="wrap"
        sx={{
          display: { xs: 'none', md: 'flex' },
          mb: 4,
          pb: 3,
          borderBottom: '1px solid',
          borderColor: 'divider',
          rowGap: 1.5,
        }}
      >
        {!hideMeta && (
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ color: 'text.secondary' }}>
            <ClockIcon size={14} />
            <Typography variant="caption" sx={{ fontSize: '0.8125rem' }}>
              {readingTime} min read
            </Typography>
          </Stack>
        )}

        {!hideMeta && meta?.contributors && meta.contributors.length > 0 && (
          <AvatarGroup
            max={6}
            sx={{
              '& .MuiAvatar-root': {
                width: 24,
                height: 24,
                fontSize: '0.7rem',
                border: '1px solid',
                borderColor: 'divider',
              },
            }}
          >
            {meta.contributors.map((c, i) => {
              const handle = c.url?.split('/').filter(Boolean).pop() || c.name || 'contributor';
              const avatar = (
                <Avatar key={c.url || i} src={c.image} alt={handle}>
                  {handle.charAt(0).toUpperCase()}
                </Avatar>
              );
              return (
                <Tooltip key={c.url || i} title={handle} arrow>
                  {c.url ? (
                    <MuiLink
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      sx={{ display: 'inline-flex' }}
                    >
                      {avatar}
                    </MuiLink>
                  ) : (
                    avatar
                  )}
                </Tooltip>
              );
            })}
          </AvatarGroup>
        )}

        {!hideMeta && editUrl && (
          <Button
            component="a"
            href={editUrl}
            target="_blank"
            rel="noopener noreferrer"
            variant="outlined"
            size="small"
            startIcon={<GithubIcon size={14} />}
            sx={{
              textTransform: 'none',
              height: 36,
              px: 1.5,
              fontSize: '0.8125rem',
              borderRadius: 1,
              borderColor: 'hsl(var(--border))',
              color: 'text.primary',
              '&:hover': {
                borderColor: 'primary.main',
                color: 'primary.main',
              },
            }}
          >
            Edit on GitHub
          </Button>
        )}

        {actionButtons}
      </Stack>

      {/* 2b. Mobile Metadata Bar (< md): read_time and Print / Export */}
      <Stack
        direction="row"
        spacing={2}
        alignItems="center"
        justifyContent="space-between"
        sx={{
          display: { xs: 'flex', md: 'none' },
          mb: 4,
          pb: 3,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        {!hideMeta ? (
          <Typography
            variant="caption"
            sx={{
              color: 'text.secondary',
              fontSize: '0.85rem',
              fontWeight: 500,
            }}
          >
            {readingTime}m to read
          </Typography>
        ) : (
          <Box />
        )}

        <Stack direction="row" spacing={1} alignItems="center">
          {isSupport && (
            <Button
              variant="outlined"
              size="small"
              onClick={handleResetCache}
              disabled={resetting || loading}
              startIcon={<RefreshCwIcon size={14} className={resetting ? 'animate-spin' : ''} />}
              sx={{
                textTransform: 'none',
                height: 32,
                fontSize: '0.75rem',
                borderColor: 'hsl(var(--border))',
                color: 'text.primary',
                '&:hover': { borderColor: 'primary.main', color: 'primary.main' },
              }}
            >
              {resetting ? 'Resetting…' : 'Reset'}
            </Button>
          )}
          <PrintDocsDialog
            slug={slug}
            title={title}
            currentMarkdown={content}
            disabled={loading || resetting}
            folder={folder}
          />
        </Stack>
      </Stack>

      {/* Mobile / Tablet On this page jumper (< xl) */}
      {mobileToc}

      {/* 3. Actual Content */}
      {(() => {
        const segments = parseMarkdownSegments(content);
        const linkComponent = {
          a: ({ href, children, ...restProps }: any) => {
            // In-page anchors update the URL as well as scrolling. Explicitly
            // scroll too, because selecting the same hash twice does not cause
            // React Router's location state to change.
            if (href?.startsWith('#')) {
              return (
                <a
                  href={href}
                  onClick={(e) => {
                    e.preventDefault();
                    navigate(`${location.pathname}${location.search}${href}`);
                    scrollToDocAnchor(href);
                  }}
                  {...restProps}
                >
                  {children}
                </a>
              );
            }

            // Reference docs contain a mix of `/docs/name`, `name.md`, and
            // relative `./name.md` links. Route all of those through the SPA
            // and preserve their heading hash.
            if (href) {
              const trimmed = href.trim();
              const isRelativeDoc =
                !/^[a-z][a-z\d+.-]*:/i.test(trimmed) &&
                /(?:^|\/)\.?\.?\/?[^/#?]+\.md(?:$|[?#])/i.test(trimmed);

              // Product-aware link resolution: detects whether current platform is
              // Shuffle Security or Shuffle Core / Automation and resolves paths like
              // /workflows, /workflows/debug, /incidents, /alerts accordingly.
              const resolved = resolveProductLink(trimmed, currentProduct);

              if (resolved.targetProduct === 'doc' || isRelativeDoc) {
                let parsed: URL | null = null;
                try {
                  const baseUrl =
                    typeof window !== 'undefined' && window.location?.origin
                      ? window.location.href
                      : 'https://shuffle.security/docs';
                  parsed = new URL(trimmed, baseUrl);
                } catch {
                  parsed = null;
                }

                if (parsed) {
                  const isDocsPath = /^\/docs(?:\/|$)/i.test(parsed.pathname);
                  const relativeName = parsed.pathname
                    .split('/')
                    .filter(Boolean)
                    .pop()
                    ?.replace(/\.md$/i, '');
                  const path =
                    isRelativeDoc && !isDocsPath && relativeName
                      ? `${basePath}/${docSlug(relativeName)}`
                      : normalizeDocPath(parsed.pathname, basePath);
                  return (
                    <Link to={`${path}${parsed.search}${parsed.hash}`}>
                      {children}
                    </Link>
                  );
                }
              }

              // Internal SPA link for the current platform
              if (resolved.isInternal) {
                return <Link to={resolved.url}>{children}</Link>;
              }

              // Cross-platform link (e.g. from Shuffle Security to Shuffle Core) or external
              return (
                <a
                  href={resolved.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={async (e) => {
                    if (resolved.isCrossDomainToCore && (getSessionToken() || hasShuffleAuth())) {
                      const isNewTab = e.ctrlKey || e.metaKey || e.button === 1;
                      e.preventDefault();
                      await navigateToShuffleCore(resolved.url, {
                        newTab: isNewTab || true,
                      });
                    }
                  }}
                  {...restProps}
                >
                  {children}
                </a>
              );
            }

            // External links fallback
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" {...restProps}>
                {children}
              </a>
            );
          },
          pre: ({ children, ...props }: any) => {
            const child: any = Array.isArray(children) ? children[0] : children;
            const raw = child?.props?.children;
            const text = Array.isArray(raw) ? raw.join('') : typeof raw === 'string' ? raw : '';
            const clean = text.replace(/^(?:#[^\r\n]*\r?\n\s*)+/, '').trim();
            if (/^(?:\$\s*)?curl(?:\s+|$)/i.test(clean)) {
              return <DocCurlViewer rawCurl={text} />;
            }
            return <pre {...props}>{children}</pre>;
          },
        };

        return segments.map((segment, idx) => {
          if (segment.type === 'markdown' && segment.content) {
            return (
              <ShuffleMarkdown
                key={`md-${idx}`}
                disableBreaks
                sx={{
                  '& p': { mb: 2 },
                  '& img': { maxWidth: '100%', borderRadius: '2px' },
                  '& > h2:first-of-type': {
                    mt: idx === 0 ? 0 : { xs: '3.5rem !important', md: '5rem !important' },
                  },
                  '& h2': {
                    mt: { xs: '3.5rem !important', md: '5rem !important' },
                    mb: 2.5,
                  },
                }}
                components={linkComponent}
              >
                {segment.content}
              </ShuffleMarkdown>
            );
          }

          if (segment.type === 'component' && segment.componentName) {
            return (
              <ComponentErrorBoundary
                key={`comp-${idx}-${segment.componentName}`}
                name={`DocComponent-${segment.componentName}`}
                fallback={null}
              >
                <DocDynamicComponent
                  name={segment.componentName}
                  props={segment.props || {}}
                />
              </ComponentErrorBoundary>
            );
          }

          if (segment.type === 'expandable') {
            return (
              <DocExpandable
                key={`exp-${idx}`}
                title={segment.title || 'Details'}
                content={segment.content}
                defaultOpen={segment.defaultOpen}
                linkComponent={linkComponent}
              />
            );
          }

          return null;
        });
      })()}
    </Box>
  );
};

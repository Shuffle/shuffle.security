import {
  Search as SearchIcon,
  ChevronDown,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from '@/lib/router-compat';
import {
  alpha,
  Box,
  Collapse,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Typography,
} from '@mui/material';
import { fetchDocsList, docSlug } from '@/components/docs/remoteDocs';
import { fetchRemoteDoc } from '@/components/docs/useDocContent';
import {
  groupRemoteDocs,
  getDocGroup,
  getDocDisplayLabel,
  type GroupedDocsCategory,
} from '@/components/docs/docGroups';
import { SidebarSearchDialog } from '@/components/layout/SidebarSearchDialog';

// In-memory session store for category expansion state per folder.
// Preserves opened and closed categories as the user navigates across doc pages within the session,
// while resetting cleanly on full page refresh.
const sessionCollapsedStore = new Map<string, Set<string>>();
const storeListeners = new Set<(folder: string) => void>();

function setSessionCollapsed(folderKey: string, next: Set<string>) {
  sessionCollapsedStore.set(folderKey, new Set(next));
  storeListeners.forEach((listener) => listener(folderKey));
}

interface DocsSidebarProps {
  onNavigate?: () => void;
  /** Active doc slug (e.g. from page or router). If omitted or 'index', defaults to 'getting-started'. */
  activeSlug?: string;
  /** API folder to list documents from (e.g. "legal"). */
  folder?: string;
  /** URL prefix for the document links (defaults to /docs). */
  basePath?: string;
  /** Section heading above the list. */
  title?: string;
  /** Force all categories in this sidebar to auto-expand by default. */
  autoExpand?: boolean;
  /** @deprecated External resources block has been removed */
  hideExternal?: boolean;
}

interface RemoteDoc {
  name: string;
  slug: string;
  label: string;
  read_time?: number;
}

const toLabel = (name: string) =>
  name.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// Documents that should not clutter the sidebar (consolidated or special purpose)
const HIDDEN_DOC_SLUGS = new Set(['triggers', 'liquid', 'onboarding']);

export const DocsSidebar = ({
  onNavigate,
  activeSlug: propActiveSlug,
  folder,
  basePath = '/docs',
  title = 'Documentation',
  autoExpand,
}: DocsSidebarProps) => {
  const params = useParams<{ slug?: string; name?: string }>();
  const slug = params.slug || params.name || 'index';
  const navigate = useNavigate();
  const [remoteDocs, setRemoteDocs] = useState<RemoteDoc[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);

  const folderKey = folder || 'docs';
  const isAutoExpandedSection =
    autoExpand ||
    folderKey === 'articles' ||
    folderKey === 'legal' ||
    folder === 'articles' ||
    folder === 'legal';
  const prevSlugRef = useRef<string | null>(null);

  // Initialize or get stored collapsed groups for this session
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    const stored = sessionCollapsedStore.get(folderKey);
    return stored ? new Set(stored) : new Set();
  });

  // Sync state across multiple DocsSidebar instances (e.g. mobile drawer and desktop sidebar)
  useEffect(() => {
    const listener = (changedFolder: string) => {
      if (changedFolder === folderKey) {
        const stored = sessionCollapsedStore.get(folderKey);
        if (stored) {
          setCollapsedGroups(new Set(stored));
        }
      }
    };
    storeListeners.add(listener);
    return () => {
      storeListeners.delete(listener);
    };
  }, [folderKey]);

  // Normalize slug: when at root /docs (slug === 'index' or empty), resolve to 'getting-started'
  // which is the default document auto-loaded by useDocContent.
  const currentSlug = useMemo(() => {
    const raw = (propActiveSlug || slug || '').toLowerCase().replace(/_+/g, '-');
    if (!raw || raw === 'index') {
      if (!folder || folder === 'docs') {
        return 'getting-started';
      }
      return remoteDocs[0]?.slug ? docSlug(remoteDocs[0].slug) : 'getting-started';
    }
    return raw;
  }, [propActiveSlug, slug, folder, remoteDocs]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await fetchDocsList(false, folder);
      const isDocsFolder = !folder || folder === 'docs';
      const mapped: RemoteDoc[] = list
        .filter((d) => d?.name && (!isDocsFolder || !HIDDEN_DOC_SLUGS.has(docSlug(d.name))))
        .map((d) => ({
          name: d.name,
          slug: docSlug(d.name),
          label: toLabel(d.name),
          read_time: d.read_time,
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
      if (!cancelled) setRemoteDocs(mapped);
    })();
    return () => {
      cancelled = true;
    };
  }, [folder]);

  // Group the loaded docs into Usability, Automation, Security, Infrastructure
  const categories = useMemo(() => {
    return groupRemoteDocs(remoteDocs, folder);
  }, [remoteDocs, folder]);

  // Identify the active category for the current doc
  const activeCategory = useMemo(() => {
    return categories.find((cat) =>
      cat.docs.some(
        (d) => docSlug(d.slug) === currentSlug || d.slug.toLowerCase() === currentSlug,
      ),
    );
  }, [categories, currentSlug]);

  const activeGroup = useMemo(() => getDocGroup(currentSlug), [currentSlug]);

  // Handle initial category setup and navigation without closing previously opened areas
  useEffect(() => {
    if (!categories.length) return;
    const targetGroupId = activeCategory?.id || activeGroup?.id || 'usability';
    const stored = sessionCollapsedStore.get(folderKey);

    if (!stored) {
      // First initialization for this session (e.g. after refresh or initial load):
      // On Articles and Legal doc pages, keep all categories auto-expanded.
      // For standard docs, expand the active document's category and collapse the others.
      const initial = new Set<string>();
      if (!isAutoExpandedSection) {
        for (const cat of categories) {
          if (cat.id !== targetGroupId) {
            initial.add(cat.id);
          }
        }
      }
      setSessionCollapsed(folderKey, initial);
      prevSlugRef.current = currentSlug;
      return;
    }

    // If an auto-expanded section somehow had categories marked collapsed in session store,
    // auto-recover by clearing the collapsed set so it stays expanded.
    if (isAutoExpandedSection && stored.size >= categories.length) {
      setSessionCollapsed(folderKey, new Set<string>());
    }

    // When navigating to a new document (slug changed):
    // Ensure the category containing the new document is expanded so the user sees it,
    // but NEVER close any other areas the user opened during this session.
    if (prevSlugRef.current !== currentSlug) {
      prevSlugRef.current = currentSlug;
      if (stored.has(targetGroupId)) {
        const next = new Set(stored);
        next.delete(targetGroupId);
        setSessionCollapsed(folderKey, next);
      }
    }
  }, [currentSlug, categories, activeCategory?.id, activeGroup?.id, folderKey, isAutoExpandedSection]);

  const toggleGroup = (groupId: string) => {
    const current = sessionCollapsedStore.get(folderKey) || collapsedGroups;
    const next = new Set(current);
    if (next.has(groupId)) {
      next.delete(groupId);
    } else {
      next.add(groupId);
    }
    setSessionCollapsed(folderKey, next);
  };

  const handleClick = () => {
    onNavigate?.();
  };

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        overflowY: 'auto',
        py: 3,
      }}
    >
      <Box sx={{ px: 2, mb: 2 }}>
        <Box
          onClick={() => setSearchOpen(true)}
          sx={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: 'hsl(var(--muted))',
            borderRadius: 1,
            px: 1.5,
            py: 1,
            gap: 1,
            cursor: 'pointer',
            border: '1px solid transparent',
            '&:hover': {
              border: '1px solid hsl(var(--border))',
              backgroundColor: 'transparent',
            },
          }}
        >
          <SearchIcon size={18} style={{ color: 'hsl(var(--muted-foreground))' }} />
          <Typography
            sx={{
              color: 'hsl(var(--muted-foreground))',
              fontSize: '0.875rem',
              flexGrow: 1,
            }}
          >
            Search
          </Typography>
          <Typography
            sx={{
              color: 'hsl(var(--muted-foreground))',
              fontSize: '0.75rem',
              fontFamily: 'monospace',
            }}
          >
            Ctrl+K
          </Typography>
        </Box>
      </Box>

      <SidebarSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />

      {/* Render documentation grouped by category */}
      <Box sx={{ px: 1.5 }}>
        {categories.map((category, catIndex) => {
          const isCollapsed = collapsedGroups.has(category.id);
          const hasActiveDoc = category.docs.some(
            (d) => docSlug(d.slug) === currentSlug || d.slug.toLowerCase() === currentSlug,
          );

          return (
            <Box key={category.id} sx={{ mt: catIndex === 0 ? 0.5 : 2.25 }}>
              {/* Category Header */}
              <Box
                onClick={() => toggleGroup(category.id)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  px: 1,
                  py: 0.6,
                  borderRadius: 1,
                  cursor: 'pointer',
                  userSelect: 'none',
                  transition: 'background-color 120ms ease',
                  '&:hover': {
                    backgroundColor: 'action.hover',
                    '& .category-label': {
                      color: 'text.primary',
                    },
                    '& .category-chevron': {
                      opacity: 1,
                    },
                  },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box
                    className="category-chevron"
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 14,
                      height: 14,
                      color: hasActiveDoc ? 'primary.main' : 'text.secondary',
                      opacity: 0.6,
                      transition: 'transform 160ms cubic-bezier(0.4, 0, 0.2, 1), opacity 120ms ease',
                      transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                    }}
                  >
                    <ChevronDown size={13} />
                  </Box>
                  <Typography
                    className="category-label"
                    sx={{
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      letterSpacing: '0.09em',
                      textTransform: 'uppercase',
                      color: hasActiveDoc ? 'primary.main' : 'text.secondary',
                      transition: 'color 120ms ease',
                    }}
                  >
                    {category.label}
                  </Typography>
                </Box>
                <Typography
                  sx={{
                    fontSize: '0.68rem',
                    fontWeight: 500,
                    color: 'text.disabled',
                    fontVariantNumeric: 'tabular-nums',
                    pr: 0.5,
                  }}
                >
                  {category.docs.length}
                </Typography>
              </Box>

              {/* Group Document Items with Structural Tree Indentation */}
              <Collapse in={!isCollapsed} timeout="auto" unmountOnExit>
                <Box
                  sx={{
                    ml: 1.75,
                    pl: 1.25,
                    borderLeft: '1px solid',
                    borderColor: (theme) => hasActiveDoc ? alpha(theme.palette.primary.main, 0.28) : theme.palette.divider,
                    mt: 0.4,
                    mb: 0.75,
                    transition: 'border-color 150ms ease',
                  }}
                >
                  <List dense disablePadding>
                    {category.docs.map((doc) => {
                      const isSelected =
                        currentSlug === docSlug(doc.slug) ||
                        currentSlug === doc.slug.toLowerCase();
                      return (
                        <ListItem key={doc.slug} disablePadding sx={{ mb: 0.25 }}>
                          <ListItemButton
                            onClick={() => {
                              handleClick();
                              navigate(`${basePath}/${doc.slug}`);
                            }}
                            onMouseEnter={() => {
                              fetchRemoteDoc(doc.slug, false, folder);
                            }}
                            selected={isSelected}
                            sx={{
                              borderRadius: 1,
                              py: 0.45,
                              px: 1.2,
                              minHeight: 28,
                              transition: 'all 120ms ease',
                              '&:hover': {
                                backgroundColor: 'action.hover',
                                '& .doc-label': {
                                  color: 'text.primary',
                                },
                              },
                              '&.Mui-selected': {
                                backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.08),
                                '&:hover': {
                                  backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.14),
                                },
                                '& .doc-label': {
                                  color: 'primary.main',
                                  fontWeight: 600,
                                },
                              },
                            }}
                          >
                            <ListItemText
                              primary={doc.label}
                              primaryTypographyProps={{
                                className: 'doc-label',
                                fontSize: '0.825rem',
                                fontWeight: isSelected ? 600 : 450,
                                color: isSelected ? 'primary.main' : 'text.primary',
                                noWrap: true,
                                sx: {
                                  lineHeight: 1.35,
                                  transition: 'color 120ms ease',
                                },
                              }}
                            />
                          </ListItemButton>
                        </ListItem>
                      );
                    })}
                  </List>
                </Box>
              </Collapse>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

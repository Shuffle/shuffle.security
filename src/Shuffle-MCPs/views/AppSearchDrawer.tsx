/**
 * AppSearchDrawer — Reusable drawer for searching apps.
 * Selecting an app opens the AppDetailDrawer for full configuration.
 */

import { useState, useEffect } from 'react';
import {
  X as CloseIcon,
  Plus as PlusIcon,
} from 'lucide-react';
import { Box, Typography, IconButton, Drawer, Avatar, Tooltip, Button } from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import { ShuffleMCP } from '@/Shuffle-MCPs/views/ShuffleMCP';
import AppDetailDrawer from '@/Shuffle-MCPs/views/AppDetailDrawer';
import { AddAppDialog } from '@/Shuffle-Core/components/AddAppDialog';
import type { AppSelectedEvent } from '@/Shuffle-MCPs/shuffle-mcp.helpers';
import { API_CONFIG } from '@/Shuffle-MCPs/api';
import { ShufflePipelinesBanner } from '@/Shuffle-MCPs/components/ShufflePipelinesBanner';
import type { ShuffleHostProps } from '@/Shuffle-MCPs/host-props';
import { useShuffleMcpTheme } from '@/Shuffle-MCPs/ShuffleMcpThemeProvider';
import { useDrawerLayer } from '@/Shuffle-MCPs/drawerLayer';


// Singul styles — compact dark theme
const singulStyles = {
  container: { width: '100%' },
  inputWrapper: {
    backgroundColor: 'hsl(var(--background-elevated))',
    borderRadius: '12px',
    border: '1px solid hsl(var(--border))',
  },
  input: {
    backgroundColor: 'transparent',
    color: 'hsl(var(--foreground))',
    border: 'none',
    borderRadius: '12px',
    padding: '12px 16px',
    fontSize: '14px',
  },
  searchIcon: { color: 'hsl(var(--muted-foreground))' },
  spinner: {
    borderColor: 'hsl(var(--border))',
    borderTopColor: 'hsl(var(--primary))',
  },
  resultsContainer: { marginTop: '12px', gap: '10px' },
  dropdownItem: {
    backgroundColor: 'hsl(var(--input))',
    border: '1px solid hsl(var(--border))',
    borderRadius: '12px',
    padding: '14px',
    color: 'hsl(var(--foreground))',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  dropdownItemHover: {
    borderColor: 'hsl(var(--primary) / 0.5)',
    backgroundColor: 'hsl(var(--accent) / 0.08)',
  },
  selectedItem: {
    backgroundColor: 'hsl(var(--primary) / 0.1)',
    borderColor: 'hsl(var(--primary))',
  },
  appIcon: {
    width: '36px',
    height: '36px',
    borderRadius: '8px',
    backgroundColor: 'hsl(var(--muted))',
    objectFit: 'contain' as const,
    padding: '4px',
  },
  appName: { fontSize: '13px', fontWeight: 600, color: 'hsl(var(--foreground))' },
  appDescription: {
    fontSize: '11px',
    color: 'hsl(var(--muted-foreground))',
    lineHeight: 1.4,
  },
  appCategory: {
    marginTop: '6px',
    padding: '2px 8px',
    backgroundColor: 'hsl(var(--muted))',
    color: 'hsl(var(--muted-foreground))',
    fontSize: '10px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    borderRadius: '4px',
    display: 'inline-block',
    width: 'fit-content',
  },
  checkbox: { border: '2px solid hsl(var(--border))' },
  checkboxChecked: { backgroundColor: 'hsl(var(--primary))', borderColor: 'hsl(var(--primary))' },
  emptyState: {
    padding: '24px',
    color: 'hsl(var(--muted-foreground))',
    textAlign: 'center' as const,
    fontSize: '13px',
    backgroundColor: 'transparent',
    borderRadius: '12px',
    gridColumn: '1 / -1',
  },
};

interface ConnectionPathApp {
  name: string;
  icon: string;
  hasValidAuth?: boolean;
  isActiveOnly?: boolean;
}

interface AppSearchDrawerProps extends ShuffleHostProps {
  open: boolean;
  onClose: () => void;
  initialQuery?: string;
  /** Silent search query run on mount without filling the visible input.
   *  Used to bias results toward specific categories (e.g. vulnerabilities
   *  page prioritising asset management / cloud / iam apps). */
  initialFilterQuery?: string;
  title?: string;
  subtitle?: string;
  anchor?: 'left' | 'right';
  width?: number;
  /** Minimum drawer width in px. Defaults to 400. */
  minWidth?: number;
  /** Maximum drawer width in px. Defaults to 720. */
  maxWidth?: number;
  /** Show the Shuffle Pipelines banner above search results */
  showPipelinesBanner?: boolean;
  /** If provided, selecting an app calls this instead of opening AppDetailDrawer */
  onQuickSelect?: (app: { name: string; icon: string; categories: string[]; id: string | null }) => void;
  /** If provided, called before default behavior. Return true to prevent opening detail drawer. */
  onSelectOverride?: (app: { name: string; icon: string; categories: string[] }) => boolean;
  /** Called when the detail drawer closes, with the app name that was being configured */
  onDetailClose?: (appName: string) => void;
  /** When set, replaces Activate with "+ Add" in the detail drawer */
  onAddToCanvas?: (appInfo: { name: string; icon: string; algoliaId?: string | null }) => void;
  /** When set, apps matching this category are sorted to the top in user's apps */
  priorityCategory?: string;
  /** Apps currently in the connection path diagram — shown first in the drawer */
  connectionPathApps?: ConnectionPathApp[];
  /** Apps to pin at the top of the ShuffleMCP search results (deduped by name). */
  pinnedApps?: Array<{ name: string; image_url: string; categories?: string[]; objectID?: string }>;
  /** Highlight (pulsing ring) the matching app card after `highlightDelayMs` */
  highlightAppName?: string;
  /** Delay before the highlight kicks in (default 5000ms) */
  highlightDelayMs?: number;
  /** Highlight these app cards IMMEDIATELY (no delay). Used for hover-driven
   *  real-time highlights, e.g. the demo tour pointing at multiple pinned
   *  apps at once. */
  realtimeHighlightAppNames?: string[];
  /** Enable multi-select: clicking apps toggles them in/out of the selection,
   *  drawer stays open, and the picker shows checkboxes + a primary-bordered
   *  highlight on already-chosen rows. */
  multiSelect?: boolean;
  /** Currently chosen apps (used to highlight rows in multi-select mode).
   *  Match is by objectID first, then by normalized name. */
  selectedApps?: Array<{ name: string; id?: string | null; icon?: string }>;
  /** Fires whenever the selection changes in multi-select mode. */
  onSelectionChange?: (apps: Array<{ name: string; id: string | null; icon: string; categories: string[] }>) => void;
  /** In multi-select mode, return true for apps that must be configured first
   *  (e.g. not authenticated yet) — those open the AppDetailDrawer instead of
   *  being toggled into the selection. */
  shouldOpenDetail?: (app: { name: string; icon: string; categories: string[]; id: string | null }) => boolean;
  /** When true, the AppDetailDrawer opened from this picker auto-fires Activate. */
  autoActivate?: boolean;
  /** Hide the per-app authentication status dot in the result list. */
  hideAuthStatus?: boolean;
}


export default function AppSearchDrawer({
  open,
  onClose,
  initialQuery = '',
  initialFilterQuery,
  title = 'Add Integration',
  subtitle = 'Search and configure a tool',
  anchor = 'right',
  width = 560,
  minWidth = 400,
  maxWidth = 720,
  showPipelinesBanner = false,
  onQuickSelect,
  onSelectOverride,
  onDetailClose,
  onAddToCanvas,
  priorityCategory,
  connectionPathApps,
  pinnedApps,
  highlightAppName,
  highlightDelayMs = 5000,
  realtimeHighlightAppNames,
  multiSelect = false,
  selectedApps,
  onSelectionChange,
  shouldOpenDetail,
  autoActivate = false,
  hideAuthStatus = false,
  globalUrl,
  theme,
  colorMode,
}: AppSearchDrawerProps) {
  const themeScope = useShuffleMcpTheme();
  const scopeClassName = themeScope?.scopeClassName ?? (theme === 'dark' ? 'shuffle-mcp-scope dark' : theme === 'light' ? 'shuffle-mcp-scope' : undefined);
  const [detailAppName, setDetailAppName] = useState<string | null>(null);
  const [detailAppId, setDetailAppId] = useState<string | null>(null);
  const [addAppOpen, setAddAppOpen] = useState(false);
  const [addAppQuery, setAddAppQuery] = useState<string>('');
  const [highlightActive, setHighlightActive] = useState(false);
  // Defer mounting the heavy <ShuffleMCP> (Algolia) widget so the Drawer
  // slide-in paints immediately. Without this, clicking "Select Apps" feels
  // laggy because the search widget initializes on the same frame the drawer
  // tries to open.
  const [bodyReady, setBodyReady] = useState(false);
  useEffect(() => {
    if (!open) { setBodyReady(false); return; }
    const raf = requestAnimationFrame(() => {
      // Wait one more frame so the drawer animation actually starts first.
      requestAnimationFrame(() => setBodyReady(true));
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);

  // Activate highlight only after the delay, so users get a chance to find
  // the app on their own before we draw attention to it.
  useEffect(() => {
    setHighlightActive(false);
    if (!open || !highlightAppName) return;
    const t = setTimeout(() => setHighlightActive(true), highlightDelayMs);
    return () => clearTimeout(t);
  }, [open, highlightAppName, highlightDelayMs]);

  const drawerWidth = `min(${width}px, 100vw)`;
  const drawerMinWidth = `min(${minWidth}px, 100vw)`;
  const drawerMaxWidth = `min(${maxWidth}px, 100vw)`;

  const handleClose = () => {
    setDetailAppName(null);
    setDetailAppId(null);
    onClose();
  };

  // Project caller-supplied selection to the AlgoliaSearchApp shape that
  // ShuffleMCP's `selectedApps` prop expects. Only `objectID` and `name` are
  // used for matching; the rest are placeholders.
  const projectedSelectedApps = (selectedApps || []).map((a) => ({
    objectID: a.id || `name:${(a.name || '').toLowerCase().replace(/[\s_\-]+/g, '')}`,
    name: a.name,
    image_url: a.icon || '',
    description: '',
    categories: [],
    creator: '',
    app_version: '1.0.0',
    time_edited: 0,
    generated: false,
    invalid: false,
    priority: 0,
    actions: 0,
    tags: [],
    accessible_by: [],
    action_labels: [],
    triggers: [],
    verified: true,
  })) as any[];

  const handleAppSelected = (detail: AppSelectedEvent) => {
    const algoliaId = (detail.app as any).objectID || null;
    const appInfo = {
      name: detail.app.name,
      icon: detail.app.image_url || '',
      categories: detail.app.categories || [],
      id: algoliaId,
    };

    // Apps that still need configuration (e.g. no authentication yet) open the
    // detail drawer even in multi-select mode.
    if (multiSelect && shouldOpenDetail?.(appInfo)) {
      setDetailAppName(detail.app.name);
      setDetailAppId(algoliaId);
      return;
    }

    // Multi-select mode: toggle in/out of the chosen list, keep the drawer open.
    if (multiSelect && onSelectionChange) {
      const norm = (s: string) => (s || '').toLowerCase().replace(/[\s_\-]+/g, '');
      const current = selectedApps || [];
      const targetSlug = norm(appInfo.name);
      const exists = current.some(
        (a) => (a.id && a.id === appInfo.id) || norm(a.name) === targetSlug,
      );
      const next = exists
        ? current.filter(
            (a) => !((a.id && a.id === appInfo.id) || norm(a.name) === targetSlug),
          ).map((a) => ({
            name: a.name,
            id: a.id ?? null,
            icon: a.icon || '',
            categories: [] as string[],
          }))
        : [
            ...current.map((a) => ({
              name: a.name,
              id: a.id ?? null,
              icon: a.icon || '',
              categories: [] as string[],
            })),
            appInfo,
          ];
      onSelectionChange(next);
      return;
    }

    if (onQuickSelect) {
      onQuickSelect(appInfo);
      onClose();
      return;
    }
    if (onSelectOverride?.(appInfo)) {
      return;
    }
    setDetailAppName(detail.app.name);
    setDetailAppId(algoliaId);
  };


  const drawerPaperProps = {
    className: scopeClassName,
    sx: {
      // Strict, environment-independent sizing so the drawer
      // looks identical on every host (Shuffle Security, /agents,
      // test page, embedded library, etc.). No breakpoint variance.
      width: drawerWidth,
      minWidth: drawerMinWidth,
      maxWidth: drawerMaxWidth,
      flex: `0 0 ${drawerWidth}`,
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      background: 'linear-gradient(180deg, hsl(var(--card)) 0%, hsl(var(--background)) 100%)',
      borderLeft: anchor === 'right' ? '1px solid hsl(var(--border))' : 'none',
      borderRight: anchor === 'left' ? '1px solid hsl(var(--border))' : 'none',
    },
  };

  return (
    <>
      <Drawer
        anchor={anchor}
        open={open && detailAppName === null}
        onClose={handleClose}
        slotProps={{
          paper: drawerPaperProps,
        }}
        {...({ PaperProps: drawerPaperProps } as any)}

        sx={{
          zIndex: drawerZIndex,
          '& .MuiDrawer-paper': {
            boxSizing: 'border-box',
            width: `${drawerWidth} !important`,
            minWidth: `${drawerMinWidth} !important`,
            maxWidth: `${drawerMaxWidth} !important`,
            flex: `0 0 ${drawerWidth} !important`,
          },
        }}

      >
        {/* Header */}
        <Box
          sx={{
            px: 3,
            py: 2,
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            borderBottom: '1px solid hsl(var(--border))',
            flexShrink: 0,
          }}
        >
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ color: 'hsl(var(--foreground))', fontWeight: 700, fontSize: '1rem', lineHeight: 1.2 }}>
              {title}
            </Typography>
            <Typography sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.75rem' }}>
              {subtitle}
            </Typography>
          </Box>
          <IconButton
            size="small"
            onClick={handleClose}
            sx={{ color: 'hsl(var(--muted-foreground))', '&:hover': { color: 'hsl(var(--foreground))' } }}
          >
            <CloseIcon size={16} />
          </IconButton>
        </Box>

        {/* Search body */}
        <Box sx={{ flex: 1, width: '100%', minWidth: 0, boxSizing: 'border-box', overflow: 'hidden', p: 3, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          

          {/* Connection path apps — shown first */}
          {connectionPathApps && connectionPathApps.length > 0 && (
            <Box sx={{ mb: 2.5 }}>
              <Typography sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', mb: 1 }}>
                In this usecase
              </Typography>
              <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                {connectionPathApps.map((app) => (
                  <Tooltip key={app.name} title={app.name.replace(/_/g, ' ')} arrow placement="bottom">
                    <Box
                      onClick={() => handleAppSelected({ app: { name: app.name, image_url: app.icon, categories: [] } } as any)}
                      sx={{
                        position: 'relative',
                        cursor: 'pointer',
                        transition: 'transform 0.15s ease',
                        '&:hover': { transform: 'scale(1.1)' },
                      }}
                    >
                      <Avatar
                        src={app.icon}
                        alt={app.name}
                        sx={{ width: 32, height: 32, borderRadius: '8px', backgroundColor: 'hsl(var(--muted))' }}
                        variant="rounded"
                      />
                      <Box
                        sx={{
                          position: 'absolute',
                          bottom: -2,
                          right: -2,
                          width: 9,
                          height: 9,
                          borderRadius: '50%',
                          backgroundColor: app.hasValidAuth ? 'hsl(var(--severity-low))' : app.isActiveOnly ? 'hsl(var(--destructive))' : 'hsl(var(--severity-medium))',
                          border: '1.5px solid hsl(var(--card))',
                        }}
                      />
                    </Box>
                  </Tooltip>
                ))}
              </Box>
            </Box>
          )}

          <Box
            sx={{
              flex: 1,
              width: '100%',
              minWidth: 0,
              minHeight: 0,
              overflow: 'hidden',
              '& .singul-container, & .singul-search-bar-container': {
                height: '100%',
                minHeight: 0,
              },
              '& .singul-search-bar-container': {
                display: 'flex',
                flexDirection: 'column',
              },
              '& .singul-results-container': {
                flex: 1,
                width: '100%',
                minWidth: 0,
                minHeight: 0,
                maxHeight: 'none',
                overflowY: 'auto',
              },
              '& .singul-results-grid': {
                width: '100% !important',
                minWidth: '0 !important',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr)) !important',
                gridAutoRows: '78px !important',
                gap: '12px !important',
              },
              '& .singul-results-grid .singul-dropdown-item': {
                width: '100%',
                maxWidth: '100%',
                minWidth: 0,
                minHeight: '78px !important',
                maxHeight: '78px !important',
                height: '78px !important',
                padding: '10px 14px !important',
                alignItems: 'center',
                overflow: 'hidden',
                boxSizing: 'border-box',
              },

              '& .singul-results-grid .singul-app-info': {
                alignItems: 'center',
                gap: '12px !important',
              },
              '& .singul-results-grid .singul-app-icon': {
                width: '36px !important',
                height: '36px !important',
                minWidth: '36px !important',
                borderRadius: '8px !important',
                padding: '4px !important',
              },
              '& .singul-results-grid .singul-app-details': { minWidth: 0 },
              '& .singul-results-grid .singul-app-name': { maxWidth: '100%' },
              '& .singul-results-grid .singul-checkbox': { marginLeft: 'auto', flexShrink: 0 },

              ...(highlightActive && highlightAppName ? {
                [`& .singul-dropdown-item[data-app-name="${highlightAppName}"]`]: {
                  borderColor: 'hsl(var(--primary)) !important',
                  boxShadow: '0 0 0 2px hsl(var(--primary)), 0 0 18px 2px hsl(var(--primary) / 0.55)',
                  animation: 'shuffleHighlightPulse 1.6s ease-in-out infinite',
                },
                '@keyframes shuffleHighlightPulse': {
                  '0%, 100%': { boxShadow: '0 0 0 2px hsl(var(--primary)), 0 0 12px 1px hsl(var(--primary) / 0.4)' },
                  '50%': { boxShadow: '0 0 0 2px hsl(var(--primary)), 0 0 24px 4px hsl(var(--primary) / 0.75)' },
                },
              } : {}),
              ...(realtimeHighlightAppNames && realtimeHighlightAppNames.length > 0 ? {
                [realtimeHighlightAppNames.map(n => `& .singul-dropdown-item[data-app-name="${n}"]`).join(', ')]: {
                  position: 'relative',
                  zIndex: 2,
                  borderColor: 'hsl(var(--primary) / 0.78) !important',
                  backgroundColor: 'hsl(var(--primary) / 0.08) !important',
                  outline: 'none !important',
                  boxShadow: 'none !important',
                  animation: 'shuffleHighlightPulseStrong 1.5s ease-in-out infinite',
                  transition: 'border-color 120ms ease, background-color 120ms ease',
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    left: '10px',
                    top: '14px',
                    bottom: '14px',
                    width: '3px',
                    borderRadius: '999px',
                    backgroundColor: 'hsl(var(--primary))',
                  },
                  '& .singul-app-info': {
                    paddingLeft: '8px',
                  },
                },
                '@keyframes shuffleHighlightPulseStrong': {
                  '0%, 100%': {
                    borderColor: 'hsl(var(--primary) / 0.62)',
                    backgroundColor: 'hsl(var(--primary) / 0.06)',
                  },
                  '50%': {
                    borderColor: 'hsl(var(--primary) / 0.92)',
                    backgroundColor: 'hsl(var(--primary) / 0.12)',
                  },
                },
              } : {}),
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                mb: 1.5,
                flexShrink: 0,
              }}
            >
              <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Search integrations
              </Typography>
            </Box>
            <AnimatePresence mode="wait">
              <motion.div
                key="search"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                style={{ height: '100%', minHeight: 0 }}
              >
                {bodyReady ? (
                  <ShuffleMCP
                    apiKey={API_CONFIG.apiKey || undefined}
                    apiBaseUrl={globalUrl || API_CONFIG.baseUrl}
                    globalUrl={globalUrl}
                    theme={theme}
                    colorMode={colorMode}
                    placeholder={initialQuery ? `Search ${initialQuery} integrations...` : 'Search integrations...'}
                    layout="grid"
                    gridColumns={2}
                    inline={true}
                    initialQuery={initialQuery}
                    initialFilterQuery={initialFilterQuery ?? initialQuery}
                    hitsPerPage={20}
                    showDescription={false}
                    showCategories={true}
                    showCheckbox={multiSelect}
                    multiSelect={multiSelect}
                    selectedApps={selectedApps ? projectedSelectedApps : undefined}
                    disableAutoSelectValidatedApps
                    hideAuthStatus={hideAuthStatus}
                    preventDefault={true}
                    onAppSelected={handleAppSelected}
                    onSelectionChange={multiSelect ? (next) => {
                      onSelectionChange?.(next.map((app) => ({
                        name: app.name,
                        id: app.objectID || null,
                        icon: app.image_url || '',
                        categories: app.categories || [],
                      })));
                    } : undefined}
                    pinnedApps={pinnedApps?.map(p => ({
                      name: p.name,
                      image_url: p.image_url,
                      categories: p.categories || [],
                      objectID: p.objectID || `pinned-${p.name}`,
                      description: '',
                      creator: '',
                      app_version: '1.0.0',
                      time_edited: 0,
                      generated: false,
                      invalid: false,
                      priority: 0,
                      actions: 0,
                      tags: [],
                      accessible_by: [],
                      action_labels: [],
                      triggers: [],
                      verified: true,
                    }))}
                    customStyles={singulStyles}
                    onCreateNewApp={() => { setAddAppQuery(''); setAddAppOpen(true); onClose(); }}
                    renderInputEndAdornment={() => (
                      <Button
                        size="small"
                        onClick={() => { setAddAppQuery(''); setAddAppOpen(true); onClose(); }}
                        startIcon={<PlusIcon size={12} />}
                        sx={{
                          textTransform: 'none',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          height: 26,
                          minHeight: 26,
                          px: 1.25,
                          borderRadius: 999,
                          color: 'hsl(var(--muted-foreground))',
                          bgcolor: 'transparent',
                          border: '1px solid hsl(var(--border))',
                          '& .MuiButton-startIcon': { color: 'hsl(var(--primary))' },
                          '&:hover': {
                            bgcolor: 'hsl(var(--muted) / 0.5)',
                            borderColor: 'hsl(var(--primary) / 0.5)',
                            color: 'hsl(var(--foreground))',
                          },
                        }}
                      >
                        New App
                      </Button>
                    )}
                    renderEmptyState={(query) => (
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.25, width: '100%' }}>
                        <Typography sx={{ fontSize: '0.8rem', color: 'hsl(var(--muted-foreground))', textAlign: 'center' }}>
                          No integrations match "{query}".
                        </Typography>
                        <Button
                          size="small"
                          onClick={() => { setAddAppQuery(query); setAddAppOpen(true); onClose(); }}
                          startIcon={<PlusIcon size={14} />}
                          sx={{
                            textTransform: 'none',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            height: 32,
                            px: 1.5,
                            borderRadius: 999,
                            color: 'hsl(var(--primary-foreground))',
                            border: '1px solid hsl(var(--primary))',
                            bgcolor: 'hsl(var(--primary))',
                            maxWidth: '100%',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            '& .MuiButton-startIcon': { color: 'hsl(var(--primary-foreground))' },
                            '&:hover': {
                              bgcolor: 'hsl(var(--primary) / 0.9)',
                              borderColor: 'hsl(var(--primary))',
                              color: 'hsl(var(--primary-foreground))',
                            },
                          }}
                        >
                          New App
                        </Button>
                      </Box>
                    )}
                    renderEndOfResults={() => (
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, py: 1 }}>
                        <Typography sx={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))' }}>
                          Cannot find what you are looking for?
                        </Typography>
                        <Button
                          size="small"
                          onClick={() => { setAddAppQuery(''); setAddAppOpen(true); onClose(); }}
                          startIcon={<PlusIcon size={14} />}
                          sx={{
                            textTransform: 'none',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            height: 30,
                            px: 1.5,
                            borderRadius: 999,
                            color: 'hsl(var(--muted-foreground))',
                            border: '1px solid hsl(var(--border))',
                            bgcolor: 'transparent',
                            '& .MuiButton-startIcon': { color: 'hsl(var(--primary))' },
                            '&:hover': {
                              bgcolor: 'hsl(var(--muted) / 0.5)',
                              borderColor: 'hsl(var(--primary) / 0.5)',
                              color: 'hsl(var(--foreground))',
                            },
                          }}
                        >
                          New App
                        </Button>
                      </Box>
                    )}
                  />
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, height: '100%' }}>
                    {/* Search input skeleton */}
                    <Box sx={{
                      height: 44,
                      borderRadius: '12px',
                      border: '1px solid hsl(var(--border))',
                      backgroundColor: 'hsl(var(--background-elevated))',
                    }} />
                    {/* Grid skeleton */}
                    <Box sx={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                      gap: '12px',
                      mt: 1,
                    }}>
                      {Array.from({ length: 8 }).map((_, i) => (
                        <Box key={i} sx={{
                          height: 78,
                          borderRadius: '12px',
                          backgroundColor: 'hsl(var(--input))',
                          border: '1px solid hsl(var(--border))',
                          opacity: 0.6,
                          animation: 'shufflePulse 1.4s ease-in-out infinite',
                          animationDelay: `${i * 60}ms`,
                          '@keyframes shufflePulse': {
                            '0%, 100%': { opacity: 0.35 },
                            '50%': { opacity: 0.7 },
                          },
                        }} />
                      ))}
                    </Box>
                  </Box>
                )}
              </motion.div>
            </AnimatePresence>
          </Box>
        </Box>
      </Drawer>

      {/* App detail drawer — opens when an app is selected from search */}
      <AppDetailDrawer
        open={open && detailAppName !== null}
        onClose={() => {
          const name = detailAppName;
          setDetailAppName(null);
          setDetailAppId(null);
          if (name) onDetailClose?.(name);
        }}

        appName={detailAppName}
        appId={detailAppId}
        anchor={anchor}
        width={width}
        globalUrl={globalUrl}
        theme={theme}
        colorMode={colorMode}
        onRefresh={onClose}
        onAddToCanvas={onAddToCanvas}
        autoActivate={autoActivate}
      />

      {/* New App dialog — Shuffle-Core canonical modal for finding / generating apps */}
      <AddAppDialog
        open={addAppOpen}
        onOpenChange={setAddAppOpen}
        initialInput={addAppQuery || initialQuery || ''}
        globalUrl={globalUrl}
        theme={theme}
        colorMode={colorMode}
        onCreated={(appId, app) => {
          // Route the picked / generated app through the SAME selection
          // pipeline as a normal search result so it lands wherever the
          // caller expects (agent canvas, onboarding source list,
          // ingestion sources, quick-select handlers, etc.).
          handleAppSelected({
            app: {
              objectID: appId,
              name: app?.name || appId,
              image_url: app?.image_url || '',
              description: '',
              categories: app?.categories || [],
              creator: '',
              app_version: '1.0.0',
              time_edited: 0,
              generated: false,
              invalid: false,
              priority: 0,
              actions: 0,
              tags: [],
              accessible_by: [],
              action_labels: [],
              triggers: [],
              verified: true,
            } as any,
            authUrl: '',
          });
          setAddAppOpen(false);
        }}
      />
    </>
  );
}

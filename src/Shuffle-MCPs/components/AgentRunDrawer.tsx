/**
 * AgentRunDrawer — standalone right-side drawer that hosts the canonical
 * `AgentUI` "Run Agent" experience plus caller-provided or built-in slots for
 * Permissions and Local LLM tabs.
 *
 * Replaces the project-only `AgentPermissionsDrawer`. It has zero
 * dependencies on host-app contexts (no react-router, no AuthContext, no
 * project services), so it works when the library is consumed standalone
 * via npm — pass `apiKey` / `apiBaseUrl` / `orgId` to authenticate the
 * embedded `AgentUI`.
 *
 * Design:
 *   - Tabs: Run (always), Permissions (if `permissionsSlot`), Local LLM
 *     (built in by default, overridable with `localLLMSlot`).
 *   - All colors use HSL tokens so themes flow through. Falls back to
 *     reasonable inline values when tokens are missing.
 */

import { useEffect, useRef, useState } from 'react';
import {
  Box,
  Drawer,
  IconButton,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from '@mui/material';
import type { SxProps, Theme } from '@mui/material';
import {
  Play,
  Server,
  ShieldCheck,
  X as CloseIcon
} from 'lucide-react';

import AgentIcon from '@/Shuffle-MCPs/components/AgentIcon';
import AgentUI, { type AgentUIProps } from '@/Shuffle-MCPs/components/AgentUI';
import LocalLLMConfig from '@/Shuffle-MCPs/components/LocalLLMConfig';
import type { ShuffleHostProps } from '@/Shuffle-MCPs/host-props';
import { useSyncHostBaseUrl } from '@/Shuffle-MCPs/useSyncHostBaseUrl';
import { useShuffleMcpTheme } from '@/Shuffle-MCPs/ShuffleMcpThemeProvider';
import { useDrawerLayer } from '@/Shuffle-MCPs/drawerLayer';

export type AgentRunDrawerTab = 'run' | 'permissions' | 'localLLM';

export interface AgentRunDrawerProps extends ShuffleHostProps {
  open: boolean;
  onClose: () => void;
  /** Which tab to focus when the drawer opens. Default: 'run'. */
  initialTab?: AgentRunDrawerTab;
  /** Render content for the Permissions tab. Tab is hidden when omitted. */
  permissionsSlot?: React.ReactNode;
  /** Render content for the Local LLM tab. Defaults to the bundled Local LLM configuration UI. */
  localLLMSlot?: React.ReactNode;
  /**
   * Custom badge node next to the Local LLM tab label (e.g. a green check
   * when OpenAI auth is detected). Optional.
   */
  localLLMTabBadge?: React.ReactNode;
  /** Tooltip shown when the Permissions tab is rendered but disabled. */
  permissionsDisabled?: boolean;
  permissionsDisabledTooltip?: string;
  /** Forwarded to the embedded AgentUI (apiKey, apiBaseUrl, orgId, etc.). */
  agentUIProps?: Partial<AgentUIProps> & { key?: React.Key };
  /** Drawer width override (default: 595 px on >=sm, full-width on xs). */
  width?: number;
  /** Minimum drawer width in px. Defaults to 420. */
  minWidth?: number;
  /** Maximum drawer width in px. Defaults to 900. */
  maxWidth?: number;
  /** Header title. Default: "Agent". */
  title?: React.ReactNode;
  /** Header subtitle. Default: "Run actions and manage permissions". */
  subtitle?: React.ReactNode;
  /** Optional className forwarded to the Drawer Paper. */
  className?: string;
  /** Style overrides merged into the Drawer Paper sx. Use to override colors, padding, etc. */
  paperSx?: SxProps<Theme>;
  /** Style overrides for the header bar (icon + title + close). */
  headerSx?: SxProps<Theme>;
  /** Style overrides for the tab strip. */
  tabsSx?: SxProps<Theme>;
  /** Style overrides for the body container that wraps the active tab content. */
  bodySx?: SxProps<Theme>;
}

const TAB_ORDER: AgentRunDrawerTab[] = ['run', 'permissions', 'localLLM'];

const AgentRunDrawer = ({
  open,
  onClose,
  initialTab = 'run',
  permissionsSlot,
  localLLMSlot,
  localLLMTabBadge,
  permissionsDisabled = false,
  permissionsDisabledTooltip = 'Coming soon',
  agentUIProps,
  width = 595,
  minWidth = 420,
  maxWidth = 900,
  title = 'Agent',
  subtitle = 'Run actions and manage permissions',
  className,
  paperSx,
  headerSx,
  tabsSx,
  bodySx,
  globalUrl,
  theme,
  colorMode,
  userdata,
  isLoaded,
  isLoggedIn,
  serverside,
}: AgentRunDrawerProps) => {
  // Sync host base URL into the runtime so all internal fetches honor it.
  useSyncHostBaseUrl(globalUrl);
  const themeScope = useShuffleMcpTheme();
  const [activeTab, setActiveTab] = useState<AgentRunDrawerTab>(initialTab);

  // Reset tab whenever the drawer transitions from closed -> open so each
  // open honors the caller's initialTab (matches the legacy behavior).
  const prevOpenRef = useRef(open);
  useEffect(() => {
    if (open && !prevOpenRef.current) setActiveTab(initialTab);
    prevOpenRef.current = open;
  }, [open, initialTab]);

  // Advertise to AgentUI that a host-mounted "Choose LLM" listener exists.
  // AgentUI uses this flag to decide whether to log a wiring warning when
  // its window-event fallback fires with no handler on the other end.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    (window as any).__shuffleAgentDrawerMounted = ((window as any).__shuffleAgentDrawerMounted || 0) + 1;
    return () => {
      (window as any).__shuffleAgentDrawerMounted = Math.max(0, ((window as any).__shuffleAgentDrawerMounted || 1) - 1);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onOpen = (event: Event) => {
      const tab = (event as CustomEvent<{ tab?: AgentRunDrawerTab }>).detail?.tab;
      if (tab === 'localLLM') {
        event.preventDefault();
        setActiveTab('localLLM');
      }
    };
    const onClose2 = () => { onClose(); };
    window.addEventListener('agent-drawer-open', onOpen as EventListener);
    window.addEventListener('agent-drawer-close', onClose2 as EventListener);
    return () => {
      window.removeEventListener('agent-drawer-open', onOpen as EventListener);
      window.removeEventListener('agent-drawer-close', onClose2 as EventListener);
    };
  }, [onClose]);

  const effectiveLocalLLMSlot = localLLMSlot ?? (
    <LocalLLMConfig
      open={open}
      globalUrl={globalUrl}
      userdata={userdata}
      isLoaded={isLoaded}
      isLoggedIn={isLoggedIn}
      serverside={serverside}
      theme={theme}
      colorMode={colorMode}
    />
  );


  const visibleTabs = TAB_ORDER.filter((t) => {
    if (t === 'run') return true;
    if (t === 'permissions') return !!permissionsSlot;
    if (t === 'localLLM') return !!effectiveLocalLLMSlot;
    return false;
  });
  const showTabs = visibleTabs.length > 1;

  // If the requested tab isn't visible, fall back to the first visible one.
  const safeActiveTab: AgentRunDrawerTab = visibleTabs.includes(activeTab)
    ? activeTab
    : 'run';

  const paperRef = useRef<HTMLElement | null>(null);

  // Focus prompt input when drawer opens to 'run' tab
  useEffect(() => {
    if (!open || safeActiveTab !== 'run') return;

    const focusInput = () => {
      if (!paperRef.current) return false;
      const target = paperRef.current.querySelector<HTMLTextAreaElement | HTMLInputElement>(
        'textarea, input[type="text"]:not([readonly]), input:not([type]):not([readonly])'
      );
      if (target) {
        target.focus();
        return true;
      }
      return false;
    };

    if (focusInput()) return;
    const t1 = setTimeout(focusInput, 50);
    const t2 = setTimeout(focusInput, 150);
    const t3 = setTimeout(focusInput, 300);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [open, safeActiveTab]);

  const drawerWidth = `min(${width}px, 100vw)`;
  const drawerMinWidth = `min(${minWidth}px, 100vw)`;
  const drawerMaxWidth = `min(${maxWidth}px, 100vw)`;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      sx={{
        zIndex: drawerZIndex,
        '& .MuiDrawer-paper': {
          boxSizing: 'border-box',
          width: { xs: '100vw', sm: drawerWidth },
          minWidth: { xs: '100vw', sm: drawerMinWidth },
          maxWidth: { xs: '100vw', sm: drawerMaxWidth },
        },
      }}
      slotProps={{
        paper: {
          ref: paperRef,
          className: [themeScope?.scopeClassName, className].filter(Boolean).join(' ') || undefined,
          sx: [
            {
              width: { xs: '100vw', sm: drawerWidth },
              minWidth: { xs: '100vw', sm: drawerMinWidth },
              maxWidth: { xs: '100vw', sm: drawerMaxWidth },
              boxSizing: 'border-box',
              background: 'linear-gradient(180deg, hsl(var(--card)) 0%, hsl(var(--background)) 100%)',
              borderLeft: '1px solid hsl(var(--border))',
              boxShadow: '-8px 0 32px hsla(0, 0%, 0%, 0.4)',
              display: 'flex',
              flexDirection: 'column',
            },
            ...(Array.isArray(paperSx) ? paperSx : paperSx ? [paperSx] : []),
          ],
        },
      }}
    >
      {/* Header */}
      <Box
        sx={[
          {
            px: 3,
            py: 2.5,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            borderBottom: '1px solid hsl(var(--border))',
            flexShrink: 0,
          },
          ...(Array.isArray(headerSx) ? headerSx : headerSx ? [headerSx] : []),
        ]}
      >
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'hsla(var(--primary) / 0.12)',
            color: 'hsl(var(--primary))',
            flexShrink: 0,
          }}
        >
          <AgentIcon size={22} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 600, fontSize: '1.1rem', color: 'hsl(var(--foreground))' }}>
            {title}
          </Typography>
          <Typography sx={{ fontSize: '0.8rem', color: 'hsl(var(--muted-foreground))' }}>
            {subtitle}
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small" sx={{ color: 'hsl(var(--muted-foreground))' }}>
          <CloseIcon size={16} />
        </IconButton>
      </Box>

      {/* Tabs (hidden when only Run is available) */}
      {showTabs && (
        <Box sx={{ borderBottom: '1px solid hsl(var(--border))', flexShrink: 0 }}>
          <Tabs
            value={safeActiveTab}
            onChange={(_, v) => setActiveTab(v as AgentRunDrawerTab)}
            sx={[
              {
                minHeight: 42,
                px: 3,
                '& .MuiTab-root': {
                  minHeight: 42,
                  textTransform: 'none',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  color: 'hsl(var(--muted-foreground))',
                  '&.Mui-selected': { color: 'hsl(var(--primary))' },
                },
                '& .MuiTabs-indicator': { bgcolor: 'hsl(var(--primary))' },
              },
              ...(Array.isArray(tabsSx) ? tabsSx : tabsSx ? [tabsSx] : []),
            ]}
          >
            {visibleTabs.includes('run') && (
              <Tab
                value="run"
                label="Run"
                icon={<Play size={14} />}
                iconPosition="start"
                sx={{ gap: 0.75 }}
              />
            )}
            {visibleTabs.includes('permissions') && (
              <Tab
                value="permissions"
                label={
                  permissionsDisabled ? (
                    <Tooltip title={permissionsDisabledTooltip} arrow>
                      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center' }}>
                        Permissions
                      </Box>
                    </Tooltip>
                  ) : (
                    'Permissions'
                  )
                }
                icon={<ShieldCheck size={14} />}
                iconPosition="start"
                disabled={permissionsDisabled}
                sx={{ gap: 0.75 }}
              />
            )}
            {visibleTabs.includes('localLLM') && (
              <Tab
                value="localLLM"
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    Local LLM
                    {localLLMTabBadge}
                  </Box>
                }
                icon={<Server size={14} />}
                iconPosition="start"
                sx={{ gap: 0.75 }}
              />
            )}
          </Tabs>
        </Box>
      )}

      {/* Body */}
      <Box sx={[{ flex: 1, overflowY: 'auto' }, ...(Array.isArray(bodySx) ? bodySx : bodySx ? [bodySx] : [])]}>
        {safeActiveTab === 'run' && (
          <Box sx={{ px: 2, py: 2 }}>
            <AgentUI
              compact
              hideHeroIcon
              title=""
              subtitle={null}
              maxWidth={width - 32}
              {...agentUIProps}
              isLoggedIn={agentUIProps?.isLoggedIn ?? isLoggedIn}
              isSupport={agentUIProps?.isSupport ?? (userdata?.support === true || userdata?.support === 'true')}
              apiBaseUrl={agentUIProps?.apiBaseUrl ?? globalUrl}
              theme={agentUIProps?.theme ?? theme}
              colorMode={agentUIProps?.colorMode ?? colorMode}
            />
          </Box>
        )}
        {safeActiveTab === 'permissions' && permissionsSlot && (
          <Box sx={{ px: 3, py: 2.5 }}>{permissionsSlot}</Box>
        )}
        {safeActiveTab === 'localLLM' && effectiveLocalLLMSlot && (
          <Box sx={{ px: 3, py: 2.5 }}>{effectiveLocalLLMSlot}</Box>
        )}
      </Box>
    </Drawer>
  );
};

export default AgentRunDrawer;

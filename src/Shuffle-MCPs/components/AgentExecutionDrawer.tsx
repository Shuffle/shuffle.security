/**
 * AgentExecutionDrawer — standalone right-side drawer showing the canonical
 * `AgentUI` Simple/Detailed view for an existing agent run. Pre-loads the
 * execution data via the `initialExecution` prop on `AgentUI`, so no extra
 * `/streams/results` fetch (and no `authorization` token) is required.
 *
 * Self-contained: no project hooks, contexts, or services. Drop-in for both
 * the host app (the `/agent` page) and npm consumers of the lib.
 */

import { useEffect, useState } from 'react';
import { Box, Drawer, IconButton, Tooltip, Typography } from '@mui/material';
import {
  X as CloseIcon,
  ExternalLink as OpenInNewIcon
} from 'lucide-react';
import type { SxProps, Theme } from '@mui/material';
import AgentUI, { type AgentUIProps } from '@/Shuffle-MCPs/components/AgentUI';
import AgentIcon from '@/Shuffle-MCPs/components/AgentIcon';
import {
  STATUS_CONFIG,
  formatDuration,
  getRunTitle,
  getTimeAgo,
} from '@/Shuffle-MCPs/components/AgentActivityList';
import type { AgentRun } from '@/Shuffle-MCPs/agentActivity';
import type { ShuffleHostProps } from '@/Shuffle-MCPs/host-props';
import { useShuffleMcpTheme } from '@/Shuffle-MCPs/ShuffleMcpThemeProvider';
import { useDrawerLayer } from '@/Shuffle-MCPs/drawerLayer';

export interface AgentExecutionDrawerProps extends ShuffleHostProps {
  open: boolean;
  onClose: () => void;
  /** The run to display. When null and `open=true`, drawer renders empty. */
  run: AgentRun | null;
  /** Drawer width. Default: 720 px on >=sm, full-width on xs. */
  width?: number;
  /** Minimum drawer width in px. Defaults to 480. */
  minWidth?: number;
  /** Maximum drawer width in px. Defaults to 960. */
  maxWidth?: number;
  /** Optional Shuffle API key, forwarded to the embedded AgentUI. */
  apiKey?: string;
  /** Optional Shuffle backend base URL, forwarded to the embedded AgentUI. */
  apiBaseUrl?: string;
  /** Optional Shuffle Org ID, forwarded to the embedded AgentUI. */
  orgId?: string;
  /** Optional className forwarded to the Drawer Paper. */
  className?: string;
  /** Style overrides merged into the Drawer Paper sx. */
  paperSx?: SxProps<Theme>;
  /** Style overrides for the header bar. */
  headerSx?: SxProps<Theme>;
  /** Style overrides for the body container that wraps the embedded AgentUI. */
  bodySx?: SxProps<Theme>;
  /** Optional content rendered at the top of the body, before the embedded
   *  AgentUI. Use this to inject a shared "Needs attention" / failure
   *  diagnosis banner so the drawer mirrors the timeline status pill. */
  topBanner?: React.ReactNode;
  /** Handler for scheduling the loaded agent prompt from the execution view. */
  onSchedule?: AgentUIProps['onSchedule'];
  /** Authoritative support flag. */
  isSupport?: boolean;
}

const AgentExecutionDrawer = ({
  open,
  onClose,
  run,
  width = 720,
  minWidth = 480,
  maxWidth = 960,
  apiKey,
  apiBaseUrl,
  orgId,
  className,
  paperSx,
  headerSx,
  bodySx,
  topBanner,
  onSchedule,
  isSupport,
  globalUrl,
  userdata,
  isLoaded,
  isLoggedIn,
  serverside,
  theme,
  colorMode,
}: AgentExecutionDrawerProps) => {
  const themeScope = useShuffleMcpTheme();

  // Optimistic body: the run data is already in hand, so the timeline is
  // rendered on the very next frame instead of waiting for the slide-in
  // animation (or any network request) to settle.
  const [bodyReady, setBodyReady] = useState(false);
  useEffect(() => {
    if (!open || !run?.execution_id) {
      setBodyReady(false);
      return;
    }
    const raf = requestAnimationFrame(() => setBodyReady(true));
    return () => cancelAnimationFrame(raf);
  }, [open, run?.execution_id]);
  const statusKey = (run?.status || '').toUpperCase();
  const cfg = STATUS_CONFIG[statusKey] || STATUS_CONFIG.WAITING;
  const duration = run ? formatDuration(run) : '';

  const drawerWidth = `min(${width}px, 100vw)`;
  const drawerMinWidth = `min(${minWidth}px, 100vw)`;
  const drawerMaxWidth = `min(${maxWidth}px, 100vw)`;

  const drawerZIndex = useDrawerLayer(open);

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      keepMounted
      transitionDuration={{ enter: 120, exit: 100 }}
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
          className: [themeScope?.scopeClassName, className].filter(Boolean).join(' ') || undefined,
          sx: [
            {
              width: { xs: '100vw', sm: drawerWidth },
              minWidth: { xs: '100vw', sm: drawerMinWidth },
              maxWidth: { xs: '100vw', sm: drawerMaxWidth },
              boxSizing: 'border-box',
              bgcolor: 'hsl(var(--background))',
              color: 'hsl(var(--foreground))',
              backgroundImage: 'none',
              borderLeft: '1px solid hsl(var(--border))',
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
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: 2.5,
            py: 1.75,
            borderBottom: '1px solid hsl(var(--border))',
            position: 'sticky',
            top: 0,
            zIndex: 2,
            bgcolor: 'hsl(var(--background))',
          },
          ...(Array.isArray(headerSx) ? headerSx : headerSx ? [headerSx] : []),
        ]}
      >
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'hsla(var(--primary) / 0.12)',
            color: 'hsl(var(--primary))',
            flexShrink: 0,
          }}
        >
          <AgentIcon size={20} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
            <Typography
              sx={{
                fontSize: '0.95rem',
                fontWeight: 600,
                color: 'hsl(var(--foreground))',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {run ? getRunTitle(run) : 'Agent execution'}
            </Typography>
            {run && (
              <Box sx={{ display: 'flex', alignItems: 'center', color: cfg.color, flexShrink: 0 }}>
                {cfg.icon}
              </Box>
            )}
          </Box>
          {run && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.25 }}>
              <Typography sx={{ fontSize: '0.72rem', color: 'hsl(var(--muted-foreground))' }}>
                {cfg.label}
              </Typography>
              {run.started_at && (
                <>
                  <Typography sx={{ fontSize: '0.72rem', color: 'hsl(var(--muted-foreground))', opacity: 0.4 }}>
                    ·
                  </Typography>
                  <Typography sx={{ fontSize: '0.72rem', color: 'hsl(var(--muted-foreground))' }}>
                    {getTimeAgo(run.started_at)}
                  </Typography>
                </>
              )}
              {duration && (
                <>
                  <Typography sx={{ fontSize: '0.72rem', color: 'hsl(var(--muted-foreground))', opacity: 0.4 }}>
                    ·
                  </Typography>
                  <Typography sx={{ fontSize: '0.72rem', color: 'hsl(var(--muted-foreground))' }}>
                    {duration}
                  </Typography>
                </>
              )}
            </Box>
          )}
        </Box>
        {run?.execution_id && (
          <Tooltip title="Open in new tab">
            <IconButton
              component="a"
              href={`/agents?execution_id=${encodeURIComponent(run.execution_id)}${run.authorization ? `&authorization=${encodeURIComponent(run.authorization)}` : ''}`}
              target="_blank"
              rel="noopener noreferrer"
              size="small"
              sx={{
                color: 'hsl(var(--muted-foreground))',
                '&:hover': { color: 'hsl(var(--foreground))', bgcolor: 'hsl(var(--muted))' },
              }}
            >
              <OpenInNewIcon size={16} />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title="Close">
          <IconButton
            onClick={onClose}
            size="small"
            sx={{
              color: 'hsl(var(--muted-foreground))',
              '&:hover': { color: 'hsl(var(--foreground))', bgcolor: 'hsl(var(--muted))' },
            }}
          >
            <CloseIcon size={16} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Body — embedded AgentUI seeded with the pre-loaded run */}
      <Box sx={[{ flex: 1, overflowY: 'auto', pt: 3 }, ...(Array.isArray(bodySx) ? bodySx : bodySx ? [bodySx] : [])]}>
        {topBanner}
        {run && !bodyReady ? (
          <Box sx={{ px: 3, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {[0, 1, 2, 3].map((i) => (
              <Box
                key={i}
                sx={{
                  height: i === 0 ? 48 : 32,
                  borderRadius: 1.5,
                  bgcolor: 'hsl(var(--muted) / 0.5)',
                  opacity: 1 - i * 0.18,
                }}
              />
            ))}
          </Box>
        ) : null}
        {run && bodyReady ? (
          <AgentUI
            key={run.execution_id}
            initialExecution={{
              execution_id: run.execution_id,
              status: run.status,
              started_at: run.started_at ? Number(run.started_at) : undefined,
              completed_at: run.completed_at ? Number(run.completed_at) : undefined,
              results: run.results,
              workflow: run.workflow,
              authorization: run.authorization,
            }}
            readUrlParams={false}
            autoLoadApps={false}
            hideHeroIcon
            hideAppPicker
            hideAttach
            disableStartTab
            compact
            maxWidth={width - 32}
            apiKey={apiKey}
            apiBaseUrl={apiBaseUrl}
            orgId={orgId}
            onSchedule={onSchedule}
            isSupport={isSupport}
            theme={theme}
            colorMode={colorMode}
          />
        ) : null}
      </Box>
    </Drawer>
  );
};

export default AgentExecutionDrawer;

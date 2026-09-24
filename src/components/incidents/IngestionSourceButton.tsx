import { Ban as BlockIcon, CheckCircle as CheckCircleOutlineIcon, ExternalLink as OpenInNewIcon, Download as DownloadIcon } from 'lucide-react';
import { useState } from 'react';
import { Box, IconButton, Popover, Typography, Chip, Button, Tooltip } from '@mui/material';
import { ValidatedIngestionApp } from '@/Shuffle-MCPs/ingestionDetection';
import { useAppDetail } from '@/Shuffle-MCPs/AppDetailContext';
import { EntityHealth } from '@/services/workflowHealth';
import { useSourceAppImage } from '@/hooks/useSourceAppImage';

interface IngestionSourceButtonProps {
  app: ValidatedIngestionApp;
  onToggle: (appName: string, enabled: boolean) => void;
  incidentCount?: number;
  variant?: 'ingest' | 'forward';
  /** When true, clicking a disabled source immediately enables it instead of
   *  opening the action popover. Used by empty states where the only wanted
   *  action is "turn this on". */
  enableOnClick?: boolean;
  /** When true, draw the primary orange border around the icon to guide the
   *  user's eye — used on the "No incidents yet" empty state. */
  highlighted?: boolean;
  isBlocked?: boolean;
  health?: EntityHealth | null;
}

export const IngestionSourceButton = ({
  app,
  onToggle,
  incidentCount = 0,
  variant = 'ingest',
  enableOnClick = false,
  highlighted = false,
  isBlocked = false,
  health,
}: IngestionSourceButtonProps) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [optimisticEnabled, setOptimisticEnabled] = useState<boolean | null>(null);
  const popoverOpen = Boolean(anchorEl);
  const displayName = app.name.replace(/_/g, ' ');
  const { openApp } = useAppDetail();
  const resolvedAppImage = useSourceAppImage(app.image ? null : app.name);
  const appImage = app.image || resolvedAppImage;

  // Use optimistic state if set, otherwise fall back to actual
  const isEnabled = optimisticEnabled !== null ? optimisticEnabled : app.enabled;

  const handleToggle = () => {
    const willBeEnabled = !isEnabled;
    setOptimisticEnabled(willBeEnabled);
    setAnchorEl(null);
    onToggle(app.name, willBeEnabled);
  };

  const handleIconClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (enableOnClick && !isEnabled) {
      handleToggle();
    } else {
      setAnchorEl(e.currentTarget);
    }
  };

  // Reset optimistic state when the real prop catches up
  if (optimisticEnabled !== null && app.enabled === optimisticEnabled) {
    // Schedule reset to avoid setState during render
    setTimeout(() => setOptimisticEnabled(null), 0);
  }

  return (
    <Box sx={{ position: 'relative' }} data-tour={`ingestion-source-${app.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
      <Tooltip
        title={
          enableOnClick && !isEnabled
            ? `Click to enable ${displayName}`
            : isBlocked
              ? `${displayName} (Blocked - runtime offline)`
              : isEnabled
                ? `${displayName} (${app.validated ? 'Connected' : 'Pending verification'})`
                : `${displayName} (Disabled - click to enable)`
        }
        placement="bottom"
      >
        <IconButton
          onClick={handleIconClick}
          size="small"
          sx={{
            width: 30,
            height: 30,
            border: '1px solid',
            borderColor: isBlocked
              ? 'hsl(var(--destructive))'
              : highlighted
                ? 'hsl(var(--primary) / 0.5)'
                : isEnabled
                  ? (app.validated ? 'hsl(var(--severity-low) / 0.20)' : 'hsl(var(--severity-medium) / 0.35)')
                  : 'transparent',
            bgcolor: isBlocked
              ? 'hsla(var(--destructive) / 0.15)'
              : highlighted
                ? 'hsl(var(--primary) / 0.08)'
                : isEnabled
                  ? (app.validated ? 'hsl(var(--severity-low) / 0.10)' : 'hsl(var(--severity-medium) / 0.12)')
                  : 'transparent',
            borderRadius: 1,
            opacity: (isEnabled || isBlocked) ? 1 : 0.35,
            filter: (isEnabled || isBlocked) ? 'none' : 'grayscale(1)',
            transition: 'transform 0.2s ease, opacity 0.15s ease, filter 0.15s ease, background-color 0.15s ease, border-color 0.15s ease',
            '&:hover': {
              transform: 'scale(1.2)',
              borderColor: isBlocked
                ? 'hsl(var(--destructive))'
                : highlighted
                  ? 'hsl(var(--primary) / 0.7)'
                  : isEnabled
                    ? (app.validated ? 'hsl(var(--severity-low) / 0.30)' : 'hsl(var(--severity-medium) / 0.50)')
                    : 'transparent',
              bgcolor: isBlocked
                ? 'hsla(var(--destructive) / 0.25)'
                : highlighted
                  ? 'hsl(var(--primary) / 0.14)'
                  : isEnabled
                    ? (app.validated ? 'hsl(var(--severity-low) / 0.18)' : 'hsl(var(--severity-medium) / 0.22)')
                    : 'rgba(255,255,255,0.1)',
              opacity: 1,
              filter: 'none',
            },
          }}
        >
          {appImage ? (
            <Box
              component="img"
              src={appImage}
              alt={app.name}
              sx={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'contain' }}
            />
          ) : (
            <DownloadIcon size={16} style={{ color: isBlocked ? 'hsl(var(--destructive))' : isEnabled ? (app.validated ? 'hsl(var(--severity-low))' : 'hsl(var(--severity-medium))') : 'rgba(255,255,255,0.4)' }} />
          )}
        </IconButton>
      </Tooltip>
      {isBlocked && (
        <Box
          sx={{
            position: 'absolute',
            bottom: 1,
            right: 1,
            width: 6,
            height: 6,
            borderRadius: '50%',
            bgcolor: 'hsl(var(--destructive))',
            border: '1px solid hsl(var(--card))',
            pointerEvents: 'none',
          }}
        />
      )}
      <Popover
        open={popoverOpen}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        disablePortal={false}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
        slotProps={{
          paper: {
            sx: {
              mt: 0.5,
              bgcolor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 1.5,
              p: 1.5,
              minWidth: 160,
            },
          },
        }}
      >
        {isBlocked && (
          <Box sx={{
            p: 1.25,
            mb: 1.25,
            borderRadius: 1,
            bgcolor: 'hsla(var(--destructive) / 0.1)',
            border: '1px solid hsla(var(--destructive) / 0.3)',
            display: 'flex',
            flexDirection: 'column',
            gap: 0.75,
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'hsl(var(--destructive))' }} />
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'hsl(var(--destructive))' }}>
                Ingestion Blocked
              </Typography>
            </Box>
            <Typography sx={{ fontSize: '0.7rem', color: 'hsl(var(--muted-foreground))', lineHeight: 1.35 }}>
              {health?.primaryProblem?.description || 'The runtime location used by this workflow is offline.'}
            </Typography>
            <Button
              size="small"
              variant="outlined"
              href={health?.primaryProblem?.actionUrl || '/admin/runtime-locations'}
              sx={{
                fontSize: '0.7rem',
                py: 0.25,
                px: 1,
                alignSelf: 'flex-start',
                borderColor: 'hsl(var(--destructive))',
                color: 'hsl(var(--destructive))',
                textTransform: 'none',
                '&:hover': {
                  borderColor: 'hsl(var(--destructive))',
                  bgcolor: 'hsla(var(--destructive) / 0.1)',
                },
              }}
            >
              Fix Runtime Location &rarr;
            </Button>
          </Box>
        )}
        <Typography variant="caption" sx={{ fontWeight: 600, color: 'hsl(var(--foreground))', textTransform: 'capitalize', mb: 0.5, display: 'block' }}>
          {displayName}
          {isBlocked ? (
            <Chip label="Blocked" size="small" sx={{ ml: 0.5, height: 18, fontSize: '0.65rem', bgcolor: 'hsla(var(--destructive) / 0.15)', color: 'hsl(var(--destructive))', border: '1px solid hsla(var(--destructive) / 0.3)' }} />
          ) : !isEnabled ? (
            <Chip label={variant === 'forward' ? 'Not Forwarding' : 'Not Ingesting'} size="small" sx={{ ml: 0.5, height: 18, fontSize: '0.65rem', bgcolor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }} />
          ) : !app.validated ? (
            <Chip label="Pending" size="small" sx={{ ml: 0.5, height: 18, fontSize: '0.65rem', bgcolor: 'hsla(38, 92%, 50%, 0.15)', color: 'hsl(var(--severity-medium))', border: '1px solid hsla(38, 92%, 50%, 0.3)' }} />
          ) : null}
        </Typography>
        {variant === 'ingest' && (
        <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', display: 'block', mb: 1, fontSize: '0.7rem' }}>
          {incidentCount} {incidentCount === 1 ? 'incident' : 'incidents'}
        </Typography>
        )}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Button
            size="small"
            startIcon={<OpenInNewIcon size={14} />}
            onClick={() => {
              setAnchorEl(null);
              openApp(app.name);
            }}
            sx={{
              justifyContent: 'flex-start',
              textTransform: 'none',
              fontSize: '0.75rem',
              color: 'hsl(var(--foreground))',
              px: 1,
              py: 0.5,
              borderRadius: 1,
              '&:hover': { bgcolor: 'hsl(var(--muted))' },
            }}
          >
            Visit app
          </Button>
          <Button
            size="small"
            startIcon={isEnabled ? <BlockIcon size={14} /> : <CheckCircleOutlineIcon size={14} />}
            onClick={handleToggle}
            sx={{
              justifyContent: 'flex-start',
              textTransform: 'none',
              fontSize: '0.75rem',
              color: isEnabled ? 'hsl(var(--destructive))' : (app.validated ? 'hsl(var(--severity-low))' : 'hsl(var(--severity-medium))'),
              px: 1,
              py: 0.5,
              borderRadius: 1,
              '&:hover': { bgcolor: isEnabled ? 'hsl(var(--destructive) / 0.1)' : (app.validated ? 'hsl(var(--severity-low) / 0.1)' : 'hsl(var(--severity-medium) / 0.1)') },
            }}
          >
            {isEnabled ? (variant === 'forward' ? 'Disable Forwarding' : 'Disable Sync') : (variant === 'forward' ? 'Enable Forwarding' : 'Enable Sync')}
          </Button>
        </Box>
      </Popover>
    </Box>
  );
};

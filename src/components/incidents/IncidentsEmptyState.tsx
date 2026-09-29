import { Rocket as RocketLaunchIcon, Inbox as InboxIcon, ArrowRight as ArrowForwardIcon, Plus as AddIcon, Play as PlayArrowIcon } from 'lucide-react';
import { Box, Typography, Button, IconButton, Tooltip, CircularProgress } from '@mui/material';
import { Link } from '@/lib/router-compat';
import { motion } from 'framer-motion';
import { ValidatedIngestionApp } from '@/Shuffle-Core/ingestionDetection';
import { IngestionSourceButton } from './IngestionSourceButton';
import { WebhookIngestionButton, WebhookIngestionInfo } from './WebhookIngestionButton';
import { useEntityText } from '@/hooks/useEntityLabel';
import { DemoModeCard } from '@/components/demo/DemoModeCard';

interface IncidentsEmptyStateProps {
  ingestionApps?: ValidatedIngestionApp[];
  onIngestionToggled?: () => void;
  onToggleApp?: (appName: string, enabled: boolean) => void;
  webhook?: WebhookIngestionInfo;
  isSyncing?: boolean;
  isUpdatingApps?: boolean;
  isLoading?: boolean;
  onSyncNow?: () => void;
  onCreateIncident?: () => void;
  /** When provided, the "Add ingestion source" button calls this instead of
   *  navigating to /onboarding/sources. Used by the demo tour so the
   *  spotlight target stays mounted on /incidents. */
  onAddSource?: () => void;
}

export const IncidentsEmptyState = ({ ingestionApps = [], onIngestionToggled, onToggleApp, webhook, isSyncing = false, isUpdatingApps = false, isLoading = false, onSyncNow, onCreateIncident, onAddSource }: IncidentsEmptyStateProps) => {
  const t = useEntityText();
  const hasApps = ingestionApps.length > 0 || !!webhook?.exists || !!webhook?.enabled;
  const hasNonWebhookSources = ingestionApps.length > 0;
  // Sync only makes sense when at least one source is actually enabled —
  // a disabled app cannot pull anything, so the action would be a no-op.
  const hasEnabledSource = ingestionApps.some(a => a.enabled);
  const canSync = hasEnabledSource && !!onSyncNow;

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 12, gap: 2 }}>
        <CircularProgress size={32} sx={{ color: 'hsl(var(--primary))' }} />
        <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))' }}>
          Loading sources…
        </Typography>
      </Box>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          py: 12,
          px: 4,
          textAlign: 'center',
          maxWidth: 520,
          mx: 'auto',
        }}
      >
        {/* Icon */}
        <Box
          sx={{
            width: 80,
            height: 80,
            borderRadius: '20px',
            backgroundColor: 'hsl(var(--primary) / 0.08)',
            border: '1px solid hsl(var(--primary) / 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mb: 4,
          }}
        >
          <InboxIcon size={36} style={{ color: 'hsl(var(--primary))', opacity: 0.8 }} />
        </Box>

        {/* Title */}
        <Typography
          variant="h5"
          sx={{
            fontWeight: 600,
            color: 'hsl(var(--foreground))',
            mb: 1.5,
          }}
        >
          {t('No incidents yet')}
        </Typography>

        {/* Description */}
        <Typography
          variant="body1"
          sx={{
            color: 'hsl(var(--muted-foreground))',
            mb: 3,
            lineHeight: 1.7,
            maxWidth: 420,
          }}
        >
          {hasApps
            ? t('Your valid ingestion sources are visible below. Incidents will appear here once alerts start flowing in. Disabled apps show in grey. Click to enable them.')
            : t('Connect your security tools to start ingesting alerts and incidents automatically. Set up your sources in just a few minutes.')}
        </Typography>

        {/* Ingestion sources bar */}
        {hasApps && (
          <Box sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            bgcolor: 'hsl(var(--muted) / 0.4)',
            border: '1px solid hsl(var(--border))',
            borderRadius: 1.5,
            px: 1,
            py: 0.75,
            mb: 4,
          }}>
            {webhook && (
              <WebhookIngestionButton webhook={webhook} onToggled={onIngestionToggled} />
            )}
            {ingestionApps.map((app, index) => (
              <IngestionSourceButton
                key={app.name}
                app={app}
                onToggle={onToggleApp || (() => {})}
                enableOnClick={false}
                highlighted={index === ingestionApps.findIndex(a => !a.enabled)}
              />
            ))}
            <Tooltip title="Add ingestion source" placement="bottom">
              <IconButton
                data-tour="add-ingestion-source-button"
                {...(onAddSource
                  ? { onClick: onAddSource }
                  : { component: Link, to: '/onboarding/sources' })}
                size="small"
                sx={{
                  width: 28,
                  height: 28,
                  color: 'hsl(var(--muted-foreground))',
                  border: '1px dashed hsl(var(--border))',
                  borderRadius: 1,
                  '&:hover': {
                    bgcolor: 'hsl(var(--muted))',
                    borderStyle: 'solid',
                    color: 'hsl(var(--primary))',
                  },
                }}
              >
                <AddIcon size={16} />
              </IconButton>
            </Tooltip>
            {onSyncNow && (
              <Tooltip
                title={
                  isUpdatingApps ? "Updating sources…"
                  : isSyncing ? "Syncing…"
                  : !hasEnabledSource ? "Enable at least one source to sync"
                  : "Sync now"
                }
                placement="bottom"
              >
                <span>
                <IconButton
                  size="small"
                  disabled={isSyncing || isUpdatingApps || !hasEnabledSource}
                  onClick={onSyncNow}
                  sx={{
                    width: 28,
                    height: 28,
                    color: (isSyncing || isUpdatingApps) ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 1,
                    '&:hover': {
                      bgcolor: 'hsl(var(--muted))',
                      color: 'hsl(var(--primary))',
                    },
                  }}
                >
                  {(isSyncing || isUpdatingApps) ? <CircularProgress size={14} color="inherit" /> : <PlayArrowIcon size={16} />}
                </IconButton>
                </span>
              </Tooltip>
            )}
          </Box>
        )}

        {/* Demo mode CTA — same component as the dashboard, compact variant */}
        <Box sx={{ width: '100%', maxWidth: 520, mb: 3 }}>
          <DemoModeCard compact />
        </Box>

        {/* CTA buttons */}
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            {canSync ? (
              <>
                <Button
                  variant="outlined"
                  size="large"
                  disabled={isSyncing || isUpdatingApps}
                  startIcon={(isSyncing || isUpdatingApps) ? <CircularProgress size={18} color="inherit" /> : <PlayArrowIcon />}
                  onClick={onSyncNow}
                  sx={{
                    px: 3,
                    py: 1.5,
                    borderRadius: 2,
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: '0.95rem',
                    borderColor: 'hsl(var(--primary) / 0.5)',
                    color: 'hsl(var(--primary))',
                    '&:hover': {
                      borderColor: 'hsl(var(--primary))',
                      bgcolor: 'hsl(var(--primary) / 0.08)',
                    },
                  }}
                >
                  Sync Now
                </Button>
                <Button
                  component={Link}
                  to="/onboarding/sources"
                  variant="text"
                  size="large"
                  sx={{
                    px: 2.5,
                    py: 1.5,
                    borderRadius: 2,
                    textTransform: 'none',
                    fontWeight: 500,
                    fontSize: '0.95rem',
                    color: 'hsl(var(--muted-foreground))',
                    '&:hover': {
                      color: 'hsl(var(--foreground))',
                      bgcolor: 'hsl(var(--muted) / 0.5)',
                    },
                  }}
                >
                  Manage Sources
                </Button>
              </>
            ) : (
              <Button
                component={Link}
                to="/onboarding/sources"
                variant="outlined"
                size="large"
                startIcon={<RocketLaunchIcon />}
                sx={{
                  px: 3,
                  py: 1.5,
                  borderRadius: 2,
                  textTransform: 'none',
                  fontWeight: 600,
                  fontSize: '0.95rem',
                  borderColor: 'hsl(var(--primary) / 0.5)',
                  color: 'hsl(var(--primary))',
                  '&:hover': {
                    borderColor: 'hsl(var(--primary))',
                    bgcolor: 'hsl(var(--primary) / 0.08)',
                  },
                }}
              >
                {hasNonWebhookSources ? 'Manage Sources' : 'Set Up Ingestion'}
              </Button>
            )}
          </Box>
          <Button
            variant="text"
            size="small"
            onClick={onCreateIncident}
            startIcon={<AddIcon />}
            sx={{
              textTransform: 'none',
              fontWeight: 500,
              fontSize: '0.85rem',
              color: 'hsl(var(--muted-foreground))',
              '&:hover': {
                color: 'hsl(var(--foreground))',
                bgcolor: 'hsl(var(--muted) / 0.5)',
              },
            }}
          >
            {t('Create Incident')}
          </Button>
        </Box>

      </Box>
    </motion.div>
  );
};

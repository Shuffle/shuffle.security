import React from 'react';
import { Box, Typography, Button } from '@mui/material';
import { useNavigate } from '@/lib/router-compat';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useIncidentRuntimeHealth } from '@/hooks/useIncidentRuntimeHealth';
import { toast } from '@/lib/toast';

export interface RuntimeQueueProblemBarProps {
  className?: string;
}

/**
 * Problem bar rendered at the top of /incidents when a runtime location relied upon
 * by incident usecases is stopped (no Orborus check-in within 300s) and has queue > 2.
 *
 * Adheres strictly to AGENTS.md branding: NO icons, NO emojis. Clean engineering typography.
 */
export const RuntimeQueueProblemBar = ({ className }: RuntimeQueueProblemBarProps) => {
  const navigate = useNavigate();
  const isAdmin = useIsAdmin();
  const { hasBlockedRuntime, blockedEnvironments } = useIncidentRuntimeHealth();

  if (!hasBlockedRuntime || blockedEnvironments.length === 0) {
    return null;
  }

  // Pick the primary blocked environment
  const primaryEnv = blockedEnvironments[0];
  const affectedNames = [
    ...primaryEnv.affectedUsecases,
    ...primaryEnv.affectedWorkflows,
  ];
  const affectedSummary =
    affectedNames.length > 2
      ? `${affectedNames.slice(0, 2).join(', ')} +${affectedNames.length - 2} more`
      : affectedNames.length > 0
        ? affectedNames.join(', ')
        : 'Incident automations';

  const handleAdminAction = () => {
    toast.warning(
      `Runtime location "${primaryEnv.name}" is offline with ${primaryEnv.queue} queued jobs. Reassign the default runtime location or start Orborus.`
    );
    const params = new URLSearchParams();
    params.set('highlight', primaryEnv.isDefault ? 'default' : primaryEnv.name);
    params.set('env', primaryEnv.name);
    navigate(`/admin/runtime-locations?${params.toString()}`);
  };

  const handleEditorAction = () => {
    const text = `Shuffle Security Alert: Runtime location "${primaryEnv.name}" is offline with ${primaryEnv.queue} queued executions. Incident ingestion and automations are paused. Please visit /admin/runtime-locations to restart Orborus or reassign the default runtime location to Cloud.`;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).catch(() => {});
      }
    } catch {}
    toast.info('Copied diagnostic alert for workspace administrator to clipboard.');
  };

  return (
    <Box
      role="alert"
      className={className}
      sx={{
        width: '100%',
        py: 1,
        px: 1.75,
        mb: 2.5,
        borderRadius: 1.5,
        bgcolor: 'hsla(var(--destructive) / 0.08)',
        border: '1px solid hsla(var(--destructive) / 0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 2,
        flexWrap: 'wrap',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1, minWidth: 280 }}>
        {/* Engineering status dot — pure CSS, no icons or emojis */}
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            bgcolor: 'hsl(var(--destructive))',
            flexShrink: 0,
          }}
        />

        <Box sx={{ flex: 1 }}>
          <Typography
            sx={{
              fontSize: '0.84rem',
              fontWeight: 600,
              color: 'hsl(var(--foreground))',
              lineHeight: 1.3,
            }}
          >
            Runtime location &ldquo;{primaryEnv.name}&rdquo; is not running ({primaryEnv.queue} queued jobs)
          </Typography>

          <Typography
            sx={{
              fontSize: '0.78rem',
              color: 'hsl(var(--muted-foreground))',
              mt: 0.25,
              lineHeight: 1.35,
            }}
          >
            {isAdmin ? (
              <>
                Incident usecases ({affectedSummary}) cannot run until Orborus is started or the location is reassigned.
              </>
            ) : (
              <>
                Incident usecases are paused. Notify a workspace admin to restart Orborus or change the runtime location.
              </>
            )}
          </Typography>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {isAdmin ? (
          <Button
            size="small"
            variant="outlined"
            onClick={handleAdminAction}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.8125rem',
              py: 0.5,
              px: 1.25,
              borderColor: 'hsla(var(--destructive) / 0.5)',
              color: 'hsl(var(--foreground))',
              whiteSpace: 'nowrap',
              '&:hover': {
                borderColor: 'hsl(var(--destructive))',
                bgcolor: 'hsla(var(--destructive) / 0.08)',
              },
            }}
          >
            Change runtime location
          </Button>
        ) : (
          <Button
            size="small"
            variant="outlined"
            onClick={handleEditorAction}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.8125rem',
              borderColor: 'hsl(var(--border))',
              color: 'hsl(var(--muted-foreground))',
              whiteSpace: 'nowrap',
              '&:hover': {
                borderColor: 'hsl(var(--foreground))',
                color: 'hsl(var(--foreground))',
              },
            }}
          >
            Copy details for admin
          </Button>
        )}
      </Box>
    </Box>
  );
};

export default RuntimeQueueProblemBar;

/**
 * The Demo Mode CTA card shown at the top of the dashboard.
 *
 * Two states:
 *   - Inactive: pitch + "Start Demo Tour" button
 *   - Active:   live counts + "Continue Tour" + "Clean up demo data"
 */

import { Box, Typography, Button, Chip, CircularProgress, Tooltip, SxProps, Theme } from '@mui/material';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useDemo } from '@/context/DemoContext';
import { useWorkflows } from '@/hooks/useWorkflows';
import { useEntityPreference } from '@/hooks/useEntityLabel';
import { applyEntityTerminology } from '@/lib/entityTerminology';
import { findIngestTicketsWorkflow, isWorkflowScheduleStopped } from '@/Shuffle-MCPs/ingestionDetection';
import { getApiUrl, getAuthHeader } from '@/Shuffle-MCPs/api';
import { countDemoIncidents } from '@/services/demoMode';
import { useAuth } from '@/context/AuthContext';

/** Returns the total number of incidents in the org's datastore. */
export const useIncidentCount = (orgId: string | null | undefined) => {
  return useQuery<number>({
    queryKey: ['demo-card', 'incident-count', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      try {
        const res = await fetch(
          getApiUrl(`/api/v1/orgs/${orgId}/list_cache?category=shuffle-security_incidents&top=50`),
          { credentials: 'include', headers: { ...getAuthHeader() } },
        );
        if (!res.ok) return 0;
        const data = await res.json();
        if (typeof data?.total_amount === 'number') return data.total_amount;
        if (typeof data?.total === 'number') return data.total;
        if (Array.isArray(data?.keys)) return data.keys.length;
        if (Array.isArray(data)) return data.length;
        return 0;
      } catch {
        return 0;
      }
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};

const INCIDENT_THRESHOLD = 10;

/** Detect leftover demo incidents in the datastore so we can offer a cleanup
 *  even when demo mode is no longer "active" (e.g. another browser/session
 *  ran the tour, or the active flag was cleared but the seeded incidents
 *  remain). Polled lazily — uses the same auth + datastore API the demo
 *  itself uses, no extra wiring required. */
const useLeftoverDemoCount = (active: boolean) => {
  return useQuery<number>({
    queryKey: ['demo-card', 'leftover-demo-count'],
    queryFn: async () => {
      try { return await countDemoIncidents(); } catch { return 0; }
    },
    // While active, the in-context stats already drive the UI — skip the
    // extra probe to avoid duplicate work.
    enabled: !active,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });
};

export interface DemoModeCardProps {
  compact?: boolean;
  incidentCount?: number;
  sx?: SxProps<Theme>;
}

export const DemoModeCard = ({ compact = false, incidentCount: incidentCountProp, sx: customSx }: DemoModeCardProps = {}) => {
  const { active, isSeeding, isCleaning, stats, startDemo, openTour, cleanup } = useDemo();
  const { userInfo } = useAuth();
  const { data: workflows } = useWorkflows();
  const { data: fetchedIncidentCount = 0 } = useIncidentCount(userInfo?.active_org?.id);
  const incidentCount = incidentCountProp !== undefined ? incidentCountProp : fetchedIncidentCount;
  const { data: leftoverDemoCount = 0 } = useLeftoverDemoCount(active);
  const { singular: entitySingular, plural: entityPlural } = useEntityPreference();
  const t = (s: string) => applyEntityTerminology(s, entitySingular, entityPlural);
  const entityPluralLower = entityPlural.toLowerCase();
  const entitySingularLower = entitySingular.toLowerCase();

  // Allow demo mode when the account is still light on real incidents (<= 10).
  // Host monitors are NOT considered — production deployments often have them.
  const ingestWorkflow = workflows ? findIngestTicketsWorkflow(workflows) : null;
  const hasIngest = !!ingestWorkflow && !isWorkflowScheduleStopped(ingestWorkflow);
  const hasExistingIncidents = incidentCount > 0;
  // Don't block — just inform. Users with real data still deserve to try the tour.
  const disableStart = false;
  const warnReason = hasExistingIncidents
    ? `You already have ${incidentCount} ${entityPluralLower}. Demo mode will add a few seeded ${entityPluralLower} you can clean up afterwards.`
    : '';
  // Show the Clean Up button whenever demo data exists, even if the demo
  // mode flag itself is no longer active.
  const hasLeftoverDemoData = !active && leftoverDemoCount > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Box
        sx={{
          mb: compact ? 0 : 4,
          borderRadius: 2.5,
          border: '1px solid hsl(var(--primary) / 0.25)',
          background: 'linear-gradient(135deg, hsl(var(--primary) / 0.10), hsl(var(--primary) / 0.02))',
          px: compact ? { xs: 1.5, sm: 2 } : { xs: 2, sm: 2.5 },
          py: compact ? { xs: 1.5, sm: 1.75 } : { xs: 2.625, sm: 3.125 },
          display: 'flex',
          alignItems: compact ? 'center' : { xs: 'flex-start', md: 'center' },
          flexDirection: { xs: 'column', md: 'row' },
          gap: compact ? { xs: 1.25, md: 1.5 } : { xs: 1.5, md: 2 },
          textAlign: compact ? 'center' : 'left',
          ...customSx,
        }}
      >

        {/* Body */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography sx={{ fontSize: compact ? '0.85rem' : '0.95rem', fontWeight: 600, color: 'hsl(var(--foreground))' }}>
              {active
                ? 'Demo mode is active'
                : compact
                  ? `Try a live ${entitySingularLower}`
                  : `See the platform respond to a real ${entitySingularLower}`}
            </Typography>
            {active && (
              <Chip
                label="ON"
                size="small"
                sx={{
                  height: 20,
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  backgroundColor: 'hsl(var(--severity-low) / 0.18)',
                  color: 'hsl(var(--severity-low))',
                  letterSpacing: '0.04em',
                }}
              />
            )}
          </Box>
          {!(compact && !active) && (
            <Typography sx={{ fontSize: compact ? '0.74rem' : '0.8rem', color: 'hsl(var(--muted-foreground))', mt: 0.5, lineHeight: 1.5 }}>
              {active
                ? `${stats.incidents} ${entityPluralLower}, ${stats.assets} assets, ${stats.users} users loaded. Real IOCs, live enrichment and AI agents you can interact with — only the ${entitySingularLower} itself is seeded.`
                : warnReason
                  ? warnReason
                  : `We seed one realistic ${entitySingularLower}, then everything else is real: live threat-feed IOCs, real enrichments and AI agents you can actually approve or question. One-click cleanup when you are done.`}
            </Typography>
          )}
        </Box>

        {/* Actions */}
        <Box sx={{
          display: 'flex',
          gap: 1,
          flexShrink: 0,
          flexWrap: 'wrap',
          justifyContent: compact ? 'center' : 'flex-start',
          width: compact ? 'auto' : { xs: '100%', md: 'auto' },
        }}>
          {active ? (
            <>
              <Button
                onClick={openTour}
                variant="text"
                size="small"
                sx={{
                  textTransform: 'none',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  color: 'hsl(var(--muted-foreground))',
                  px: 1.5,
                  whiteSpace: 'nowrap',
                  '&:hover': {
                    backgroundColor: 'hsl(var(--muted) / 0.6)',
                    color: 'hsl(var(--foreground))',
                  },
                }}
              >
                Continue demo mode
              </Button>
              <Button
                onClick={cleanup}
                disabled={isCleaning}
                variant="outlined"
                size="small"
                startIcon={isCleaning ? <CircularProgress size={12} sx={{ color: 'inherit' }} /> : undefined}
                sx={{
                  textTransform: 'none',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  borderColor: 'hsl(var(--border))',
                  color: 'hsl(var(--foreground))',
                  px: 2,
                  whiteSpace: 'nowrap',
                  '&:hover': {
                    borderColor: 'hsl(var(--destructive) / 0.5)',
                    backgroundColor: 'hsl(var(--destructive) / 0.06)',
                    color: 'hsl(var(--destructive))',
                  },
                }}
              >
                {isCleaning ? 'Cleaning…' : 'Clean up demo data'}
              </Button>
            </>
          ) : (
            <>
              {/* Demo data left over from a previous session — surface the
                  cleanup so the user is not stuck with seeded incidents. */}
              {hasLeftoverDemoData && !compact && (
                <Button
                  onClick={cleanup}
                  disabled={isCleaning}
                  variant="outlined"
                  size="small"
                  startIcon={isCleaning ? <CircularProgress size={12} sx={{ color: 'inherit' }} /> : undefined}
                  sx={{
                    textTransform: 'none',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    borderColor: 'hsl(var(--border))',
                    color: 'hsl(var(--foreground))',
                    px: 2,
                    whiteSpace: 'nowrap',
                    '&:hover': {
                      borderColor: 'hsl(var(--destructive) / 0.5)',
                      backgroundColor: 'hsl(var(--destructive) / 0.06)',
                      color: 'hsl(var(--destructive))',
                    },
                  }}
                >
                  {isCleaning ? 'Cleaning…' : `Clean up demo data (${leftoverDemoCount})`}
                </Button>
              )}
              <Tooltip title={warnReason} arrow disableHoverListener={!warnReason}>
                <span>
                  <Button
                    onClick={startDemo}
                    disabled={isSeeding || disableStart}
                    variant="contained"
                    size="medium"
                    endIcon={isSeeding ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : undefined}
                    sx={{
                      textTransform: 'none',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      backgroundColor: 'hsl(var(--primary))',
                      color: 'hsl(var(--primary-foreground))',
                      px: 2.5,
                      py: 1,
                      boxShadow: 'none',
                      whiteSpace: 'nowrap',
                      width: compact ? 'auto' : { xs: '100%', md: 'auto' },
                      '&:hover': { backgroundColor: 'hsl(var(--primary) / 0.9)', boxShadow: 'none' },
                      '&.Mui-disabled': {
                        backgroundColor: 'hsl(var(--muted))',
                        color: 'hsl(var(--muted-foreground))',
                      },
                    }}
                  >
                    {isSeeding ? 'Seeding sample data…' : 'Start demo mode'}
                  </Button>
                </span>
              </Tooltip>
            </>
          )}
        </Box>
      </Box>
    </motion.div>
  );
};

export default DemoModeCard;

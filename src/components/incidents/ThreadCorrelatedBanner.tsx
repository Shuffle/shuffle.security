/**
 * Banner listing incidents that share the same `thread_id` as the one
 * being viewed. Compact by default (single line summary) with an
 * expandable list; auto-merge CTA collapses the thread by keeping the
 * newest incident as primary and linking the rest.
 */

import { Box, Typography, Chip, IconButton, Tooltip, CircularProgress, Button } from '@mui/material';
import { MessagesSquare, ExternalLink, GitMerge, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from '@/lib/router-compat';
import { getIncidentUrl, toCanonicalIncidentId } from '@/lib/incidentUrl';
import type { LinkedIncidentSummary } from '@/hooks/useRelatedIncidents';

interface ThreadCorrelatedBannerProps {
  threadId: string | null;
  incidents: LinkedIncidentSummary[];
  discoveredCount?: number;
  invisibleCount: number;
  loading?: boolean;
  /** Optional callback to auto-merge all thread siblings into the latest. */
  onAutoMerge?: () => void | Promise<void>;
  /** Disables the CTA and shows a spinner while a merge is in flight. */
  autoMergeBusy?: boolean;
}

export const ThreadCorrelatedBanner = ({
  threadId,
  incidents,
  discoveredCount = 0,
  invisibleCount,
  loading,
  onAutoMerge,
  autoMergeBusy,
}: ThreadCorrelatedBannerProps) => {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  if (!threadId) return null;
  const total = Math.max(discoveredCount, incidents.length + invisibleCount);
  if (!loading && total === 0) return null;


  return (
    <Box
      sx={{
        px: 2,
        py: 1,
        mb: 2,
        borderRadius: 2,
        bgcolor: 'hsl(var(--muted) / 0.35)',
        border: '1px solid hsl(var(--border))',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <MessagesSquare size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
        <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>
          {total === 1 ? '1 incident in this thread' : `${total} incidents in this thread`}
        </Typography>
        <Tooltip title="Shared thread_id">
          <Chip
            size="small"
            label={threadId.length > 20 ? `${threadId.substring(0, 20)}…` : threadId}
            sx={{
              height: 18,
              fontSize: '0.65rem',
              fontFamily: 'monospace',
              bgcolor: 'hsl(var(--background) / 0.6)',
              border: '1px solid hsl(var(--border))',
            }}
          />
        </Tooltip>
        {loading && <CircularProgress size={12} sx={{ color: 'hsl(var(--muted-foreground))' }} />}
        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {onAutoMerge && total > 0 && (
            <Button
              size="small"
              variant="outlined"
              disabled={autoMergeBusy}
              onClick={() => { void onAutoMerge(); }}
              startIcon={autoMergeBusy
                ? <CircularProgress size={12} sx={{ color: 'inherit' }} />
                : <GitMerge size={13} />}
              sx={{
                height: 26,
                fontSize: '0.7rem',
                textTransform: 'none',
                borderColor: 'hsl(var(--border))',
                color: 'hsl(var(--foreground))',
                '&:hover': {
                  borderColor: 'hsl(var(--primary))',
                  bgcolor: 'hsl(var(--primary) / 0.08)',
                },
              }}
            >
              {autoMergeBusy ? 'Merging…' : 'Auto-merge'}
            </Button>
          )}
          {incidents.length > 0 && (
            <Tooltip title={expanded ? 'Hide list' : 'Show list'}>
              <IconButton
                size="small"
                onClick={() => setExpanded((v) => !v)}
                sx={{ color: 'hsl(var(--muted-foreground))' }}
              >
                {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>
      {expanded && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, maxHeight: 260, overflowY: 'auto', pr: 0.5, mt: 1 }}>
          {incidents.map((l) => (
            <Box
              key={l.id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 1.25,
                py: 0.5,
                borderRadius: 1.5,
                bgcolor: 'hsl(var(--background) / 0.5)',
                '&:hover': { bgcolor: 'hsl(var(--muted) / 0.4)' },
              }}
            >
              <Box
                sx={{
                  flex: 1,
                  minWidth: 0,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                <Typography
                  component="span"
                  variant="body2"
                  sx={{ fontWeight: 500, color: 'hsl(var(--foreground))', fontSize: '0.8rem' }}
                >
                  {l.title}
                </Typography>
              </Box>
              <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', flexShrink: 0, fontFamily: 'monospace' }}>
                {toCanonicalIncidentId(l.id).substring(0, 10)}…
              </Typography>
              <Tooltip title="Open">
                <IconButton
                  size="small"
                  onClick={() => navigate(getIncidentUrl(l.id))}
                  sx={{ color: 'hsl(var(--muted-foreground))' }}
                >
                  <ExternalLink size={13} />
                </IconButton>
              </Tooltip>
            </Box>
          ))}
          {invisibleCount > 0 && (
            <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', px: 1.25 }}>
              +{invisibleCount} not visible in current view
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
};

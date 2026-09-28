/**
 * Banner shown at the top of a PRIMARY incident's detail page. Merges are
 * meant to be almost invisible: instead of listing every incident that was
 * folded into this one, we show a single compact summary line with the latest
 * merged incident and a count. The full list can be expanded if an analyst
 * ever needs to unmerge or inspect a specific source.
 */

import { Box, Typography, Chip, IconButton, Tooltip, CircularProgress } from '@mui/material';
import { GitMerge, ExternalLink, Link2Off, ChevronDown, ChevronUp } from 'lucide-react';
import { useNavigate } from '@/lib/router-compat';
import { useState, useMemo, useEffect } from 'react';
import { toast } from '@/lib/toast';
import { unlinkMergePair } from '@/lib/incidentRelations';
import { UnmergeConfirmDialog } from '@/components/incidents/UnmergeConfirmDialog';
import { getIncidentUrl, toCanonicalIncidentId } from '@/lib/incidentUrl';
import type { LinkedIncidentSummary } from '@/hooks/useRelatedIncidents';

interface RelatedIncidentsBannerProps {
  currentIncidentId: string;
  linked: LinkedIncidentSummary[];
  invisibleCount: number;
  /** Total pointer count from the OCSF payload; used as a fallback when
   *  resolution is still loading or rate-limited. */
  expectedCount?: number;
  loading?: boolean;
  onUnlinked?: () => void;
  /** If set, flash the matching linked row (auto-expanding the list when needed). */
  highlightId?: string | null;
}

const readTs = (raw: any): number => {
  if (!raw) return 0;
  const cs = [raw.time, raw.event_time, raw.created_time_dt, raw.created_time, raw.created_at, raw.metadata?.extensions?.custom_attributes?.created];
  for (const c of cs) {
    if (typeof c === 'number' && Number.isFinite(c) && c > 0) return c < 1e12 ? c * 1000 : c;
    if (typeof c === 'string' && c) {
      const p = Date.parse(c);
      if (Number.isFinite(p) && p > 0) return p;
    }
  }
  return 0;
};

export const RelatedIncidentsBanner = ({
  currentIncidentId,
  linked,
  invisibleCount,
  expectedCount = 0,
  loading,
  onUnlinked,
  highlightId,
}: RelatedIncidentsBannerProps) => {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  // Pending confirmation target: null = closed, string = single sourceId,
  // 'all' = unlink every merged source in one confirm.
  const [pendingUnmerge, setPendingUnmerge] = useState<string | null>(null);
  const highlightMatch = useMemo(
    () => (highlightId ? linked.find((l) => l.id === highlightId) : null),
    [highlightId, linked],
  );
  // Auto-expand the full list when the highlight target isn't the summary row.
  useEffect(() => {
    if (highlightMatch && linked.length > 1) setExpanded(true);
  }, [highlightMatch, linked.length]);

  const sorted = useMemo(() => {
    return [...linked].sort((a, b) => (readTs(b.raw) - readTs(a.raw)) || b.id.localeCompare(a.id));
  }, [linked]);

  if (!loading && linked.length === 0 && invisibleCount === 0 && expectedCount === 0) return null;

  const latest = sorted[0];
  const resolvedTotal = linked.length + invisibleCount;
  const total = Math.max(resolvedTotal, expectedCount);

  const handleUnlink = async (sourceId: string) => {
    const res = await unlinkMergePair({
      primaryId: currentIncidentId,
      sourceId,
    });
    if (res.success) {
      toast.success('Unmerged');
      onUnlinked?.();
    } else {
      toast.error(res.error || 'Failed to unmerge');
    }
  };

  const confirmLabel = (() => {
    if (!pendingUnmerge) return '';
    if (pendingUnmerge === 'all') {
      return `${sorted.length} merged incident${sorted.length === 1 ? '' : 's'}`;
    }
    const hit = sorted.find((l) => l.id === pendingUnmerge);
    return hit?.title || `incident ${pendingUnmerge}`;
  })();

  const runPendingUnmerge = async () => {
    if (!pendingUnmerge) return;
    if (pendingUnmerge === 'all') {
      for (const l of sorted) await handleUnlink(l.id);
    } else {
      await handleUnlink(pendingUnmerge);
    }
  };


  const openIncident = (id: string) => navigate(getIncidentUrl(id));

  return (
    <Box
      sx={{
        px: 2.5,
        py: 1.25,
        mb: 2,
        borderRadius: 2,
        bgcolor: 'hsl(var(--muted) / 0.35)',
        border: '1px solid hsl(var(--border))',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <GitMerge size={16} style={{ color: 'hsl(var(--muted-foreground))', flexShrink: 0 }} />

        <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 0, flex: '1 1 auto' }}>
          {total === 1 && linked.length === 1 && latest ? (
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', minWidth: 0, maxWidth: '100%' }}>
              <Box component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {latest.title}
              </Box>
              <Box component="span" sx={{ whiteSpace: 'nowrap', ml: 0.5, color: 'text.secondary' }}>
                merged into this one
              </Box>
            </Box>
          ) : latest ? (
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', minWidth: 0, maxWidth: '100%' }}>
              <Box component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {latest.title}
              </Box>
              <Box component="span" sx={{ whiteSpace: 'nowrap', ml: 0.5, color: 'text.secondary' }}>
                merged into this one
              </Box>
              <Chip
                size="small"
                label={`+${linked.length - 1} more`}
                sx={{ height: 18, fontSize: '0.65rem', ml: 1, flexShrink: 0 }}
              />
            </Box>
          ) : (
            `${total} merged incident${total === 1 ? '' : 's'}${loading ? ' (loading…)' : ''}`
          )}
        </Typography>

        {loading && <CircularProgress size={12} sx={{ color: 'hsl(var(--muted-foreground))', flexShrink: 0 }} />}

        {invisibleCount > 0 && (
          <Tooltip title="Merged sources that could not be loaded (deleted or inaccessible)">
            <Chip
              size="small"
              label={`${invisibleCount} unavailable`}
              sx={{ height: 18, fontSize: '0.65rem' }}
            />
          </Tooltip>
        )}

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, ml: 'auto', flexShrink: 0 }}>
          {linked.length === 1 && latest && (
            <>
              <Tooltip title="Open merged incident">
                <IconButton
                  size="small"
                  onClick={() => openIncident(latest.id)}
                  sx={{ color: 'hsl(var(--muted-foreground))' }}
                >
                  <ExternalLink size={14} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Unmerge (rarely recommended)">
                <IconButton
                  size="small"
                  onClick={() => setPendingUnmerge(latest.id)}
                  sx={{ color: 'hsl(var(--muted-foreground))' }}
                >
                  <Link2Off size={14} />
                </IconButton>
              </Tooltip>
            </>
          )}
          {linked.length > 1 && (
            <>
              <Tooltip title={expanded ? 'Hide merged sources' : 'Show merged sources'}>
                <IconButton
                  size="small"
                  onClick={() => setExpanded((v) => !v)}
                  sx={{ color: 'hsl(var(--muted-foreground))' }}
                >
                  {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </IconButton>
              </Tooltip>
              <Tooltip title="Unmerge all sources (rarely recommended)">
                <IconButton
                  size="small"
                  onClick={() => setPendingUnmerge('all')}
                  sx={{ color: 'hsl(var(--muted-foreground))' }}
                >
                  <Link2Off size={14} />
                </IconButton>
              </Tooltip>
            </>
          )}
        </Box>
      </Box>

      {expanded && linked.length > 1 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 1.5, maxHeight: 260, overflowY: 'auto', pr: 0.5 }}>
          {sorted.map((l) => {
            const canonicalId = toCanonicalIncidentId(l.id);
            const isFlashed = !!highlightId && toCanonicalIncidentId(highlightId) === canonicalId;
            return (
            <Box
              key={l.id}
              data-related-id={canonicalId}
              className={isFlashed ? 'incident-new-flash' : undefined}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 1.25,
                py: 0.75,
                borderRadius: 1.5,
                bgcolor: isFlashed ? 'hsl(var(--primary) / 0.12)' : 'hsl(var(--background) / 0.5)',
                border: isFlashed ? '1px solid hsl(var(--primary) / 0.5)' : '1px solid transparent',
                transition: 'background-color 0.3s, border-color 0.3s',
                '&:hover': { bgcolor: 'hsl(var(--muted) / 0.4)' },
              }}
            >
              <Typography
                variant="body2"
                sx={{
                  flex: 1,
                  minWidth: 0,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {l.title}
              </Typography>
              <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))' }}>
                {toCanonicalIncidentId(l.id).substring(0, 10)}…
              </Typography>
              <Tooltip title="Open">
                <IconButton
                  size="small"
                  onClick={() => openIncident(l.id)}
                  sx={{ color: 'hsl(var(--muted-foreground))' }}
                >
                  <ExternalLink size={14} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Unmerge (rarely recommended)">
                <IconButton
                  size="small"
                  onClick={() => setPendingUnmerge(l.id)}
                  sx={{ color: 'hsl(var(--muted-foreground))' }}
                >
                  <Link2Off size={14} />
                </IconButton>
              </Tooltip>
            </Box>
            );
          })}
        </Box>
      )}
      <UnmergeConfirmDialog
        open={pendingUnmerge !== null}
        onOpenChange={(next) => { if (!next) setPendingUnmerge(null); }}
        targetLabel={confirmLabel}
        onConfirm={runPendingUnmerge}
      />
    </Box>
  );
};

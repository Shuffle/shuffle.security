/**
 * CorrelationContextStrip
 *
 * Inline strip rendered inside a CorrelationRow when the correlation has only
 * a small number of incident references (≤2). Instead of forcing the user to
 * click each chip and read the popover, we eagerly fetch each referenced
 * incident and surface the two signals that actually matter for triage:
 *
 *   1. Recency  — when did it land? (relative time)
 *   2. Severity — how bad is it? (severity chip in semantic color)
 *
 * This turns "1 match" rows from "is this noise?" into "is this recent and
 * bad?" at a glance — important because being a known IOC is only one
 * dimension of relevance. A correlated incident from yesterday at Critical
 * severity is materially different from one from 8 months ago at Low.
 */
import { Clock as ScheduleIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Box, Typography, Chip, CircularProgress, Tooltip } from '@mui/material';
import { lookupIncidentCached } from './incidentPreviewCache';
import { toCanonicalIncidentId } from '@/lib/incidentUrl';

interface CorrelationContextStripProps {
  /** The other incident keys referenced by this correlation (current incident already filtered out). */
  incidentKeys: string[];
  /** Datastore category to fetch from. Defaults to incidents category. */
  category?: string;
  compact?: boolean;
}

interface RefPreview {
  key: string;
  loading: boolean;
  notFound?: boolean;
  title?: string;
  severity?: string;
  /** ms since epoch */
  whenMs?: number;
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: 'hsl(var(--destructive))',
  high: '#ff6600',
  medium: '#eab308',
  low: 'hsl(var(--muted-foreground))',
  informational: 'hsl(var(--muted-foreground))',
};

const formatRelative = (ms?: number): string => {
  if (!ms || !Number.isFinite(ms)) return '—';
  const diff = Date.now() - ms;
  if (diff < 0) return 'just now';
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
};

/**
 * Pull title / severity / "when" from the wide variety of shapes the
 * datastore returns for an incident. Mirrors the lookups inside
 * IncidentCorrelationPreview but trimmed to the two fields we care about.
 */
const extractPreview = (raw: unknown): { title?: string; severity?: string; whenMs?: number } => {
  let parsed: Record<string, unknown> | undefined;
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw); } catch { /* ignore */ }
  } else if (raw && typeof raw === 'object') {
    parsed = raw as Record<string, unknown>;
  }
  if (!parsed) return {};
  const findings = (parsed?.finding_info as Record<string, unknown> | undefined) || parsed;
  const customAttrs = ((parsed?.metadata as Record<string, unknown> | undefined)?.extensions as Record<string, unknown> | undefined)?.custom_attributes as Record<string, unknown> | undefined;
  const title = (findings?.title as string | undefined)
    || (parsed?.title as string | undefined)
    || (customAttrs?.title as string | undefined);
  const severity = (parsed?.severity as string | undefined)
    || ((parsed?.severity_id as { name?: string } | undefined)?.name)
    || (customAttrs?.severity as string | undefined);

  // Prefer the most "this just happened" timestamp available. We use ISO
  // strings on OCSF (first_seen_time/created_time) and fall back to the
  // numeric `created` field the datastore wraps items with.
  const tsCandidates: unknown[] = [
    parsed?.last_seen_time, parsed?.first_seen_time, parsed?.created_time,
    parsed?.modified_time, parsed?.created, parsed?.timestamp,
  ];
  let whenMs: number | undefined;
  for (const cand of tsCandidates) {
    if (typeof cand === 'string') {
      const t = Date.parse(cand);
      if (!Number.isNaN(t)) { whenMs = t; break; }
    } else if (typeof cand === 'number' && Number.isFinite(cand)) {
      // Some datastore wrappers store seconds, not ms.
      whenMs = cand > 1e12 ? cand : cand * 1000;
      break;
    }
  }
  return { title: typeof title === 'string' ? title : undefined, severity: typeof severity === 'string' ? severity : undefined, whenMs };
};

export const CorrelationContextStrip = ({ incidentKeys, category = 'shuffle-security_incidents', compact = false }: CorrelationContextStripProps) => {
  // Stabilize keys array — parents pass a fresh array each render, which
  // otherwise retriggers the fetch effect every tick (caused the
  // "no longer exists" row to flicker / re-poll constantly).
  const keysSignature = incidentKeys.join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableKeys = useMemo(() => incidentKeys.map(toCanonicalIncidentId), [keysSignature]);
  const [previews, setPreviews] = useState<RefPreview[]>(() => stableKeys.map(k => ({ key: k, loading: true })));

  useEffect(() => {
    let cancelled = false;
    setPreviews(stableKeys.map(k => ({ key: k, loading: true })));
    stableKeys.forEach(async (key) => {
      const result = await lookupIncidentCached(key, category);
      if (cancelled) return;
      if (result.status === 'not_found' || result.status === 'error') {
        setPreviews(prev => prev.map(p => p.key === key ? { key, loading: false, notFound: true } : p));
        return;
      }
      const raw = result.raw;
      const fields = extractPreview(raw);
      const wrapperWhen = result.item?.edited || result.item?.created;
      const whenMs = fields.whenMs
        ?? (typeof wrapperWhen === 'number'
            ? (wrapperWhen > 1e12 ? wrapperWhen : wrapperWhen * 1000)
            : undefined);
      setPreviews(prev => prev.map(p => p.key === key ? { key, loading: false, ...fields, whenMs } : p));
    });
    return () => { cancelled = true; };
  }, [stableKeys, category]);


  if (incidentKeys.length === 0) return null;

  return (
    <Box
      sx={{
        mt: compact ? 0.75 : 1,
        pt: compact ? 0.75 : 1,
        borderTop: '1px dashed hsl(var(--border))',
        display: 'flex',
        flexDirection: 'column',
        gap: 0.5,
      }}
    >
      <Typography
        variant="caption"
        sx={{
          fontSize: compact ? '0.6rem' : '0.65rem',
          color: 'hsl(var(--muted-foreground))',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          fontWeight: 600,
        }}
      >
        Recency &amp; severity
      </Typography>
      {previews.map((p) => {
        const sev = (p.severity || '').toLowerCase();
        const sevColor = SEVERITY_COLOR[sev] || 'hsl(var(--muted-foreground))';
        return (
          <Box
            key={p.key}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              minWidth: 0,
            }}
          >
            {p.loading ? (
              <>
                <CircularProgress size={10} sx={{ color: 'hsl(var(--muted-foreground))' }} />
                <Typography
                  variant="caption"
                  sx={{ fontSize: compact ? '0.65rem' : '0.7rem', fontFamily: 'monospace', color: 'hsl(var(--muted-foreground))' }}
                >
                  {p.key}
                </Typography>
              </>
            ) : p.notFound ? (
              <>
                <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'hsl(var(--muted-foreground) / 0.5)', flexShrink: 0 }} />
                <Typography
                  variant="caption"
                  sx={{ fontSize: compact ? '0.65rem' : '0.7rem', fontFamily: 'monospace', color: 'hsl(var(--muted-foreground))', fontStyle: 'italic' }}
                >
                  {p.key} — no longer exists
                </Typography>
              </>
            ) : (
              <>
                {p.severity && (
                  <Chip
                    label={p.severity}
                    size="small"
                    sx={{
                      height: compact ? 16 : 18,
                      fontSize: compact ? '0.55rem' : '0.6rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: 0.4,
                      bgcolor: 'transparent',
                      border: `1px solid ${sevColor}`,
                      color: sevColor,
                      '& .MuiChip-label': { px: 0.75 },
                      flexShrink: 0,
                    }}
                  />
                )}
                <Tooltip title={p.whenMs ? new Date(p.whenMs).toLocaleString() : 'Unknown time'} arrow>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, flexShrink: 0, color: 'hsl(var(--muted-foreground))' }}>
                    <ScheduleIcon size={compact ? 10 : 11} strokeWidth={2} />
                    <Typography
                      variant="caption"
                      sx={{ fontSize: compact ? '0.6rem' : '0.65rem', fontWeight: 600 }}
                    >
                      {formatRelative(p.whenMs)}
                    </Typography>
                  </Box>
                </Tooltip>
                <Typography
                  variant="caption"
                  sx={{
                    fontSize: compact ? '0.65rem' : '0.7rem',
                    color: 'hsl(var(--foreground))',
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={p.title || p.key}
                >
                  {p.title || p.key}
                </Typography>
              </>
            )}
          </Box>
        );
      })}
    </Box>
  );
};

export default CorrelationContextStrip;

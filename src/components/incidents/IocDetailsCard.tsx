import { AlertTriangle as WarningAmberIcon, ExternalLink as OpenInNewIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Box, Typography, Chip, CircularProgress, Link as MuiLink, Tooltip } from '@mui/material';
import { getDatastoreItem, getDatastoreByCategory, DATASTORE_CATEGORIES } from '@/Shuffle-Core/datastore';
import { isIocCategory, type Correlation } from './CorrelationRow';
import type { ThreatFeed } from '@/hooks/useThreatFeeds';

/** In-memory cache of threat feeds (id+url+name) so we resolve a friendly
 *  feed name for IOC references without re-hitting the datastore for every
 *  popover render. Loaded lazily on first use. */
let threatFeedsCache: ThreatFeed[] | null = null;
let threatFeedsPromise: Promise<ThreatFeed[]> | null = null;
const loadThreatFeeds = async (): Promise<ThreatFeed[]> => {
  if (threatFeedsCache) return threatFeedsCache;
  if (threatFeedsPromise) return threatFeedsPromise;
  threatFeedsPromise = (async () => {
    try {
      const res = await getDatastoreByCategory(DATASTORE_CATEGORIES.THREAT_FEEDS);
      const items = (res?.data || []).map((it) => {
        try { return JSON.parse(String(it.value)) as ThreatFeed; } catch { return null; }
      }).filter(Boolean) as ThreatFeed[];
      threatFeedsCache = items;
      return items;
    } catch {
      threatFeedsCache = [];
      return [];
    }
  })();
  return threatFeedsPromise;
};

/** Resolve a human-readable feed name for a STIX external_reference. We
 *  prefer (in order): an exact URL match in the user's threat-feed list,
 *  the reference's own description, the source_name, the URL hostname,
 *  and finally a generic fallback. This ensures generic source_name values
 *  like "threatfeed" are upgraded to the actual feed name where possible. */
const resolveFeedLabel = (
  ref: { source_name?: string; url?: string; description?: string },
  feeds: ThreatFeed[],
): string => {
  if (ref.url) {
    const match = feeds.find(f => f.url && f.url === ref.url);
    if (match?.name) return match.name;
  }
  const generic = !ref.source_name || /^threat[\s_-]?feed$/i.test(ref.source_name);
  if (generic && ref.description) return ref.description;
  if (ref.source_name && !generic) return ref.source_name;
  if (ref.description) return ref.description;
  if (ref.url) {
    try { return new URL(ref.url).hostname; } catch { return ref.url; }
  }
  return ref.source_name || 'reference';
};

interface ParsedStix {
  type?: string;
  pattern?: string;
  pattern_type?: string;
  x_raw_pattern?: string;
  created?: string;
  modified?: string;
  external_references?: Array<{ source_name?: string; url?: string; description?: string }>;
}

interface IocDetailsCardProps {
  /** Correlations for an observable — we extract IOC refs (category|key) from these. */
  correlations: Correlation[];
  /** Compact density for inline (drawer/popover) rendering. */
  compact?: boolean;
}

/**
 * Loads the underlying STIX IOC payload from the datastore for every IOC ref
 * found in the supplied correlations. The IOC datastore item itself carries the
 * pattern, source feeds, and external references — exactly the context users
 * need to understand WHY an observable is flagged as known-bad.
 *
 * Refs follow the format `category|key`. We fetch each unique IOC ref once and
 * dedupe across correlations. Errors are silently ignored per ref so a single
 * missing entry never blocks the rest.
 */
export const IocDetailsCard = ({ correlations, compact = false }: IocDetailsCardProps) => {
  const [items, setItems] = useState<Array<{ category: string; key: string; stix?: ParsedStix; raw?: string; loading: boolean; error?: string }>>([]);
  const [feeds, setFeeds] = useState<ThreatFeed[]>(threatFeedsCache || []);

  useEffect(() => {
    if (threatFeedsCache) { setFeeds(threatFeedsCache); return; }
    let cancelled = false;
    loadThreatFeeds().then((f) => { if (!cancelled) setFeeds(f); });
    return () => { cancelled = true; };
  }, []);

  // Collect unique IOC (category, key) pairs across all correlations.
  const iocRefs = (() => {
    const seen = new Set<string>();
    const refs: Array<{ category: string; key: string }> = [];
    correlations.forEach((c) => {
      c.ref?.forEach((r) => {
        const [category, key] = r.split('|');
        if (!category || !key) return;
        if (!isIocCategory(category)) return;
        const id = `${category}|${key}`;
        if (seen.has(id)) return;
        seen.add(id);
        refs.push({ category, key });
      });
    });
    return refs;
  })();

  useEffect(() => {
    if (iocRefs.length === 0) {
      setItems([]);
      return;
    }
    let cancelled = false;
    setItems(iocRefs.map((r) => ({ ...r, loading: true })));
    Promise.all(
      iocRefs.map(async (r) => {
        try {
          const result = await getDatastoreItem(r.key, r.category);
          const raw = typeof result.item?.value === 'string' ? result.item.value : JSON.stringify(result.item?.value || '');
          let stix: ParsedStix | undefined;
          try { stix = raw ? JSON.parse(raw) : undefined; } catch { /* not JSON */ }
          return { ...r, stix, raw, loading: false };
        } catch (e) {
          return { ...r, loading: false, error: e instanceof Error ? e.message : 'Failed to load' };
        }
      }),
    ).then((next) => { if (!cancelled) setItems(next); });
    return () => { cancelled = true; };
    // We intentionally key this on the serialised refs so we refetch when the
    // underlying correlation set changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iocRefs.map((r) => `${r.category}|${r.key}`).join(',')]);

  if (iocRefs.length === 0) return null;

  return (
    <Box
      sx={{
        mt: 1,
        p: compact ? 1.25 : 1.5,
        borderRadius: 1.5,
        border: '1px solid hsl(var(--destructive) / 0.4)',
        bgcolor: 'hsl(var(--destructive) / 0.06)',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
        <WarningAmberIcon style={{ fontSize: compact ? 14 : 16, color: 'hsl(var(--destructive))' }} />
        <Typography
          sx={{
            fontWeight: 700,
            fontSize: compact ? '0.7rem' : '0.75rem',
            color: 'hsl(var(--destructive))',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          {items.length === 1 ? 'Known IOC details' : `${items.length} known IOC matches`}
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {items.map((it) => {
          const stix = it.stix;
          const pattern = stix?.x_raw_pattern || stix?.pattern || it.key;
          const refs = stix?.external_references || [];
          const formatCategory = it.category.replace('shuffle-', '').replace(/_/g, ' ');
          return (
            <Box
              key={`${it.category}|${it.key}`}
              sx={{
                p: compact ? 0.75 : 1,
                borderRadius: 1,
                bgcolor: 'hsl(var(--background) / 0.4)',
                border: '1px solid hsl(var(--destructive) / 0.25)',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography
                  sx={{
                    fontFamily: 'monospace',
                    fontSize: compact ? '0.7rem' : '0.75rem',
                    fontWeight: 700,
                    color: 'hsl(var(--destructive))',
                    wordBreak: 'break-all',
                  }}
                >
                  {pattern}
                </Typography>
                <Chip
                  label={formatCategory}
                  size="small"
                  sx={{
                    height: 18,
                    fontSize: '0.6rem',
                    textTransform: 'capitalize',
                    bgcolor: 'transparent',
                    border: '1px solid hsl(var(--destructive) / 0.4)',
                    color: 'hsl(var(--destructive))',
                  }}
                />
                {stix?.pattern_type && (
                  <Chip
                    label={stix.pattern_type}
                    size="small"
                    sx={{
                      height: 18,
                      fontSize: '0.6rem',
                      bgcolor: 'transparent',
                      border: '1px solid hsl(var(--border))',
                      color: 'hsl(var(--muted-foreground))',
                    }}
                  />
                )}
              </Box>

              {it.loading && (
                <Box sx={{ mt: 0.75, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <CircularProgress size={10} sx={{ color: 'hsl(var(--destructive))' }} />
                  <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'hsl(var(--muted-foreground))' }}>
                    Loading IOC context…
                  </Typography>
                </Box>
              )}

              {!it.loading && it.error && (
                <Typography variant="caption" sx={{ display: 'block', mt: 0.5, fontSize: '0.65rem', color: 'hsl(var(--muted-foreground))', fontStyle: 'italic' }}>
                  Could not load IOC context: {it.error}
                </Typography>
              )}

              {!it.loading && refs.length > 0 && (
                <Box sx={{ mt: 0.75 }}>
                  <Typography variant="caption" sx={{ fontSize: '0.6rem', color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600 }}>
                    References ({refs.length})
                  </Typography>
                  <Box sx={{ mt: 0.5, display: 'flex', flexDirection: 'column', gap: 0.4 }}>
                    {refs.slice(0, 6).map((r, ri) => {
                      const label = resolveFeedLabel(r, feeds);
                      return r.url ? (
                        <Tooltip key={ri} title={r.url} arrow>
                          <MuiLink
                            href={r.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            sx={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 0.5,
                              fontSize: compact ? '0.65rem' : '0.7rem',
                              color: 'hsl(var(--destructive))',
                              textDecoration: 'none',
                              wordBreak: 'break-all',
                              '&:hover': { textDecoration: 'underline' },
                            }}
                          >
                            <OpenInNewIcon size={11} />
                            {label}
                          </MuiLink>
                        </Tooltip>
                      ) : (
                        <Typography key={ri} variant="caption" sx={{ fontSize: compact ? '0.65rem' : '0.7rem', color: 'hsl(var(--muted-foreground))' }}>
                          {label}
                        </Typography>
                      );
                    })}
                    {refs.length > 6 && (
                      <Typography variant="caption" sx={{ fontSize: '0.6rem', color: 'hsl(var(--muted-foreground))' }}>
                        +{refs.length - 6} more
                      </Typography>
                    )}
                  </Box>
                </Box>
              )}

              {!it.loading && !it.error && (refs.length === 0) && stix?.created && (
                <Typography variant="caption" sx={{ display: 'block', mt: 0.5, fontSize: '0.65rem', color: 'hsl(var(--muted-foreground))' }}>
                  First reported {new Date(stix.created).toLocaleString()}
                </Typography>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

export default IocDetailsCard;

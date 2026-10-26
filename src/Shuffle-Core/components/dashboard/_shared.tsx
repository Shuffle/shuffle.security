/**
 * Shared building blocks for dashboard surfaces (DashboardOverview,
 * AutomationDashboard). Keeps the visual language identical between them:
 * cyberpunk neon palette, KPI tiles with sparklines, Panel wrapper with
 * uppercase title, EmptyState CTA, and shared chart tooltip.
 */
import { Box, Typography, Skeleton, Tooltip as MuiTooltip, useTheme } from '@mui/material';
import { motion } from 'framer-motion';
import { ArrowUpRight, type LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  ReferenceArea,
} from 'recharts';

// Cyberpunk neon palette shared across dashboards.
export const NEON = {
  magenta: '#FF2E9F',
  pink: '#EC517C',
  violet: '#9C5AF2',
  cyan: '#22E6FF',
  amber: '#FFB020',
  red: '#FF3B5C',
  green: '#3DF5A0',
  orange: '#FF6600', // brand
} as const;

// ── Time-bucketing ─────────────────────────────────────────────────────────
// Shared across dashboards so each "section" (bar / area segment) is always
// the same width regardless of the time range. Daily = one bucket per day,
// Monthly = one bucket per calendar month covering the range.
export type Granularity = 'daily' | 'monthly';

export interface TimeBucket {
  /** Stable key (ISO date for day, `YYYY-MM` for month). */
  key: string;
  /** Display label (e.g. `Mar 12` or `Mar 2024`). */
  label: string;
  /** Start of the bucket as ms since epoch. */
  startMs: number;
  /** End of the bucket (exclusive) as ms since epoch. */
  endMs: number;
}

const startOfDayMs = (ms: number): number => {
  const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime();
};
const startOfMonthMs = (ms: number): number => {
  const d = new Date(ms); d.setDate(1); d.setHours(0, 0, 0, 0); return d.getTime();
};
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** Build N evenly-spaced buckets ending today, oldest first. */
export const buildBuckets = (days: number, gran: Granularity): TimeBucket[] => {
  const out: TimeBucket[] = [];
  const now = Date.now();
  if (gran === 'monthly') {
    // How many months are needed to fully cover the requested range?
    const cutoffMs = startOfDayMs(now - (days - 1) * 86400_000);
    const startBucket = startOfMonthMs(cutoffMs);
    const d = new Date(startBucket);
    while (d.getTime() <= now) {
      const startMs = d.getTime();
      const next = new Date(d); next.setMonth(next.getMonth() + 1);
      out.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
        startMs,
        endMs: next.getTime(),
      });
      d.setMonth(d.getMonth() + 1);
    }
    return out;
  }
  // daily
  for (let i = days - 1; i >= 0; i--) {
    const startMs = startOfDayMs(now - i * 86400_000);
    const dt = new Date(startMs);
    out.push({
      key: dt.toISOString().slice(0, 10),
      label: `${MONTHS[dt.getMonth()]} ${dt.getDate()}`,
      startMs,
      endMs: startMs + 86400_000,
    });
  }
  return out;
};

/**
 * Same shape as `buildBuckets` but for an explicit [fromMs, toMs] window.
 * Used when the user click-drags on a chart to pick an arbitrary range.
 */
export const buildBucketsBetween = (fromMs: number, toMs: number, gran: Granularity): TimeBucket[] => {
  const out: TimeBucket[] = [];
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) return out;
  if (gran === 'monthly') {
    const d = new Date(startOfMonthMs(fromMs));
    while (d.getTime() <= toMs) {
      const startMs = d.getTime();
      const next = new Date(d); next.setMonth(next.getMonth() + 1);
      out.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
        startMs,
        endMs: next.getTime(),
      });
      d.setMonth(d.getMonth() + 1);
    }
    return out;
  }
  const start = startOfDayMs(fromMs);
  const end = startOfDayMs(toMs);
  for (let t = start; t <= end; t += 86400_000) {
    const dt = new Date(t);
    out.push({
      key: dt.toISOString().slice(0, 10),
      label: `${MONTHS[dt.getMonth()]} ${dt.getDate()}`,
      startMs: t,
      endMs: t + 86400_000,
    });
  }
  return out;
};

// Re-export ReferenceArea so charts using `useChartRangeDrag` can import the
// selection visual from the same module.
export { ReferenceArea };

/**
 * Shared chart drag-to-select hook. Pairs with a recharts chart's
 * onMouseDown/Move/Up handlers to let the user paint a date range. When the
 * user releases, calls `onRangeSelect(fromMs, toMs)` with the bucket-aligned
 * window. Returns the props you need to spread onto the chart + the
 * ReferenceArea props for the active selection (or null).
 */
export const useChartRangeDrag = (
  buckets: TimeBucket[],
  onRangeSelect?: (fromMs: number, toMs: number) => void,
) => {
  const [leftLabel, setLeftLabel] = useState<string | null>(null);
  const [rightLabel, setRightLabel] = useState<string | null>(null);
  const selecting = useRef(false);
  const enabled = !!onRangeSelect && buckets.length > 1;

  const onMouseDown = useCallback((e: any) => {
    if (!enabled || !e?.activeLabel) return;
    selecting.current = true;
    setLeftLabel(e.activeLabel);
    setRightLabel(e.activeLabel);
  }, [enabled]);

  const onMouseMove = useCallback((e: any) => {
    if (!enabled || !selecting.current || !e?.activeLabel) return;
    setRightLabel(e.activeLabel);
  }, [enabled]);

  const finish = useCallback(() => {
    if (!enabled || !selecting.current) return;
    selecting.current = false;
    if (leftLabel && rightLabel && onRangeSelect) {
      const left = buckets.find(b => b.label === leftLabel);
      const right = buckets.find(b => b.label === rightLabel);
      if (left && right) {
        const fromMs = Math.min(left.startMs, right.startMs);
        const toMs = Math.max(left.endMs, right.endMs) - 1;
        if (toMs > fromMs) onRangeSelect(fromMs, toMs);
      }
    }
    setLeftLabel(null);
    setRightLabel(null);
  }, [enabled, leftLabel, rightLabel, buckets, onRangeSelect]);

  return {
    enabled,
    chartProps: enabled ? {
      onMouseDown,
      onMouseMove,
      onMouseUp: finish,
      onMouseLeave: finish,
      style: { cursor: 'crosshair' as const },
    } : {},
    refArea: enabled && leftLabel && rightLabel && leftLabel !== rightLabel ? {
      x1: leftLabel,
      x2: rightLabel,
    } : null,
  };
};

/** Find the bucket index covering a given ms timestamp, or -1. */
export const bucketIndexOf = (buckets: TimeBucket[], ms: number): number => {
  // buckets are sorted ascending; do a binary search.
  let lo = 0, hi = buckets.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const b = buckets[mid];
    if (ms < b.startMs) hi = mid - 1;
    else if (ms >= b.endMs) lo = mid + 1;
    else return mid;
  }
  return -1;
};

// Shared recharts tooltip — glass card, monospace numbers.
export const TooltipContent = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <Box sx={{
      bgcolor: 'hsl(var(--popover) / 0.85)',
      border: '1px solid hsl(var(--border))',
      borderRadius: 1.5,
      px: 1.25,
      py: 0.85,
      boxShadow: '0 8px 24px hsl(0 0% 0% / 0.4)',
      backdropFilter: 'blur(12px)',
    }}>
      {label != null && (
        <Typography sx={{ fontSize: '0.65rem', color: 'hsl(var(--muted-foreground))', fontWeight: 600, display: 'block', mb: 0.5, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {label}
        </Typography>
      )}
      {payload.map((entry: any) => (
        <Box key={entry.name ?? entry.dataKey} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, py: 0.15 }}>
          <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: entry.color || entry.payload?.fill, flexShrink: 0 }} />
          <Typography sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.7rem' }}>
            {entry.name}
          </Typography>
          <Typography sx={{ color: 'hsl(var(--foreground))', fontSize: '0.72rem', fontWeight: 700, ml: 'auto', fontFamily: 'ui-monospace, monospace' }}>
            {entry.value}
          </Typography>
        </Box>
      ))}
    </Box>
  );
};

// ── KPI Tile ────────────────────────────────────────────────────────────────
export interface KpiTileProps {
  icon?: LucideIcon;
  glow: string;
  value: number | string;
  label: string;
  delta?: { value: string; positive: boolean } | null;
  /** Optional tooltip describing what the delta percentage represents. */
  deltaTooltip?: string;
  spark?: number[];
  isLoading?: boolean;
  onClick?: () => void;
  delay?: number;
}
export const KpiTile = ({ icon: Icon, glow, value, label, delta, deltaTooltip, spark, isLoading, onClick, delay = 0 }: KpiTileProps) => {
  const sparkData = (spark ?? []).map((v, i) => ({ i, v }));
  const sparkId = `spark-${label.replace(/\s/g, '')}`;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay }}
    >
      <Box
        onClick={onClick}
        sx={{
          position: 'relative',
          p: 2,
          borderRadius: 2,
          backgroundColor: 'transparent',
          backdropFilter: 'blur(12px)',
          border: '1px solid hsl(var(--border))',
          cursor: onClick ? 'pointer' : 'default',
          transition: 'border-color 0.2s, transform 0.2s',
          overflow: 'hidden',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          '&:hover': onClick ? {
            borderColor: 'hsl(var(--border) / 1)',
            transform: 'translateY(-1px)',
            '& .kpi-arrow': { opacity: 1, transform: 'translate(0,0)' },
          } : {},
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1.25, position: 'relative' }}>
          {Icon ? (
            <Box
              sx={{
                width: 32, height: 32, borderRadius: 1.25,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                backgroundColor: `${glow}1A`,
                border: `1px solid ${glow}33`,
              }}
            >
              <Icon size={16} style={{ color: glow }} />
            </Box>
          ) : (
            <Box
              sx={{
                width: 24,
                height: 3,
                borderRadius: 1,
                backgroundColor: glow,
                my: 0.5,
              }}
            />
          )}
          {onClick && (
            <ArrowUpRight
              size={14}
              className="kpi-arrow"
              style={{
                color: 'hsl(var(--muted-foreground))',
                opacity: 0,
                transform: 'translate(-4px, 4px)',
                transition: 'all 0.2s ease',
              }}
            />
          )}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, position: 'relative' }}>
          {isLoading ? (
            <Skeleton variant="text" width={70} height={32} animation="wave" sx={{ bgcolor: 'hsl(var(--muted) / 0.5)', '&::after': { background: 'linear-gradient(90deg, transparent, hsl(var(--foreground) / 0.12), transparent)' } }} />
          ) : (
            <Typography sx={{
              fontWeight: 600,
              fontSize: '1.6rem',
              lineHeight: 1,
              color: 'hsl(var(--foreground))',
              letterSpacing: '-0.02em',
            }}>
              {value}
            </Typography>
          )}
          {delta && (
            <MuiTooltip title={deltaTooltip || 'Change vs the previous period'} arrow placement="top">
              <Box sx={{
                display: 'inline-flex', alignItems: 'center', gap: 0.25,
                px: 0.6, py: 0.15,
                borderRadius: 1,
                fontSize: '0.65rem',
                fontWeight: 600,
                cursor: 'help',
                color: delta.positive ? NEON.green : NEON.red,
                backgroundColor: delta.positive ? `${NEON.green}1A` : `${NEON.red}1A`,
              }}>
                {delta.positive ? '↓' : '↑'} {delta.value}
              </Box>
            </MuiTooltip>
          )}
        </Box>
        <Typography sx={{
          fontSize: '0.72rem',
          color: 'hsl(var(--muted-foreground))',
          mt: 0.5,
          fontWeight: 500,
          position: 'relative',
        }}>
          {label}
        </Typography>

        {sparkData.length > 1 && !isLoading && (
          <Box sx={{ height: 28, mt: 'auto', pt: 1, mx: -0.5, position: 'relative' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparkData}>
                <defs>
                  <linearGradient id={sparkId} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor={glow} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={glow} stopOpacity={1} />
                  </linearGradient>
                </defs>
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke={glow}
                  strokeOpacity={0.7}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </Box>
        )}
      </Box>
    </motion.div>
  );
};

// ── Panel wrapper ───────────────────────────────────────────────────────────
export const Panel = ({ title, action, children, delay = 0 }: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  delay?: number;
  accent?: string;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.35, delay }}
    style={{ height: '100%' }}
  >
    <Box sx={{
      position: 'relative',
      p: 2.5,
      borderRadius: 2,
      backgroundColor: 'transparent',
      backdropFilter: 'blur(12px)',
      border: '1px solid hsl(var(--border))',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, position: 'relative', gap: 2, flexWrap: 'wrap' }}>
        <Typography sx={{
          fontSize: '0.75rem',
          fontWeight: 600,
          color: 'hsl(var(--foreground))',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}>
          {title}
        </Typography>
        {action}
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {children}
      </Box>
    </Box>
  </motion.div>
);

export const EmptyState = ({ text, ctaLabel, onCta }: { text: string; ctaLabel?: string; onCta?: () => void }) => {
  const theme = useTheme();
  const primaryColor = theme.palette.primary.main;
  
  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 120, gap: 1.25, textAlign: 'center', px: 2, pt: '25px' }}>
      <Typography sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.78rem' }}>{text}</Typography>
      {ctaLabel && onCta && (
        <Box
          component="button"
          onClick={onCta}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.75,
            height: 36,
            px: 2,
            borderRadius: 1,
            border: 'none',
            bgcolor: primaryColor,
            color: '#FFFFFF',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            '&:hover': { opacity: 0.9 },
          }}
        >
          {ctaLabel}
          <ArrowUpRight size={14} />
        </Box>
      )}
    </Box>
  );
};

/**
 * Per-chart series visibility, remembered in the browser (localStorage).
 * `defaultHidden` applies only until the user changes the chart once.
 */
export function useSeriesVisibility(chartId: string, defaultHidden: string[] = []) {
  const storageKey = `shuffle-chart-series:${chartId}`;
  const [hidden, setHidden] = useState<string[]>(defaultHidden);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setHidden(parsed.filter((x) => typeof x === 'string'));
      }
    } catch { /* ignore */ }
  }, [storageKey]);
  const toggle = useCallback((key: string) => {
    setHidden((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      try { window.localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [storageKey]);
  const isHidden = useCallback((key: string) => hidden.includes(key), [hidden]);
  return { hidden, isHidden, toggle };
}

/** Clickable chart legend: clicking an entry hides or shows that series. */
export function SeriesLegend({ items, isHidden, onToggle }: {
  items: { key: string; label: string; color: string }[];
  isHidden: (key: string) => boolean;
  onToggle: (key: string) => void;
}) {
  return (
    <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
      {items.map(({ key, label, color }) => {
        const off = isHidden(key);
        return (
          <MuiTooltip key={key} title={off ? `Show ${label}` : `Hide ${label}`}>
            <Box
              component="button"
              type="button"
              onClick={() => onToggle(key)}
              aria-pressed={!off}
              sx={{
                display: 'flex', alignItems: 'center', gap: 0.5, p: 0, border: 0, background: 'none',
                cursor: 'pointer', opacity: off ? 0.45 : 1, font: 'inherit',
              }}
            >
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: off ? 'transparent' : color, border: `1px solid ${color}` }} />
              <Typography sx={{ fontSize: '0.68rem', color: 'hsl(var(--muted-foreground))', fontWeight: 500, textDecoration: off ? 'line-through' : 'none' }}>{label}</Typography>
            </Box>
          </MuiTooltip>
        );
      })}
    </Box>
  );
}

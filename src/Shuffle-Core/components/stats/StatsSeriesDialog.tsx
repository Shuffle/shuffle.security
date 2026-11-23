import { ReactNode, useEffect, useState } from 'react';
import { Box, Dialog, DialogContent, DialogTitle, IconButton, Typography, CircularProgress, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { X } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip as ChartTooltip, CartesianGrid } from 'recharts';
import { getApiUrl, getAuthHeader } from '@/Shuffle-Core/api';

export interface StatsSeries {
  key: string;
  label: string;
}

export interface StatPoint {
  date: string;
  value: number;
}

/** Per-device stat key: device_id lowercased with spaces replaced by _. */
export const deviceStatKey = (deviceId: string, type: string) =>
  `device_notification_${String(deviceId).toLowerCase().replace(/ /g, '_')}_${type}`;

/** Normalize the various stats response shapes into sorted daily points. */
export function parseStatPoints(data: any): StatPoint[] {
  const list: any[] = Array.isArray(data)
    ? data
    : data?.entries || data?.data || data?.daily_statistics || data?.stats || [];
  if (!Array.isArray(list)) return [];
  const out: StatPoint[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const raw = item.date ?? item.timestamp ?? item.time ?? item.day;
    if (raw === undefined || raw === null) continue;
    const num = typeof raw === 'number' ? raw : Number(raw);
    const ms = Number.isFinite(num) ? (num < 1e12 ? num * 1000 : num) : new Date(raw).getTime();
    if (!Number.isFinite(ms)) continue;
    const value = Number(item.value ?? item.count ?? item.amount ?? item.total ?? 0) || 0;
    out.push({ date: new Date(ms).toISOString().slice(0, 10), value });
  }
  const merged = new Map<string, number>();
  out.forEach((p) => merged.set(p.date, (merged.get(p.date) || 0) + p.value));
  return Array.from(merged.entries()).map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
}

export async function fetchStatSeries(key: string, orgId?: string): Promise<StatPoint[]> {
  const path = orgId ? `/api/v1/orgs/${orgId}/stats/${key}` : `/api/v1/stats/${key}`;
  const res = await fetch(getApiUrl(path), { credentials: 'include', headers: { ...getAuthHeader(orgId) } });
  if (!res.ok) return [];
  return parseStatPoints(await res.json().catch(() => null));
}

const fillDays = (points: StatPoint[], days: number): StatPoint[] => {
  const map = new Map(points.map((p) => [p.date, p.value]));
  const out: StatPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
    out.push({ date: d, value: map.get(d) || 0 });
  }
  return out;
};

function SeriesChart({ label, points, days }: { label: string; points: StatPoint[] | null; days: number }) {
  const data = points ? fillDays(points, days) : [];
  const total = data.reduce((s, p) => s + p.value, 0);
  return (
    <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'hsl(var(--muted) / 0.15)' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 1 }}>
        <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'hsl(var(--foreground))' }}>{label}</Typography>
        <Typography sx={{ fontSize: '1.1rem', fontWeight: 700, color: 'hsl(var(--foreground))' }}>{points ? total : '-'}</Typography>
      </Box>
      <Box sx={{ height: 110 }}>
        {points === null ? (
          <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress size={18} /></Box>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(d: string) => d.slice(5)} minTickGap={24} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
              <ChartTooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', fontSize: 12 }} />
              <Area type="monotone" dataKey="value" name={label} stroke="#FF6600" fill="#FF6600" fillOpacity={0.18} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Box>
    </Box>
  );
}

export interface StatsSeriesCardProps {
  statKey: string;
  label?: string;
  orgId?: string;
}

/** Standalone single-series graph with its own fetch and 7/30/90-day toggle. */
export function StatsSeriesCard({ statKey, label, orgId }: StatsSeriesCardProps) {
  const [days, setDays] = useState(30);
  const [points, setPoints] = useState<StatPoint[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPoints(null);
    fetchStatSeries(statKey, orgId).then((p) => {
      if (!cancelled) setPoints(p);
    });
    return () => { cancelled = true; };
  }, [statKey, orgId]);

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography
          variant="caption"
          sx={{
            color: 'hsl(var(--muted-foreground))',
            fontSize: '0.72rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          {label || 'Usage'}
        </Typography>
        <ToggleButtonGroup size="small" exclusive value={days} onChange={(_, v) => v && setDays(v)}>
          {[7, 30, 90].map((d) => (
            <ToggleButton key={d} value={d} sx={{ px: 1, py: 0.1, fontSize: '0.68rem', textTransform: 'none' }}>{d}d</ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>
      <SeriesChart label={label || 'Usage'} points={points} days={days} />
    </Box>
  );
}

export interface StatsSeriesDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  series: StatsSeries[];
  orgId?: string;
  children?: ReactNode;
  /** Extra control rendered in the header between the title and the day toggle. */
  toolbar?: ReactNode;
}

export function StatsSeriesDialog({ open, onClose, title, series, orgId, children, toolbar }: StatsSeriesDialogProps) {
  const [days, setDays] = useState(30);
  const [points, setPoints] = useState<Record<string, StatPoint[] | null>>({});
  const seriesSig = series.map((s) => s.key).join('|');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPoints(Object.fromEntries(series.map((s) => [s.key, null])));
    series.forEach((s) => {
      fetchStatSeries(s.key, orgId).then((p) => {
        if (!cancelled) setPoints((prev) => ({ ...prev, [s.key]: p }));
      });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orgId, seriesSig]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { bgcolor: 'hsl(var(--card))', backgroundImage: 'none', borderRadius: 3 } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1.5 }}>
        <Typography sx={{ flex: 1, fontWeight: 700, color: 'hsl(var(--foreground))' }}>{title}</Typography>
        {toolbar}
        <ToggleButtonGroup size="small" exclusive value={days} onChange={(_, v) => v && setDays(v)}>
          {[7, 30, 90].map((d) => (
            <ToggleButton key={d} value={d} sx={{ px: 1.25, py: 0.25, fontSize: '0.72rem', textTransform: 'none' }}>{d}d</ToggleButton>
          ))}
        </ToggleButtonGroup>
        <IconButton size="small" onClick={onClose} aria-label="Close"><X size={18} /></IconButton>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
          {series.map((s) => (
            <SeriesChart key={s.key} label={s.label} points={points[s.key] ?? null} days={days} />
          ))}
        </Box>
        {children}
      </DialogContent>
    </Dialog>
  );
}

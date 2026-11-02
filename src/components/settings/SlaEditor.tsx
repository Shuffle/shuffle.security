/**
 * Per-severity SLA editor used on /preferences.
 *
 * Each row lets the user set:
 *   - Respond within (acknowledge / first-touch target)
 *   - Resolve within (incident closure target)
 *
 * Values are entered in a free unit (m / h / d) for ergonomics but are
 * normalised to minutes before save so the underlying datastore stays
 * consistent. The "Fallback" row is always present and is used when an
 * incident lacks a severity.
 */
import { RotateCcw as RestartAltIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  MenuItem,
  Button,
  Tooltip,
} from '@mui/material';
import { toast } from '@/lib/toast';
import {
  SLA_SEVERITY_ORDER,
  SLA_SEVERITY_META,
  DEFAULT_SLA_CONFIG,
  SlaConfig,
  SlaSeverity,
  useSlaConfig,
  setSlaConfig,
} from '@/hooks/useSlaConfig';

type Unit = 'm' | 'h' | 'd';

interface DurationDraft {
  amount: string;
  unit: Unit;
}

interface RowDraft {
  respond: DurationDraft;
  resolve: DurationDraft;
}

type Draft = Record<SlaSeverity, RowDraft>;

/** Pick the most natural unit so 240 → 4h, not 240m. */
function minutesToDraft(minutes: number): DurationDraft {
  if (minutes >= 24 * 60 && minutes % (24 * 60) === 0) {
    return { amount: String(minutes / (24 * 60)), unit: 'd' };
  }
  if (minutes >= 60 && minutes % 60 === 0) {
    return { amount: String(minutes / 60), unit: 'h' };
  }
  return { amount: String(minutes), unit: 'm' };
}

function draftToMinutes(d: DurationDraft): number {
  const n = Number(d.amount);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (d.unit === 'd') return Math.round(n * 24 * 60);
  if (d.unit === 'h') return Math.round(n * 60);
  return Math.round(n);
}

function configToDraft(cfg: SlaConfig): Draft {
  const out = {} as Draft;
  for (const sev of SLA_SEVERITY_ORDER) {
    out[sev] = {
      respond: minutesToDraft(cfg[sev].respondMinutes),
      resolve: minutesToDraft(cfg[sev].resolveMinutes),
    };
  }
  return out;
}

const UNIT_OPTIONS: { value: Unit; label: string }[] = [
  { value: 'm', label: 'min' },
  { value: 'h', label: 'hr' },
  { value: 'd', label: 'days' },
];

const DurationField = ({
  value,
  onChange,
  ariaLabel,
}: {
  value: DurationDraft;
  onChange: (next: DurationDraft) => void;
  ariaLabel: string;
}) => (
  <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
    <TextField
      size="small"
      type="number"
      inputProps={{ min: 1, 'aria-label': `${ariaLabel} amount` }}
      value={value.amount}
      onChange={(e) => onChange({ ...value, amount: e.target.value })}
      sx={{
        width: 72,
        '& .MuiOutlinedInput-root': {
          bgcolor: 'hsl(var(--background))',
          color: 'hsl(var(--foreground))',
          '& fieldset': { borderColor: 'hsl(var(--border))' },
          '&:hover fieldset': { borderColor: 'hsl(var(--primary) / 0.5)' },
          '&.Mui-focused fieldset': { borderColor: 'hsl(var(--primary))' },
        },
      }}
    />
    <TextField
      size="small"
      select
      value={value.unit}
      onChange={(e) => onChange({ ...value, unit: e.target.value as Unit })}
      inputProps={{ 'aria-label': `${ariaLabel} unit` }}
      sx={{
        width: 78,
        '& .MuiOutlinedInput-root': {
          bgcolor: 'hsl(var(--background))',
          color: 'hsl(var(--foreground))',
          '& fieldset': { borderColor: 'hsl(var(--border))' },
          '&:hover fieldset': { borderColor: 'hsl(var(--primary) / 0.5)' },
          '&.Mui-focused fieldset': { borderColor: 'hsl(var(--primary))' },
        },
      }}
    >
      {UNIT_OPTIONS.map((u) => (
        <MenuItem key={u.value} value={u.value}>{u.label}</MenuItem>
      ))}
    </TextField>
  </Box>
);

export const SlaEditor = () => {
  const stored = useSlaConfig();
  const [draft, setDraft] = useState<Draft>(() => configToDraft(stored));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Sync from store when the user is not actively editing
  useEffect(() => {
    if (!dirty) setDraft(configToDraft(stored));
  }, [stored, dirty]);

  const updateRow = (sev: SlaSeverity, field: 'respond' | 'resolve', next: DurationDraft) => {
    setDraft((prev) => ({ ...prev, [sev]: { ...prev[sev], [field]: next } }));
    setDirty(true);
  };

  const handleReset = () => {
    setDraft(configToDraft(DEFAULT_SLA_CONFIG));
    setDirty(true);
  };

  const handleSave = async () => {
    // Validate before saving — bad inputs (0, NaN, negative) are rejected so
    // we don't silently fall back to defaults inside normalize().
    const next = {} as SlaConfig;
    for (const sev of SLA_SEVERITY_ORDER) {
      const r = draftToMinutes(draft[sev].respond);
      const f = draftToMinutes(draft[sev].resolve);
      if (r <= 0 || f <= 0) {
        toast.error(`${SLA_SEVERITY_META[sev].label}: enter a value greater than 0`);
        return;
      }
      if (f < r) {
        toast.error(`${SLA_SEVERITY_META[sev].label}: resolve target must be ≥ respond target`);
        return;
      }
      next[sev] = { respondMinutes: r, resolveMinutes: f };
    }
    setSaving(true);
    try {
      await setSlaConfig(next);
      setDirty(false);
      toast.success('SLA targets saved');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, width: '100%' }}>
      {/* Header row */}
      <Box
        sx={{
          display: { xs: 'none', sm: 'grid' },
          gridTemplateColumns: 'minmax(180px, 1.4fr) minmax(160px, 1fr) minmax(160px, 1fr)',
          gap: 2,
          px: 1,
          pb: 0.5,
          borderBottom: '1px solid hsl(var(--border))',
        }}
      >
        <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          Severity
        </Typography>
        <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          Respond within
        </Typography>
        <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          Resolve within
        </Typography>
      </Box>

      {SLA_SEVERITY_ORDER.map((sev) => {
        const meta = SLA_SEVERITY_META[sev];
        return (
          <Box
            key={sev}
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'minmax(180px, 1.4fr) minmax(160px, 1fr) minmax(160px, 1fr)' },
              gap: { xs: 1, sm: 2 },
              alignItems: 'center',
              px: 1,
              py: { xs: 1, sm: 0.75 },
              borderRadius: 1,
              borderBottom: { xs: '1px solid hsl(var(--border) / 0.5)', sm: 'none' },
              '&:hover': { bgcolor: 'hsl(var(--muted) / 0.4)' },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
              <Box
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  bgcolor: meta.color,
                  flexShrink: 0,
                  boxShadow: `0 0 0 2px ${meta.color}33`,
                }}
              />
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>
                  {meta.label}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    color: 'hsl(var(--muted-foreground))',
                    display: 'block',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {meta.description}
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
              <Typography variant="caption" sx={{ display: { xs: 'block', sm: 'none' }, color: 'hsl(var(--muted-foreground))', fontWeight: 600 }}>
                Respond within
              </Typography>
              <DurationField
                value={draft[sev].respond}
                onChange={(next) => updateRow(sev, 'respond', next)}
                ariaLabel={`${meta.label} respond`}
              />
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
              <Typography variant="caption" sx={{ display: { xs: 'block', sm: 'none' }, color: 'hsl(var(--muted-foreground))', fontWeight: 600 }}>
                Resolve within
              </Typography>
              <DurationField
                value={draft[sev].resolve}
                onChange={(next) => updateRow(sev, 'resolve', next)}
                ariaLabel={`${meta.label} resolve`}
              />
            </Box>
          </Box>
        );
      })}

      {/* Action row */}
      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', flexWrap: 'wrap', mt: 1 }}>
        <Tooltip title="Reset all rows to recommended defaults">
          <Button
            size="small"
            startIcon={<RestartAltIcon size={20} />}
            onClick={handleReset}
            sx={{
              color: 'hsl(var(--muted-foreground))',
              textTransform: 'none',
              whiteSpace: 'nowrap',
              '&:hover': { bgcolor: 'hsl(var(--muted) / 0.6)', color: 'hsl(var(--foreground))' },
            }}
          >
            Reset to defaults
          </Button>
        </Tooltip>
        <Button
          size="small"
          variant="contained"
          disabled={!dirty || saving}
          onClick={handleSave}
          sx={{
            bgcolor: 'hsl(var(--primary))',
            color: 'hsl(var(--primary-foreground))',
            textTransform: 'none',
            whiteSpace: 'nowrap',
            boxShadow: 'none',
            '&:hover': { bgcolor: 'hsl(var(--primary) / 0.9)', boxShadow: 'none' },
            '&.Mui-disabled': {
              bgcolor: 'hsl(var(--muted))',
              color: 'hsl(var(--muted-foreground))',
            },
          }}
        >
          {saving ? 'Saving…' : 'Save SLA targets'}
        </Button>
      </Box>
    </Box>
  );
};

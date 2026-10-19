/**
 * Tenant SLA / SLO controls on /preferences. SLA timers (incidents, tasks)
 * and SLO attainment tracking are toggled independently.
 */
import { useEffect, useState } from 'react';
import { Box, Typography, TextField, MenuItem, Button, Switch, FormControlLabel } from '@mui/material';
import { toast } from '@/lib/toast';
import {
  DEFAULT_SLA_CONTROLS,
  TASK_SLA_CATEGORIES,
  getSlaControls,
  mergeSlaControls,
  setSlaControls,
  useSlaControls,
  type SlaControls,
} from '@/hooks/useSlaControls';

type Unit = 'm' | 'h' | 'd';
const toDraft = (min: number): { amount: string; unit: Unit } =>
  min % 1440 === 0 ? { amount: String(min / 1440), unit: 'd' }
    : min % 60 === 0 ? { amount: String(min / 60), unit: 'h' }
    : { amount: String(min), unit: 'm' };
const toMinutes = (d: { amount: string; unit: Unit }) => {
  const n = Number(d.amount);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(d.unit === 'd' ? n * 1440 : d.unit === 'h' ? n * 60 : n);
};

const fieldSx = {
  '& .MuiOutlinedInput-root': {
    bgcolor: 'hsl(var(--background))',
    color: 'hsl(var(--foreground))',
    '& fieldset': { borderColor: 'hsl(var(--border))' },
    '&:hover fieldset': { borderColor: 'hsl(var(--primary) / 0.5)' },
    '&.Mui-focused fieldset': { borderColor: 'hsl(var(--primary))' },
  },
};
const switchSx = {
  '& .MuiSwitch-switchBase.Mui-checked': { color: 'hsl(var(--primary))' },
  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: 'hsl(var(--primary))' },
};
const captionSx = { color: 'hsl(var(--muted-foreground))', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 } as const;

const Toggle = ({ checked, onChange, label, help }: { checked: boolean; onChange: (v: boolean) => void; label: string; help: string }) => (
  <Box>
    <FormControlLabel
      control={<Switch size="small" checked={checked} onChange={(e) => onChange(e.target.checked)} sx={switchSx} />}
      label={<Typography variant="body2" sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>{label}</Typography>}
    />
    <Typography variant="caption" sx={{ display: 'block', color: 'hsl(var(--muted-foreground))', ml: 5.5, mt: -0.5 }}>{help}</Typography>
  </Box>
);

const SaveRow = ({ dirty, saving, onSave, label }: { dirty: boolean; saving: boolean; onSave: () => void; label: string }) => (
  <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
    <Button
      size="small"
      variant="contained"
      disabled={!dirty || saving}
      onClick={onSave}
      sx={{
        bgcolor: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', textTransform: 'none', boxShadow: 'none',
        '&:hover': { bgcolor: 'hsl(var(--primary) / 0.9)', boxShadow: 'none' },
        '&.Mui-disabled': { bgcolor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' },
      }}
    >
      {saving ? 'Saving...' : label}
    </Button>
  </Box>
);

function useDraft() {
  const stored = useSlaControls();
  const [draft, setDraft] = useState<SlaControls>(stored);
  const [patch, setPatch] = useState<Partial<SlaControls>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (!dirty) { setDraft(stored); setPatch({}); } }, [stored, dirty]);
  const update = (p: Partial<SlaControls>) => { setDraft((d) => ({ ...d, ...p })); setPatch((prev) => ({ ...prev, ...p })); setDirty(true); };
  const save = async (extra: Partial<SlaControls>, msg: string) => {
    setSaving(true);
    // Save only the fields this section owns, merged over the latest stored
    // settings, so saving one section never reverts values another section
    // (or the incident toggle) saved after this editor became dirty.
    try { await setSlaControls(mergeSlaControls(getSlaControls(), { ...patch, ...extra })); setDirty(false); toast.success(msg); } finally { setSaving(false); }
  };
  return { draft, dirty, saving, update, save };
}

/** Incident SLA toggle shown above the per-severity SlaEditor. */
export const IncidentSlaToggle = () => {
  const stored = useSlaControls();
  return (
    <Toggle
      checked={stored.incidentSlaEnabled}
      onChange={(v) => { setSlaControls({ ...stored, incidentSlaEnabled: v }); toast.success(v ? 'Incident SLA timers on' : 'Incident SLA timers off'); }}
      label="Incident SLA timers"
      help="Track respond and resolve targets on incidents and show breaches on dashboards."
    />
  );
};

export const TaskSlaEditor = () => {
  const { draft, dirty, saving, update, save } = useDraft();
  const [rows, setRows] = useState(() => Object.fromEntries(TASK_SLA_CATEGORIES.map(c => [c.value, toDraft(draft.taskTargets[c.value])])));
  useEffect(() => {
    if (!dirty) setRows(Object.fromEntries(TASK_SLA_CATEGORIES.map(c => [c.value, toDraft(draft.taskTargets[c.value])])));
  }, [draft, dirty]);

  const handleSave = () => {
    const taskTargets: Record<string, number> = {};
    for (const c of TASK_SLA_CATEGORIES) {
      const m = toMinutes(rows[c.value]);
      if (m <= 0) { toast.error(`${c.label}: enter a value greater than 0`); return; }
      taskTargets[c.value] = m;
    }
    save({ ...draft, taskTargets }, 'Task SLA targets saved');
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Toggle
        checked={draft.taskSlaEnabled}
        onChange={(v) => update({ taskSlaEnabled: v })}
        label="Task SLA timers"
        help="Mark tasks as overdue when they are not completed within the target for their category."
      />
      <Box sx={{ opacity: draft.taskSlaEnabled ? 1 : 0.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1.4fr) minmax(160px, 1fr)', gap: 2, px: 1, pb: 0.5, borderBottom: '1px solid hsl(var(--border))' }}>
          <Typography variant="caption" sx={captionSx}>Task category</Typography>
          <Typography variant="caption" sx={captionSx}>Complete within</Typography>
        </Box>
        {TASK_SLA_CATEGORIES.map((c) => (
          <Box key={c.value} sx={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1.4fr) minmax(160px, 1fr)', gap: 2, alignItems: 'center', px: 1, py: 0.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: c.color, flexShrink: 0 }} />
              <Typography variant="body2" sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>{c.label}</Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <TextField
                size="small" type="number" disabled={!draft.taskSlaEnabled}
                inputProps={{ min: 1, 'aria-label': `${c.label} amount` }}
                value={rows[c.value]?.amount ?? ''}
                onChange={(e) => { setRows(r => ({ ...r, [c.value]: { ...r[c.value], amount: e.target.value } })); update({}); }}
                sx={{ width: 72, ...fieldSx }}
              />
              <TextField
                size="small" select disabled={!draft.taskSlaEnabled}
                value={rows[c.value]?.unit ?? 'h'}
                onChange={(e) => { setRows(r => ({ ...r, [c.value]: { ...r[c.value], unit: e.target.value as Unit } })); update({}); }}
                inputProps={{ 'aria-label': `${c.label} unit` }}
                sx={{ width: 78, ...fieldSx }}
              >
                <MenuItem value="m">min</MenuItem>
                <MenuItem value="h">hr</MenuItem>
                <MenuItem value="d">days</MenuItem>
              </TextField>
            </Box>
          </Box>
        ))}
      </Box>
      <SaveRow dirty={dirty} saving={saving} onSave={handleSave} label="Save task SLA" />
    </Box>
  );
};

export const SloEditor = () => {
  const { draft, dirty, saving, update, save } = useDraft();
  const pctField = (label: string, key: 'incidentSloPercent' | 'taskSloPercent') => (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1.4fr) minmax(160px, 1fr)', gap: 2, alignItems: 'center', px: 1, py: 0.5 }}>
      <Typography variant="body2" sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>{label}</Typography>
      <TextField
        size="small" type="number" disabled={!draft.sloEnabled}
        inputProps={{ min: 1, max: 100, 'aria-label': `${label} percent` }}
        value={draft[key]}
        onChange={(e) => update({ [key]: Number(e.target.value) } as Partial<SlaControls>)}
        InputProps={{ endAdornment: <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))' }}>%</Typography> }}
        sx={{ width: 110, ...fieldSx }}
      />
    </Box>
  );
  const handleSave = () => {
    for (const k of ['incidentSloPercent', 'taskSloPercent'] as const) {
      const v = draft[k];
      if (!Number.isFinite(v) || v <= 0 || v > 100) { toast.error('SLO targets must be between 1 and 100 percent'); return; }
    }
    save(draft, 'SLO targets saved');
  };
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Toggle
        checked={draft.sloEnabled}
        onChange={(v) => update({ sloEnabled: v })}
        label="SLO tracking"
        help="Show the share of incidents and tasks that met their SLA against these targets. Works independently of the SLA timer switches."
      />
      <Box sx={{ opacity: draft.sloEnabled ? 1 : 0.5 }}>
        {pctField('Incidents within SLA', 'incidentSloPercent')}
        {pctField('Tasks within SLA', 'taskSloPercent')}
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Button size="small" onClick={() => update({ incidentSloPercent: DEFAULT_SLA_CONTROLS.incidentSloPercent, taskSloPercent: DEFAULT_SLA_CONTROLS.taskSloPercent })} sx={{ color: 'hsl(var(--muted-foreground))', textTransform: 'none' }}>
          Reset to defaults
        </Button>
        <SaveRow dirty={dirty} saving={saving} onSave={handleSave} label="Save SLO targets" />
      </Box>
    </Box>
  );
};

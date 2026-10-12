/**
 * Editor for tenant lifecycle overrides (statuses + severities) on /admin/preferences.
 */
import { useEffect, useState } from 'react';
import { Box, Typography, TextField, MenuItem, Button, Checkbox, Tooltip, IconButton } from '@mui/material';
import { Trash2, RotateCcw } from 'lucide-react';
import { toast } from '@/lib/toast';
import { useLifecycleConfig, setLifecycleConfig } from '@/hooks/useLifecycleConfig';
import {
  LifecycleOverrides,
  EMPTY_LIFECYCLE,
  DEFAULT_STATUS_META,
  DEFAULT_SEVERITY_LABELS,
  BUILTIN_SEVERITIES,
  CustomState,
  StateOverride,
} from '@/config/lifecycleOverrides';

type Kind = 'statuses' | 'severities';

const fieldSx = {
  '& .MuiOutlinedInput-root': {
    bgcolor: 'hsl(var(--background))',
    color: 'hsl(var(--foreground))',
    height: 36,
    '& fieldset': { borderColor: 'hsl(var(--border))' },
    '&:hover fieldset': { borderColor: 'hsl(var(--primary) / 0.5)' },
    '&.Mui-focused fieldset': { borderColor: 'hsl(var(--primary))' },
  },
};

const DEFAULT_SEVERITY_COLOR: Record<string, string> = {
  critical: '#ef4444', high: '#ea3815', medium: '#d97706', low: '#22c55e', informational: '#3b82f6',
};

const toHex = (c?: string) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : '#888888');

const builtinsFor = (kind: Kind) =>
  kind === 'statuses'
    ? Object.entries(DEFAULT_STATUS_META).map(([k, v]) => ({ key: k, label: v.label, color: v.color }))
    : BUILTIN_SEVERITIES.map((k) => ({ key: k, label: DEFAULT_SEVERITY_LABELS[k], color: DEFAULT_SEVERITY_COLOR[k] }));

const headerSx = { fontSize: 12, fontWeight: 600, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase' as const };

export const LifecycleEditor = () => {
  const stored = useLifecycleConfig();
  const [draft, setDraft] = useState<LifecycleOverrides>(stored);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!dirty) setDraft(stored); }, [stored, dirty]);

  const update = (fn: (d: LifecycleOverrides) => void) => {
    setDraft((prev) => { const next = JSON.parse(JSON.stringify(prev)); fn(next); return next; });
    setDirty(true);
  };

  const setBuiltin = (kind: Kind, key: string, patch: Partial<StateOverride>) =>
    update((d) => { d[kind].builtin[key] = { ...(d[kind].builtin[key] || {}), ...patch }; });

  const setCustom = (kind: Kind, i: number, patch: Partial<CustomState>) =>
    update((d) => { d[kind].custom[i] = { ...d[kind].custom[i], ...patch }; });

  const save = async () => {
    for (const kind of ['statuses', 'severities'] as Kind[]) {
      if (draft[kind].custom.some((c) => !c.label.trim())) {
        toast.error('Every custom state needs a name.');
        return;
      }
    }
    setSaving(true);
    const ok = await setLifecycleConfig(draft);
    setSaving(false);
    setDirty(false);
    if (ok) toast.success('Lifecycle states saved.');
    else toast.error('Saved locally, but could not save to the organization.');
  };

  const renderSection = (kind: Kind, title: string) => {
    const builtins = builtinsFor(kind);
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>{title}</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: '140px 1fr 56px 72px 40px', gap: 1.5, alignItems: 'center' }}>
          <Typography sx={headerSx}>Default</Typography>
          <Typography sx={headerSx}>Label</Typography>
          <Typography sx={headerSx}>Colour</Typography>
          <Typography sx={headerSx}>{kind === 'statuses' ? 'Hidden' : ''}</Typography>
          <span />
          {builtins.map((b) => {
            const ov = draft[kind].builtin[b.key] || {};
            const canHide = kind === 'statuses' && b.key !== 'new' && b.key !== 'resolved' && b.key !== 'merged';
            return (
              <Box key={b.key} sx={{ display: 'contents' }}>
                <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))' }}>{b.label}</Typography>
                <TextField size="small" placeholder={b.label} value={ov.label || ''} sx={fieldSx}
                  inputProps={{ 'aria-label': `${b.label} label` }}
                  onChange={(e) => setBuiltin(kind, b.key, { label: e.target.value })} />
                <input type="color" aria-label={`${b.label} colour`} value={toHex(ov.color || b.color)}
                  onChange={(e) => setBuiltin(kind, b.key, { color: e.target.value })}
                  style={{ width: 40, height: 32, border: 'none', background: 'transparent', cursor: 'pointer' }} />
                <Box>
                  {canHide && (
                    <Tooltip title="Hide from status pickers. Incidents already in this state still show it.">
                      <Checkbox size="small" checked={!!ov.hidden}
                        onChange={(e) => setBuiltin(kind, b.key, { hidden: e.target.checked })} />
                    </Tooltip>
                  )}
                </Box>
                <Tooltip title="Reset to default">
                  <IconButton size="small" aria-label={`Reset ${b.label}`}
                    sx={{ p: 0.75, borderRadius: 1.5, border: '1px solid hsl(var(--border))' }}
                    onClick={() => update((d) => { delete d[kind].builtin[b.key]; })}>
                    <RotateCcw size={18} />
                  </IconButton>
                </Tooltip>
              </Box>
            );
          })}
        </Box>

        {draft[kind].custom.length > 0 && (
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 160px 1fr 56px 40px', gap: 1.5, alignItems: 'center', mt: 1 }}>
            <Typography sx={headerSx}>Custom name</Typography>
            <Typography sx={headerSx}>Based on</Typography>
            <Typography sx={headerSx}>Synonyms</Typography>
            <Typography sx={headerSx}>Colour</Typography>
            <span />
            {draft[kind].custom.map((c, i) => (
              <Box key={i} sx={{ display: 'contents' }}>
                <TextField size="small" value={c.label} sx={fieldSx} placeholder="Name"
                  onChange={(e) => setCustom(kind, i, { label: e.target.value, key: '' })} />
                <TextField size="small" select value={c.base} sx={fieldSx}
                  onChange={(e) => setCustom(kind, i, { base: e.target.value })}>
                  {builtins.filter((b) => b.key !== 'merged').map((b) => (
                    <MenuItem key={b.key} value={b.key}>{b.label}</MenuItem>
                  ))}
                </TextField>
                <TextField size="small" sx={fieldSx} placeholder="Comma separated"
                  value={(c.synonyms || []).join(', ')}
                  onChange={(e) => setCustom(kind, i, { synonyms: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
                <input type="color" aria-label={`${c.label} colour`} value={toHex(c.color)}
                  onChange={(e) => setCustom(kind, i, { color: e.target.value })}
                  style={{ width: 40, height: 32, border: 'none', background: 'transparent', cursor: 'pointer' }} />
                <Tooltip title="Delete custom state">
                  <IconButton size="small" aria-label={`Delete ${c.label}`}
                    sx={{ p: 0.75, borderRadius: 1.5, border: '1px solid hsl(var(--border))' }}
                    onClick={() => update((d) => { d[kind].custom.splice(i, 1); })}>
                    <Trash2 size={18} />
                  </IconButton>
                </Tooltip>
              </Box>
            ))}
          </Box>
        )}
        <Box>
          <Button size="small" variant="outlined" sx={{ height: 36, textTransform: 'none' }}
            onClick={() => update((d) => { d[kind].custom.push({ key: '', label: '', base: builtins[0].key, synonyms: [] }); })}>
            Add custom {kind === 'statuses' ? 'status' : 'severity'}
          </Button>
        </Box>
      </Box>
    );
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {renderSection('statuses', 'Statuses')}
      {renderSection('severities', 'Severities')}
      <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'flex-end' }}>
        <Button variant="outlined" sx={{ height: 36, textTransform: 'none' }}
          onClick={() => { setDraft(JSON.parse(JSON.stringify(EMPTY_LIFECYCLE))); setDirty(true); }}>
          Reset all to defaults
        </Button>
        <Button variant="contained" disabled={!dirty || saving} sx={{ height: 36, textTransform: 'none' }} onClick={save}>
          {saving ? 'Saving' : 'Save'}
        </Button>
      </Box>
    </Box>
  );
};

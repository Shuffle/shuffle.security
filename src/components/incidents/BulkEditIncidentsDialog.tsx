import { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Checkbox,
  FormControlLabel, MenuItem, TextField, Typography,
} from '@mui/material';
import { statusConfig } from '@/config/incidentConfig';
import { BUILTIN_SEVERITIES, getCustomStatuses, getCustomSeverities, getSeverityLabel } from '@/config/lifecycleOverrides';

export interface BulkEditChanges {
  /** Built-in status key to save. */
  status?: string;
  /** Custom status key, saved next to its built-in base. */
  customStatus?: string;
  severity?: string;
  customSeverity?: string;
  /** Empty string means unassign. */
  assignee?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onApply: (changes: BulkEditChanges) => void;
  count: number;
  users: { username: string }[];
  isLoading?: boolean;
}

// Resolved and Merged have their own flows (resolve dialog, merge dialog).
const EXCLUDED_STATUSES = new Set(['resolved', 'merged']);

export function BulkEditIncidentsDialog({ open, onClose, onApply, count, users, isLoading }: Props) {
  const [useStatus, setUseStatus] = useState(false);
  const [useSeverity, setUseSeverity] = useState(false);
  const [useAssignee, setUseAssignee] = useState(false);
  const [status, setStatus] = useState('');
  const [severity, setSeverity] = useState('');
  const [assignee, setAssignee] = useState('');

  useEffect(() => {
    if (!open) return;
    setUseStatus(false); setUseSeverity(false); setUseAssignee(false);
    setStatus(''); setSeverity(''); setAssignee('');
  }, [open]);

  const statusOptions = [
    ...Object.entries(statusConfig)
      .filter(([k, c]) => !c.hidden && !EXCLUDED_STATUSES.has(k))
      .map(([k, c]) => ({ value: k, label: c.label })),
    ...getCustomStatuses()
      .filter(c => !EXCLUDED_STATUSES.has(c.base))
      .map(c => ({ value: `custom:${c.key}`, label: c.label })),
  ];
  const severityOptions = [
    ...BUILTIN_SEVERITIES.map(s => ({ value: s as string, label: getSeverityLabel(s) })),
    ...getCustomSeverities().map(c => ({ value: `custom:${c.key}`, label: c.label })),
  ];

  const canApply =
    (useStatus && !!status) || (useSeverity && !!severity) || useAssignee;

  const handleApply = () => {
    const changes: BulkEditChanges = {};
    if (useStatus && status) {
      if (status.startsWith('custom:')) {
        const key = status.slice(7);
        const c = getCustomStatuses().find(x => x.key === key);
        if (c) { changes.status = c.base; changes.customStatus = c.key; }
      } else changes.status = status;
    }
    if (useSeverity && severity) {
      if (severity.startsWith('custom:')) {
        const key = severity.slice(7);
        const c = getCustomSeverities().find(x => x.key === key);
        if (c) { changes.severity = c.base; changes.customSeverity = c.key; }
      } else changes.severity = severity;
    }
    if (useAssignee) changes.assignee = assignee;
    onApply(changes);
  };

  const row = (label: string, checked: boolean, setChecked: (v: boolean) => void, control: React.ReactNode) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <FormControlLabel
        sx={{ width: 140, m: 0 }}
        control={<Checkbox size="small" checked={checked} onChange={e => setChecked(e.target.checked)} />}
        label={label}
      />
      <Box sx={{ flex: 1, opacity: checked ? 1 : 0.5 }}>{control}</Box>
    </Box>
  );

  const selectSx = { '& .MuiInputBase-root': { height: 36 } };
  const menuProps = { MenuProps: { sx: { zIndex: 9999 } } };

  return (
    <Dialog open={open} onClose={isLoading ? undefined : onClose} maxWidth="sm" fullWidth
      PaperProps={{ sx: { backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' } }}>
      <DialogTitle>Bulk edit {count} incident{count !== 1 ? 's' : ''}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: '8px !important' }}>
        <Typography variant="body2" color="text.secondary">
          Choose the fields to change. Only checked fields are updated. To resolve incidents, use the Resolve button.
        </Typography>
        {row('Status', useStatus, setUseStatus,
          <TextField select fullWidth size="small" value={status} disabled={!useStatus} sx={selectSx}
            SelectProps={menuProps} onChange={e => setStatus(e.target.value)} label="New status">
            {statusOptions.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
          </TextField>)}
        {row('Severity', useSeverity, setUseSeverity,
          <TextField select fullWidth size="small" value={severity} disabled={!useSeverity} sx={selectSx}
            SelectProps={menuProps} onChange={e => setSeverity(e.target.value)} label="New severity">
            {severityOptions.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
          </TextField>)}
        {row('Assignee', useAssignee, setUseAssignee,
          <TextField select fullWidth size="small" value={assignee} disabled={!useAssignee} sx={selectSx}
            SelectProps={{ ...menuProps, displayEmpty: true }} onChange={e => setAssignee(e.target.value)}
            InputLabelProps={{ shrink: true }} label="New assignee">
            <MenuItem value="">Unassigned</MenuItem>
            <MenuItem value="AI Agent">AI Agent</MenuItem>
            {users.map(u => <MenuItem key={u.username} value={u.username}>{u.username}</MenuItem>)}
          </TextField>)}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={isLoading} sx={{ height: 36 }}>Cancel</Button>
        <Button variant="contained" onClick={handleApply} disabled={!canApply || isLoading} sx={{ height: 36 }}>
          {isLoading ? 'Applying...' : 'Apply'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

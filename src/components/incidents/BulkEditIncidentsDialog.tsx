import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Checkbox,
  FormControlLabel, TextField, Typography, ToggleButton, ToggleButtonGroup, Autocomplete,
} from '@mui/material';
import {
  TimelineStatusDropdown, TimelineSeverityDropdown, TimelineAssigneeDropdown,
  TimelineTagsEditor, TimelineTlpDropdown,
} from '@/components/incidents/TimelineAttributeComponents';
import { getCustomStatus, getCustomSeverity } from '@/config/lifecycleOverrides';

export type TagMode = 'add' | 'remove' | 'replace';

export interface BulkEditChanges {
  /** Built-in status key to save. */
  status?: string;
  /** Custom status key, saved next to its built-in base. */
  customStatus?: string;
  severity?: string;
  customSeverity?: string;
  /** Empty string means unassign. */
  assignee?: string;
  tlp?: string;
  tags?: { mode: TagMode; values: string[] };
  customField?: { key: string; value: string };
  comment?: string;
}

/** Minimal incident shape the dialog needs to preview changes. */
export interface BulkEditIncident {
  status: string;
  severity: string;
  assignee: string | null;
  tlp?: string;
  labels?: string[];
  lifecycle?: { status?: string; severity?: string };
  customFields?: Record<string, unknown>;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onApply: (changes: BulkEditChanges) => void;
  /** Called when Resolved is picked: resolving has its own dialog. */
  onResolveRequest?: () => void;
  incidents: BulkEditIncident[];
  isLoading?: boolean;
}

const splitCustom = (v: string, lookup: (k: string) => { base: string } | undefined) => {
  if (!v.startsWith('custom:')) return { base: v, custom: undefined as string | undefined };
  const key = v.slice(7);
  const c = lookup(key);
  return c ? { base: c.base, custom: key } : { base: '', custom: undefined };
};

export function BulkEditIncidentsDialog({ open, onClose, onApply, onResolveRequest, incidents, isLoading }: Props) {
  const [on, setOn] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState('new');
  const [severity, setSeverity] = useState('medium');
  const [assignee, setAssignee] = useState('');
  const [tlp, setTlp] = useState('TLP:AMBER');
  const [tagMode, setTagMode] = useState<TagMode>('add');
  const [tags, setTags] = useState<string[]>([]);
  const [cfKey, setCfKey] = useState('');
  const [cfValue, setCfValue] = useState('');
  const [comment, setComment] = useState('');

  useEffect(() => {
    if (!open) return;
    setOn({}); setStatus('new'); setSeverity('medium'); setAssignee(''); setTlp('TLP:AMBER');
    setTagMode('add'); setTags([]); setCfKey(''); setCfValue(''); setComment('');
  }, [open]);

  const toggle = (k: string) => (v: boolean) => setOn(p => ({ ...p, [k]: v }));

  const customFieldKeys = useMemo(() => {
    const s = new Set<string>();
    incidents.forEach(i => Object.keys(i.customFields || {}).forEach(k => s.add(k)));
    return Array.from(s).sort();
  }, [incidents]);

  // Count how many selected incidents each checked field would actually change.
  const willChange = (field: string): number => {
    const st = splitCustom(status, getCustomStatus);
    const sv = splitCustom(severity, getCustomSeverity);
    return incidents.filter(i => {
      switch (field) {
        case 'status': return i.status !== st.base || (i.lifecycle?.status || undefined) !== st.custom;
        case 'severity': return i.severity !== sv.base || (i.lifecycle?.severity || undefined) !== sv.custom;
        case 'assignee': return (i.assignee || '') !== assignee;
        case 'tlp': return (i.tlp || '') !== tlp;
        case 'tags': {
          const cur = i.labels || [];
          if (tagMode === 'add') return tags.some(t => !cur.includes(t));
          if (tagMode === 'remove') return tags.some(t => cur.includes(t));
          return cur.length !== tags.length || cur.some(t => !tags.includes(t));
        }
        case 'customField': return String(i.customFields?.[cfKey] ?? '') !== cfValue;
        default: return true;
      }
    }).length;
  };

  const canApply =
    on.status || on.severity || on.assignee || on.tlp ||
    (on.tags && (tags.length > 0 || tagMode === 'replace')) ||
    (on.customField && !!cfKey.trim()) ||
    (on.comment && !!comment.trim());

  const handleApply = () => {
    const changes: BulkEditChanges = {};
    if (on.status) {
      const s = splitCustom(status, getCustomStatus);
      if (s.base) { changes.status = s.base; changes.customStatus = s.custom; }
    }
    if (on.severity) {
      const s = splitCustom(severity, getCustomSeverity);
      if (s.base) { changes.severity = s.base; changes.customSeverity = s.custom; }
    }
    if (on.assignee) changes.assignee = assignee;
    if (on.tlp) changes.tlp = tlp;
    if (on.tags) changes.tags = { mode: tagMode, values: tags };
    if (on.customField && cfKey.trim()) changes.customField = { key: cfKey.trim(), value: cfValue };
    if (on.comment && comment.trim()) changes.comment = comment.trim();
    onApply(changes);
  };

  const total = incidents.length;
  const row = (key: string, label: string, control: React.ReactNode, preview = true) => (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, minHeight: 36 }}>
      <FormControlLabel
        sx={{ width: 150, m: 0, flexShrink: 0, height: 36 }}
        control={<Checkbox size="small" checked={!!on[key]} onChange={e => toggle(key)(e.target.checked)} />}
        label={label}
      />
      <Box sx={{ flex: 1, minWidth: 0, pt: '6px', opacity: on[key] ? 1 : 0.5, pointerEvents: on[key] ? 'auto' : 'none' }}>
        {control}
        {preview && on[key] && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            {willChange(key)} of {total} will change
          </Typography>
        )}
      </Box>
    </Box>
  );

  return (
    <Dialog open={open} onClose={isLoading ? undefined : onClose} maxWidth="sm" fullWidth
      PaperProps={{ sx: { backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' } }}>
      <DialogTitle>Bulk edit {total} incident{total !== 1 ? 's' : ''}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
        <Typography variant="body2" color="text.secondary">
          Choose the fields to change. Only checked fields are updated.
        </Typography>
        {row('status', 'Status',
          <TimelineStatusDropdown value={status} onChange={setStatus}
            onResolveRequest={onResolveRequest} />)}
        {row('severity', 'Severity', <TimelineSeverityDropdown value={severity} onChange={setSeverity} />)}
        {row('assignee', 'Assignee', <TimelineAssigneeDropdown value={assignee} onChange={setAssignee} />)}
        {row('tlp', 'TLP', <TimelineTlpDropdown value={tlp} onChange={setTlp} />)}
        {row('tags', 'Tags',
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <ToggleButtonGroup size="small" exclusive value={tagMode} onChange={(_, v) => v && setTagMode(v)}
              sx={{ '& .MuiToggleButton-root': { height: 28, px: 1.5, textTransform: 'none', fontSize: '0.75rem' } }}>
              <ToggleButton value="add">Add</ToggleButton>
              <ToggleButton value="remove">Remove</ToggleButton>
              <ToggleButton value="replace">Replace all</ToggleButton>
            </ToggleButtonGroup>
            <TimelineTagsEditor
              tags={tags}
              onAddTag={t => setTags(p => (p.includes(t) ? p : [...p, t]))}
              onDeleteTag={t => setTags(p => p.filter(x => x !== t))}
            />
          </Box>)}
        {row('customField', 'Custom field',
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Autocomplete freeSolo size="small" options={customFieldKeys} inputValue={cfKey}
              onInputChange={(_, v) => setCfKey(v)} sx={{ flex: 1 }}
              slotProps={{ popper: { sx: { zIndex: 9999 } } }}
              renderInput={p => <TextField {...p} placeholder="Field name" />} />
            <TextField size="small" placeholder="Value" value={cfValue} onChange={e => setCfValue(e.target.value)} sx={{ flex: 1 }} />
          </Box>)}
        {row('comment', 'Comment',
          <TextField size="small" fullWidth multiline minRows={2} placeholder="Why are these incidents being changed?"
            value={comment} onChange={e => setComment(e.target.value)} />, false)}
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

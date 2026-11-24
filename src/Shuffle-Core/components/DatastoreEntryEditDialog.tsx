import React, { useEffect, useState } from 'react';
import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from '@mui/material';
import { getApiUrl, getAuthHeader } from '@/Shuffle-Core/api';
import { toast } from '@/lib/toast';
import { HighlightedFileEditor } from '@/Shuffle-Core/components/HighlightedFileEditor';

/** Minimal datastore record shape the edit dialog reads. */
export interface DatastoreEntryRecord {
  key: string;
  value: any;
  category?: string;
  created_at?: number;
  edited_at?: number;
  created?: number;
  edited?: number;
  tags?: string[];
  updated_by?: string;
  revision_id?: string;
  suborg_distribution?: string[];
}

export interface DatastoreEntryEditDialogProps {
  open: boolean;
  item: DatastoreEntryRecord | null;
  /** Org the entry lives in. Without one, the dialog only reports the new value via onSaved. */
  orgId?: string | null;
  /** Category shown and saved when the item has none. */
  fallbackCategory?: string;
  isDark?: boolean;
  onClose: () => void;
  onSaved?: (item: DatastoreEntryRecord, value: any) => void;
}

const toStringValue = (val: unknown): string =>
  typeof val === 'string' ? val : val == null ? '' : JSON.stringify(val);

const toEditorString = (value: unknown): string => {
  if (typeof value === 'object' && value !== null) return JSON.stringify(value, null, 2);
  if (typeof value === 'string') {
    try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; }
  }
  return String(value ?? '');
};

const formatTs = (ts?: number) => {
  if (!ts) return '-';
  try {
    const ms = ts > 1e11 ? ts : ts * 1000;
    return new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return String(ts);
  }
};

/** The datastore page's "Edit Datastore Entry" dialog, usable from anywhere. */
export const DatastoreEntryEditDialog: React.FC<DatastoreEntryEditDialogProps> = ({
  open, item, orgId, fallbackCategory = '', isDark = true, onClose, onSaved,
}) => {
  const [formValue, setFormValue] = useState('');
  const [isJsonValid, setIsJsonValid] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && item) {
      setFormValue(toEditorString(item.value));
      setIsJsonValid(true);
    }
  }, [open, item]);

  const handleValueChange = (val: string) => {
    setFormValue(val);
    try { JSON.parse(val); setIsJsonValid(true); } catch { setIsJsonValid(false); }
  };

  const handleFormatJson = () => {
    try {
      setFormValue(JSON.stringify(JSON.parse(formValue), null, 2));
      setIsJsonValid(true);
    } catch {
      toast.warning('Value is not valid JSON; formatting skipped.');
    }
  };

  const handleSave = async () => {
    if (!item) return;
    let finalValue: any = formValue;
    try { finalValue = JSON.parse(formValue); } catch { finalValue = formValue; }
    setSaving(true);
    try {
      if (orgId) {
        const response = await fetch(getApiUrl(`/api/v1/orgs/${orgId}/set_cache`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...getAuthHeader(orgId) },
          credentials: 'include',
          body: JSON.stringify({
            org_id: orgId,
            key: item.key,
            value: toStringValue(finalValue),
            category: item.category || (fallbackCategory === 'default' ? '' : fallbackCategory),
          }),
        });
        if (!response.ok) throw new Error(`Failed to update entry: ${response.status}`);
      }
      toast.success(`Entry "${item.key}" updated successfully`);
      onSaved?.(item, finalValue);
      onClose();
    } catch (err) {
      console.error('[Datastore] update entry error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to update entry');
    } finally {
      setSaving(false);
    }
  };

  const tags = Array.isArray(item?.tags)
    ? item!.tags!.filter((t) => typeof t === 'string' && t.trim().length > 0).map((t) => t.trim())
    : [];
  const suborgs = Array.isArray(item?.suborg_distribution) ? item!.suborg_distribution! : [];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { bgcolor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 2 } }}
    >
      <DialogTitle sx={{ fontWeight: 600, fontSize: '1rem' }}>Edit Datastore Entry</DialogTitle>
      <DialogContent sx={{ py: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <TextField
          label="Key"
          size="small"
          fullWidth
          disabled
          value={item?.key || ''}
          sx={{ mt: 1, '& input': { fontFamily: 'monospace', fontSize: '0.88rem' } }}
        />
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>Value (JSON or String)</Typography>
          <Button size="small" variant="text" onClick={handleFormatJson} sx={{ textTransform: 'none', fontSize: '0.75rem' }}>
            Format JSON
          </Button>
        </Box>
        <HighlightedFileEditor
          value={formValue}
          onChange={(nextVal) => handleValueChange(nextVal)}
          validateJson={false}
          language="json"
          minHeight={220}
          maxHeight={360}
        />
        {!isJsonValid && (
          <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', px: 0.5 }}>
            Value is not valid JSON (will be saved as raw string if submitted)
          </Typography>
        )}
        {/* Raw record details: what the entry looks like on the server */}
        <Box
          sx={{
            mt: 0.5, p: 1.5, borderRadius: 1.5, border: '1px solid hsl(var(--border))',
            bgcolor: isDark ? 'hsl(var(--card) / 0.6)' : 'hsl(var(--muted) / 0.35)',
            display: 'flex', flexDirection: 'column', gap: 1.25,
          }}
        >
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2.5, fontSize: '0.78rem', fontFamily: 'monospace', color: 'hsl(var(--muted-foreground))' }}>
            <span>Created: {formatTs(item?.created_at ?? item?.created)}</span>
            <span>Updated: {formatTs(item?.edited_at ?? item?.edited)}</span>
            <span>Category: {item?.category || fallbackCategory || '-'}</span>
            {item?.updated_by ? <span>Updated by: {item.updated_by}</span> : null}
            {item?.revision_id ? <span>Revision: {item.revision_id}</span> : null}
            {suborgs.length > 0 ? <span>Shared with: {suborgs.length} sub-tenant(s)</span> : null}
          </Box>
          {tags.length > 0 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, alignItems: 'center' }}>
              <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', fontWeight: 600, letterSpacing: '0.02em' }}>
                Tags
              </Typography>
              {tags.map((tag) => (
                <Chip key={tag} label={tag} size="small" variant="outlined" sx={{ fontFamily: 'monospace', fontSize: '0.72rem', height: 22 }} />
              ))}
            </Box>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5, borderTop: '1px solid hsl(var(--border))' }}>
        <Button size="small" onClick={onClose} sx={{ textTransform: 'none' }}>Cancel</Button>
        <Button size="small" variant="contained" onClick={handleSave} disabled={saving} sx={{ textTransform: 'none', fontWeight: 600 }}>
          {saving ? 'Saving...' : 'Update Entry'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DatastoreEntryEditDialog;

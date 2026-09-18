import { CheckCircle2 as CheckCircleIcon, Filter as FilterListIcon } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Box,
  Typography,
  Switch,
  FormControlLabel,
  Fade,
} from '@mui/material';
import { useCustomFields, CustomField } from '@/hooks/useCustomFields';
import { useEntityText } from '@/hooks/useEntityLabel';

export interface ResolutionData {
  reason: string;
  notes: string;
  customFieldValues?: Record<string, string>;
}

const RESOLUTION_REASONS = [
  { value: 'true_positive_remediated', label: 'True Positive - Remediated' },
  { value: 'true_positive_accepted', label: 'True Positive - Risk Accepted' },
  { value: 'false_positive', label: 'False Positive' },
  { value: 'duplicate', label: 'Duplicate Incident' },
  { value: 'not_applicable', label: 'Not Applicable' },
  { value: 'no_action_required', label: 'No Action Required' },
  { value: 'escalated', label: 'Escalated to External Team' },
  { value: 'other', label: 'Other' },
] as const;

interface ResolveIncidentDialogProps {
  open: boolean;
  onClose: () => void;
  onResolve: (data: ResolutionData) => void;
  incidentTitle: string;
  isLoading?: boolean;
  incidentCustomFields?: Record<string, string>;
}

export const ResolveIncidentDialog = React.forwardRef<HTMLDivElement, ResolveIncidentDialogProps>(({
  open,
  onClose,
  onResolve,
  incidentTitle,
  isLoading = false,
  incidentCustomFields = {},
}, _ref) => {
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [resolved, setResolved] = useState(false);
  const { fields: allCustomFields } = useCustomFields();
  const t = useEntityText();

  const missingRequiredFields = allCustomFields.filter(
    (f) => f.required && !incidentCustomFields?.[f.key]?.trim()
  );

  useEffect(() => {
    if (open) {
      setReason('');
      setNotes('');
      setCustomValues({});
      setResolved(false);
    }
  }, [open]);

  const allRequiredFilled = missingRequiredFields.every((f) => {
    const val = customValues[f.key];
    if (f.type === 'boolean') return true;
    return val && val.trim().length > 0;
  });

  const canResolve = !!reason && allRequiredFilled;

  const handleResolve = () => {
    if (!canResolve) return;
    onResolve({
      reason,
      notes: notes.trim(),
      customFieldValues: missingRequiredFields.length > 0 ? customValues : undefined,
    });
    setResolved(true);
  };

  const handleClose = () => {
    setReason('');
    setNotes('');
    setCustomValues({});
    setResolved(false);
    onClose();
  };

  const updateCustomValue = (key: string, value: string) => {
    setCustomValues((prev) => ({ ...prev, [key]: value }));
  };

  const renderCustomField = (field: CustomField) => {
    const value = customValues[field.key] || '';
    switch (field.type) {
      case 'select':
        return (
          <FormControl fullWidth sx={{ mb: 2, ...inputSx }} key={field.key}>
            <InputLabel>{field.name} *</InputLabel>
            <Select value={value} onChange={(e) => updateCustomValue(field.key, e.target.value)} label={`${field.name} *`}>
              {(field.options || []).map((opt) => (
                <MenuItem key={opt} value={opt}>{opt}</MenuItem>
              ))}
            </Select>
          </FormControl>
        );
      case 'boolean':
        return (
          <FormControlLabel
            key={field.key}
            sx={{ mb: 2, ml: 0 }}
            control={<Switch checked={value === 'true'} onChange={(e) => updateCustomValue(field.key, String(e.target.checked))} />}
            label={field.name}
          />
        );
      case 'number':
        return (
          <TextField key={field.key} fullWidth type="number" label={`${field.name} *`} value={value} onChange={(e) => updateCustomValue(field.key, e.target.value)} sx={{ mb: 2, ...inputSx }} />
        );
      case 'date':
        return (
          <TextField key={field.key} fullWidth type="date" label={`${field.name} *`} value={value} onChange={(e) => updateCustomValue(field.key, e.target.value)} InputLabelProps={{ shrink: true }} sx={{ mb: 2, ...inputSx }} />
        );
      default:
        return (
          <TextField key={field.key} fullWidth label={`${field.name} *`} placeholder={field.description || ''} value={value} onChange={(e) => updateCustomValue(field.key, e.target.value)} sx={{ mb: 2, ...inputSx }} />
        );
    }
  };

  const inputSx = {
    '& .MuiOutlinedInput-root': {
      bgcolor: 'rgba(255,255,255,0.03)',
      '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' },
    },
  };

  const resolvedReasonLabel = RESOLUTION_REASONS.find(r => r.value === reason)?.label || reason;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          background: 'hsl(var(--card))',
          border: '1px solid hsl(var(--border))',
          borderRadius: 2,
        },
      }}
    >
      {resolved ? (
        <Fade in timeout={400}>
          <Box sx={{ textAlign: 'center', py: 5, px: 3 }}>
            <CheckCircleIcon size={56} style={{ color: 'hsl(var(--severity-low))', marginBottom: '16px' }} />
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
              Incident Resolved
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              <strong>{incidentTitle}</strong>
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Reason: {resolvedReasonLabel}
            </Typography>
            <Box sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
              mb: 3,
              p: 1.5,
              borderRadius: 1.5,
              bgcolor: 'hsl(var(--muted))',
              border: '1px solid hsl(var(--border))',
            }}>
              <FilterListIcon size={18} style={{ color: 'hsl(var(--muted-foreground))' }} />
              <Typography variant="caption" color="text.secondary">
                You can find this incident under the <strong>Resolved</strong> status filter
              </Typography>
            </Box>
            <Button variant="contained" onClick={handleClose} sx={{
              bgcolor: 'hsl(var(--severity-low))',
              color: 'hsl(var(--primary-foreground))',
              '&:hover': { bgcolor: 'hsl(var(--severity-low) / 0.9)' },
            }}>
              Done
            </Button>
          </Box>
        </Fade>
      ) : (
        <>
          <DialogTitle sx={{ pb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <CheckCircleIcon style={{ color: 'hsl(var(--severity-low))' }} />
              <Typography variant="h6">{t('Resolve Incident')}</Typography>
            </Box>
          </DialogTitle>

          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Resolving: <strong>{incidentTitle}</strong>
            </Typography>

            <FormControl fullWidth sx={{ mb: 3, ...inputSx }}>
              <InputLabel>Resolution Reason *</InputLabel>
              <Select value={reason} onChange={(e) => setReason(e.target.value)} label="Resolution Reason *">
                {RESOLUTION_REASONS.map((r) => (
                  <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>
                ))}
              </Select>
            </FormControl>

            {missingRequiredFields.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                  Required fields must be filled before resolving
                </Typography>
                {missingRequiredFields.map(renderCustomField)}
              </Box>
            )}

            <TextField
              fullWidth
              multiline
              rows={3}
              label="Resolution Notes (optional)"
              placeholder={t('Add any additional context about how this incident was resolved...')}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              sx={inputSx}
            />
          </DialogContent>

          <DialogActions sx={{ px: 3, pb: 3 }}>
            <Button onClick={handleClose} disabled={isLoading}>Cancel</Button>
            <Button
              variant="contained"
              onClick={handleResolve}
              disabled={!canResolve || isLoading}
              startIcon={<CheckCircleIcon />}
              sx={{
                bgcolor: 'hsl(var(--severity-low))',
                color: 'hsl(var(--primary-foreground))',
                '&:hover': { bgcolor: 'hsl(var(--severity-low) / 0.9)' },
              }}
            >
              {isLoading ? 'Resolving...' : 'Resolve Incident'}
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
});

export { RESOLUTION_REASONS };

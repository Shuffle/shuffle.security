import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
} from '@mui/material';
import type { IncidentEvent } from '@/config/ocsfIncidentSchema';

interface AddIncidentEventDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (event: IncidentEvent) => Promise<void>;
  incidentId: string;
}

export const AddIncidentEventDialog: React.FC<AddIncidentEventDialogProps> = ({
  open,
  onClose,
  onAdd,
  incidentId,
}) => {
  const [mode, setMode] = useState<'form' | 'json'>('form');
  const [source, setSource] = useState('');
  const [type, setType] = useState('process_creation');
  const [action, setAction] = useState('');
  const [severity, setSeverity] = useState<IncidentEvent['severity']>('medium');
  const [status, setStatus] = useState<IncidentEvent['status']>('relevant');
  const [tagsInput, setTagsInput] = useState('');
  const [notes, setNotes] = useState('');
  const [rawJson, setRawJson] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setSource('');
    setType('process_creation');
    setAction('');
    setSeverity('medium');
    setStatus('relevant');
    setTagsInput('');
    setNotes('');
    setRawJson('');
    setJsonError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleJsonPasteChange = (text: string) => {
    setRawJson(text);
    if (!text.trim()) {
      setJsonError(null);
      return;
    }
    try {
      const parsed = JSON.parse(text);
      setJsonError(null);
      // Auto-populate form fields from parsed JSON
      if (parsed.source || parsed.product || parsed.vendor) {
        setSource(String(parsed.source || parsed.product || parsed.vendor));
      }
      if (parsed.type || parsed.event_type || parsed.category) {
        setType(String(parsed.type || parsed.event_type || parsed.category));
      }
      if (parsed.action || parsed.name || parsed.title || parsed.message) {
        setAction(String(parsed.action || parsed.name || parsed.title || parsed.message));
      }
      if (parsed.severity) {
        const s = String(parsed.severity).toLowerCase();
        if (s.includes('crit')) setSeverity('critical');
        else if (s.includes('high')) setSeverity('high');
        else if (s.includes('med')) setSeverity('medium');
        else if (s.includes('low')) setSeverity('low');
        else setSeverity('informational');
      }
    } catch {
      setJsonError('Invalid JSON format');
    }
  };

  const handleSubmit = async () => {
    if (!action.trim()) return;

    setIsSubmitting(true);
    try {
      let parsedRaw: Record<string, unknown> | undefined;
      if (rawJson.trim()) {
        try {
          parsedRaw = JSON.parse(rawJson);
        } catch {
          parsedRaw = { raw_text: rawJson };
        }
      }

      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const sevIdMap: Record<string, number> = {
        informational: 1,
        low: 2,
        medium: 3,
        high: 4,
        critical: 5,
      };

      const eventId = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      const newEvent: IncidentEvent = {
        id: eventId,
        incident_id: incidentId,
        time: new Date().toISOString(),
        source: source.trim() || 'Manual Entry',
        type: type.trim() || 'custom',
        action: action.trim(),
        severity,
        severity_id: sevIdMap[severity || 'medium'] || 3,
        status,
        tags,
        notes: notes.trim() || undefined,
        raw: parsedRaw,
      };

      await onAdd(newEvent);
      handleClose();
    } catch (err: any) {
      console.error('Failed to add event:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: 'hsl(var(--card))',
          color: 'hsl(var(--foreground))',
          border: '1px solid hsl(var(--border))',
          borderRadius: 2,
        },
      }}
    >
      <DialogTitle
        sx={{
          fontSize: '1rem',
          fontWeight: 600,
          borderBottom: '1px solid hsl(var(--border))',
          py: 1.75,
          px: 2.5,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 600, fontSize: '0.95rem' }}>
          Add Incident Event
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            size="small"
            variant={mode === 'form' ? 'contained' : 'outlined'}
            onClick={() => setMode('form')}
            sx={{
              height: 28,
              fontSize: '0.75rem',
              textTransform: 'none',
              px: 1.5,
              borderColor: 'hsl(var(--border))',
              bgcolor: mode === 'form' ? 'hsl(var(--primary))' : 'transparent',
              color: mode === 'form' ? 'hsl(var(--primary-foreground))' : 'hsl(var(--foreground))',
              '&:hover': {
                bgcolor: mode === 'form' ? 'hsl(var(--primary) / 0.9)' : 'hsl(var(--muted) / 0.3)',
              },
            }}
          >
            Structured
          </Button>
          <Button
            size="small"
            variant={mode === 'json' ? 'contained' : 'outlined'}
            onClick={() => setMode('json')}
            sx={{
              height: 28,
              fontSize: '0.75rem',
              textTransform: 'none',
              px: 1.5,
              borderColor: 'hsl(var(--border))',
              bgcolor: mode === 'json' ? 'hsl(var(--primary))' : 'transparent',
              color: mode === 'json' ? 'hsl(var(--primary-foreground))' : 'hsl(var(--foreground))',
              '&:hover': {
                bgcolor: mode === 'json' ? 'hsl(var(--primary) / 0.9)' : 'hsl(var(--muted) / 0.3)',
              },
            }}
          >
            Paste JSON
          </Button>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
        {mode === 'json' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))' }}>
              Paste raw JSON telemetry or log data below. Fields like source, action, and severity will be automatically parsed.
            </Typography>
            <TextField
              multiline
              rows={8}
              value={rawJson}
              onChange={(e) => handleJsonPasteChange(e.target.value)}
              placeholder='{\n  "timestamp": "2026-09-17T12:00:00Z",\n  "source": "CrowdStrike",\n  "action": "Suspicious execution",\n  "severity": "high"\n}'
              error={!!jsonError}
              helperText={jsonError}
              sx={{
                fontFamily: 'monospace',
                fontSize: '0.8rem',
                '& .MuiOutlinedInput-root': {
                  bgcolor: 'hsl(var(--background))',
                  '& fieldset': { borderColor: 'hsl(var(--border))' },
                },
              }}
            />
            {rawJson && !jsonError && (
              <Alert severity="success" sx={{ py: 0.25, fontSize: '0.75rem', bgcolor: 'transparent', border: '1px solid hsl(var(--border))' }}>
                Valid JSON parsed. You can refine the extracted fields below.
              </Alert>
            )}
          </Box>
        )}

        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <TextField
            size="small"
            label="Source / Product"
            placeholder="e.g. CrowdStrike, Okta, Syslog"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            fullWidth
            sx={{
              '& .MuiOutlinedInput-root': {
                '& fieldset': { borderColor: 'hsl(var(--border))' },
              },
            }}
          />
          <TextField
            size="small"
            label="Event Category / Type"
            placeholder="e.g. process_creation, authentication"
            value={type}
            onChange={(e) => setType(e.target.value)}
            fullWidth
            sx={{
              '& .MuiOutlinedInput-root': {
                '& fieldset': { borderColor: 'hsl(var(--border))' },
              },
            }}
          />
        </Box>

        <TextField
          size="small"
          label="Action / Summary"
          placeholder="Brief description of the event"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          required
          fullWidth
          sx={{
            '& .MuiOutlinedInput-root': {
              '& fieldset': { borderColor: 'hsl(var(--border))' },
            },
          }}
        />

        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <FormControl size="small" fullWidth>
            <InputLabel id="event-severity-label">Severity</InputLabel>
            <Select
              labelId="event-severity-label"
              value={severity}
              label="Severity"
              onChange={(e) => setSeverity(e.target.value as any)}
              sx={{
                '& fieldset': { borderColor: 'hsl(var(--border))' },
              }}
            >
              <MenuItem value="critical">Critical</MenuItem>
              <MenuItem value="high">High</MenuItem>
              <MenuItem value="medium">Medium</MenuItem>
              <MenuItem value="low">Low</MenuItem>
              <MenuItem value="informational">Informational</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" fullWidth>
            <InputLabel id="event-status-label">Relevance Status</InputLabel>
            <Select
              labelId="event-status-label"
              value={status}
              label="Relevance Status"
              onChange={(e) => setStatus(e.target.value as any)}
              sx={{
                '& fieldset': { borderColor: 'hsl(var(--border))' },
              }}
            >
              <MenuItem value="relevant">Relevant</MenuItem>
              <MenuItem value="investigating">Investigating</MenuItem>
              <MenuItem value="excluded">Excluded / Noise</MenuItem>
            </Select>
          </FormControl>
        </Box>

        <TextField
          size="small"
          label="Tags (comma separated)"
          placeholder="e.g. ioc_match, suspicious_powershell, persistence"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          fullWidth
          sx={{
            '& .MuiOutlinedInput-root': {
              '& fieldset': { borderColor: 'hsl(var(--border))' },
            },
          }}
        />

        <TextField
          size="small"
          label="Analyst Notes"
          placeholder="Additional investigative context..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          multiline
          rows={2}
          fullWidth
          sx={{
            '& .MuiOutlinedInput-root': {
              '& fieldset': { borderColor: 'hsl(var(--border))' },
            },
          }}
        />
      </DialogContent>

      <DialogActions sx={{ p: 2, borderTop: '1px solid hsl(var(--border))' }}>
        <Button
          size="small"
          onClick={handleClose}
          sx={{
            height: 32,
            textTransform: 'none',
            fontSize: '0.8rem',
            color: 'hsl(var(--muted-foreground))',
          }}
        >
          Cancel
        </Button>
        <Button
          size="small"
          variant="contained"
          onClick={handleSubmit}
          disabled={!action.trim() || isSubmitting}
          sx={{
            height: 32,
            textTransform: 'none',
            fontSize: '0.8rem',
            fontWeight: 600,
            bgcolor: 'hsl(var(--primary))',
            color: 'hsl(var(--primary-foreground))',
            '&:hover': { bgcolor: 'hsl(var(--primary) / 0.9)' },
          }}
        >
          {isSubmitting ? 'Saving...' : 'Add Event'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

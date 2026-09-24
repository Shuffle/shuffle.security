import { CheckCircle2 as CheckCircleIcon, Save as SaveIcon, Plus as AddIcon } from 'lucide-react';
import { useState, useEffect } from 'react';
import { htmlToPlainText } from '@/lib/utils';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Chip,
  Divider,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  CircularProgress,
  FormControlLabel,
  Switch,
} from '@mui/material';
import { 
  OCSFIncidentFinding, 
  Observable, 
  severityOptions, 
  TLP_LABELS,
} from '@/config/ocsfIncidentSchema';
import { 
  tlpLevels,
  papLevels,
} from './CreateIncidentDialog';
import { useUsers } from '@/hooks/useUsers';
import { useCustomFields, CustomField } from '@/hooks/useCustomFields';
import { useIOCTypes } from '@/hooks/useIOCTypes';
import { ObservableTypeSelector } from './ObservableTypeSelector';

interface DisplayIncident {
  id: string;
  title?: string;
  source?: string;
  severity: string;
  status: string;
  assignee: string | null;
  created: string;
  edited?: string;
  tlp?: string;
  pap?: string;
  references?: string[];
  observables?: Observable[];
  customFields?: Record<string, string | number | boolean>;
  relatedFindings?: string[];
  rawOCSF?: any; // Use any for legacy compatibility
}

interface IncidentDetailDialogProps {
  open: boolean;
  incident: DisplayIncident | null;
  onClose: () => void;
  onResolve: (incidentId: string) => Promise<void>;
  onUpdate?: (incidentId: string, updates: any) => Promise<void>;
}

const severityColors: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#22c55e',
  informational: '#3b82f6',
};

const statusColors: Record<string, { bg: string; text: string }> = {
  new: { bg: 'rgba(34, 184, 207, 0.15)', text: '#22b8cf' },
  in_progress: { bg: 'rgba(249, 115, 22, 0.15)', text: '#f97316' },
  escalated: { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444' },
  resolved: { bg: 'rgba(34, 197, 94, 0.15)', text: '#22c55e' },
};

export const IncidentDetailDialog = ({ open, incident, onClose, onResolve, onUpdate }: IncidentDetailDialogProps) => {
  const [editedTitle, setEditedTitle] = useState('');
  const [editedMessage, setEditedMessage] = useState('');
  const [editedSeverity, setEditedSeverity] = useState('');
  const [editedAssignee, setEditedAssignee] = useState('');
  const [editedTlp, setEditedTlp] = useState('TLP:AMBER');
  const [editedPap, setEditedPap] = useState('PAP:AMBER');
  const [editedReferences, setEditedReferences] = useState<string[]>([]);
  const [newReference, setNewReference] = useState('');
  const [editedObservables, setEditedObservables] = useState<Observable[]>([]);
  const [newObservableType, setNewObservableType] = useState('ipv4');
  const [newObservableValue, setNewObservableValue] = useState('');
  const [editedCustomFields, setEditedCustomFields] = useState<Record<string, string | number | boolean>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const { users, loading: usersLoading } = useUsers();
  const { fields: customFields } = useCustomFields();
  const { observableTypeNames, iocTypes } = useIOCTypes();

  // Reset form when incident changes
  useEffect(() => {
    if (incident) {
      setEditedTitle(incident.title ?? '');
      const rawDesc = incident.rawOCSF?.desc || incident.rawOCSF?.message || '';
      setEditedMessage(htmlToPlainText(rawDesc));
      setEditedSeverity(incident.severity);
      setEditedAssignee(incident.assignee || '');
      setEditedTlp(incident.tlp || 'TLP:AMBER');
      setEditedPap(incident.pap || 'PAP:AMBER');
      setEditedReferences(incident.references || []);
      const customAttrs = incident.rawOCSF?.metadata?.extensions?.custom_attributes;
      setEditedCustomFields(customAttrs?.customFields || (incident.rawOCSF as any)?.customFields || {});
      setHasChanges(false);
    }
  }, [incident]);

  // Track changes
  useEffect(() => {
    if (!incident) return;
    const changed = 
      editedTitle !== incident.title ||
      editedMessage !== (incident.rawOCSF?.message || '') ||
      editedSeverity !== incident.severity ||
      editedAssignee !== (incident.assignee || '') ||
      editedTlp !== (incident.tlp || 'TLP:AMBER') ||
      editedPap !== (incident.pap || 'PAP:AMBER') ||
      JSON.stringify(editedReferences) !== JSON.stringify(incident.references || []) ||
      JSON.stringify(editedObservables) !== JSON.stringify(incident.observables || []);
    const customAttrsForCompare = incident.rawOCSF?.metadata?.extensions?.custom_attributes;
    const changedCustomFields = JSON.stringify(editedCustomFields) !== JSON.stringify(customAttrsForCompare?.customFields || (incident.rawOCSF as any)?.customFields || {});
    setHasChanges(changed || changedCustomFields);
  }, [incident, editedTitle, editedMessage, editedSeverity, editedAssignee, editedTlp, editedPap, editedReferences, editedObservables, editedCustomFields]);

  const handleAddReference = () => {
    if (newReference.trim()) {
      setEditedReferences([...editedReferences, newReference.trim()]);
      setNewReference('');
    }
  };

  const handleRemoveReference = (index: number) => {
    setEditedReferences(editedReferences.filter((_, i) => i !== index));
  };

  const handleAddObservable = () => {
    if (newObservableValue.trim()) {
      setEditedObservables([...editedObservables, { type: newObservableType, value: newObservableValue.trim() }]);
      setNewObservableValue('');
    }
  };

  const handleRemoveObservable = (index: number) => {
    setEditedObservables(editedObservables.filter((_, i) => i !== index));
  };

  if (!incident) return null;

  const isResolved = incident.status === 'resolved';

  const handleResolve = async () => {
    setSaving(true);
    await onResolve(incident.id);
    setSaving(false);
    onClose();
  };

  const handleSave = async () => {
    if (!onUpdate || !incident.rawOCSF) return;
    
    setSaving(true);
    const severityOption = severityOptions.find(s => s.value === editedSeverity);
    
    // Get existing finding info from list (new) or direct (legacy)
    const existingFindingInfo = incident.rawOCSF?.finding_info_list?.[0] || (incident.rawOCSF as any)?.finding_info;
    
    const updates: any = {
      title: editedTitle,
      desc: editedMessage || editedTitle,
      severity_id: severityOption?.id || 3,
      severity: severityOption?.label || 'Medium',
      references: editedReferences, // Always include, even if empty
      metadata: {
        ...incident.rawOCSF?.metadata,
        extensions: {
          ...incident.rawOCSF?.metadata?.extensions,
          custom_attributes: {
            ...incident.rawOCSF?.metadata?.extensions?.custom_attributes,
            tlp: typeof editedTlp === 'string' ? (editedTlp.includes('GREEN') ? 2 : editedTlp.includes('RED') ? 4 : editedTlp.includes('AMBER') ? 3 : 1) : editedTlp,
            observables: editedObservables, // Always include, even if empty
            customFields: editedCustomFields, // Always include, even if empty
            assignee: editedAssignee.trim() || '',
          },
        },
      },
    };

    await onUpdate(incident.id, updates);
    setSaving(false);
    setHasChanges(false);
  };

  const handleCustomFieldChange = (field: CustomField, value: string | number | boolean) => {
    setEditedCustomFields(prev => ({
      ...prev,
      [field.key]: value,
    }));
  };

  const renderCustomField = (field: CustomField) => {
    const value = editedCustomFields[field.key];
    
    switch (field.type) {
      case 'text':
        return (
          <TextField
            key={field.key}
            label={field.name}
            value={value || ''}
            onChange={(e) => handleCustomFieldChange(field, e.target.value)}
            fullWidth
            size="small"
            sx={inputSx}
          />
        );
      case 'number':
        return (
          <TextField
            key={field.key}
            label={field.name}
            type="number"
            value={value || ''}
            onChange={(e) => handleCustomFieldChange(field, Number(e.target.value))}
            fullWidth
            size="small"
            sx={inputSx}
          />
        );
      case 'select':
        return (
          <FormControl key={field.key} fullWidth size="small">
            <InputLabel>{field.name}</InputLabel>
            <Select
              value={value || ''}
              label={field.name}
              onChange={(e) => handleCustomFieldChange(field, e.target.value)}
              sx={inputSx['& .MuiOutlinedInput-root']}
            >
              <MenuItem value="">
                <em>None</em>
              </MenuItem>
              {field.options?.map((opt) => (
                <MenuItem key={opt} value={opt}>
                  {opt}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        );
      case 'date':
        return (
          <TextField
            key={field.key}
            label={field.name}
            type="date"
            value={value || ''}
            onChange={(e) => handleCustomFieldChange(field, e.target.value)}
            fullWidth
            InputLabelProps={{ shrink: true }}
            size="small"
            sx={inputSx}
          />
        );
      case 'boolean':
        return (
          <FormControlLabel
            key={field.key}
            control={
              <Switch
                checked={Boolean(value)}
                onChange={(e) => handleCustomFieldChange(field, e.target.checked)}
              />
            }
            label={field.name}
            sx={{ color: 'hsl(var(--foreground))' }}
          />
        );
      default:
        return null;
    }
  };

  const inputSx = {
    '& .MuiOutlinedInput-root': {
      bgcolor: 'background.paper',
      '& fieldset': {
        borderColor: 'divider',
      },
      '&:hover fieldset': {
        borderColor: 'text.secondary',
      },
      '&.Mui-focused fieldset': {
        borderColor: 'primary.main',
      },
    },
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Incident Details
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              OCSF Incident Finding (class_uid: 2005)
            </Typography>
          </Box>
          <Chip
            label={incident.status.replace('_', ' ')}
            size="small"
            sx={{
              backgroundColor: statusColors[incident.status]?.bg || 'rgba(148, 163, 184, 0.1)',
              color: statusColors[incident.status]?.text || '#94a3b8',
              fontWeight: 500,
              textTransform: 'capitalize',
            }}
          />
        </Box>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 1 }}>
          <Box>
            <TextField
              label="Title"
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              fullWidth
              sx={inputSx}
            />
            <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.5, display: 'block' }}>
              ID: {incident.id}
            </Typography>
          </Box>

          <TextField
            label="Message / Description"
            value={editedMessage}
            onChange={(e) => setEditedMessage(e.target.value)}
            fullWidth
            multiline
            rows={6}
            sx={inputSx}
          />

          <Divider sx={{ borderColor: 'rgba(148, 163, 184, 0.1)' }} />

          {/* Fields Grid */}
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 3 }}>
            {/* Severity */}
            <FormControl fullWidth size="small">
              <InputLabel>Severity</InputLabel>
              <Select
                value={editedSeverity}
                label="Severity"
                onChange={(e) => setEditedSeverity(e.target.value)}
                sx={{
                  ...inputSx['& .MuiOutlinedInput-root'],
                  '& .MuiSelect-select': {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                  },
                }}
              >
                {severityOptions.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box
                        sx={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          backgroundColor: severityColors[opt.value],
                        }}
                      />
                      {opt.label}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Status (read-only) */}
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>
                Status
              </Typography>
              <Chip
                label={incident.status.replace('_', ' ')}
                size="small"
                sx={{
                  backgroundColor: statusColors[incident.status]?.bg || 'rgba(148, 163, 184, 0.1)',
                  color: statusColors[incident.status]?.text || '#94a3b8',
                  fontWeight: 500,
                  textTransform: 'capitalize',
                }}
              />
            </Box>

            {/* TLP */}
            <FormControl fullWidth size="small">
              <InputLabel>TLP</InputLabel>
              <Select
                value={editedTlp}
                label="TLP"
                onChange={(e) => setEditedTlp(e.target.value)}
                sx={inputSx['& .MuiOutlinedInput-root']}
              >
                {tlpLevels.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: opt.color, border: opt.color === '#ffffff' ? '1px solid #666' : 'none' }} />
                      {opt.label}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* PAP */}
            <FormControl fullWidth size="small">
              <InputLabel>PAP</InputLabel>
              <Select
                value={editedPap}
                label="PAP"
                onChange={(e) => setEditedPap(e.target.value)}
                sx={inputSx['& .MuiOutlinedInput-root']}
              >
                {papLevels.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: opt.color, border: opt.color === '#ffffff' ? '1px solid #666' : 'none' }} />
                      {opt.label}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Assignee */}
            <FormControl fullWidth size="small">
              <InputLabel>Assignee</InputLabel>
              <Select
                value={editedAssignee}
                label="Assignee"
                onChange={(e) => setEditedAssignee(e.target.value)}
                disabled={usersLoading}
                endAdornment={usersLoading ? <CircularProgress size={16} sx={{ mr: 2 }} /> : null}
                sx={inputSx['& .MuiOutlinedInput-root']}
                MenuProps={{
                  PaperProps: {
                    sx: {
                      bgcolor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      zIndex: 10040,
                    },
                  },
                }}
              >
                <MenuItem value="">
                  <em>Unassigned</em>
                </MenuItem>
                {users.map((user) => (
                  <MenuItem key={user.id} value={user.username}>
                    {user.username}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Source */}
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>
                Source
              </Typography>
              <Chip
                label={incident.source}
                size="small"
                sx={{ backgroundColor: 'rgba(148, 163, 184, 0.1)' }}
              />
            </Box>

            {/* Created */}
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>
                Created
              </Typography>
              <Typography variant="body2">
                {incident.created}
              </Typography>
            </Box>

            {/* Edited */}
            {incident.edited && (
              <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>
                  Last Edited
                </Typography>
                <Typography variant="body2">
                  {incident.edited}
                </Typography>
              </Box>
            )}
          </Box>

          <Divider sx={{ borderColor: 'rgba(148, 163, 184, 0.1)' }} />

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>
              URL References
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                <TextField
                  size="small"
                  value={newReference}
                  onChange={(e) => setNewReference(e.target.value)}
                  placeholder="https://example.com/reference"
                  fullWidth
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddReference();
                    }
                  }}
                  sx={inputSx}
                />
                <IconButton 
                  onClick={handleAddReference} 
                  size="small" 
                  sx={{ bgcolor: 'rgba(255,255,255,0.05)', '&:hover': { bgcolor: 'hsl(var(--border))' } }}
                  disabled={!newReference.trim()}
                >
                  <AddIcon />
              </IconButton>
            </Box>
            {editedReferences.length > 0 ? (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {editedReferences.map((ref, idx) => (
                  <Chip
                    key={idx}
                    label={ref.length > 40 ? ref.substring(0, 40) + '...' : ref}
                    size="small"
                    onDelete={() => handleRemoveReference(idx)}
                    sx={{ maxWidth: '100%' }}
                  />
                ))}
              </Box>
            ) : (
              <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
                No references
              </Typography>
            )}
          </Box>

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>
              Observables (IOCs)
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
              <ObservableTypeSelector
                value={newObservableType}
                onChange={setNewObservableType}
                iocTypes={iocTypes}
              />
              <TextField
                size="small"
                value={newObservableValue}
                onChange={(e) => setNewObservableValue(e.target.value)}
                placeholder="Value..."
                fullWidth
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddObservable();
                  }
                }}
                sx={inputSx}
              />
              <IconButton 
                onClick={handleAddObservable} 
                size="small" 
                sx={{ bgcolor: 'rgba(255,255,255,0.05)', '&:hover': { bgcolor: 'hsl(var(--border))' } }}
                disabled={!newObservableValue.trim()}
              >
                <AddIcon />
              </IconButton>
            </Box>
            {editedObservables.length > 0 ? (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {editedObservables.map((obs, idx) => (
                  <Chip
                    key={idx}
                    label={`${obs.type}: ${obs.value}`}
                    size="small"
                    onDelete={() => handleRemoveObservable(idx)}
                    sx={{ 
                      bgcolor: '#ff6600',
                      color: '#ffffff',
                      '& .MuiChip-deleteIcon': { color: 'rgba(255,255,255,0.8)', '&:hover': { color: '#ffffff' } },
                      '& .MuiChip-label': { fontFamily: 'monospace', fontSize: '0.75rem' }
                    }}
                  />
                ))}
              </Box>
            ) : (
              <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
                No observables
              </Typography>
            )}
          </Box>

          {/* Custom Fields */}
          {customFields.length > 0 && (
            <>
              <Divider sx={{ borderColor: 'rgba(148, 163, 184, 0.1)' }} />
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1.5, color: 'text.secondary' }}>
                  Custom Fields
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2 }}>
                  {customFields.map((field) => renderCustomField(field))}
                </Box>
              </Box>
            </>
          )}

          {/* Related Findings */}
          {incident.relatedFindings && incident.relatedFindings.length > 0 && (
            <>
              <Divider sx={{ borderColor: 'rgba(148, 163, 184, 0.1)' }} />
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1.5, color: 'text.secondary' }}>
                  Related Detection Findings
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {incident.relatedFindings.map((findingId, idx) => (
                    <Chip
                      key={idx}
                      label={findingId}
                      size="small"
                      sx={{ bgcolor: 'rgba(59, 130, 246, 0.15)', fontFamily: 'monospace' }}
                    />
                  ))}
                </Box>
              </Box>
            </>
          )}

          {incident.rawOCSF && (
            <>
              <Divider sx={{ borderColor: 'rgba(148, 163, 184, 0.1)' }} />
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1.5, color: 'text.secondary' }}>
                  OCSF Incident Data
                </Typography>
                <Box
                  sx={{
                    backgroundColor: 'hsl(var(--input))',
                    borderRadius: 1,
                    p: 2,
                    fontFamily: 'monospace',
                    fontSize: '0.8rem',
                    overflow: 'auto',
                    maxHeight: 200,
                  }}
                >
                  <pre style={{ margin: 0 }}>
                    {JSON.stringify(incident.rawOCSF, null, 2)}
                  </pre>
                </Box>
              </Box>
            </>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 2, pt: 1, gap: 1 }}>
        <Button onClick={onClose}>
          Close
        </Button>
        {hasChanges && onUpdate && (
          <Button
            variant="outlined"
            startIcon={<SaveIcon />}
            onClick={handleSave}
            disabled={saving}
          >
            Save Changes
          </Button>
        )}
        {!isResolved && (
          <Button
            variant="contained"
            color="success"
            startIcon={<CheckCircleIcon />}
            onClick={handleResolve}
            disabled={saving}
          >
            Resolve Incident
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

import { ChevronDown as ExpandMoreIcon, Plus as AddIcon, ListChecks as PlaylistAddCheckIcon } from 'lucide-react';
import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Box,
  Typography,
  IconButton,
  Chip,
  FormControl,
  InputLabel,
  Select,
  CircularProgress,
  FormControlLabel,
  Switch,
  Slider,
  Collapse,
} from '@mui/material';
import { useUsers } from '@/hooks/useUsers';
import { useCustomFields, CustomField } from '@/hooks/useCustomFields';
import { useIOCTypes } from '@/hooks/useIOCTypes';
import { useCaseTemplates, CaseTemplate } from '@/hooks/useCaseTemplates';
import { ObservableTypeSelector } from './ObservableTypeSelector';
import { useEntityText } from '@/hooks/useEntityLabel';
import {
  OCSFIncidentFinding,
  Observable,
  Comment,
  IncidentTask,
  FileAttachment,
  TLP_LEVELS,
  TLP_LABELS,
  severityOptions,
  taskCategories,
  generateFindingUid,
} from '@/config/ocsfIncidentSchema';

// Re-export types for backward compatibility
export type { OCSFIncidentFinding, Observable, Comment, IncidentTask, FileAttachment };
export { severityOptions, taskCategories, TLP_LEVELS, TLP_LABELS };

// Legacy activity item - kept for backward compatibility during migration
export interface ActivityItem {
  id: string;
  type: 'comment' | 'change' | 'status' | 'assignment' | 'created';
  user: string;
  timestamp: number;
  content: string;
  details?: Record<string, unknown>;
  attachments?: FileAttachment[];
  /** When set, this comment is a reply to another timeline item (revision id,
   *  agent execution_id, or another activity id). Used to render the reply
   *  indented under its parent so users can pivot between threads. */
  replyToId?: string;
  /** Short snippet of the parent item, captured at reply time so the thread
   *  reads sensibly even if the parent later changes or scrolls off. */
  replyToPreview?: string;
  /** Human label for what the reply targets ("Comment by Alice", "Revision
   *  #4", "Agent run"). Captured at reply time so we can display it inside
   *  the threaded child without re-resolving the parent. */
  replyToLabel?: string;
  /** Soft-delete flag. We never hard-delete comments — instead we mark them
   *  deleted so the original timestamp, author and thread position stay put.
   *  The renderer shows a muted "Comment deleted" placeholder in place of
   *  the original content (and attachments are stripped). */
  deleted?: boolean;
  /** When the comment was soft-deleted (ms epoch). */
  deletedAt?: number;
  /** Marks whether automation / AI agents have already processed this comment.
   *  Defaults to `false` on every new human comment so agents can pick it up
   *  exactly once; agents flip it to `true` after acting on it to prevent
   *  re-running on the same data. */
  ai_handled?: boolean;
}

// TLP levels for UI display (using new integer-based system)
export const tlpLevels = [
  { value: 1, label: 'TLP:CLEAR', color: '#ffffff' },
  { value: 2, label: 'TLP:GREEN', color: '#22c55e' },
  { value: 3, label: 'TLP:AMBER', color: '#f59e0b' },
  { value: 4, label: 'TLP:RED', color: '#ef4444' },
];

// DEPRECATED: PAP levels removed from new OCSF format
// Kept for backward compatibility parsing only
export const papLevels = [
  { value: 'PAP:CLEAR', label: 'PAP:CLEAR', color: '#ffffff' },
  { value: 'PAP:GREEN', label: 'PAP:GREEN', color: '#22c55e' },
  { value: 'PAP:AMBER', label: 'PAP:AMBER', color: '#f59e0b' },
  { value: 'PAP:RED', label: 'PAP:RED', color: '#ef4444' },
];

// DEPRECATED: Use useIOCTypes().observableTypeNames instead
export const observableTypes = [
  'ipv4',
  'ipv6',
  'domain',
  'url',
  'email',
  'hash_md5',
  'hash_sha1',
  'hash_sha256',
  'file_name',
  'user',
  'hostname',
  'other',
];

interface CreateIncidentDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (incident: OCSFIncidentFinding) => Promise<void>;
}

export const CreateIncidentDialog = ({ open, onClose, onSubmit }: CreateIncidentDialogProps) => {
  const t = useEntityText();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severityId, setSeverityId] = useState(3);
  const [source, setSource] = useState('');
  const [tlp, setTlp] = useState<number>(2);
  const [confidence, setConfidence] = useState<number>(50);
  const [assignee, setAssignee] = useState('');
  const [references, setReferences] = useState<string[]>([]);
  const [newReference, setNewReference] = useState('');
  const [observables, setObservables] = useState<Observable[]>([]);
  const [newObservableType, setNewObservableType] = useState('ipv4');
  const [newObservableValue, setNewObservableValue] = useState('');
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string | number | boolean>>({});
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [tasks, setTasks] = useState<IncidentTask[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { users, loading: usersLoading } = useUsers();
  const { fields: customFields } = useCustomFields();
  const { observableTypeNames, iocTypes } = useIOCTypes();
  const { templates, trackUsage } = useCaseTemplates();

  // Handle template selection
  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (templateId) {
      const template = templates.find(t => t.id === templateId);
      if (template) {
        // Apply template tasks
        const templateTasks: IncidentTask[] = (template.tasks || []).map((t, index) => ({
          id: `task-${Date.now()}-${index}`,
          title: t.title || '',
          description: t.description || '',
          category: t.category || '',
          assignee: t.assignee || '',
          dependsOn: t.dependsOn || '',
          dueDate: '',
          completed: false,
          completedAt: 0,
          createdAt: Date.now(),
          createdBy: '',
          attachments: [],
        }));
        setTasks(templateTasks);
        // Optionally set severity from template
        if (template.severity) {
          const severityOption = severityOptions.find(s => s.value === template.severity);
          if (severityOption) {
            setSeverityId(severityOption.id);
          }
        }
      }
    } else {
      setTasks([]);
    }
  };

  const handleAddReference = () => {
    if (newReference.trim()) {
      setReferences([...references, newReference.trim()]);
      setNewReference('');
    }
  };

  const handleRemoveReference = (index: number) => {
    setReferences(references.filter((_, i) => i !== index));
  };

  const handleAddObservable = () => {
    if (newObservableValue.trim()) {
      setObservables([...observables, { type: newObservableType, value: newObservableValue.trim() }]);
      setNewObservableValue('');
    }
  };

  const handleRemoveObservable = (index: number) => {
    setObservables(observables.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!title.trim()) return;

    setIsSubmitting(true);
    const severity = severityOptions.find(s => s.id === severityId)?.label || 'Medium';
    const findingUid = generateFindingUid();
    const now = new Date().toISOString();

    // Build new OCSF format incident
    // CRITICAL: Never use undefined - always use empty values to prevent field deletion on updates
    const incident: OCSFIncidentFinding = {
      class_uid: 2005,
      class_name: 'Incident Finding',
      finding_uid: findingUid,
      title: title.trim(),
      desc: description.trim() || '',
      severity_id: severityId,
      severity,
      status_id: 1, // New
      status: 'New',
      confidence,
      created_time: now,
      first_seen_time: now,
      ...(source ? { types: [source] } : {}),
      product: {
        name: source || 'Manual',
        uid: 'shuffle-security',
      },
      references: references, // Always include, even if empty array
      metadata: {
        uid: findingUid,
        extensions: {
          custom_attributes: {
            tlp,
            // Only include the optional collections when the user actually
            // populated them — comments / tasks / observables / customFields /
            // assignee / attachments will be added later as they become
            // necessary, instead of being seeded as empty defaults.
            ...(tasks.length > 0 ? { tasks } : {}),
            ...(observables.length > 0 ? { observables } : {}),
            ...(Object.keys(customFieldValues).length > 0 ? { customFields: customFieldValues } : {}),
            ...(assignee.trim() ? { assignee: assignee.trim() } : {}),
          },
        },
      },
    };

    // Track template usage if one was selected
    if (selectedTemplateId) {
      await trackUsage(selectedTemplateId);
    }

    await onSubmit(incident);
    setIsSubmitting(false);
    handleClose();
  };

  const handleClose = () => {
    setTitle('');
    setDescription('');
    setSeverityId(3);
    setSource('');
    setTlp(2);
    setConfidence(50);
    setAssignee('');
    setReferences([]);
    setNewReference('');
    setObservables([]);
    setNewObservableType('ipv4');
    setNewObservableValue('');
    setCustomFieldValues({});
    setSelectedTemplateId('');
    setTasks([]);
    onClose();
  };


  const handleCustomFieldChange = (field: CustomField, value: string | number | boolean) => {
    setCustomFieldValues(prev => ({
      ...prev,
      [field.key]: value,
    }));
  };

  const renderCustomField = (field: CustomField) => {
    const value = customFieldValues[field.key];
    
    switch (field.type) {
      case 'text':
        return (
          <TextField
            key={field.key}
            label={field.name}
            value={value || ''}
            onChange={(e) => handleCustomFieldChange(field, e.target.value)}
            fullWidth
            required={field.required}
            placeholder={field.description}
            size="small"
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
            required={field.required}
            placeholder={field.description}
            size="small"
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
              required={field.required}
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
            required={field.required}
            InputLabelProps={{ shrink: true }}
            size="small"
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
          />
        );
      default:
        return null;
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          {t('Create Incident')}
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          OCSF Incident Finding (class_uid: 2005)
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1 }}>
          {/* Title */}
          <TextField
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            fullWidth
            required
            placeholder="e.g., Suspicious Login Activity"
          />

          {/* Description */}
          <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
            multiline
            rows={3}
            placeholder={t('Detailed description of the incident...')}
          />

          {/* Severity */}
          <TextField
            select
            label="Severity"
            value={severityId}
            onChange={(e) => setSeverityId(Number(e.target.value))}
            fullWidth
          >
            {severityOptions.map((opt) => (
              <MenuItem key={opt.id} value={opt.id}>
                {opt.label}
              </MenuItem>
            ))}
          </TextField>

          {/* Advanced Options Toggle */}
          <Box
            onClick={() => setShowAdvanced(!showAdvanced)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              cursor: 'pointer',
              color: 'hsl(var(--muted-foreground))',
              '&:hover': { color: 'hsl(var(--foreground))' },
            }}
          >
            <ExpandMoreIcon size={20} style={{ transform: showAdvanced ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              Advanced options
            </Typography>
          </Box>

          <Collapse in={showAdvanced}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              {/* Template Selection */}
              {templates.length > 0 && (
                <Box sx={{ 
                  p: 2, 
                  bgcolor: 'rgba(255, 102, 0, 0.05)', 
                  borderRadius: 2, 
                  border: '1px solid rgba(255, 102, 0, 0.2)',
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                    <PlaylistAddCheckIcon size={18} style={{ color: '#ff6600' }} />
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      Apply Template
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', ml: 'auto' }}>
                      Optional
                    </Typography>
                  </Box>
                  <FormControl fullWidth size="small">
                    <Select
                      value={selectedTemplateId}
                      onChange={(e) => handleTemplateSelect(e.target.value)}
                      displayEmpty
                      sx={{ bgcolor: 'background.paper' }}
                    >
                      <MenuItem value="">
                        <em>No template (start blank)</em>
                      </MenuItem>
                      {templates.map((template) => (
                        <MenuItem key={template.id} value={template.id}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                            <Typography variant="body2">{template.name}</Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary', ml: 'auto' }}>
                              {template.tasks?.length ?? 0} tasks
                            </Typography>
                          </Box>
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  {selectedTemplateId && tasks.length > 0 && (
                    <Box sx={{ mt: 1.5, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {tasks.slice(0, 3).map((task) => (
                        <Chip 
                          key={task.id} 
                          label={task.title} 
                          size="small" 
                          sx={{ fontSize: '0.7rem', height: 22 }} 
                        />
                      ))}
                      {tasks.length > 3 && (
                        <Chip 
                          label={`+${tasks.length - 3} more`} 
                          size="small" 
                          sx={{ fontSize: '0.7rem', height: 22, bgcolor: 'rgba(255,255,255,0.1)' }} 
                        />
                      )}
                    </Box>
                  )}
                </Box>
              )}

              {/* Source + TLP */}
              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField
                  label="Source / Product"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  fullWidth
                  placeholder="e.g., SIEM, EDR, Firewall"
                />
                <TextField
                  select
                  label="TLP"
                  value={tlp}
                  onChange={(e) => setTlp(Number(e.target.value))}
                  fullWidth
                >
                  {tlpLevels.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: opt.color, border: opt.color === '#ffffff' ? '1px solid #666' : 'none' }} />
                        {opt.label}
                      </Box>
                    </MenuItem>
                  ))}
                </TextField>
              </Box>

              {/* Confidence */}
              <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', mb: 0.5, display: 'block' }}>
                  Confidence: {confidence}%
                </Typography>
                <Slider
                  value={confidence}
                  onChange={(_, value) => setConfidence(value as number)}
                  min={0}
                  max={100}
                  valueLabelDisplay="auto"
                  sx={{ mt: 1 }}
                />
              </Box>

              {/* Assignee */}
              <FormControl fullWidth>
                <InputLabel>Assignee</InputLabel>
                <Select
                  value={assignee}
                  label="Assignee"
                  onChange={(e) => setAssignee(e.target.value)}
                  disabled={usersLoading}
                  endAdornment={usersLoading ? <CircularProgress size={20} sx={{ mr: 2 }} /> : null}
                  MenuProps={{
                    PaperProps: {
                      sx: {
                        bgcolor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        zIndex: 9999,
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

              {/* URL References */}
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
                  />
                  <IconButton 
                    onClick={handleAddReference} 
                    size="small" 
                    sx={{ bgcolor: 'rgba(255,255,255,0.05)', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}
                    disabled={!newReference.trim()}
                  >
                    <AddIcon />
                  </IconButton>
                </Box>
                {references.length > 0 && (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {references.map((ref, idx) => (
                      <Chip
                        key={idx}
                        label={ref.length > 40 ? ref.substring(0, 40) + '...' : ref}
                        size="small"
                        onDelete={() => handleRemoveReference(idx)}
                        sx={{ maxWidth: '100%' }}
                      />
                    ))}
                  </Box>
                )}
              </Box>

              {/* Observables */}
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
                  />
                  <IconButton 
                    onClick={handleAddObservable} 
                    size="small" 
                    sx={{ bgcolor: 'rgba(255,255,255,0.05)', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}
                    disabled={!newObservableValue.trim()}
                  >
                    <AddIcon />
                  </IconButton>
                </Box>
                {observables.length > 0 && (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {observables.map((obs, idx) => (
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
                )}
              </Box>

              {/* Custom Fields */}
              {customFields.length > 0 && (
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 1.5, color: 'text.secondary' }}>
                    Custom Fields
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {customFields.map((field) => renderCustomField(field))}
                  </Box>
                </Box>
              )}
            </Box>
          </Collapse>
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 2, pt: 1 }}>
        <Button onClick={handleClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!title.trim() || isSubmitting}
        >
          {isSubmitting ? 'Creating...' : t('Create Incident')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

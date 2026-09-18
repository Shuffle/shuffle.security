import { Plus as AddIcon, MoreVertical as MoreVertIcon, ClipboardList as AssignmentIcon, Pencil as EditIcon, Trash2 as DeleteIcon, RefreshCw as RefreshIcon, ListPlus as PlaylistAddIcon } from 'lucide-react';
import { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Tooltip,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { motion } from 'framer-motion';
import { useCaseTemplates, CaseTemplate, TemplateTask } from '@/hooks/useCaseTemplates';
import { TaskEditor } from '@/components/incidents/TaskEditor';
import { IncidentTask, taskCategories } from '@/components/incidents/CreateIncidentDialog';
import { toast } from '@/lib/toast';
import { usePageMeta } from '@/hooks/usePageMeta';

const severityColors: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#22c55e',
  informational: '#3b82f6',
};

const TemplatesPage = () => {

  usePageMeta({
    title: 'Templates',
    description: 'Browse incident response and automation templates.',
    url: '/templates',
  });
  const { 
    templates, 
    isLoading, 
    createTemplate, 
    updateTemplate, 
    deleteTemplate,
    initializeDefaults,
  } = useCaseTemplates();
  
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<CaseTemplate | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ el: HTMLElement; template: CaseTemplate } | null>(null);
  
  // Form state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formSeverity, setFormSeverity] = useState<string>('medium');
  const [formTasks, setFormTasks] = useState<IncidentTask[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const handleOpenCreate = () => {
    setSelectedTemplate(null);
    setFormName('');
    setFormDescription('');
    setFormSeverity('medium');
    setFormTasks([]);
    setEditDialogOpen(true);
  };

  const handleOpenEdit = (template: CaseTemplate) => {
    setSelectedTemplate(template);
    setFormName(template.name);
    setFormDescription(template.description || '');
    setFormSeverity(template.severity || 'medium');
    // Convert TemplateTask to IncidentTask for editing
    setFormTasks(template.tasks.map((t, idx) => ({
      id: `task-${idx}`,
      title: t.title,
      description: t.description || '',
      category: t.category || '',
      assignee: t.assignee || '',
      dependsOn: t.dependsOn || '',
      dueDate: '',
      completed: false,
      completedAt: 0,
      createdAt: Date.now(),
      attachments: [],
    })));
    setEditDialogOpen(true);
    setMenuAnchor(null);
  };

  const handleOpenDelete = (template: CaseTemplate) => {
    setSelectedTemplate(template);
    setDeleteDialogOpen(true);
    setMenuAnchor(null);
  };

  const handleSaveTemplate = async () => {
    if (!formName.trim()) {
      toast.error('Template name is required');
      return;
    }

    setIsSaving(true);
    try {
      // Convert IncidentTask back to TemplateTask
      const templateTasks: TemplateTask[] = formTasks.map(t => ({
        title: t.title,
        description: t.description || '',
        category: t.category || '',
        assignee: t.assignee || '',
        dependsOn: t.dependsOn || '',
      }));

      if (selectedTemplate) {
        await updateTemplate(selectedTemplate.id, {
          name: formName,
          description: formDescription,
          severity: formSeverity,
          tasks: templateTasks,
        });
        toast.success('Template updated');
      } else {
        await createTemplate({
          name: formName,
          description: formDescription,
          severity: formSeverity,
          tasks: templateTasks,
        });
        toast.success('Template created');
      }
      setEditDialogOpen(false);
    } catch (err) {
      toast.error('Failed to save template');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedTemplate) return;
    setIsSaving(true);
    try {
      await deleteTemplate(selectedTemplate.id);
      toast.success('Template deleted');
      setDeleteDialogOpen(false);
    } catch (err) {
      toast.error('Failed to delete template');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddTask = () => {
    setFormTasks([...formTasks, {
      id: `task-${Date.now()}`,
      title: 'New task',
      assignee: '',
      completed: false,
      createdAt: Date.now(),
    }]);
  };

  const handleResetToDefaults = async () => {
    setIsSaving(true);
    try {
      await initializeDefaults();
      toast.success('Default templates restored');
    } catch (err) {
      toast.error('Failed to restore defaults');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      style={{ maxWidth: 1400, width: '100%', margin: '0 auto' }}
    >
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>
            Case Templates
          </Typography>
          {isLoading && <CircularProgress size={20} />}
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {templates.length === 0 && (
            <Tooltip title="Restore default templates">
              <IconButton
                onClick={handleResetToDefaults}
                disabled={isSaving}
                sx={{ 
                  width: 36,
                  height: 36,
                  color: 'text.secondary',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                }}
              >
                <RefreshIcon size={20} />
              </IconButton>
            </Tooltip>
          )}
          <Button 
            variant="contained" 
            startIcon={<AddIcon />}
            onClick={handleOpenCreate}
            sx={{ height: 36 }}
          >
            New Template
          </Button>
        </Box>
      </Box>

      {/* Template Grid */}
      {templates.length === 0 && !isLoading ? (
        <Box sx={{ 
          textAlign: 'center', 
          py: 8,
          bgcolor: 'action.hover',
          borderRadius: 2,
          border: '1px dashed',
          borderColor: 'divider',
        }}>
          <AssignmentIcon size={48} style={{ color: 'hsl(var(--muted-foreground))', marginBottom: '16px' }} />
          <Typography variant="h6" sx={{ color: 'text.secondary', mb: 1 }}>
            No templates yet
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.disabled', mb: 3 }}>
            Create a template to standardize your incident workflows
          </Typography>
          <Button 
            variant="outlined" 
            startIcon={<RefreshIcon />}
            onClick={handleResetToDefaults}
            sx={{ mr: 2, height: 36 }}
          >
            Load Defaults
          </Button>
          <Button 
            variant="contained" 
            startIcon={<AddIcon />}
            onClick={handleOpenCreate}
            sx={{ height: 36 }}
          >
            Create Template
          </Button>
        </Box>
      ) : (
        <Grid container spacing={3}>
          {templates.map((template, index) => (
            <Grid size={{ xs: 12, md: 6, lg: 4 }} key={template.id}>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.05 }}
              >
                <Card
                  elevation={0}
                  sx={{
                    height: '100%',
                    cursor: 'pointer',
                    bgcolor: 'transparent',
                    backgroundImage: 'none',
                    border: '1px solid hsl(var(--border))',
                    transition: 'all 0.2s',
                    '&:hover': {
                      transform: 'translateY(-4px)',
                      borderColor: 'hsl(var(--primary) / 0.5)',
                      boxShadow: (theme) => theme.shadows[6],
                    },
                  }}
                  onClick={() => handleOpenEdit(template)}
                >
                  <CardContent sx={{ p: 3 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                      <Box
                        sx={{
                          p: 1.5,
                          borderRadius: 2,
                          backgroundColor: `${severityColors[template.severity || 'medium']}15`,
                          color: severityColors[template.severity || 'medium'],
                        }}
                      >
                        <AssignmentIcon />
                      </Box>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Tooltip title="Edit">
                          <IconButton 
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEdit(template);
                            }}
                          >
                            <EditIcon size={20} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton 
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenDelete(template);
                            }}
                            sx={{ '&:hover': { color: 'error.main' } }}
                          >
                            <DeleteIcon size={20} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </Box>

                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                      {template.name}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        color: 'text.secondary',
                        mb: 2,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        minHeight: 40,
                      }}
                    >
                      {template.description || 'No description'}
                    </Typography>

                    <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                      <Chip
                        label={template.severity || 'medium'}
                        size="small"
                        sx={{
                          backgroundColor: `${severityColors[template.severity || 'medium']}20`,
                          color: severityColors[template.severity || 'medium'],
                          fontWeight: 600,
                          textTransform: 'capitalize',
                        }}
                      />
                      <Chip
                        label={`${template.tasks.length} task${template.tasks.length !== 1 ? 's' : ''}`}
                        size="small"
                        sx={{ backgroundColor: 'rgba(148, 163, 184, 0.1)' }}
                      />
                    </Box>

                    {template.usageCount !== undefined && template.usageCount > 0 && (
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        Used {template.usageCount} time{template.usageCount !== 1 ? 's' : ''}
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Edit/Create Dialog */}
      <Dialog 
        open={editDialogOpen} 
        onClose={() => setEditDialogOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: 'hsl(var(--card))',
            backgroundImage: 'none',
          }
        }}
      >
        <DialogTitle>
          {selectedTemplate ? 'Edit Template' : 'Create Template'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Template Name"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              fullWidth
              required
            />
            <TextField
              label="Description"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              fullWidth
              multiline
              rows={2}
            />
            <FormControl fullWidth>
              <InputLabel>Default Severity</InputLabel>
              <Select
                value={formSeverity}
                label="Default Severity"
                onChange={(e) => setFormSeverity(e.target.value)}
              >
                <MenuItem value="critical">Critical</MenuItem>
                <MenuItem value="high">High</MenuItem>
                <MenuItem value="medium">Medium</MenuItem>
                <MenuItem value="low">Low</MenuItem>
                <MenuItem value="informational">Informational</MenuItem>
              </Select>
            </FormControl>

            {/* Tasks Section */}
            <Box sx={{ mt: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  Tasks ({formTasks.length})
                </Typography>
                <Button 
                  size="small" 
                  startIcon={<PlaylistAddIcon />}
                  onClick={handleAddTask}
                >
                  Add Task
                </Button>
              </Box>
              <TaskEditor
                tasks={formTasks}
                onTasksChange={setFormTasks}
                incidentId="template"
                compact={false}
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button 
            variant="contained" 
            onClick={handleSaveTemplate}
            disabled={isSaving}
          >
            {isSaving ? <CircularProgress size={20} /> : (selectedTemplate ? 'Update' : 'Create')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog 
        open={deleteDialogOpen} 
        onClose={() => setDeleteDialogOpen(false)}
        PaperProps={{
          sx: {
            bgcolor: 'hsl(var(--card))',
            backgroundImage: 'none',
          }
        }}
      >
        <DialogTitle>Delete Template</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete "{selectedTemplate?.name}"? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button 
            variant="contained" 
            color="error" 
            onClick={handleDelete}
            disabled={isSaving}
          >
            {isSaving ? <CircularProgress size={20} /> : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </motion.div>
  );
};

export default TemplatesPage;

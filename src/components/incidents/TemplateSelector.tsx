import { ListPlus as PlaylistAddIcon, ClipboardList as AssignmentIcon } from 'lucide-react';
import { useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Menu,
  MenuItem,
  Chip,
  CircularProgress,
} from '@mui/material';
import { useCaseTemplates, CaseTemplate, TemplateTask } from '@/hooks/useCaseTemplates';
import { IncidentTask } from './CreateIncidentDialog';

interface TemplateSelectorProps {
  onApplyTemplate: (tasks: IncidentTask[]) => void;
  currentUsername?: string;
}

const severityColors: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#22c55e',
  informational: '#3b82f6',
};

export const TemplateSelector = ({ onApplyTemplate, currentUsername = '' }: TemplateSelectorProps) => {
  const { templates, isLoading, trackUsage } = useCaseTemplates();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const handleOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleApplyTemplate = async (template: CaseTemplate) => {
    // Convert template tasks to incident tasks with all fields initialized
    const newTasks: IncidentTask[] = (template.tasks || []).map((t: TemplateTask, index: number) => ({
      id: `task-${Date.now()}-${index}`,
      title: t.title || '',
      description: t.description || '',
      category: t.category || '',
      completed: false,
      completedAt: 0,
      assignee: t.assignee || '',
      dependsOn: t.dependsOn || '',
      dueDate: '',
      createdAt: Date.now(),
      createdBy: currentUsername,
      attachments: [],
    }));
    
    onApplyTemplate(newTasks);
    await trackUsage(template.id);
    handleClose();
  };

  return (
    <>
      <Tooltip title="Apply template">
        <IconButton 
          onClick={handleOpen}
          sx={{ 
            bgcolor: '#ff6600', 
            color: '#ffffff', 
            '&:hover': { bgcolor: '#e55c00' } 
          }}
        >
          {isLoading ? <CircularProgress size={20} sx={{ color: '#ffffff' }} /> : <PlaylistAddIcon />}
        </IconButton>
      </Tooltip>
      
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleClose}
        PaperProps={{
          sx: {
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
            minWidth: 280,
            maxHeight: 400,
          },
        }}
      >
        <Box sx={{ px: 2, py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500 }}>
            Apply Case Template
          </Typography>
        </Box>
        
        {templates.length === 0 ? (
          <MenuItem disabled>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              No templates available
            </Typography>
          </MenuItem>
        ) : (
          templates.map((template) => (
            <MenuItem 
              key={template.id}
              onClick={() => handleApplyTemplate(template)}
              sx={{ 
                py: 1.5,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 0.5,
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
                <Box sx={{ 
                  p: 0.75, 
                  borderRadius: 1, 
                  bgcolor: `${severityColors[template.severity || 'medium']}15`,
                }}>
                  <AssignmentIcon size={16} style={{ color: severityColors[template.severity || 'medium'] }} />
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {template.name}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                    <Chip 
                      label={`${template.tasks?.length ?? 0} tasks`} 
                      size="small" 
                      sx={{ 
                        height: 18, 
                        fontSize: '0.65rem',
                        bgcolor: 'rgba(255,255,255,0.08)',
                      }} 
                    />
                    {template.severity && (
                      <Chip 
                        label={template.severity} 
                        size="small" 
                        sx={{ 
                          height: 18, 
                          fontSize: '0.65rem',
                          bgcolor: `${severityColors[template.severity]}20`,
                          color: severityColors[template.severity],
                          textTransform: 'capitalize',
                        }} 
                      />
                    )}
                  </Box>
                </Box>
              </Box>
              {template.description && (
                <Typography variant="caption" sx={{ color: 'text.secondary', pl: 4.5 }}>
                  {template.description}
                </Typography>
              )}
            </MenuItem>
          ))
        )}
      </Menu>
    </>
  );
};

export default TemplateSelector;
